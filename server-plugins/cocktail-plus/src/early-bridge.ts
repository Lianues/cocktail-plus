// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { API_PREFIX, HEADER_PREFIX, PLUGIN_DIR, SERVER_ROOT, VERSION } from './constants.js';
import { config } from './config.js';
import { ENDPOINT_LIST } from './endpoint-registry.js';
import { CHAT_SAVE_HASH_ALGORITHM, chatSaveEndpoint, groupChatSaveEndpoint } from './endpoints/chat-save.js';
import { settingsGetEndpoint } from './endpoints/settings-get.js';
import { SETTINGS_HASH_ALGORITHM, settingsSaveEndpoint } from './endpoints/settings-save.js';

const MARKER_START = '<!-- cocktail-plus early bridge start -->';
const MARKER_END = '<!-- cocktail-plus early bridge end -->';
const BRIDGE_SCRIPT_ID = 'cocktail-plus-early-bridge';
const BRIDGE_SRC = `${API_PREFIX}/early/bridge.js`;
const INDEX_PATH = path.join(SERVER_ROOT, 'public', 'index.html');
const BACKUP_DIR = path.join(PLUGIN_DIR, 'backups');
const MODULE_IMPORT_MAP_ID = 'cocktail-plus-module-import-map';
// Only parser/static entry modules are rewritten as <script src="...">. The rest of the module graph should stay
// on SillyTavern's native static file URLs for startup speed; import map only canonicalizes modules that we patch.
const MODULE_PROXY_ENTRY_PATHS = ['/scripts/i18n.js', '/script.js'];
const MODULE_PROXY_IMPORT_PATHS = ['/script.js', '/scripts/i18n.js', '/scripts/system-messages.js', '/scripts/extensions.js', '/scripts/welcome-screen.js'];
const MODULE_SCRIPT_PROXY_EXCLUDED_PREFIXES = ['/scripts/extensions/third-party/'];

function normalizePublicModulePath(value) {
    let out = String(value || '').replace(/\\/g, '/');
    if (!out.startsWith('/')) out = `/${out}`;
    return out;
}

function collectModuleProxyImportPaths() {
    return MODULE_PROXY_IMPORT_PATHS
        .map(normalizePublicModulePath)
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b));
}

function getModuleProxyImportMap() {
    const imports = {};
    for (const publicPath of collectModuleProxyImportPaths()) {
        imports[publicPath] = getModuleProxySrc(publicPath);
    }
    return { imports };
}

function escapeScriptJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getBridgeBlock() {
    const lines = [MARKER_START];
    if (config.moduleProxyEnabled) {
        lines.push(`<script type="importmap" id="${MODULE_IMPORT_MAP_ID}" data-cp-module-proxy-importmap="1">${escapeScriptJson(getModuleProxyImportMap())}</script>`);
    }
    lines.push(`<script id="${BRIDGE_SCRIPT_ID}" src="${BRIDGE_SRC}" data-cocktail-plus-early="1"></script>`);
    lines.push(MARKER_END);
    return lines.join('\n');
}

function getModuleProxySrc(publicPath) {
    return `${API_PREFIX}/module?path=${encodeURIComponent(publicPath)}`;
}

function stripLeadingSlash(value) {
    return String(value || '').replace(/^\//, '');
}

function normalizeHtmlScriptSrc(value) {
    let src = String(value || '').trim();
    if (!src) return '';
    try {
        if (/^https?:\/\//i.test(src)) {
            const url = new URL(src);
            src = url.pathname;
        }
    } catch (_) {}
    src = src.split('#')[0].split('?')[0].replace(/^\//, '');
    return `/${src}`;
}

function replaceScriptSrcAttribute(tag, nextSrc) {
    if (/\bsrc\s*=\s*"[^"]*"/i.test(tag)) {
        return tag.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${nextSrc}"`);
    }
    if (/\bsrc\s*=\s*'[^']*'/i.test(tag)) {
        return tag.replace(/\bsrc\s*=\s*'[^']*'/i, `src="${nextSrc}"`);
    }
    return tag;
}

function readIndexHtml() {
    if (!fs.existsSync(INDEX_PATH)) return '';
    return fs.readFileSync(INDEX_PATH, 'utf8');
}

function countOccurrences(text, needle) {
    if (!needle) return 0;
    return String(text || '').split(needle).length - 1;
}

function getMarkerRegex() {
    return new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`, 'g');
}

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeBackup(html) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `index.html.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
    fs.writeFileSync(file, html, 'utf8');
    return file;
}

function rewriteIndexModuleProxyTags(html) {
    if (!config.moduleProxyEnabled) return restoreIndexModuleProxyTags(html);
    let out = restoreIndexModuleProxyTags(html);
    const targets = new Map(MODULE_PROXY_ENTRY_PATHS.map(publicPath => [normalizeHtmlScriptSrc(publicPath), publicPath]));
    return out.replace(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*><\/script>/gi, (tag, _quote, src) => {
        if (/data-cp-module-proxy-original=/i.test(tag)) return tag;
        const publicPath = targets.get(normalizeHtmlScriptSrc(src));
        if (!publicPath) return tag;
        const originalSrc = stripLeadingSlash(publicPath);
        const proxySrc = getModuleProxySrc(publicPath);
        const rewritten = replaceScriptSrcAttribute(tag, proxySrc);
        return rewritten.replace(/<script\b/i, `<script data-cp-module-proxy-original="${originalSrc}"`);
    });
}

function restoreIndexModuleProxyTags(html) {
    return String(html || '').replace(/<script\b[^>]*\bdata-cp-module-proxy-original=["']([^"']+)["'][^>]*><\/script>/gi, (tag, original) => {
        let restored = replaceScriptSrcAttribute(tag, original);
        restored = restored.replace(/\s*data-cp-module-proxy-original=["'][^"']+["']/i, '');
        return restored;
    });
}

function insertBridgeBlock(html) {
    const block = getBridgeBlock();
    const markerRegex = getMarkerRegex();

    if (markerRegex.test(html)) {
        markerRegex.lastIndex = 0;
        return { html: html.replace(markerRegex, block), mode: 'replace-marker' };
    }

    const headOpen = html.match(/<head\b[^>]*>/i);
    if (headOpen && typeof headOpen.index === 'number') {
        const pos = headOpen.index + headOpen[0].length;
        return { html: `${html.slice(0, pos)}\n${block}\n${html.slice(pos)}`, mode: 'after-head-open' };
    }

    const scriptJs = html.match(/<script\b[^>]*\bsrc=["']script\.js["'][^>]*><\/script>/i);
    if (scriptJs && typeof scriptJs.index === 'number') {
        return { html: `${html.slice(0, scriptJs.index)}${block}\n${html.slice(scriptJs.index)}`, mode: 'before-script-js' };
    }

    return { html: `${block}\n${html}`, mode: 'file-start' };
}

export function getEarlyBridgeStatus() {
    const html = readIndexHtml();
    const markerStartCount = countOccurrences(html, MARKER_START);
    const markerEndCount = countOccurrences(html, MARKER_END);
    const scriptIdCount = countOccurrences(html, `id="${BRIDGE_SCRIPT_ID}"`) + countOccurrences(html, `id='${BRIDGE_SCRIPT_ID}'`);
    const installed = markerStartCount > 0 && markerEndCount > 0 && scriptIdCount > 0;
    const upToDate = installed && html.includes(getBridgeBlock());
    return {
        ok: true,
        enabled: !!config.earlyBridgeEnabled,
        autoInstall: !!config.autoInstallEarlyBridge,
        installed,
        upToDate,
        indexPath: INDEX_PATH,
        bridgeSrc: BRIDGE_SRC,
        markerStartCount,
        markerEndCount,
        scriptIdCount,
        backupDir: BACKUP_DIR,
    };
}

export function installEarlyBridge(options = {}) {
    const html = readIndexHtml();
    if (!html) return { ok: false, error: `index.html not found: ${INDEX_PATH}`, status: getEarlyBridgeStatus() };

    const beforeStatus = getEarlyBridgeStatus();
    const { html: nextHtml, mode } = insertBridgeBlock(html);
    const finalHtml = rewriteIndexModuleProxyTags(nextHtml);
    if (finalHtml === html) {
        return { ok: true, changed: false, mode: 'unchanged', backup: null, status: beforeStatus };
    }

    let backup = null;
    if (!options.noBackup) backup = makeBackup(html);
    fs.writeFileSync(INDEX_PATH, finalHtml, 'utf8');
    return { ok: true, changed: true, mode, backup, status: getEarlyBridgeStatus() };
}

export function uninstallEarlyBridge(options = {}) {
    const html = readIndexHtml();
    if (!html) return { ok: false, error: `index.html not found: ${INDEX_PATH}`, status: getEarlyBridgeStatus() };

    const markerRegex = getMarkerRegex();
    markerRegex.lastIndex = 0;
    if (!markerRegex.test(html)) {
        return { ok: true, changed: false, backup: null, status: getEarlyBridgeStatus() };
    }

    markerRegex.lastIndex = 0;
    const nextHtml = restoreIndexModuleProxyTags(html.replace(markerRegex, '').replace(/\n{3,}/g, '\n\n'));
    let backup = null;
    if (!options.noBackup) backup = makeBackup(html);
    fs.writeFileSync(INDEX_PATH, nextHtml, 'utf8');
    return { ok: true, changed: true, backup, status: getEarlyBridgeStatus() };
}

function makeFastRoutesLiteral() {
    return ENDPOINT_LIST
        .map(endpoint => `  [${JSON.stringify(endpoint.originalPath)}, { path: PREFIX + ${JSON.stringify(endpoint.fastPath)}, method: ${JSON.stringify(endpoint.method)} }]`)
        .join(',\n');
}

function makeTemplatePreloadList() {
    const fallback = ['help.html', 'hotkeys.html', 'formatting.html', 'welcome.html', 'welcomePrompt.html', 'assistantNote.html'];
    try {
        const dir = path.join(SERVER_ROOT, 'public', 'scripts', 'templates');
        const names = fs.readdirSync(dir)
            .filter(name => name.endsWith('.html'))
            .sort((a, b) => a.localeCompare(b));
        const list = names.length ? names : fallback;
        return list.map(name => `/scripts/templates/${name}`);
    } catch {
        return fallback.map(name => `/scripts/templates/${name}`);
    }
}

export function makeEarlyBridgeScript() {
    const fastRoutes = makeFastRoutesLiteral();
    const templatePreloadList = makeTemplatePreloadList();
    return `/* cocktail-plus Early Bridge v${VERSION} */
(function () {
  'use strict';
  var BRIDGE_ENABLED = ${JSON.stringify(!!config.earlyBridgeEnabled)};
  var PATCH_FETCH = ${JSON.stringify(!!config.earlyBridgePatchFetch)};
  var VERSION = ${JSON.stringify(VERSION)};
  var PREFIX = ${JSON.stringify(API_PREFIX)};
  var HEADER_PREFIX = ${JSON.stringify(HEADER_PREFIX)};
  var FAST_ROUTES = new Map([
${fastRoutes}
  ]);
  var SETTINGS_GET = {
    enabled: ${JSON.stringify(!!config.optimizeSettingsGet)},
    csrfPath: '/csrf-token',
    originalPath: ${JSON.stringify(settingsGetEndpoint.originalPath)},
    fastPath: PREFIX + ${JSON.stringify(settingsGetEndpoint.fastPath)},
    method: ${JSON.stringify(settingsGetEndpoint.method)}
  };
  var TEMPLATE_PRELOAD = {
    enabled: ${JSON.stringify(!!config.templatePreloadEnabled)},
    paths: ${JSON.stringify(templatePreloadList)}
  };
  var STARTUP_PRELOAD = {
    enabled: ${JSON.stringify(!!config.startupPreloadEnabled)},
    versionPath: '/version'
  };
  var EXTENSION_PRELOAD = {
    enabled: ${JSON.stringify(!!config.patchExtensionManifests)}
  };
  var MODULE_PROXY = {
    enabled: ${JSON.stringify(!!config.moduleProxyEnabled)},
    prefix: PREFIX + '/module?path=',
    entryPaths: ${JSON.stringify(MODULE_PROXY_ENTRY_PATHS)},
    scriptExcludedPrefixes: ${JSON.stringify(MODULE_SCRIPT_PROXY_EXCLUDED_PREFIXES)},
    importMapId: ${JSON.stringify(MODULE_IMPORT_MAP_ID)},
    importMap: ${escapeScriptJson(getModuleProxyImportMap())}
  };
  var SETTINGS_SAVE = {
    enabled: ${JSON.stringify(!!config.optimizeSettingsSave)},
    noopEnabled: ${JSON.stringify(!!config.settingsSaveNoopEnabled)},
    patchEnabled: ${JSON.stringify(!!config.settingsSavePatchEnabled)},
    originalGetPath: '/api/settings/get',
    originalSavePath: ${JSON.stringify(settingsSaveEndpoint.originalPath)},
    fastPath: PREFIX + ${JSON.stringify(settingsSaveEndpoint.fastPath)},
    method: ${JSON.stringify(settingsSaveEndpoint.method)},
    hashAlgorithm: ${JSON.stringify(SETTINGS_HASH_ALGORITHM)},
    maxPatchOperations: ${JSON.stringify(config.settingsSaveMaxPatchOperations)},
    maxPatchBytesRatio: ${JSON.stringify(config.settingsSaveMaxPatchBytesRatio)}
  };
  var CHAT_SAVE = {
    enabled: ${JSON.stringify(!!config.optimizeChatSave)},
    noopEnabled: ${JSON.stringify(!!config.chatSaveNoopEnabled)},
    patchEnabled: ${JSON.stringify(!!config.chatSavePatchEnabled)},
    originalGetPath: '/api/chats/get',
    originalGroupGetPath: '/api/chats/group/get',
    originalSavePath: ${JSON.stringify(chatSaveEndpoint.originalPath)},
    originalGroupSavePath: ${JSON.stringify(groupChatSaveEndpoint.originalPath)},
    fastPath: PREFIX + ${JSON.stringify(chatSaveEndpoint.fastPath)},
    groupFastPath: PREFIX + ${JSON.stringify(groupChatSaveEndpoint.fastPath)},
    method: 'POST',
    hashAlgorithm: ${JSON.stringify(CHAT_SAVE_HASH_ALGORITHM)},
    maxPatchOperations: ${JSON.stringify(config.chatSaveMaxPatchOperations)},
    maxPatchBytesRatio: ${JSON.stringify(config.chatSaveMaxPatchBytesRatio)},
    maxBaselines: ${JSON.stringify(config.chatSaveCacheMaxEntries)}
  };
  var FLAG = '__cocktailPlusEarlyBridge';
  var state = window[FLAG] = window[FLAG] || { version: VERSION, installedAt: Date.now(), events: [], patchedFetch: false, swRegisterStarted: false, settingsSave: { baselineHash: '', captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0 }, chatSave: { baselineCount: 0, captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0, evictions: 0 } };
  state.settingsSave = state.settingsSave || { baselineHash: '', captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0 };
  state.chatSave = state.chatSave || { baselineCount: 0, captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0, evictions: 0 };
  var settingsBaseline = null;
  var chatSaveBaselines = new Map();
  var settingsGetPrefetch = null;
  var csrfPrefetch = null;
  var settingsGetCsrfToken = '';
  var fastGetPrefetches = new Map();
  var extensionDiscoverPrefetch = null;
  var extensionManifestPrefetches = new Map();
  var backgroundsAllPrefetch = null;
  var groupsAllPrefetch = null;

  function remember(type, detail) {
    var item = { t: Date.now(), type: type, detail: detail || {} };
    state.events.push(item);
    if (state.events.length > 100) state.events.shift();
    try { console.info('[cocktail-plus:early] ' + type, detail || ''); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('cocktail-plus:early', { detail: item })); } catch (_) {}
  }

  state.startupMarks = state.startupMarks || [];
  state.markStartup = function markStartup(label, detail) {
    var now = 0;
    try { now = Math.round(performance.now() * 10) / 10; } catch (_) { now = Date.now() - state.installedAt; }
    var item = { label: String(label || ''), ms: now, detail: detail || {} };
    state.startupMarks.push(item);
    if (state.startupMarks.length > 200) state.startupMarks.shift();
    remember('startup.mark', item);
    return item;
  };

  function toUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, location.href);
      if (input instanceof URL) return new URL(input.href, location.href);


      if (input && typeof input.url === 'string') return new URL(input.url, location.href);
    } catch (_) {}
    return null;
  }


  function installModuleImportMapIfMissing() {
    try {
      if (!MODULE_PROXY.enabled || !MODULE_PROXY.importMap || document.getElementById(MODULE_PROXY.importMapId)) return;
      var script = document.createElement('script');
      script.type = 'importmap';
      script.id = MODULE_PROXY.importMapId;
      script.dataset.cpModuleProxyImportmap = '1';
      script.textContent = JSON.stringify(MODULE_PROXY.importMap).replace(/</g, '\\u003c');
      var current = document.currentScript;
      if (current && current.parentNode) current.parentNode.insertBefore(script, current.nextSibling);
      else (document.head || document.documentElement).appendChild(script);
      remember('module.importmap-installed', { imports: Object.keys(MODULE_PROXY.importMap.imports || {}).length });
    } catch (error) {
      remember('module.importmap-error', { error: String(error && error.message || error) });
    }
  }


  function moduleProxyUrl(pathname) {
    return MODULE_PROXY.prefix + encodeURIComponent(pathname);
  }

  function shouldProxyModuleScript(src) {
    if (!MODULE_PROXY.enabled || !src) return '';
    try {
      var url = new URL(src, location.href);
      if (url.origin !== location.origin) return '';
      if (url.pathname.startsWith(PREFIX + '/')) return '';
      if (!url.pathname.endsWith('.js')) return '';
      var excludedPrefixes = Array.isArray(MODULE_PROXY.scriptExcludedPrefixes) ? MODULE_PROXY.scriptExcludedPrefixes : [];
      for (var i = 0; i < excludedPrefixes.length; i++) {
        if (url.pathname.startsWith(excludedPrefixes[i])) return '';
      }
      var entryPaths = Array.isArray(MODULE_PROXY.entryPaths) ? MODULE_PROXY.entryPaths : [];
      if (entryPaths.indexOf(url.pathname) !== -1) return url.pathname;
    } catch (_) {}
    return '';
  }

  function proxyModuleScript(script) {
    try {
      if (!script || script.dataset && script.dataset.cpModuleProxy === '1') return;
      var type = String(script.getAttribute('type') || '').toLowerCase();
      if (type !== 'module') return;
      var src = script.getAttribute('src') || '';
      var pathname = shouldProxyModuleScript(src);
      if (!pathname) return;
      script.dataset.cpModuleProxy = '1';
      script.setAttribute('src', moduleProxyUrl(pathname));
      remember('module.proxy-script', { path: pathname });
    } catch (error) {
      remember('module.proxy-script-error', { error: String(error && error.message || error) });
    }
  }


  function rewriteModuleScriptTree(node) {
    try {
      if (!(node instanceof Element)) return;
      if (node.matches && node.matches('script[type="module"][src]')) proxyModuleScript(node);
      node.querySelectorAll && node.querySelectorAll('script[type="module"][src]').forEach(proxyModuleScript);
    } catch (error) {
      remember('module.proxy-tree-error', { error: String(error && error.message || error) });
    }
  }

  function patchModuleScriptInsertionHooks() {
    if (!MODULE_PROXY.enabled || window.__cpModuleInsertionPatched) return;
    window.__cpModuleInsertionPatched = true;

    var rawAppendChild = Node.prototype.appendChild;
    var rawInsertBefore = Node.prototype.insertBefore;
    var rawAppend = Element.prototype.append;
    var rawPrepend = Element.prototype.prepend;

    Node.prototype.appendChild = function cpAppendChild(node) {
      rewriteModuleScriptTree(node);
      return rawAppendChild.call(this, node);
    };

    Node.prototype.insertBefore = function cpInsertBefore(node, child) {
      rewriteModuleScriptTree(node);
      return rawInsertBefore.call(this, node, child);
    };

    Element.prototype.append = function cpAppend() {
      Array.prototype.forEach.call(arguments, rewriteModuleScriptTree);
      return rawAppend.apply(this, arguments);
    };

    Element.prototype.prepend = function cpPrepend() {
      Array.prototype.forEach.call(arguments, rewriteModuleScriptTree);
      return rawPrepend.apply(this, arguments);
    };

    remember('module.proxy-insertion-hooks-ready');
  }

  function patchModuleScripts() {
    if (!MODULE_PROXY.enabled) return;
    try {
      patchModuleScriptInsertionHooks();
      document.querySelectorAll('script[type="module"][src]').forEach(proxyModuleScript);
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes && mutation.addedNodes.forEach(rewriteModuleScriptTree);
        });
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      remember('module.proxy-observer-ready');
    } catch (error) {
      remember('module.proxy-observer-error', { error: String(error && error.message || error) });
    }
  }

  function checkMainModuleProxyStatus(reason) {
    try {
      if (!MODULE_PROXY.enabled) return;
      var scripts = Array.prototype.slice.call(document.querySelectorAll('script[type="module"][src]'));
      var entries = scripts.map(function (script) {
        var raw = script.getAttribute('src') || '';
        var url = new URL(raw, location.href);
        var proxiedPath = '';
        if (url.pathname === PREFIX + '/module') {
          proxiedPath = url.searchParams.get('path') || '';
        }
        return { raw: raw, pathname: url.pathname, proxiedPath: proxiedPath };
      }).filter(function (item) {
        return item.pathname === '/script.js' || item.pathname === '/scripts/i18n.js' || item.proxiedPath === '/script.js' || item.proxiedPath === '/scripts/i18n.js';
      });
      var scriptJsProxied = entries.some(function (item) { return item.proxiedPath === '/script.js'; });
      var i18nProxied = entries.some(function (item) { return item.proxiedPath === '/scripts/i18n.js'; });
      remember(scriptJsProxied ? 'module.main-entry-proxied' : 'module.main-entry-not-proxied', { reason: reason || '', scriptJsProxied: scriptJsProxied, i18nProxied: i18nProxied, entries: entries });
    } catch (error) {
      remember('module.main-entry-status-error', { reason: reason || '', error: String(error && error.message || error) });
    }
  }



  function startFastGetPrefetch(rawFetch, originalPath, fastPath) {
    if (!STARTUP_PRELOAD.enabled || !rawFetch || !originalPath || !fastPath) return null;
    var existing = fastGetPrefetches.get(originalPath);
    if (existing) return existing.promise;
    var record = { path: originalPath, state: 'pending', promise: null, text: '', status: 0, statusText: '', headers: [], error: null, startedAt: Date.now(), finishedAt: 0, durationMs: 0 };
    record.promise = rawFetch(fastPath, {
      method: 'GET',
      headers: new Headers([[HEADER_PREFIX + '-early', VERSION]]),
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual'
    }).then(async function (response) {
      record.status = response.status;
      record.statusText = response.statusText || 'OK';
      record.headers = serializeHeaders(response.headers);
      record.text = await response.text();
      record.state = response.ok ? 'ready' : 'error';
      record.finishedAt = Date.now();
      record.durationMs = record.finishedAt - record.startedAt;
      if (!response.ok) record.error = 'HTTP ' + response.status;
      remember('startup.fast-prefetch-ready', { path: originalPath, status: record.status, durationMs: record.durationMs });
      return record;
    }).catch(function (error) {
      record.state = 'error';
      record.error = String(error && error.message || error);
      record.finishedAt = Date.now();
      record.durationMs = record.finishedAt - record.startedAt;
      remember('startup.fast-prefetch-error', { path: originalPath, error: record.error, durationMs: record.durationMs });
      return record;
    });
    fastGetPrefetches.set(originalPath, record);
    remember('startup.fast-prefetch-start', { path: originalPath, fastPath: fastPath });
    return record.promise;
  }

  function startFastStartupPreloads(rawFetch) {
    if (!STARTUP_PRELOAD.enabled || !rawFetch) return;
    var versionRoute = FAST_ROUTES.get(STARTUP_PRELOAD.versionPath);
    if (versionRoute && versionRoute.method === 'GET') {
      startFastGetPrefetch(rawFetch, STARTUP_PRELOAD.versionPath, versionRoute.path);
    }
  }


  var templateRecords = new Map();

  function normalizeTemplatePath(input) {
    try {
      var url = new URL(input, location.href);
      if (url.origin !== location.origin) return null;
      if (!url.pathname.startsWith('/scripts/templates/') || !url.pathname.endsWith('.html')) return null;
      return url.pathname;
    } catch (_) {
      return null;
    }
  }

  function serializeHeaders(headers) {
    var out = [];
    try { headers.forEach(function (value, key) { out.push([key, value]); }); } catch (_) {}
    return out;
  }

  function startTemplateFetch(pathname) {
    if (!TEMPLATE_PRELOAD.enabled || !pathname) return null;
    var existing = templateRecords.get(pathname);
    if (existing) return existing.promise;
    var record = { pathname: pathname, state: 'pending', promise: null, text: '', status: 0, statusText: '', headers: [], error: null, startedAt: Date.now(), finishedAt: 0 };
    record.promise = fetch(pathname, { method: 'GET', credentials: 'same-origin', cache: 'force-cache' })
      .then(async function (response) {
        record.status = response.status;
        record.statusText = response.statusText || 'OK';
        record.headers = serializeHeaders(response.headers);
        record.text = await response.text();
        record.state = response.ok ? 'ready' : 'error';
        record.finishedAt = Date.now();
        if (!response.ok) record.error = 'HTTP ' + response.status;
        return record;
      })
      .catch(function (error) {
        record.state = 'error';
        record.error = String(error && error.message || error);
        record.finishedAt = Date.now();
        return record;
      });
    templateRecords.set(pathname, record);
    return record.promise;
  }

  function startTemplatePreload() {
    if (!TEMPLATE_PRELOAD.enabled) return;
    var paths = Array.isArray(TEMPLATE_PRELOAD.paths) ? TEMPLATE_PRELOAD.paths : [];
    remember('templates.preload-start', { count: paths.length });
    paths.forEach(startTemplateFetch);
  }

  function getTemplateRecord(pathname) {
    if (!TEMPLATE_PRELOAD.enabled || !pathname) return null;
    var record = templateRecords.get(pathname);
    if (!record) {
      startTemplateFetch(pathname);
      record = templateRecords.get(pathname);
    }
    return record || null;
  }

  function defineXhrValue(xhr, key, value) {
    try { Object.defineProperty(xhr, key, { configurable: true, get: function () { return value; } }); return true; } catch (_) { return false; }
  }

  function fireXhrHandler(xhr, name) {
    try { if (typeof xhr[name] === 'function') xhr[name].call(xhr); } catch (error) { setTimeout(function () { throw error; }, 0); }
  }

  function patchTemplateXHR() {
    if (!TEMPLATE_PRELOAD.enabled) return;
    var NativeXHR = window.XMLHttpRequest;
    if (!NativeXHR || NativeXHR.__cpTemplatePatched) return;
    var rawOpen = NativeXHR.prototype.open;
    var rawSend = NativeXHR.prototype.send;

    NativeXHR.prototype.open = function cpTemplateOpen(method, url, async) {
      var pathname = normalizeTemplatePath(url);
      this.__cpTemplatePath = String(method || '').toUpperCase() === 'GET' && async !== false ? pathname : null;
      return rawOpen.apply(this, arguments);
    };

    NativeXHR.prototype.send = function cpTemplateSend(body) {
      var xhr = this;
      var pathname = xhr.__cpTemplatePath;
      if (!pathname) return rawSend.apply(xhr, arguments);

      var record = getTemplateRecord(pathname);
      if (!record || !record.promise) return rawSend.apply(xhr, arguments);

      record.promise.then(function (ready) {
        if (!ready || ready.state !== 'ready') {
          if (!defineXhrValue(xhr, 'status', ready && ready.status || 0)) return rawSend.call(xhr, body);
          defineXhrValue(xhr, 'statusText', ready && ready.statusText || '');
          defineXhrValue(xhr, 'readyState', 4);
          fireXhrHandler(xhr, 'onreadystatechange');
          fireXhrHandler(xhr, 'onerror');
          fireXhrHandler(xhr, 'onloadend');
          return;
        }
        if (!defineXhrValue(xhr, 'status', ready.status || 200)) return rawSend.call(xhr, body);
        defineXhrValue(xhr, 'statusText', ready.statusText || 'OK');
        if (!defineXhrValue(xhr, 'responseText', ready.text || '')) return rawSend.call(xhr, body);
        defineXhrValue(xhr, 'response', ready.text || '');
        defineXhrValue(xhr, 'readyState', 4);
        fireXhrHandler(xhr, 'onreadystatechange');
        fireXhrHandler(xhr, 'onload');
        fireXhrHandler(xhr, 'onloadend');
        remember('templates.xhr-hit', { path: pathname, waitedMs: Math.max(0, Date.now() - (ready.finishedAt || Date.now())) });
      });
    };

    NativeXHR.__cpTemplatePatched = true;
    remember('templates.xhr-patched', { count: TEMPLATE_PRELOAD.paths && TEMPLATE_PRELOAD.paths.length || 0 });
  }

  function getMethod(input, init) {
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function cloneHeaders(input, init) {
    var headers = new Headers();
    try {
      if (input instanceof Request) input.headers.forEach(function (v, k) { headers.set(k, v); });
      if (init && init.headers) new Headers(init.headers).forEach(function (v, k) { headers.set(k, v); });
    } catch (_) {}
    headers.set(HEADER_PREFIX + '-early', VERSION);
    return headers;
  }

  async function getBody(input, init, method) {
    if (method === 'GET' || method === 'HEAD') return undefined;
    if (init && init.body !== undefined) return init.body;
    try {
      if (input instanceof Request) return await input.clone().arrayBuffer();
    } catch (_) {}
    return undefined;
  }

  function utf8Bytes(text) {
    try { return new TextEncoder().encode(String(text || '')).byteLength; } catch (_) { return String(text || '').length; }
  }

  function bytesToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  async function sha256Hex(text) {
    if (!globalThis.crypto || !crypto.subtle) throw new Error('crypto.subtle is unavailable');
    var data = new TextEncoder().encode(String(text));
    return bytesToHex(await crypto.subtle.digest('SHA-256', data));
  }

  function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (k) { return JSON.stringify(k) + ':' + stableStringify(value[k]); }).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  async function hashSettingsObject(value) {
    return await sha256Hex(stableStringify(value));
  }

  function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function sameJson(a, b) {
    return stableStringify(a) === stableStringify(b);
  }

  function decodeBodyToText(body) {
    if (body === undefined || body === null) return Promise.resolve('');
    if (typeof body === 'string') return Promise.resolve(body);
    if (body instanceof URLSearchParams) return Promise.resolve(body.toString());
    if (body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer) return Promise.resolve(new TextDecoder().decode(body));
    if (ArrayBuffer.isView(body)) return Promise.resolve(new TextDecoder().decode(body));
    return Promise.resolve(String(body));
  }

  async function decodeGzipBodyToText(body) {
    try {
      if (body === undefined || body === null) return '';
      if (typeof DecompressionStream !== 'function') return '';
      var blob = body instanceof Blob ? body : new Blob([body]);
      var stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch (_) {
      return '';
    }
  }

  function getRequestHeader(input, init, name) {
    try {
      var headers = new Headers();
      if (input instanceof Request) input.headers.forEach(function (v, k) { headers.set(k, v); });
      if (init && init.headers) new Headers(init.headers).forEach(function (v, k) { headers.set(k, v); });
      return headers.get(name) || '';
    } catch (_) {
      return '';
    }
  }

  async function getBodyText(input, init, method) {
    if (method === 'GET' || method === 'HEAD') return '';
    var encoding = String(getRequestHeader(input, init, 'content-encoding') || '').toLowerCase();
    var isGzip = encoding.indexOf('gzip') !== -1;
    if (init && init.body !== undefined) {
      return isGzip ? await decodeGzipBodyToText(init.body) : await decodeBodyToText(init.body);
    }
    try {
      if (input instanceof Request) {
        var buffer = await input.clone().arrayBuffer();
        return isGzip ? await decodeGzipBodyToText(buffer) : await decodeBodyToText(buffer);
      }
    } catch (_) {}
    return '';
  }

  function addDiffOps(base, next, path, ops) {
    if (ops.length > SETTINGS_SAVE.maxPatchOperations) return;
    if (sameJson(base, next)) return;
    if (isPlainObject(base) && isPlainObject(next)) {
      var seen = Object.create(null);
      Object.keys(base).forEach(function (key) { seen[key] = true; });
      Object.keys(next).forEach(function (key) { seen[key] = true; });
      Object.keys(seen).sort().forEach(function (key) {
        if (ops.length > SETTINGS_SAVE.maxPatchOperations) return;
        if (!Object.prototype.hasOwnProperty.call(next, key)) {
          ops.push({ op: 'delete', path: path.concat([key]) });
        } else if (!Object.prototype.hasOwnProperty.call(base, key)) {
          ops.push({ op: 'set', path: path.concat([key]), value: cloneJson(next[key]) });
        } else if (isPlainObject(base[key]) && isPlainObject(next[key])) {
          addDiffOps(base[key], next[key], path.concat([key]), ops);
        } else if (!sameJson(base[key], next[key])) {
          ops.push({ op: 'set', path: path.concat([key]), value: cloneJson(next[key]) });
        }
      });
      return;
    }
    ops.push({ op: 'set', path: path, value: cloneJson(next) });
  }

  async function updateSettingsBaseline(settingsObject, reason) {
    try {
      var hash = await hashSettingsObject(settingsObject);
      settingsBaseline = { object: cloneJson(settingsObject), hash: hash, capturedAt: Date.now() };
      state.settingsSave.baselineHash = hash;
      state.settingsSave.captures += 1;
      remember('settings.baseline', { reason: reason, hash: hash, bytes: utf8Bytes(JSON.stringify(settingsObject)) });
    } catch (error) {
      remember('settings.baseline.error', { reason: reason, error: String(error && error.message || error) });
    }
  }

  async function captureSettingsGetText(text, reason) {
    try {
      if (!SETTINGS_SAVE.enabled || !text) return;
      var data = JSON.parse(text);
      if (!data || data.settings === undefined) return;
      var settingsObject = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
      if (settingsObject && typeof settingsObject === 'object') await updateSettingsBaseline(settingsObject, reason);
    } catch (error) {
      remember('settings.get.capture-error', { reason: reason, error: String(error && error.message || error) });
    }
  }

  async function captureSettingsGetResponse(response, reason) {
    try {
      if (!SETTINGS_SAVE.enabled || !response || !response.ok) return;
      await captureSettingsGetText(await response.clone().text(), reason);
    } catch (error) {
      remember('settings.get.capture-error', { error: String(error && error.message || error) });
    }
  }

  function makeSettingsGetHeaders(token) {
    var headers = new Headers();
    headers.set('content-type', 'application/json');
    headers.set(HEADER_PREFIX + '-early', VERSION);
    if (token) headers.set('x-csrf-token', token);
    return headers;
  }

  function responseFromSettingsGetRecord(record) {
    return responseFromRecord(record, '{}');
  }

  function responseFromRecord(record, fallbackText) {
    var headers = new Headers();
    try {
      (record.headers || []).forEach(function (pair) { headers.set(pair[0], pair[1]); });
    } catch (_) {}
    return new Response(record.text || fallbackText || '', { status: record.status || 200, statusText: record.statusText || 'OK', headers: headers });
  }


  function makeApiRecordFromResponse(response, text, startedAt) {
    var headers = [];
    try { response.headers.forEach(function (value, key) { headers.push([key, value]); }); } catch (_) {}
    return { ok: !!response.ok, status: response.status, statusText: response.statusText, headers: headers, text: text, durationMs: Date.now() - startedAt };
  }

  function startExtensionDiscoverPrefetch(rawFetch) {
    var reason = arguments.length > 1 ? arguments[1] : '';
    if (!EXTENSION_PRELOAD.enabled) {
      remember('extensions.discover.prefetch-skip', { reason: reason, cause: 'disabled' });
      return null;
    }
    if (!rawFetch) {
      remember('extensions.discover.prefetch-skip', { reason: reason, cause: 'no-fetch' });
      return null;
    }
    if (extensionDiscoverPrefetch) {
      remember('extensions.discover.prefetch-existing', { reason: reason });
      return extensionDiscoverPrefetch;
    }
    extensionDiscoverPrefetch = (async function () {
      var startedAt = Date.now();
      try {
        remember('extensions.discover.prefetch-start', { reason: reason });
        var response = await rawFetch('/api/extensions/discover', { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'manual' });
        var text = await response.text();
        var record = makeApiRecordFromResponse(response, text, startedAt);
        if (record.ok) startExtensionManifestPrefetches(rawFetch, text);
        remember(record.ok ? 'extensions.discover.prefetch-ready' : 'extensions.discover.prefetch-bad-status', { status: record.status, durationMs: record.durationMs, manifestPrefetches: extensionManifestPrefetches.size });
        return record;
      } catch (error) {
        var record = { ok: false, error: String(error && error.message || error), durationMs: Date.now() - startedAt };
        remember('extensions.discover.prefetch-error', record);
        return record;
      }
    })();
    return extensionDiscoverPrefetch;
  }

  function manifestPathForExtensionName(name) {
    try {
      if (!name || typeof name !== 'string') return '';
      return '/scripts/extensions/' + name.split('/').map(encodeURIComponent).join('/') + '/manifest.json';
    } catch (_) { return ''; }
  }

  function startExtensionManifestPrefetch(rawFetch, name) {
    if (!EXTENSION_PRELOAD.enabled || !rawFetch || !name) return null;
    var pathname = manifestPathForExtensionName(name);
    if (!pathname) return null;
    var existing = extensionManifestPrefetches.get(pathname);
    if (existing) return existing.promise;
    var record = { ok: false, path: pathname, state: 'pending', promise: null, text: '', status: 0, statusText: '', headers: [], error: null, startedAt: Date.now(), finishedAt: 0, durationMs: 0 };
    remember('extensions.manifest.prefetch-start-one', { path: pathname });
    record.promise = rawFetch(pathname, { method: 'GET', credentials: 'same-origin', cache: 'force-cache', redirect: 'manual' })
      .then(async function (response) {
        record.ok = !!response.ok;
        record.status = response.status;
        record.statusText = response.statusText || 'OK';
        record.headers = serializeHeaders(response.headers);
        record.text = await response.text();
        record.state = response.ok ? 'ready' : 'error';
        record.finishedAt = Date.now();
        record.durationMs = record.finishedAt - record.startedAt;
        if (!response.ok) record.error = 'HTTP ' + response.status;
        return record;
      })
      .catch(function (error) {
        record.state = 'error';
        record.error = String(error && error.message || error);
        record.finishedAt = Date.now();
        record.durationMs = record.finishedAt - record.startedAt;
        return record;
      });
    extensionManifestPrefetches.set(pathname, record);
    return record.promise;
  }

  function startExtensionManifestPrefetches(rawFetch, discoverText) {
    if (!EXTENSION_PRELOAD.enabled || !rawFetch || !discoverText) return;
    try {
      var list = JSON.parse(discoverText);
      if (!Array.isArray(list)) return;
      var names = list.map(function (item) { return item && item.name; }).filter(Boolean);
      names.forEach(function (name) { startExtensionManifestPrefetch(rawFetch, name); });
      remember('extensions.manifest.prefetch-start', { count: names.length });
    } catch (error) {
      remember('extensions.manifest.prefetch-list-error', { error: String(error && error.message || error) });
    }
  }

  state.startExtensionPrefetch = function startExtensionPrefetch() {
    var reason = arguments.length > 0 ? arguments[0] : 'manual';
    try {
      var fetcher = state.rawFetch;
      if (!fetcher && !state.patchedFetch && typeof window.fetch === 'function') fetcher = window.fetch.bind(window);
      if (!fetcher) {
        remember('extensions.prefetch-kick-skip', { reason: reason, cause: 'no-raw-fetch', patchedFetch: !!state.patchedFetch });
        return null;
      }
      remember('extensions.prefetch-kick', { reason: reason, hasRawFetch: !!state.rawFetch, extensionPreload: EXTENSION_PRELOAD.enabled });
      return startExtensionDiscoverPrefetch(fetcher, reason);
    } catch (error) {
      remember('extensions.prefetch-kick-error', { error: String(error && error.message || error) });
      return null;
    }
  };

  state.getExtensionManifest = async function getExtensionManifest(name) {
    try {
      var pathname = manifestPathForExtensionName(name);
      var record = pathname ? extensionManifestPrefetches.get(pathname) : null;
      if ((!record || !record.promise) && state.rawFetch) {
        startExtensionManifestPrefetch(state.rawFetch, name);
        record = pathname ? extensionManifestPrefetches.get(pathname) : null;
      }
      if (!record || !record.promise) return null;
      var ready = await record.promise;
      if (!ready || ready.state !== 'ready' || !ready.text) return null;
      return JSON.parse(ready.text);
    } catch (error) {
      remember('extensions.manifest.get-prefetch-error', { name: name, error: String(error && error.message || error) });
      return null;
    }
  };


  function startBackgroundsAllPrefetch(rawFetch, token) {
    if (!STARTUP_PRELOAD.enabled || !rawFetch || !token) return null;
    if (backgroundsAllPrefetch) return backgroundsAllPrefetch;
    backgroundsAllPrefetch = (async function () {
      var startedAt = Date.now();
      try {
        remember('backgrounds.all.prefetch-start');
        var headers = new Headers();
        headers.set('content-type', 'application/json');
        headers.set('x-csrf-token', token);
        headers.set(HEADER_PREFIX + '-early', VERSION);
        var response = await rawFetch('/api/backgrounds/all', { method: 'POST', headers: headers, credentials: 'same-origin', cache: 'no-store', redirect: 'manual', body: '{}' });
        var text = await response.text();
        var record = makeApiRecordFromResponse(response, text, startedAt);
        remember(record.ok ? 'backgrounds.all.prefetch-ready' : 'backgrounds.all.prefetch-bad-status', { status: record.status, durationMs: record.durationMs });
        return record;
      } catch (error) {
        var record = { ok: false, error: String(error && error.message || error), durationMs: Date.now() - startedAt };
        remember('backgrounds.all.prefetch-error', record);
        return record;
      }
    })();
    return backgroundsAllPrefetch;
  }

  function startGroupsAllPrefetch(rawFetch, token) {
    if (!EXTENSION_PRELOAD.enabled || !rawFetch || !token) return null;
    if (groupsAllPrefetch) return groupsAllPrefetch;
    groupsAllPrefetch = (async function () {
      var startedAt = Date.now();
      try {
        remember('groups.all.prefetch-start');
        var headers = new Headers();
        headers.set('x-csrf-token', token);
        headers.set(HEADER_PREFIX + '-early', VERSION);
        var response = await rawFetch('/api/groups/all', { method: 'POST', headers: headers, credentials: 'same-origin', cache: 'no-store', redirect: 'manual' });
        var text = await response.text();
        var record = makeApiRecordFromResponse(response, text, startedAt);
        remember(record.ok ? 'groups.all.prefetch-ready' : 'groups.all.prefetch-bad-status', { status: record.status, durationMs: record.durationMs });
        return record;
      } catch (error) {
        var record = { ok: false, error: String(error && error.message || error), durationMs: Date.now() - startedAt };
        remember('groups.all.prefetch-error', record);
        return record;
      }
    })();
    return groupsAllPrefetch;
  }

  async function consumePrefetchRecord(promise, label, startedAt) {
    if (!promise) return null;
    try {
      var record = await promise;
      var usable = record && (record.ok || record.state === 'ready');
      if (usable) {
        remember(label + '.prefetch-hit', { status: record.status, state: record.state || '', durationMs: Date.now() - startedAt, prefetchDurationMs: record.durationMs });
        return responseFromRecord(record, '');
      }
      remember(label + '.prefetch-unusable', { status: record && record.status, error: record && record.error });
    } catch (error) {
      remember(label + '.prefetch-await-error', { error: String(error && error.message || error) });
    }
    return null;
  }

  function startSettingsGetPrefetch(rawFetch, token) {
    if (!SETTINGS_GET.enabled) return null;
    if (settingsGetPrefetch) return settingsGetPrefetch;
    settingsGetCsrfToken = token || settingsGetCsrfToken || '';
    settingsGetPrefetch = (async function () {
      var startedAt = Date.now();
      try {
        remember('settings.get.prefetch-start', { hasToken: !!settingsGetCsrfToken });
        var response = await rawFetch(SETTINGS_GET.fastPath, {
          method: SETTINGS_GET.method,
          headers: makeSettingsGetHeaders(settingsGetCsrfToken),
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'manual',
          body: '{}'
        });
        var headers = [];
        try { response.headers.forEach(function (value, key) { headers.push([key, value]); }); } catch (_) {}
        var text = await response.text();
        var record = { ok: !!response.ok, status: response.status, statusText: response.statusText, headers: headers, text: text, durationMs: Date.now() - startedAt };
        if (record.ok) {
          await captureSettingsGetText(text, 'settings-get-prefetch');
          remember('settings.get.prefetch-ready', { status: record.status, state: response.headers.get(HEADER_PREFIX + '-settings-get-state') || '', bytes: response.headers.get(HEADER_PREFIX + '-settings-get-bytes') || '', durationMs: record.durationMs });
        } else {
          remember('settings.get.prefetch-bad-status', { status: record.status, durationMs: record.durationMs });
        }
        return record;
      } catch (error) {
        var record = { ok: false, error: String(error && error.message || error), durationMs: Date.now() - startedAt };
        remember('settings.get.prefetch-error', record);
        return record;
      }
    })();
    return settingsGetPrefetch;
  }


  function startCsrfPrefetch(rawFetch) {
    if (!SETTINGS_GET.enabled) return null;
    if (csrfPrefetch) return csrfPrefetch;
    csrfPrefetch = (async function () {
      var startedAt = Date.now();
      try {
        remember('csrf.prefetch-start');
        var response = await rawFetch(SETTINGS_GET.csrfPath, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'manual'
        });
        var headers = [];
        try { response.headers.forEach(function (value, key) { headers.push([key, value]); }); } catch (_) {}
        var text = await response.text();
        var record = { ok: !!response.ok, status: response.status, statusText: response.statusText, headers: headers, text: text, durationMs: Date.now() - startedAt };
        if (record.ok) {
          try {
            var data = JSON.parse(text);
            settingsGetCsrfToken = String(data && data.token || '');
            if (settingsGetCsrfToken) startSettingsGetPrefetch(rawFetch, settingsGetCsrfToken);
            if (settingsGetCsrfToken) startBackgroundsAllPrefetch(rawFetch, settingsGetCsrfToken);
            if (settingsGetCsrfToken) startGroupsAllPrefetch(rawFetch, settingsGetCsrfToken);
          } catch (_) {}
          remember('csrf.prefetch-ready', { status: record.status, durationMs: record.durationMs, startedSettingsGet: !!settingsGetPrefetch });
        } else {
          remember('csrf.prefetch-bad-status', { status: record.status, durationMs: record.durationMs });
        }
        return record;
      } catch (error) {
        var record = { ok: false, error: String(error && error.message || error), durationMs: Date.now() - startedAt };
        remember('csrf.prefetch-error', record);
        return record;
      }
    })();
    return csrfPrefetch;
  }

  async function handleCsrfFetch(rawFetch, input, init) {
    if (SETTINGS_GET.enabled && csrfPrefetch) {
      try {
        var prefetched = await csrfPrefetch;
        if (prefetched && prefetched.ok) {
          remember('csrf.prefetch-hit', { status: prefetched.status, durationMs: prefetched.durationMs });
          return responseFromRecord(prefetched, '{}');
        }
        remember('csrf.prefetch-unusable', { status: prefetched && prefetched.status, error: prefetched && prefetched.error });
      } catch (error) {
        remember('csrf.prefetch-await-error', { error: String(error && error.message || error) });
      }
    }

    var csrfResponse = await rawFetch(input, init);
    await captureCsrfAndPrefetch(rawFetch, csrfResponse);
    return csrfResponse;
  }

  async function captureCsrfAndPrefetch(rawFetch, response) {
    try {
      if (!response || !response.ok) return;
      var data = await response.clone().json();
      settingsGetCsrfToken = String(data && data.token || '');
      if (settingsGetCsrfToken) startSettingsGetPrefetch(rawFetch, settingsGetCsrfToken);
      if (settingsGetCsrfToken) startBackgroundsAllPrefetch(rawFetch, settingsGetCsrfToken);
      if (settingsGetCsrfToken) startGroupsAllPrefetch(rawFetch, settingsGetCsrfToken);
    } catch (error) {
      remember('settings.get.csrf-capture-error', { error: String(error && error.message || error) });
    }
  }

  async function handleSettingsGetFetch(rawFetch, input, init, url, method) {
    if (method !== SETTINGS_GET.method) return null;
    var startedAt = Date.now();
    if (SETTINGS_GET.enabled) {
      if (settingsGetPrefetch) {
        try {
          var prefetched = await settingsGetPrefetch;
          if (prefetched && prefetched.ok) {
            remember('settings.get.prefetch-hit', { status: prefetched.status, durationMs: Date.now() - startedAt, prefetchDurationMs: prefetched.durationMs });
            return responseFromSettingsGetRecord(prefetched);
          }
          remember('settings.get.prefetch-unusable', { status: prefetched && prefetched.status, error: prefetched && prefetched.error });
        } catch (error) {
          remember('settings.get.prefetch-await-error', { error: String(error && error.message || error) });
        }
      }
      try {
        var headers = cloneHeaders(input, init);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
        var bodyText = await getBodyText(input, init, method);
        var fastResponse = await rawFetch(SETTINGS_GET.fastPath, {
          method: SETTINGS_GET.method,
          headers: headers,
          credentials: (init && init.credentials) || 'same-origin',
          cache: 'no-store',
          redirect: 'manual',
          body: bodyText || '{}'
        });
        if (fastResponse && fastResponse.ok) {
          await captureSettingsGetResponse(fastResponse, 'settings-get-fast');
          remember('settings.get.optimized', { status: fastResponse.status, state: fastResponse.headers.get(HEADER_PREFIX + '-settings-get-state') || '', bytes: fastResponse.headers.get(HEADER_PREFIX + '-settings-get-bytes') || '', durationMs: Date.now() - startedAt });
          return fastResponse;
        }
        remember('settings.get.fast-fallback', { status: fastResponse && fastResponse.status, durationMs: Date.now() - startedAt });
      } catch (error) {
        remember('settings.get.fast-error', { error: String(error && error.message || error), durationMs: Date.now() - startedAt });
      }
    }

    var originalResponse = await rawFetch(input, init);
    await captureSettingsGetResponse(originalResponse, 'settings-get-original');
    return originalResponse;
  }

  async function buildSettingsSavePatch(nextObject, originalBytes) {
    if (!settingsBaseline) return null;
    var nextHash = await hashSettingsObject(nextObject);
    if (nextHash === settingsBaseline.hash) {
      if (!SETTINGS_SAVE.noopEnabled) return null;
      var noopBody = {
        mode: 'noop',
        hashAlgorithm: SETTINGS_SAVE.hashAlgorithm,
        baseHash: settingsBaseline.hash,
        nextHash: nextHash,
        originalBytes: originalBytes
      };
      var noopText = JSON.stringify(noopBody);
      noopBody.optimizedBytes = utf8Bytes(noopText);
      noopText = JSON.stringify(noopBody);
      var noopOptimizedBytes = utf8Bytes(noopText);
      noopBody.optimizedBytes = noopOptimizedBytes;
      noopText = JSON.stringify(noopBody);
      return { mode: 'noop', text: noopText, nextHash: nextHash, savedBytes: Math.max(0, originalBytes - noopOptimizedBytes) };
    }
    if (!SETTINGS_SAVE.patchEnabled) return null;
    var ops = [];
    addDiffOps(settingsBaseline.object, nextObject, [], ops);
    if (ops.length === 0) return null;
    if (ops.length > SETTINGS_SAVE.maxPatchOperations) {
      remember('settings.save.patch-too-many-ops', { ops: ops.length });
      return null;
    }
    var patchBody = {
      mode: 'patch',
      hashAlgorithm: SETTINGS_SAVE.hashAlgorithm,
      baseHash: settingsBaseline.hash,
      nextHash: nextHash,
      ops: ops,
      originalBytes: originalBytes
    };
    var patchText = JSON.stringify(patchBody);
    patchBody.optimizedBytes = utf8Bytes(patchText);
    patchText = JSON.stringify(patchBody);
    var optimizedBytes = utf8Bytes(patchText);
    patchBody.optimizedBytes = optimizedBytes;
    patchText = JSON.stringify(patchBody);
    if (originalBytes > 0 && optimizedBytes > originalBytes * SETTINGS_SAVE.maxPatchBytesRatio) {
      remember('settings.save.patch-too-large', { originalBytes: originalBytes, optimizedBytes: optimizedBytes, ops: ops.length });
      return null;
    }
    return { mode: 'patch', text: patchText, nextHash: nextHash, ops: ops.length, savedBytes: Math.max(0, originalBytes - optimizedBytes) };
  }


  function chatIdentityFor(kind, data) {
    if (kind === 'group') {
      var id = String(data && data.id || '');
      if (!id) return null;
      return { kind: 'group', id: id };
    }
    var avatarUrl = String(data && data.avatar_url || '');
    var fileName = String(data && data.file_name || '');
    if (!avatarUrl || !fileName) return null;
    return { kind: 'character', avatar_url: avatarUrl, file_name: fileName, ch_name: String(data && data.ch_name || '') };
  }

  function chatIdentityKey(identity) {
    if (!identity) return '';
    if (identity.kind === 'group') return 'group:' + identity.id;
    return 'character:' + identity.avatar_url + ':' + identity.file_name;
  }

  async function hashChatArray(value) {
    return await sha256Hex(stableStringify(Array.isArray(value) ? value : []));
  }

  function pruneChatBaselines() {
    var limit = Math.max(0, Number(CHAT_SAVE.maxBaselines) || 0);
    if (limit <= 0) {
      state.chatSave.evictions += chatSaveBaselines.size;
      chatSaveBaselines.clear();
    }
    while (limit > 0 && chatSaveBaselines.size > limit) {
      var oldest = chatSaveBaselines.keys().next().value;
      if (oldest === undefined) break;
      chatSaveBaselines.delete(oldest);
      state.chatSave.evictions += 1;
    }
    state.chatSave.baselineCount = chatSaveBaselines.size;
  }

  async function updateChatBaseline(identity, chatArray, reason) {
    try {
      if (!CHAT_SAVE.enabled || !identity || !Array.isArray(chatArray)) return;
      var key = chatIdentityKey(identity);
      if (!key) return;
      var hash = await hashChatArray(chatArray);
      if (chatSaveBaselines.has(key)) chatSaveBaselines.delete(key);
      chatSaveBaselines.set(key, { identity: cloneJson(identity), chat: cloneJson(chatArray), hash: hash, capturedAt: Date.now(), messages: chatArray.length });
      state.chatSave.captures += 1;
      pruneChatBaselines();
      remember('chat.baseline', { reason: reason, kind: identity.kind, key: key, hash: hash, messages: chatArray.length, bytes: utf8Bytes(JSON.stringify(chatArray)) });
    } catch (error) {
      remember('chat.baseline.error', { reason: reason, error: String(error && error.message || error) });
    }
  }

  async function captureChatGetResponse(response, identity, reason) {
    try {
      if (!CHAT_SAVE.enabled || !identity || !response || !response.ok) return;
      var text = await response.clone().text();
      if (!text) return;
      var chatArray = JSON.parse(text);
      if (Array.isArray(chatArray)) await updateChatBaseline(identity, chatArray, reason);
    } catch (error) {
      remember('chat.get.capture-error', { reason: reason, error: String(error && error.message || error) });
    }
  }

  async function handleChatGetFetch(rawFetch, input, init, url, method) {
    if (!CHAT_SAVE.enabled || method !== CHAT_SAVE.method) return null;
    var kind = url.pathname === CHAT_SAVE.originalGroupGetPath ? 'group' : 'character';
    var bodyText = await getBodyText(input, init, method);
    var body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch (_) {}
    var identity = chatIdentityFor(kind, body || {});
    var response = await rawFetch(input, init);
    await captureChatGetResponse(response, identity, kind === 'group' ? 'group-chat-get' : 'chat-get');
    return response;
  }

  function commonPrefixLength(base, next) {
    var len = Math.min(base.length, next.length);
    var i = 0;
    while (i < len && sameJson(base[i], next[i])) i += 1;
    return i;
  }

  function commonSuffixLength(base, next, prefix) {
    var max = Math.min(base.length, next.length) - prefix;
    var i = 0;
    while (i < max && sameJson(base[base.length - 1 - i], next[next.length - 1 - i])) i += 1;
    return i;
  }

  function buildChatDiffOps(baseChat, nextChat) {
    if (!Array.isArray(baseChat) || !Array.isArray(nextChat)) return [];
    var ops = [];
    if (baseChat.length === nextChat.length) {
      for (var i = 0; i < nextChat.length; i++) {
        if (!sameJson(baseChat[i], nextChat[i])) ops.push({ op: 'set', index: i, value: cloneJson(nextChat[i]) });
        if (ops.length > CHAT_SAVE.maxPatchOperations) return ops;
      }
      return ops;
    }
    var prefix = commonPrefixLength(baseChat, nextChat);
    var suffix = commonSuffixLength(baseChat, nextChat, prefix);
    ops.push({
      op: 'splice',
      index: prefix,
      deleteCount: Math.max(0, baseChat.length - prefix - suffix),
      items: cloneJson(nextChat.slice(prefix, nextChat.length - suffix))
    });
    return ops;
  }

  async function buildChatSavePatch(identity, baseline, nextChat, force, originalBytes) {
    if (!CHAT_SAVE.enabled || !identity || !baseline || !Array.isArray(nextChat)) return null;
    var nextHash = await hashChatArray(nextChat);
    if (nextHash === baseline.hash) {
      if (!CHAT_SAVE.noopEnabled) return null;
      var noopBody = {
        mode: 'noop',
        kind: identity.kind,
        identity: cloneJson(identity),
        force: !!force,
        hashAlgorithm: CHAT_SAVE.hashAlgorithm,
        baseHash: baseline.hash,
        nextHash: nextHash,
        originalBytes: originalBytes
      };
      var noopText = JSON.stringify(noopBody);
      noopBody.optimizedBytes = utf8Bytes(noopText);
      noopText = JSON.stringify(noopBody);
      var noopOptimizedBytes = utf8Bytes(noopText);
      noopBody.optimizedBytes = noopOptimizedBytes;
      noopText = JSON.stringify(noopBody);
      return { mode: 'noop', text: noopText, nextHash: nextHash, savedBytes: Math.max(0, originalBytes - noopOptimizedBytes) };
    }
    if (!CHAT_SAVE.patchEnabled) return null;
    var ops = buildChatDiffOps(baseline.chat, nextChat);
    if (ops.length === 0) return null;
    if (ops.length > CHAT_SAVE.maxPatchOperations) {
      remember('chat.save.patch-too-many-ops', { ops: ops.length });
      return null;
    }
    var patchBody = {
      mode: 'patch',
      kind: identity.kind,
      identity: cloneJson(identity),
      force: !!force,
      hashAlgorithm: CHAT_SAVE.hashAlgorithm,
      baseHash: baseline.hash,
      nextHash: nextHash,
      ops: ops,
      originalBytes: originalBytes
    };
    var patchText = JSON.stringify(patchBody);
    patchBody.optimizedBytes = utf8Bytes(patchText);
    patchText = JSON.stringify(patchBody);
    var optimizedBytes = utf8Bytes(patchText);
    patchBody.optimizedBytes = optimizedBytes;
    patchText = JSON.stringify(patchBody);
    if (originalBytes > 0 && optimizedBytes > originalBytes * CHAT_SAVE.maxPatchBytesRatio) {
      remember('chat.save.patch-too-large', { originalBytes: originalBytes, optimizedBytes: optimizedBytes, ops: ops.length, mode: ops[0] && ops[0].op });
      return null;
    }
    return { mode: 'patch', text: patchText, nextHash: nextHash, ops: ops.length, savedBytes: Math.max(0, originalBytes - optimizedBytes) };
  }

  async function handleChatSaveFetch(rawFetch, input, init, url, method) {
    if (!CHAT_SAVE.enabled || method !== CHAT_SAVE.method) return null;
    var startedAt = Date.now();
    var bodyText = await getBodyText(input, init, method);
    if (!bodyText) return null;
    var body;
    try { body = JSON.parse(bodyText); } catch (_) { return null; }
    if (!body || !Array.isArray(body.chat)) return null;
    var kind = url.pathname === CHAT_SAVE.originalGroupSavePath ? 'group' : 'character';
    var identity = chatIdentityFor(kind, body);
    if (!identity) return null;
    var key = chatIdentityKey(identity);
    var baseline = chatSaveBaselines.get(key);
    if (!baseline) {
      remember('chat.save.no-baseline', { kind: kind, key: key });
      return null;
    }
    var originalBytes = utf8Bytes(bodyText);
    var patch = null;
    try { patch = await buildChatSavePatch(identity, baseline, body.chat, body.force, originalBytes); }
    catch (error) { remember('chat.save.patch-error', { error: String(error && error.message || error) }); }

    if (patch) {
      try {
        var headers = cloneHeaders(input, init);
        headers.set('content-type', 'application/json');
        headers.delete && headers.delete('content-encoding');
        var fastPath = kind === 'group' ? CHAT_SAVE.groupFastPath : CHAT_SAVE.fastPath;
        var fastResponse = await rawFetch(fastPath, { method: CHAT_SAVE.method, headers: headers, credentials: (init && init.credentials) || 'same-origin', cache: 'no-store', redirect: 'manual', body: patch.text });
        if (fastResponse && fastResponse.ok) {
          var saveState = fastResponse.headers.get(HEADER_PREFIX + '-chat-save-state') || '';
          state.chatSave.optimized += 1;
          state.chatSave.savedBytes += patch.savedBytes || 0;
          if (saveState !== 'NOOP-STALE') await updateChatBaseline(identity, body.chat, 'chat-save-' + patch.mode);
          remember('chat.save.optimized', { mode: patch.mode, kind: kind, status: fastResponse.status, state: saveState, savedBytes: patch.savedBytes || 0, durationMs: Date.now() - startedAt });
          return fastResponse;
        }
        remember('chat.save.fast-fallback', { mode: patch.mode, kind: kind, status: fastResponse && fastResponse.status, durationMs: Date.now() - startedAt });
      } catch (error) {
        remember('chat.save.fast-error', { mode: patch.mode, kind: kind, error: String(error && error.message || error), durationMs: Date.now() - startedAt });
      }
    }

    var fallbackResponse = await rawFetch(input, init);
    state.chatSave.fallbacks += 1;
    if (fallbackResponse && fallbackResponse.ok) await updateChatBaseline(identity, body.chat, patch ? 'chat-save-fallback' : 'chat-save-original');
    remember('chat.save.original', { kind: kind, status: fallbackResponse && fallbackResponse.status, optimized: false, durationMs: Date.now() - startedAt });
    return fallbackResponse;
  }


  async function handleSettingsSaveFetch(rawFetch, input, init, url, method) {
    if (!SETTINGS_SAVE.enabled || method !== SETTINGS_SAVE.method) return null;
    var startedAt = Date.now();
    var bodyText = await getBodyText(input, init, method);
    if (!bodyText) return null;
    var nextObject;
    try { nextObject = JSON.parse(bodyText); } catch (_) { return null; }
    var originalBytes = utf8Bytes(bodyText);
    var patch = null;
    try { patch = await buildSettingsSavePatch(nextObject, originalBytes); }
    catch (error) { remember('settings.save.patch-error', { error: String(error && error.message || error) }); }

    if (patch) {
      try {
        var headers = cloneHeaders(input, init);
        headers.set('content-type', 'application/json');
        headers.delete && headers.delete('content-encoding');
        var fastResponse = await rawFetch(SETTINGS_SAVE.fastPath, { method: SETTINGS_SAVE.method, headers: headers, credentials: (init && init.credentials) || 'same-origin', cache: 'no-store', redirect: 'manual', body: patch.text });
        if (fastResponse && fastResponse.ok) {
          state.settingsSave.optimized += 1;
          state.settingsSave.savedBytes += patch.savedBytes || 0;
          await updateSettingsBaseline(nextObject, 'settings-save-' + patch.mode);
          remember('settings.save.optimized', { mode: patch.mode, status: fastResponse.status, savedBytes: patch.savedBytes || 0, durationMs: Date.now() - startedAt });
          return fastResponse;
        }
        remember('settings.save.fast-fallback', { mode: patch.mode, status: fastResponse && fastResponse.status, durationMs: Date.now() - startedAt });
      } catch (error) {
        remember('settings.save.fast-error', { mode: patch.mode, error: String(error && error.message || error), durationMs: Date.now() - startedAt });
      }
    }

    var fallbackResponse = await rawFetch(input, init);
    state.settingsSave.fallbacks += 1;
    if (fallbackResponse && fallbackResponse.ok) await updateSettingsBaseline(nextObject, patch ? 'settings-save-fallback' : 'settings-save-original');
    remember('settings.save.original', { status: fallbackResponse && fallbackResponse.status, optimized: false, durationMs: Date.now() - startedAt });
    return fallbackResponse;
  }

  async function callFast(rawFetch, input, init, route, url, method) {
    var startedAt = Date.now();
    if (method === 'GET') {
      var prefetched = fastGetPrefetches.get(url.pathname);
      if (prefetched && prefetched.promise) {
        try {
          var ready = await prefetched.promise;
          if (ready && ready.state === 'ready') {
            remember('startup.fast-prefetch-hit', { path: url.pathname, status: ready.status, durationMs: Date.now() - startedAt, prefetchDurationMs: ready.durationMs });
            return responseFromRecord(ready, '');
          }
        } catch (_) {}
      }
    }
    var headers = cloneHeaders(input, init);
    var body = await getBody(input, init, method);
    if (method !== 'GET' && method !== 'HEAD' && !headers.has('content-type')) headers.set('content-type', 'application/json');

    remember('intercept.start', { path: url.pathname, fastPath: route.path, method: method });
    try {
      var fastInit = {
        method: route.method,
        headers: headers,
        credentials: (init && init.credentials) || 'same-origin',
        cache: 'no-store',
        redirect: 'manual'
      };
      if (route.method !== 'GET' && route.method !== 'HEAD' && body !== undefined) fastInit.body = body;
      var response = await rawFetch(route.path, fastInit);
      if (response && response.status !== 404 && response.status !== 503) {
        var cacheState = response.headers.get(HEADER_PREFIX + '-state') || response.headers.get('x-cocktail-cache') || '';
        remember('intercept.fast-response', { path: url.pathname, status: response.status, cache: cacheState, durationMs: Date.now() - startedAt });
        return response;
      }
      remember('intercept.fallback-status', { path: url.pathname, status: response && response.status, durationMs: Date.now() - startedAt });
    } catch (error) {
      remember('intercept.error', { path: url.pathname, error: String(error && error.message || error), durationMs: Date.now() - startedAt });
    }
    return null;
  }

  function patchFetch() {
    if (state.patchedFetch) return;
    if (typeof window.fetch !== 'function') return;
    var rawFetch = window.fetch.bind(window);
    state.rawFetch = rawFetch;
    startCsrfPrefetch(rawFetch);
    startFastStartupPreloads(rawFetch);
    startExtensionDiscoverPrefetch(rawFetch, 'patch-fetch');
    window.fetch = async function cocktailPlusEarlyFetch(input, init) {
      var url = toUrl(input);
      var method = getMethod(input, init);
      if (url && url.origin === location.origin && url.pathname === SETTINGS_GET.csrfPath && method === 'GET') {
        return await handleCsrfFetch(rawFetch, input, init);
      }
      if (url && url.origin === location.origin && url.pathname === SETTINGS_GET.originalPath && method === SETTINGS_GET.method) {
        var settingsGetResponse = await handleSettingsGetFetch(rawFetch, input, init, url, method);
        if (settingsGetResponse) return settingsGetResponse;
      }
      if (url && url.origin === location.origin && (url.pathname === CHAT_SAVE.originalGetPath || url.pathname === CHAT_SAVE.originalGroupGetPath) && method === CHAT_SAVE.method) {
        var chatGetResponse = await handleChatGetFetch(rawFetch, input, init, url, method);
        if (chatGetResponse) return chatGetResponse;
      }
      if (url && url.origin === location.origin && url.pathname === '/api/extensions/discover' && method === 'GET') {
        var extensionResponse = await consumePrefetchRecord(extensionDiscoverPrefetch, 'extensions.discover', Date.now());
        if (extensionResponse) return extensionResponse;
      }
      if (url && url.origin === location.origin && url.pathname.startsWith('/scripts/extensions/') && url.pathname.endsWith('/manifest.json') && method === 'GET') {
        var manifestResponse = await consumePrefetchRecord(extensionManifestPrefetches.get(url.pathname)?.promise, 'extensions.manifest', Date.now());
        if (manifestResponse) return manifestResponse;
      }
      if (url && url.origin === location.origin && url.pathname === '/api/backgrounds/all' && method === 'POST') {
        var backgroundsResponse = await consumePrefetchRecord(backgroundsAllPrefetch, 'backgrounds.all', Date.now());
        if (backgroundsResponse) return backgroundsResponse;
      }
      if (url && url.origin === location.origin && url.pathname === '/api/groups/all' && method === 'POST') {
        var groupsResponse = await consumePrefetchRecord(groupsAllPrefetch, 'groups.all', Date.now());
        if (groupsResponse) return groupsResponse;
      }
      if (url && url.origin === location.origin && url.pathname === SETTINGS_SAVE.originalSavePath && method === SETTINGS_SAVE.method) {
        var settingsSaveResponse = await handleSettingsSaveFetch(rawFetch, input, init, url, method);
        if (settingsSaveResponse) return settingsSaveResponse;
      }
      if (url && url.origin === location.origin && (url.pathname === CHAT_SAVE.originalSavePath || url.pathname === CHAT_SAVE.originalGroupSavePath) && method === CHAT_SAVE.method) {
        var chatSaveResponse = await handleChatSaveFetch(rawFetch, input, init, url, method);
        if (chatSaveResponse) return chatSaveResponse;
      }
      var route = url && url.origin === location.origin ? FAST_ROUTES.get(url.pathname) : null;
      if (route && method === route.method) {
        var fastResponse = await callFast(rawFetch, input, init, route, url, method);
        if (fastResponse) return fastResponse;
      }
      return rawFetch(input, init);
    };
    state.patchedFetch = true;
    remember('fetch.patched', { routes: Array.from(FAST_ROUTES.keys()), settingsGet: SETTINGS_GET.enabled, settingsSave: SETTINGS_SAVE.enabled, chatSave: CHAT_SAVE.enabled });
  }

  function registerSW() {
    if (state.swRegisterStarted) return;
    state.swRegisterStarted = true;
    if (!('serviceWorker' in navigator)) {
      remember('sw.unsupported');
      return;
    }
    try {
      navigator.serviceWorker.register(PREFIX + '/sw.js', { scope: '/' })
        .then(function (reg) { remember('sw.registered', { scope: reg.scope, controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL || '' }); })
        .catch(function (error) { remember('sw.register.error', { error: String(error && error.message || error) }); });
    } catch (error) {
      remember('sw.register.throw', { error: String(error && error.message || error) });
    }
  }

  function preloadSelf() {
    try {
      var link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = location.origin;
      document.head && document.head.appendChild(link);
    } catch (_) {}
  }

  if (!BRIDGE_ENABLED) { remember('disabled', { version: VERSION }); return; }
  installModuleImportMapIfMissing();
  patchModuleScripts();
  checkMainModuleProxyStatus('bridge-ready');
  try { document.addEventListener('DOMContentLoaded', function () { checkMainModuleProxyStatus('dom-content-loaded'); }, { once: true }); } catch (_) {}
  patchTemplateXHR();
  startTemplatePreload();
  if (PATCH_FETCH) patchFetch();
  else remember('fetch.patch-disabled');
  if (${JSON.stringify(!!config.serviceWorkerEnabled)}) registerSW();
  preloadSelf();
  remember('ready', { version: VERSION, readyState: document.readyState });
})();
`;
}

export function autoEnsureEarlyBridge() {
    if (!config.earlyBridgeEnabled || !config.autoInstallEarlyBridge) return { ok: true, skipped: true, reason: 'disabled', status: getEarlyBridgeStatus() };
    try {
        return installEarlyBridge({ noBackup: false });
    } catch (error) {
        console.warn('[cocktail-plus] Failed to install early bridge:', error);
        return { ok: false, error: error instanceof Error ? error.message : String(error), status: getEarlyBridgeStatus() };
    }
}
