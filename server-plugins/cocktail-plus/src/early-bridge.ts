// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { API_PREFIX, HEADER_PREFIX, PLUGIN_DIR, VERSION } from './constants.js';
import { config } from './config.js';
import { ENDPOINT_LIST } from './endpoint-registry.js';
import { CHAT_SAVE_HASH_ALGORITHM, chatSaveEndpoint, groupChatSaveEndpoint } from './endpoints/chat-save.js';
import { settingsGetEndpoint } from './endpoints/settings-get.js';
import { SETTINGS_HASH_ALGORITHM, settingsSaveEndpoint } from './endpoints/settings-save.js';
import { getServerRoot } from './utils.js';

const MARKER_START = '<!-- cocktail-plus early bridge start -->';
const MARKER_END = '<!-- cocktail-plus early bridge end -->';
const BRIDGE_SCRIPT_ID = 'cocktail-plus-early-bridge';
const BRIDGE_SRC = `${API_PREFIX}/early/bridge.js`;
const BACKUP_DIR = path.join(PLUGIN_DIR, 'backups');
const MODULE_IMPORT_MAP_ID = 'cocktail-plus-module-import-map';
// Only parser/static entry modules are rewritten as <script src="...">. The rest of the module graph should stay
// on SillyTavern's native static file URLs for startup speed; import map only canonicalizes modules that we patch.
const MODULE_PROXY_ENTRY_PATHS = ['/scripts/i18n.js', '/script.js'];
const MODULE_PROXY_IMPORT_PATHS = ['/script.js', '/scripts/i18n.js', '/scripts/system-messages.js', '/scripts/extensions.js', '/scripts/welcome-screen.js'];
const MODULE_SCRIPT_PROXY_EXCLUDED_PREFIXES = ['/scripts/extensions/third-party/'];

function getIndexPath() {
    return path.join(getServerRoot(), 'public', 'index.html');
}

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
    const indexPath = getIndexPath();
    if (!fs.existsSync(indexPath)) return '';
    return fs.readFileSync(indexPath, 'utf8');
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
    const indexPath = getIndexPath();
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
        indexPath,
        bridgeSrc: BRIDGE_SRC,
        markerStartCount,
        markerEndCount,
        scriptIdCount,
        backupDir: BACKUP_DIR,
    };
}

export function installEarlyBridge(options = {}) {
    const indexPath = getIndexPath();
    const html = readIndexHtml();
    if (!html) return { ok: false, error: `index.html not found: ${indexPath}`, status: getEarlyBridgeStatus() };

    const beforeStatus = getEarlyBridgeStatus();
    const { html: nextHtml, mode } = insertBridgeBlock(html);
    const finalHtml = rewriteIndexModuleProxyTags(nextHtml);
    if (finalHtml === html) {
        return { ok: true, changed: false, mode: 'unchanged', backup: null, status: beforeStatus };
    }

    let backup = null;
    if (!options.noBackup) backup = makeBackup(html);
    fs.writeFileSync(indexPath, finalHtml, 'utf8');
    return { ok: true, changed: true, mode, backup, status: getEarlyBridgeStatus() };
}

export function uninstallEarlyBridge(options = {}) {
    const indexPath = getIndexPath();
    const html = readIndexHtml();
    if (!html) return { ok: false, error: `index.html not found: ${indexPath}`, status: getEarlyBridgeStatus() };

    const markerRegex = getMarkerRegex();
    markerRegex.lastIndex = 0;
    if (!markerRegex.test(html)) {
        return { ok: true, changed: false, backup: null, status: getEarlyBridgeStatus() };
    }

    markerRegex.lastIndex = 0;
    const nextHtml = restoreIndexModuleProxyTags(html.replace(markerRegex, '').replace(/\n{3,}/g, '\n\n'));
    let backup = null;
    if (!options.noBackup) backup = makeBackup(html);
    fs.writeFileSync(indexPath, nextHtml, 'utf8');
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
        const dir = path.join(getServerRoot(), 'public', 'scripts', 'templates');
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
    enabled: ${JSON.stringify(!!config.patchExtensionManifests)},
    manifestMaxAgeMs: 10000
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
  var BROWSER_LOGS = {
    enabled: ${JSON.stringify(!!config.browserLogCaptureEnabled)},
    ingestPath: PREFIX + '/browser-logs/ingest',
    beaconPath: PREFIX + '/browser-logs/beacon'
  };
  var FLAG = '__cocktailPlusEarlyBridge';
  var state = window[FLAG] = window[FLAG] || { version: VERSION, installedAt: Date.now(), events: [], patchedFetch: false, swRegisterStarted: false, settingsSave: { baselineHash: '', captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0 }, chatSave: { baselineCount: 0, captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0, evictions: 0 } };
  var PAGE_SESSION_ID = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  state.pageSessionId = PAGE_SESSION_ID;
  state.settingsSave = state.settingsSave || { baselineHash: '', captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0 };
  state.chatSave = state.chatSave || { baselineCount: 0, captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0, evictions: 0 };
  state.charactersLoad = state.charactersLoad || { active: false, phase: 'idle', cache: '', startedAt: 0, updatedAt: 0, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, message: '' };
  state.recentChatsLoad = state.recentChatsLoad || { active: false, phase: 'idle', startedAt: 0, updatedAt: 0, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, message: '', error: null };
  var characterProgressStatusTimer = null;
  var characterProgressRenderTimer = null;
  var characterProgressRowTimer = null;
  var recentProgressRenderTimer = null;
  var recentProgressRemoveTimer = null;
  var recentChatsPatchBaselines = new Map();
  var characterGetPatchBaselines = new Map();

  function cpNumber(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function cpClampPercent(value) {
    var n = cpNumber(value, null);
    return n === null ? null : Math.max(0, Math.min(100, n));
  }

  function cpFormatBytes(value) {
    var bytes = Math.max(0, cpNumber(value, 0) || 0);
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i += 1; }
    return bytes.toFixed(i === 0 ? 0 : bytes >= 10 ? 1 : 2) + units[i];
  }

  function cpFormatDuration(value) {
    var seconds = Math.max(0, Math.round((cpNumber(value, 0) || 0) / 1000));
    if (seconds < 60) return seconds + 's';
    var minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    if (minutes < 60) return minutes + 'm ' + seconds + 's';
    var hours = Math.floor(minutes / 60);
    return hours + 'h ' + (minutes % 60) + 'm';
  }

  function cpGetCharactersBlock() {
    try { return document.getElementById('rm_print_characters_block'); } catch (_) { return null; }
  }

  function cpHasCharacterRows(block) {
    try { return !!(block && block.querySelector('.character_select,.group_select,.bogus_folder_select')); } catch (_) { return false; }
  }

  function cpEnsureCharacterProgressStyle() {
    try {
      if (document.getElementById('cocktail-plus-character-load-style')) return;
      var style = document.createElement('style');
      style.id = 'cocktail-plus-character-load-style';
      style.textContent = [
        '#cocktail-plus-character-load-progress{box-sizing:border-box;width:calc(100% - 12px);margin:8px 6px 10px;padding:12px;border:1px solid rgba(120,170,255,.35);border-radius:10px;background:linear-gradient(180deg,rgba(35,45,65,.96),rgba(22,28,40,.96));box-shadow:0 8px 24px rgba(0,0,0,.18);color:#e9f1ff;font-size:13px;line-height:1.45;}',
        '#cocktail-plus-character-load-progress .cp-char-progress-title{font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px;}',
        '#cocktail-plus-character-load-progress .cp-char-progress-title:before{content:"";display:inline-block;width:8px;height:8px;border-radius:999px;background:#7ab6ff;box-shadow:0 0 10px #7ab6ff;}',
        '#cocktail-plus-character-load-progress .cp-char-progress-message{opacity:.92;margin-bottom:8px;}',
        '#cocktail-plus-character-load-progress .cp-char-progress-track{position:relative;overflow:hidden;height:8px;border-radius:999px;background:rgba(255,255,255,.12);}',
        '#cocktail-plus-character-load-progress .cp-char-progress-bar{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#69d2ff,#8f8cff);transition:width .18s ease;}',
        '#cocktail-plus-character-load-progress.cp-indeterminate .cp-char-progress-bar{width:38%;animation:cpCharIndeterminate 1.2s ease-in-out infinite;}',
        '#cocktail-plus-character-load-progress .cp-char-progress-meta{margin-top:8px;display:flex;flex-wrap:wrap;gap:8px 12px;opacity:.78;font-size:12px;}',
        '#rm_print_characters_block.cp-character-loading .empty_block{display:none!important;}',
        '@keyframes cpCharIndeterminate{0%{transform:translateX(-110%)}50%{transform:translateX(60%)}100%{transform:translateX(260%)}}'
      ].join('');
      (document.head || document.documentElement).appendChild(style);
    } catch (_) {}
  }

  function cpEnsureCharacterProgressElement() {
    var block = cpGetCharactersBlock();
    if (!block || cpHasCharacterRows(block)) return null;
    cpEnsureCharacterProgressStyle();
    block.classList.add('cp-character-loading');
    var el = document.getElementById('cocktail-plus-character-load-progress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cocktail-plus-character-load-progress';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<div class="cp-char-progress-title">鸡尾酒+ 正在加载角色列表</div><div class="cp-char-progress-message"></div><div class="cp-char-progress-track"><div class="cp-char-progress-bar"></div></div><div class="cp-char-progress-meta"></div>';
    }
    if (el.parentNode !== block) block.insertBefore(el, block.firstChild || null);
    return el;
  }

  function cpProgressMessage(data) {
    if (data && data.message) return data.message;
    var cache = String(data && data.cache || '');
    var phase = String(data && data.phase || '');
    if (cache === 'ASYNC-MISS') return '后端正在构建角色缓存，首次加载可能较久…';
    if (phase === 'requesting' || phase === 'starting') return '等待 SillyTavern 原始接口返回角色列表…';
    if (phase === 'scanning') return '正在扫描角色卡文件…';
    if (phase === 'reading') return '正在读取角色卡元数据并构建缓存…';
    if (phase === 'downloading') return '正在下载角色列表数据…';
    if (phase === 'transforming') return '正在整理角色缓存…';
    if (phase === 'cached') return '缓存已就绪，正在刷新角色列表…';
    if (phase === 'rendering') return '角色数据已返回，正在解析并渲染列表…';
    if (phase === 'error') return '角色列表加载遇到问题，正在回退/等待重试…';
    return '正在加载角色列表…';
  }

  function cpRenderCharacterProgress() {
    try {
      var data = state.charactersLoad || {};
      if (!data.active) return;
      var block = cpGetCharactersBlock();
      if (cpHasCharacterRows(block)) { cpRemoveCharacterProgress(); return; }
      var el = cpEnsureCharacterProgressElement();
      if (!el) return;
      var percent = cpClampPercent(data.percent);
      var determinate = percent !== null;
      el.classList.toggle('cp-indeterminate', !determinate);
      var bar = el.querySelector('.cp-char-progress-bar');
      if (bar && determinate) bar.style.width = percent.toFixed(1) + '%';
      var msg = el.querySelector('.cp-char-progress-message');
      if (msg) msg.textContent = cpProgressMessage(data);
      var parts = [];
      var received = Math.max(0, cpNumber(data.bytesReceived, 0) || 0);
      var total = cpNumber(data.totalBytes, null);
      var phase = String(data.phase || '');
      var bytesLabel = (phase === 'reading' || phase === 'scanning') ? '已读取 ' : (phase === 'transforming' || phase === 'cached') ? '已处理 ' : '已接收 ';
      var speedLabel = (phase === 'reading' || phase === 'scanning') ? '读取速度 ' : (phase === 'transforming' || phase === 'cached') ? '处理速度 ' : '';
      if (total && total > 0) parts.push(bytesLabel + cpFormatBytes(received) + ' / ' + cpFormatBytes(total));
      else if (received > 0) parts.push(bytesLabel + cpFormatBytes(received));
      if (determinate) parts.push(percent.toFixed(1) + '%');
      if ((cpNumber(data.speedBps, 0) || 0) > 0) parts.push(speedLabel + cpFormatBytes(data.speedBps) + '/s');
      if (cpNumber(data.etaMs, null) !== null && (cpNumber(data.etaMs, 0) || 0) > 0) parts.push('剩余 ' + cpFormatDuration(data.etaMs));
      else if (data.startedAt) parts.push('已用 ' + cpFormatDuration(Date.now() - data.startedAt));
      if (cpNumber(data.totalCount, null) !== null) parts.push('角色 ' + (cpNumber(data.count, 0) || 0) + ' / ' + (cpNumber(data.totalCount, 0) || 0));
      else if (cpNumber(data.count, null) !== null) parts.push('角色 ' + (cpNumber(data.count, 0) || 0));
      if ((cpNumber(data.errors, 0) || 0) > 0) parts.push('跳过 ' + (cpNumber(data.errors, 0) || 0));
      if (data.cache) parts.push('缓存状态 ' + data.cache);
      if (data.phase) parts.push('阶段 ' + data.phase);
      if (data.error) parts.push('错误 ' + data.error);
      var meta = el.querySelector('.cp-char-progress-meta');
      if (meta) meta.textContent = parts.join(' · ');
    } catch (error) {
      remember('characters.progress.render-error', { error: String(error && error.message || error) });
    }
  }

  function cpStartCharacterRenderTimer() {
    if (characterProgressRenderTimer) return;
    characterProgressRenderTimer = setInterval(function () {
      if (!state.charactersLoad || !state.charactersLoad.active) { clearInterval(characterProgressRenderTimer); characterProgressRenderTimer = null; return; }
      cpRenderCharacterProgress();
    }, 500);
  }

  function cpUpdateCharacterProgress(patch) {
    var now = Date.now();
    var previous = state.charactersLoad || {};
    var next = Object.assign({}, previous, patch || {});
    next.active = patch && patch.active !== undefined ? !!patch.active : true;
    next.startedAt = next.startedAt || now;
    next.updatedAt = now;
    next.bytesReceived = Math.max(0, cpNumber(next.bytesReceived, 0) || 0);
    next.totalBytes = cpNumber(next.totalBytes, null);
    if (!(next.totalBytes > 0)) next.totalBytes = null;
    next.speedBps = Math.max(0, cpNumber(next.speedBps, 0) || 0);
    next.percent = cpClampPercent(next.percent);
    next.etaMs = cpNumber(next.etaMs, null);
    state.charactersLoad = next;
    cpStartCharacterRenderTimer();
    try { window.dispatchEvent(new CustomEvent('cocktail-plus:characters-progress', { detail: Object.assign({}, next) })); } catch (_) {}
    cpRenderCharacterProgress();
    return next;
  }

  function cpRemoveCharacterProgress() {
    try {
      if (characterProgressStatusTimer) { clearTimeout(characterProgressStatusTimer); characterProgressStatusTimer = null; }
      if (characterProgressRowTimer) { clearInterval(characterProgressRowTimer); characterProgressRowTimer = null; }
      state.charactersLoad.active = false;
      var block = cpGetCharactersBlock();
      if (block) block.classList.remove('cp-character-loading');
      var el = document.getElementById('cocktail-plus-character-load-progress');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (_) {}
  }

  function cpWaitRowsThenRemove(maxMs) {
    if (characterProgressRowTimer) clearInterval(characterProgressRowTimer);
    var started = Date.now();
    characterProgressRowTimer = setInterval(function () {
      if (cpHasCharacterRows(cpGetCharactersBlock()) || Date.now() - started > Math.max(1000, maxMs || 20000)) {
        clearInterval(characterProgressRowTimer);
        characterProgressRowTimer = null;
        cpRemoveCharacterProgress();
      }
    }, 500);
  }

  function cpFinishCharacterProgress(reason, delayMs) {
    if (reason) cpUpdateCharacterProgress({ phase: reason === 'rendered' ? 'rendered' : 'cached', message: reason === 'rendered' ? '角色列表已显示' : '缓存已就绪，正在刷新角色列表…', percent: 100, etaMs: 0 });
    if (characterProgressStatusTimer) { clearTimeout(characterProgressStatusTimer); characterProgressStatusTimer = null; }
    setTimeout(function () { cpWaitRowsThenRemove(15000); }, Math.max(0, delayMs || 0));
  }

  function cpStartCharacterStatusPolling(rawFetch, sourceHeaders) {
    if (characterProgressStatusTimer) clearTimeout(characterProgressStatusTimer);
    var started = Date.now();
    var poll = async function () {
      try {
        if (!state.charactersLoad || !state.charactersLoad.active) return;
        var headers = new Headers();
        try {
          var token = sourceHeaders && sourceHeaders.get && sourceHeaders.get('x-csrf-token');
          if (token) headers.set('x-csrf-token', token);
          var auth = sourceHeaders && sourceHeaders.get && sourceHeaders.get('authorization');
          if (auth) headers.set('authorization', auth);
        } catch (_) {}
        if (settingsGetCsrfToken && !headers.has('x-csrf-token')) headers.set('x-csrf-token', settingsGetCsrfToken);
        headers.set('content-type', 'application/json');
        headers.set(HEADER_PREFIX + '-early', VERSION);
        var response = await rawFetch(PREFIX + '/status', { method: 'POST', headers: headers, credentials: 'same-origin', cache: 'no-store', redirect: 'manual', body: '{}' });
        if (response && response.ok) {
          var data = await response.json();
          var rows = Array.isArray(data && data.status) ? data.status : [];
          var row = rows.find(function (item) { return item && item.endpointKey === 'characters-all'; });
          if (row && row.progress) cpUpdateCharacterProgress(Object.assign({ cache: 'ASYNC-MISS' }, row.progress));
          else cpUpdateCharacterProgress({ cache: 'ASYNC-MISS', phase: row && row.refreshing ? 'requesting' : 'starting' });
          if (row && row.entry && !row.refreshing) { cpFinishCharacterProgress('cached', 1200); return; }
        }
      } catch (error) {
        cpUpdateCharacterProgress({ phase: 'requesting', error: String(error && error.message || error) });
      }
      if (Date.now() - started > 5 * 60 * 1000) { cpUpdateCharacterProgress({ phase: 'error', error: 'status polling timeout' }); return; }
      characterProgressStatusTimer = setTimeout(poll, 700);
    };
    characterProgressStatusTimer = setTimeout(poll, 300);
  }

  function cpGetRecentChatList() {
    try {
      var lists = cpGetRecentChatLists();
      for (var i = 0; i < lists.length; i++) {
        if (lists[i] && lists[i].querySelector('#cocktail-plus-recent-load-progress')) return lists[i];
      }
      return document.querySelector('#chat .welcomePanel .recentChatList') || document.querySelector('.welcomePanel .recentChatList');
    } catch (_) { return null; }
  }

  function cpGetRecentChatLists() {
    try { return Array.prototype.slice.call(document.querySelectorAll('.welcomePanel .recentChatList')); } catch (_) { return []; }
  }

  function cpGetRecentProgressHost() {
    try { return document.querySelector('#chat .welcomePanel .recentChatsTitle') || document.querySelector('.welcomePanel .recentChatsTitle') || cpGetRecentChatList(); } catch (_) { return null; }
  }

  function cpEnsureRecentProgressStyle() {
    try {
      if (document.getElementById('cocktail-plus-recent-load-style')) return;
      var style = document.createElement('style');
      style.id = 'cocktail-plus-recent-load-style';
      style.textContent = [
        '#cocktail-plus-recent-load-progress{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:min(46vw,360px);margin-left:10px;padding:2px 7px;border:1px solid rgba(120,220,255,.38);border-radius:999px;background:rgba(18,34,46,.72);color:#e9f8ff;font-size:11px;font-weight:500;line-height:1.2;vertical-align:middle;white-space:nowrap;overflow:hidden;}',
        '#cocktail-plus-recent-load-progress .cp-recent-progress-title{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;font-weight:700;}',
        '#cocktail-plus-recent-load-progress .cp-recent-progress-title:before{content:"";display:inline-block;width:6px;height:6px;border-radius:999px;background:#72e0ff;box-shadow:0 0 8px #72e0ff;}',
        '#cocktail-plus-recent-load-progress .cp-recent-progress-message{display:none;}',
        '#cocktail-plus-recent-load-progress .cp-recent-progress-track{position:relative;overflow:hidden;flex:0 0 44px;width:44px;height:4px;border-radius:999px;background:rgba(255,255,255,.16);}',
        '#cocktail-plus-recent-load-progress .cp-recent-progress-bar{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#6ee7ff,#8fffb8);transition:width .18s ease;}',
        '#cocktail-plus-recent-load-progress.cp-indeterminate .cp-recent-progress-bar{width:38%;animation:cpRecentIndeterminate 1.2s ease-in-out infinite;}',
        '#cocktail-plus-recent-load-progress .cp-recent-progress-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:.82;font-size:11px;font-weight:400;}',
        '.welcomePanel .recentChatList.cp-recent-loading .noRecentChat{display:none!important;}',
        '@keyframes cpRecentIndeterminate{0%{transform:translateX(-110%)}50%{transform:translateX(60%)}100%{transform:translateX(260%)}}'
      ].join('');
      (document.head || document.documentElement).appendChild(style);
    } catch (_) {}
  }

  function cpEnsureRecentProgressElement() {
    var host = cpGetRecentProgressHost();
    if (!host) return null;
    cpEnsureRecentProgressStyle();
    cpGetRecentChatLists().forEach(function (list) {
      try { list.classList.add('cp-recent-loading'); } catch (_) {}
    });
    var el = document.getElementById('cocktail-plus-recent-load-progress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cocktail-plus-recent-load-progress';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<span class="cp-recent-progress-title">加载最近</span><span class="cp-recent-progress-message"></span><span class="cp-recent-progress-track"><span class="cp-recent-progress-bar"></span></span><span class="cp-recent-progress-meta"></span>';
    }
    if (el.parentNode !== host) host.appendChild(el);
    return el;
  }

  function cpRecentProgressMessage(data) {
    if (data && data.message) return data.message;
    var phase = String(data && data.phase || '');
    if (phase === 'requesting' || phase === 'starting') return '等待 /recent 返回最近消息…';
    if (phase === 'downloading') return '正在接收最近消息列表…';
    if (phase === 'rendering' || phase === 'parsing') return '正在解析并渲染最近消息…';
    if (phase === 'rendered') return '最近消息已显示';
    if (phase === 'cancelled') return '最近消息加载已取消';
    if (phase === 'error') return '最近消息加载遇到问题。';
    return '正在加载最近消息…';
  }

  function cpRecentListHasRenderedContent(expectedItems) {
    try {
      var lists = cpGetRecentChatLists();
      var expected = cpNumber(expectedItems, null);
      for (var i = 0; i < lists.length; i++) {
        var list = lists[i];
        if (!list) continue;
        if (expected === 0 && list.querySelector('.noRecentChat')) return true;
        if (expected === null && list.querySelector('.recentChat,[data-file],.noRecentChat')) return true;
        if ((expected === null || expected > 0) && list.querySelector('.recentChat,[data-file]')) return true;
        if (expected > 0) {
          var children = Array.prototype.slice.call(list.children || []);
          for (var j = 0; j < children.length; j++) {
            var child = children[j];
            if (!child) continue;
            if (child.id === 'cocktail-plus-recent-load-progress') continue;
            if (child.classList && child.classList.contains('noRecentChat')) continue;
            if (child.classList && child.classList.contains('showMoreChats')) continue;
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
  }

  function cpRenderRecentProgress() {
    try {
      var data = state.recentChatsLoad || {};
      if (!data.active) return;
      if (String(data.phase || '') === 'rendering' && cpRecentListHasRenderedContent(data.expectedItems)) {
        cpRemoveRecentProgress();
        return;
      }
      var el = cpEnsureRecentProgressElement();
      if (!el) return;
      var percent = cpClampPercent(data.percent);
      var determinate = percent !== null;
      el.classList.toggle('cp-indeterminate', !determinate);
      var bar = el.querySelector('.cp-recent-progress-bar');
      if (bar && determinate) bar.style.width = percent.toFixed(1) + '%';
      var msg = el.querySelector('.cp-recent-progress-message');
      if (msg) msg.textContent = cpRecentProgressMessage(data);
      var parts = [];
      var received = Math.max(0, cpNumber(data.bytesReceived, 0) || 0);
      var total = cpNumber(data.totalBytes, null);
      if (total && total > 0) parts.push('已接收 ' + cpFormatBytes(received) + ' / ' + cpFormatBytes(total));
      else if (received > 0) parts.push('已接收 ' + cpFormatBytes(received));
      if (determinate) parts.push(percent.toFixed(1) + '%');
      if ((cpNumber(data.speedBps, 0) || 0) > 0) parts.push(cpFormatBytes(data.speedBps) + '/s');
      if (cpNumber(data.etaMs, null) !== null && (cpNumber(data.etaMs, 0) || 0) > 0) parts.push('剩余 ' + cpFormatDuration(data.etaMs));
      if (data.startedAt) {
        var currentPhase = String(data.phase || '');
        parts.push((currentPhase === 'requesting' || currentPhase === 'starting' ? '等待 ' : '已用 ') + cpFormatDuration(Date.now() - data.startedAt));
      }
      if (data.status) parts.push('HTTP ' + data.status);
      if (data.phase) parts.push('阶段 ' + data.phase);
      if (data.error) parts.push('错误 ' + data.error);
      var meta = el.querySelector('.cp-recent-progress-meta');
      if (meta) meta.textContent = parts.join(' · ');
    } catch (error) {
      remember('recent.progress.render-error', { error: String(error && error.message || error) });
    }
  }

  function cpStartRecentRenderTimer() {
    if (recentProgressRenderTimer) return;
    recentProgressRenderTimer = setInterval(function () {
      if (!state.recentChatsLoad || !state.recentChatsLoad.active) { clearInterval(recentProgressRenderTimer); recentProgressRenderTimer = null; return; }
      cpRenderRecentProgress();
    }, 500);
  }

  function cpUpdateRecentProgress(patch) {
    var now = Date.now();
    var previous = state.recentChatsLoad || {};
    var next = Object.assign({}, previous, patch || {});
    next.active = patch && patch.active !== undefined ? !!patch.active : true;
    next.startedAt = patch && patch.startedAt !== undefined ? patch.startedAt : (next.startedAt || now);
    next.updatedAt = now;
    next.bytesReceived = Math.max(0, cpNumber(next.bytesReceived, 0) || 0);
    next.totalBytes = cpNumber(next.totalBytes, null);
    if (!(next.totalBytes > 0)) next.totalBytes = null;
    next.speedBps = Math.max(0, cpNumber(next.speedBps, 0) || 0);
    next.percent = cpClampPercent(next.percent);
    next.etaMs = cpNumber(next.etaMs, null);
    next.status = cpNumber(next.status, null);
    state.recentChatsLoad = next;
    cpStartRecentRenderTimer();
    try { window.dispatchEvent(new CustomEvent('cocktail-plus:recent-progress', { detail: Object.assign({}, next) })); } catch (_) {}
    cpRenderRecentProgress();
    return next;
  }

  function cpStartRecentChatsProgress() {
    if (recentProgressRemoveTimer) { clearTimeout(recentProgressRemoveTimer); recentProgressRemoveTimer = null; }
    return cpUpdateRecentProgress({ active: true, phase: 'requesting', startedAt: Date.now(), updatedAt: Date.now(), bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null, message: '正在加载最近消息…' });
  }

  function cpRemoveRecentProgress() {
    try {
      if (recentProgressRemoveTimer) { clearTimeout(recentProgressRemoveTimer); recentProgressRemoveTimer = null; }
      state.recentChatsLoad.active = false;
      cpGetRecentChatLists().forEach(function (list) {
        try { list.classList.remove('cp-recent-loading'); } catch (_) {}
      });
      Array.prototype.slice.call(document.querySelectorAll('#cocktail-plus-recent-load-progress')).forEach(function (el) {
        try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (_) {}
      });
    } catch (_) {}
  }

  function cpFinishRecentChatsProgress(reason, delayMs) {
    var phase = reason === 'cancelled' ? 'cancelled' : 'rendered';
    var message = reason === 'cancelled' ? '最近消息加载已取消' : '最近消息已显示';
    cpUpdateRecentProgress({ phase: phase, message: message, percent: 100, etaMs: 0, error: null });
    if (recentProgressRemoveTimer) { clearTimeout(recentProgressRemoveTimer); recentProgressRemoveTimer = null; }
    var removeDelayMs = Math.max(0, delayMs === undefined ? 0 : delayMs);
    if (removeDelayMs <= 0) { cpRemoveRecentProgress(); return; }
    recentProgressRemoveTimer = setTimeout(cpRemoveRecentProgress, removeDelayMs);
  }

  function cpFailRecentChatsProgress(error, delayMs) {
    cpUpdateRecentProgress({ phase: 'error', message: '最近消息加载遇到问题。', error: String(error && error.message || error), etaMs: null });
    if (recentProgressRemoveTimer) { clearTimeout(recentProgressRemoveTimer); recentProgressRemoveTimer = null; }
    recentProgressRemoveTimer = setTimeout(cpRemoveRecentProgress, Math.max(0, delayMs === undefined ? 5000 : delayMs));
  }

  function cpParseContentLength(headers) {
    try {
      var raw = headers && headers.get && headers.get('content-length');
      var value = Number(raw);
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch (_) { return null; }
  }

  function cpRecentTransferPatch(phase, startedAt, bytesReceived, totalBytes, extra) {
    var elapsedMs = Math.max(1, Date.now() - startedAt);
    var speedBps = bytesReceived > 0 ? bytesReceived / (elapsedMs / 1000) : 0;
    var hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;
    var percent = hasTotal ? Math.max(0, Math.min(100, bytesReceived / totalBytes * 100)) : null;
    var etaMs = hasTotal && speedBps > 0 ? Math.max(0, (totalBytes - bytesReceived) / speedBps * 1000) : null;
    return Object.assign({ phase: phase, startedAt: startedAt, bytesReceived: bytesReceived, totalBytes: hasTotal ? totalBytes : null, speedBps: speedBps, percent: percent, etaMs: etaMs }, extra || {});
  }

  state.startRecentChatsProgress = cpStartRecentChatsProgress;
  state.updateRecentChatsProgress = cpUpdateRecentProgress;
  state.finishRecentChatsProgress = cpFinishRecentChatsProgress;
  state.failRecentChatsProgress = cpFailRecentChatsProgress;



  state.updateCharactersLoadProgress = cpUpdateCharacterProgress;
  state.finishCharactersLoadProgress = cpFinishCharacterProgress;


  function cpEndpointsToInvalidate(pathname) {
    var out = [];
    if (String(pathname || '').startsWith('/api/characters/') && pathname !== '/api/characters/all' && pathname !== '/api/characters/get' && pathname !== '/api/characters/chats' && pathname !== '/api/characters/export') out.push('characters-all');
    if (pathname === '/api/chats/save' || pathname === '/api/chats/group/save' || pathname === '/api/chats/delete' || pathname === '/api/chats/group/delete' || pathname === '/api/chats/import' || pathname === '/api/chats/group/import') out.push('characters-all');
    return out.filter(function (item, index) { return item && out.indexOf(item) === index; });
  }

  async function cpNotifyInvalidate(rawFetch, input, init, endpoints, reason) {
    try {
      if (!rawFetch || !endpoints || !endpoints.length) return;
      var headers = cloneHeaders(input, init);
      headers.set('content-type', 'application/json');
      await rawFetch(PREFIX + '/invalidate', {
        method: 'POST',
        headers: headers,
        credentials: (init && init.credentials) || 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        body: JSON.stringify({ endpoints: endpoints, reason: reason || '' })
      });
      remember('invalidate.done', { endpoints: endpoints, reason: reason || '' });
    } catch (error) {
      remember('invalidate.error', { endpoints: endpoints || [], reason: reason || '', error: String(error && error.message || error) });
    }
  }

  function cpShouldInvalidateSettingsGet(pathname) {
    return pathname === '/api/worldinfo/import'
      || pathname === '/api/worldinfo/delete'
      || pathname === '/api/worldinfo/edit'
      || pathname === SETTINGS_SAVE.originalSavePath;
  }

  async function cpInvalidateSettingsGet(rawFetch, input, init, reason) {
    try {
      settingsGetPrefetch = null;
      var headers = cloneHeaders(input, init);
      headers.set('content-type', 'application/json');
      await rawFetch(PREFIX + '/cache/clear', {
        method: 'POST',
        headers: headers,
        credentials: (init && init.credentials) || 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        body: JSON.stringify({ endpoints: [] })
      });
      remember('settings.get.invalidate', { reason: reason || '' });
    } catch (error) {
      remember('settings.get.invalidate-error', { reason: reason || '', error: String(error && error.message || error) });
    }
  }

  async function cpFetchWithInvalidation(rawFetch, input, init, url, method) {
    var endpoints = url && url.origin === location.origin && method === 'POST' ? cpEndpointsToInvalidate(url.pathname) : [];
    var invalidateSettingsGet = url && url.origin === location.origin && method === 'POST' && cpShouldInvalidateSettingsGet(url.pathname);
    if (!endpoints.length && !invalidateSettingsGet) return rawFetch(input, init);
    var response = await rawFetch(input, init);
    if (response && response.ok) {
      if (endpoints.length) await cpNotifyInvalidate(rawFetch, input, init, endpoints, url.pathname);
      if (invalidateSettingsGet) await cpInvalidateSettingsGet(rawFetch, input, init, url.pathname);
    }
    return response;
  }

  var settingsBaseline = null;
  var chatSaveBaselines = new Map();
  var settingsGetPrefetch = null;
  var csrfPrefetch = null;
  var settingsGetCsrfToken = '';
  var characterEditRecoveryQueues = new Map();
  var fastGetPrefetches = new Map();
  var extensionDiscoverPrefetch = null;
  var extensionManifestPrefetches = new Map();
  var extensionResourcePreloads = new Set();
  var charactersAllWarmPrefetch = null;
  var backgroundsAllPrefetch = null;
  var groupsAllPrefetch = null;

  function cpShouldPrintEarlyEvent(type) {
    var text = String(type || '');
    return /(?:error|throw|failed|not-proxied|disabled|browser-log\.capture-installed|fetch\.patch-disabled|module\.main-entry-not-proxied)/i.test(text);
  }

  function remember(type, detail) {
    var item = { t: Date.now(), type: type, detail: detail || {} };
    state.events.push(item);
    if (state.events.length > 100) state.events.shift();
    if (cpShouldPrintEarlyEvent(type)) {
      try { console.info('[cocktail-plus:early] ' + type, detail || ''); } catch (_) {}
    }
    try { window.dispatchEvent(new CustomEvent('cocktail-plus:early', { detail: item })); } catch (_) {}
  }

  function cpClipLogText(value, max) {
    var text = String(value === undefined ? 'undefined' : value === null ? 'null' : value);
    // Keep console-captured logs complete enough for real debugging. The backend has a matching high cap;
    // callers that must fit into beacon/query URLs still pass a smaller explicit max.
    var limit = max || 5000000;
    return text.length > limit ? text.slice(0, limit) + '…<truncated ' + (text.length - limit) + '>' : text;
  }

  function cpSerializeLogArg(value) {
    try {
      if (value instanceof Error) return cpClipLogText((value.name || 'Error') + ': ' + (value.message || '') + '\\n' + (value.stack || ''));
      if (typeof value === 'string') return cpClipLogText(value);
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
      return cpClipLogText(JSON.stringify(value));
    } catch (_) {
      try { return cpClipLogText(Object.prototype.toString.call(value)); } catch (_) { return '[unserializable]'; }
    }
  }

  function cpSendBrowserLogBeacon(entry) {
    try {
      if (!BROWSER_LOGS.enabled || !BROWSER_LOGS.beaconPath) return;
      var payload = {
        origin: 'frontend',
        clientId: PAGE_SESSION_ID,
        level: cpClipLogText(entry && entry.level || 'log', 40),
        message: cpClipLogText(entry && entry.message || (entry && entry.args ? entry.args.join(' ') : ''), 900),
        args: Array.isArray(entry && entry.args) ? entry.args.slice(0, 4).map(function (x) { return cpClipLogText(x, 700); }) : [],
        stack: cpClipLogText(entry && entry.stack || '', 1000),
        pageUrl: location.href,
        source: cpClipLogText(entry && entry.source || 'early-beacon', 200),
        line: entry && entry.line || null,
        column: entry && entry.column || null,
        timestamp: entry && entry.timestamp || Date.now(),
      };
      var json = JSON.stringify(payload);
      if (json.length > 1800) {
        payload.args = [];
        payload.stack = cpClipLogText(payload.stack, 300);
        payload.message = cpClipLogText(payload.message, 700);
        json = JSON.stringify(payload);
      }
      var url = BROWSER_LOGS.beaconPath + '?t=' + Date.now() + '&d=' + encodeURIComponent(json);
      if (url.length > 3900) {
        url = BROWSER_LOGS.beaconPath + '?t=' + Date.now() + '&clientId=' + encodeURIComponent(PAGE_SESSION_ID) + '&level=' + encodeURIComponent(payload.level) + '&message=' + encodeURIComponent(cpClipLogText(payload.message, 1200));
      }
      var img = new Image();
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
    } catch (_) {}
  }

  function cpInstallBrowserLogCapture() {
    if (!BROWSER_LOGS.enabled || state.browserLogCaptureInstalled) return;
    state.browserLogCaptureInstalled = true;
    state.browserLogQueue = state.browserLogQueue || [];
    state.browserLogSending = false;
    state.browserLogFlushTimer = null;
    state.browserLogSeq = state.browserLogSeq || 1;
    var rawConsole = {};
    ['debug', 'log', 'info', 'warn', 'error', 'trace'].forEach(function (level) {
      try { rawConsole[level] = console[level] && console[level].bind(console); } catch (_) {}
    });

    function enqueue(level, argsLike, extra) {
      try {
        var args = Array.prototype.slice.call(argsLike || []).map(cpSerializeLogArg);
        var message = args.join(' ');
        if (message.indexOf('[cocktail-plus:browser-log-send]') !== -1) return;
        if (message.indexOf('[cocktail-plus:early]') === 0 && !/(error|warn|failed|not-proxied|browser-log)/i.test(message)) return;
        if (message.indexOf('[cocktail-plus:route-diag]') === 0 || message.indexOf('[cocktail-plus:module-diag]') === 0 || message.indexOf('[cocktail-plus:fast-diag]') === 0) return;
        var entry = Object.assign({
          seq: state.browserLogSeq++,
          origin: 'frontend',
          clientId: PAGE_SESSION_ID,
          level: level,
          args: args,
          message: cpClipLogText(message),
          stack: '',
          pageUrl: location.href,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        }, extra || {});
        state.browserLogQueue.push(entry);
        while (state.browserLogQueue.length > 300) state.browserLogQueue.shift();
        if (level === 'warn' || level === 'error' || level === 'window-error' || level === 'unhandledrejection') {
          cpSendBrowserLogBeacon(entry);
        }
        scheduleFlush();
      } catch (_) {}
    }

    function scheduleFlush() {
      if (state.browserLogFlushTimer) return;
      state.browserLogFlushTimer = setTimeout(function () {
        state.browserLogFlushTimer = null;
        flush();
      }, 800);
    }

    function getLogHeaders() {
      var headers = new Headers();
      headers.set('content-type', 'application/json');
      headers.set(HEADER_PREFIX + '-early', VERSION);
      if (settingsGetCsrfToken) headers.set('x-csrf-token', settingsGetCsrfToken);
      return headers;
    }

    async function flush() {
      if (state.browserLogSending || !state.browserLogQueue.length) return;
      if (!settingsGetCsrfToken) { scheduleFlush(); return; }
      var fetcher = state.rawFetch || (typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
      if (!fetcher) { scheduleFlush(); return; }
      state.browserLogSending = true;
      var batch = state.browserLogQueue.splice(0, 80);
      try {
        await fetcher(BROWSER_LOGS.ingestPath, {
          method: 'POST',
          headers: getLogHeaders(),
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ entries: batch }),
        });
      } catch (_) {
        state.browserLogQueue = batch.concat(state.browserLogQueue).slice(-300);
      } finally {
        state.browserLogSending = false;
        if (state.browserLogQueue.length) scheduleFlush();
      }
    }

    ['debug', 'log', 'info', 'warn', 'error', 'trace'].forEach(function (level) {
      try {
        var raw = rawConsole[level];
        if (typeof raw !== 'function') return;
        console[level] = function cpConsoleCapture() {
          try { raw.apply(console, arguments); } catch (_) {}
          enqueue(level, arguments);
        };
      } catch (_) {}
    });

    window.addEventListener('error', function (event) {
      enqueue('window-error', [event.message || 'window error'], { source: event.filename || '', line: event.lineno || null, column: event.colno || null, stack: event.error && event.error.stack || '' });
    });
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event.reason;
      enqueue('unhandledrejection', [reason && reason.message ? reason.message : reason], { stack: reason && reason.stack || '' });
    });
    state.flushBrowserLogs = flush;
    remember('browser-log.capture-installed', { enabled: true });
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

  function getCacheMode(input, init) {
    try {
      if (init && init.cache) return String(init.cache);
      if (input instanceof Request && input.cache) return String(input.cache);
    } catch (_) {}
    return '';
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

  function textToUtf8Bytes(text) {
    text = String(text);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
    var encoded = unescape(encodeURIComponent(text));
    var bytes = new Uint8Array(encoded.length);
    for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i) & 255;
    return bytes;
  }

  function bytesToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  function rotr32(value, bits) {
    return ((value >>> bits) | (value << (32 - bits))) >>> 0;
  }

  function wordToHex(value) {
    return (value >>> 0).toString(16).padStart(8, '0');
  }

  function sha256HexPureJs(text) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = textToUtf8Bytes(text);
    var bitLen = bytes.length * 8;
    var lenHi = Math.floor(bitLen / 0x100000000);
    var lenLo = bitLen >>> 0;
    var totalLen = Math.ceil((bytes.length + 9) / 64) * 64;
    var data = new Uint8Array(totalLen);
    data.set(bytes);
    data[bytes.length] = 0x80;
    data[totalLen - 8] = (lenHi >>> 24) & 255;
    data[totalLen - 7] = (lenHi >>> 16) & 255;
    data[totalLen - 6] = (lenHi >>> 8) & 255;
    data[totalLen - 5] = lenHi & 255;
    data[totalLen - 4] = (lenLo >>> 24) & 255;
    data[totalLen - 3] = (lenLo >>> 16) & 255;
    data[totalLen - 2] = (lenLo >>> 8) & 255;
    data[totalLen - 1] = lenLo & 255;
    var W = new Array(64);
    for (var offset = 0; offset < data.length; offset += 64) {
      for (var i = 0; i < 16; i++) {
        var j = offset + i * 4;
        W[i] = (((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) >>> 0);
      }
      for (var i = 16; i < 64; i++) {
        var s0 = (rotr32(W[i - 15], 7) ^ rotr32(W[i - 15], 18) ^ (W[i - 15] >>> 3)) >>> 0;
        var s1 = (rotr32(W[i - 2], 17) ^ rotr32(W[i - 2], 19) ^ (W[i - 2] >>> 10)) >>> 0;
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var i = 0; i < 64; i++) {
        var S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
        var ch = ((e & f) ^ ((~e) & g)) >>> 0;
        var temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        var S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(wordToHex).join('');
  }

  async function sha256Hex(text) {
    text = String(text);
    if (globalThis.crypto && crypto.subtle) return bytesToHex(await crypto.subtle.digest('SHA-256', textToUtf8Bytes(text)));
    return sha256HexPureJs(text);
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

  // SillyTavern refreshes characters[chid].json_data after /characters/get, but an already-open
  // editor keeps its hidden json_data input. Keep that input aligned so edit patches use a fresh base.
  function cpSyncCharacterEditorJsonData(avatar, jsonData) {
    var expectedAvatar = String(avatar || '');
    var text = String(jsonData || '');
    if (!expectedAvatar || !text) return false;
    var hidden = null;
    var avatarPole = null;
    try { hidden = document.querySelector('#character_json_data'); } catch (_) {}
    try { avatarPole = document.querySelector('#avatar_url_pole'); } catch (_) {}
    if (!hidden || !avatarPole) return false;
    if (String(avatarPole.value || '') !== expectedAvatar) return false;
    if (hidden.value !== text) hidden.value = text;
    return true;
  }

  function cpScheduleCharacterEditorJsonSync(avatar, jsonData) {
    var expectedAvatar = String(avatar || '');
    var text = String(jsonData || '');
    if (!expectedAvatar || !text) return;
    var startedAt = Date.now();
    var attempts = 0;
    var attempt = function () {
      attempts += 1;
      if (cpSyncCharacterEditorJsonData(expectedAvatar, text)) return;
      if (attempts < 20 && Date.now() - startedAt < 2000) {
        try { setTimeout(attempt, 100); } catch (_) {}
      }
    };
    attempt();
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

  function extensionAssetPathForName(name, asset) {
    try {
      if (!name || typeof name !== 'string' || !asset || typeof asset !== 'string') return '';
      var raw = String(asset || '').trim();
      if (!raw) return '';
      var protocolIndex = raw.indexOf('://');
      if (raw.indexOf('//') === 0 || protocolIndex > 0) return '';
      if (raw.charAt(0) === '/') return raw;
      var encodedName = name.split('/').map(encodeURIComponent).join('/');
      var encodedAsset = raw.split('/').map(encodeURIComponent).join('/');
      return '/scripts/extensions/' + encodedName + '/' + encodedAsset;
    } catch (_) { return ''; }
  }

  function addExtensionResourcePreload(href, rel, asValue) {
    try {
      if (!href || extensionResourcePreloads.has(rel + ':' + href)) return;
      extensionResourcePreloads.add(rel + ':' + href);
      if (document.querySelectorAll) {
        var existing = document.querySelectorAll('link[data-cocktail-plus-extension-preload]');
        for (var i = 0; i < existing.length; i++) {
          try {
            if (existing[i] && existing[i].href === new URL(href, location.href).href) return;
          } catch (_) {
            if (existing[i] && existing[i].getAttribute && existing[i].getAttribute('href') === href) return;
          }
        }
      }
      var link = document.createElement('link');
      link.rel = rel;
      if (asValue) link.as = asValue;
      link.href = href;
      link.dataset.cocktailPlusExtensionPreload = '1';
      (document.head || document.documentElement).appendChild(link);
      remember('extensions.resource-preload', { rel: rel, as: asValue || '', href: href });
    } catch (error) {
      remember('extensions.resource-preload-error', { href: href || '', error: String(error && error.message || error) });
    }
  }

  function preloadExtensionResources(name, manifest) {
    try {
      if (!EXTENSION_PRELOAD.enabled || !manifest || typeof manifest !== 'object') return;
      var js = typeof manifest.js === 'string' ? manifest.js : '';
      var css = typeof manifest.css === 'string' ? manifest.css : '';
      if (js) {
        var jsHref = extensionAssetPathForName(name, js);
        if (jsHref) addExtensionResourcePreload(jsHref, 'modulepreload', 'script');
      }
      if (css) {
        var cssHref = extensionAssetPathForName(name, css);
        if (cssHref) addExtensionResourcePreload(cssHref, 'preload', 'style');
      }
    } catch (error) {
      remember('extensions.resource-preload-list-error', { name: name, error: String(error && error.message || error) });
    }
  }

  function startExtensionManifestPrefetch(rawFetch, name) {
    if (!EXTENSION_PRELOAD.enabled || !rawFetch || !name) return null;
    var pathname = manifestPathForExtensionName(name);
    if (!pathname) return null;
    var existing = extensionManifestPrefetches.get(pathname);
    if (existing) return existing.promise;
    var record = { ok: false, path: pathname, state: 'pending', promise: null, text: '', status: 0, statusText: '', headers: [], error: null, startedAt: Date.now(), finishedAt: 0, durationMs: 0 };
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
        if (response.ok && record.text) {
          try {
            preloadExtensionResources(name, JSON.parse(record.text));
          } catch (error) {
            remember('extensions.resource-preload-parse-error', { name: name, path: pathname, error: String(error && error.message || error) });
          }
        }
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
      var manifest = JSON.parse(ready.text);
      preloadExtensionResources(name, manifest);
      return manifest;
    } catch (error) {
      remember('extensions.manifest.get-prefetch-error', { name: name, error: String(error && error.message || error) });
      return null;
    }
  };

  state.getExtensionDiscover = async function getExtensionDiscover() {
    try {
      var fetcher = state.rawFetch;
      if (!fetcher && !state.patchedFetch && typeof window.fetch === 'function') fetcher = window.fetch.bind(window);
      if (!extensionDiscoverPrefetch && fetcher) startExtensionDiscoverPrefetch(fetcher, 'discover-getter');
      if (!extensionDiscoverPrefetch) return null;
      var ready = await extensionDiscoverPrefetch;
      if (!ready || !ready.ok || !ready.text) return null;
      var list = JSON.parse(ready.text);
      if (!Array.isArray(list)) return null;
      remember('extensions.discover.get-prefetch-hit', { count: list.length, durationMs: ready.durationMs });
      return list;
    } catch (error) {
      remember('extensions.discover.get-prefetch-error', { error: String(error && error.message || error) });
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

  function startCharactersAllWarm(rawFetch, token) {
    if (!STARTUP_PRELOAD.enabled || !rawFetch || !token) return null;
    if (charactersAllWarmPrefetch) return charactersAllWarmPrefetch;
    charactersAllWarmPrefetch = (async function () {
      var startedAt = Date.now();
      try {
        remember('characters.all.warm-start');
        var headers = new Headers();
        headers.set('content-type', 'application/json');
        headers.set('x-csrf-token', token);
        headers.set(HEADER_PREFIX + '-early', VERSION);
        var response = await rawFetch(PREFIX + '/warm', {
          method: 'POST',
          headers: headers,
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'manual',
          body: JSON.stringify({ endpoints: ['characters-all'], wait: false, force: false })
        });
        var text = await response.text();
        var record = makeApiRecordFromResponse(response, text, startedAt);
        remember(record.ok ? 'characters.all.warm-ready' : 'characters.all.warm-bad-status', { status: record.status, durationMs: record.durationMs });
        return record;
      } catch (error) {
        var record = { ok: false, error: String(error && error.message || error), durationMs: Date.now() - startedAt };
        remember('characters.all.warm-error', record);
        return record;
      }
    })();
    return charactersAllWarmPrefetch;
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
            if (settingsGetCsrfToken) startCharactersAllWarm(rawFetch, settingsGetCsrfToken);
            if (settingsGetCsrfToken) state.flushBrowserLogs?.();
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
      if (settingsGetCsrfToken) startCharactersAllWarm(rawFetch, settingsGetCsrfToken);
      if (settingsGetCsrfToken) state.flushBrowserLogs?.();
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
          await cpNotifyInvalidate(rawFetch, input, init, ['characters-all'], url.pathname);
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
    if (fallbackResponse && fallbackResponse.ok) {
      await updateChatBaseline(identity, body.chat, patch ? 'chat-save-fallback' : 'chat-save-original');
      await cpNotifyInvalidate(rawFetch, input, init, ['characters-all'], url.pathname);
    }
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
          await cpInvalidateSettingsGet(rawFetch, input, init, url.pathname);
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
    if (fallbackResponse && fallbackResponse.ok) {
      await updateSettingsBaseline(nextObject, patch ? 'settings-save-fallback' : 'settings-save-original');
      await cpInvalidateSettingsGet(rawFetch, input, init, url.pathname);
    }
    remember('settings.save.original', { status: fallbackResponse && fallbackResponse.status, optimized: false, durationMs: Date.now() - startedAt });
    return fallbackResponse;
  }

  function cpHeadersFromResponse(response) {
    var headers = new Headers();
    try { response.headers.forEach(function (value, key) { headers.set(key, value); }); } catch (_) {}
    return headers;
  }

  async function cpReadRecentResponseWithProgress(response, startedAt) {
    var totalBytes = cpParseContentLength(response.headers);
    var bytesReceived = 0;
    var lastEmitAt = 0;
    cpUpdateRecentProgress(cpRecentTransferPatch('downloading', startedAt, 0, totalBytes, { status: response.status, message: '正在接收最近消息列表…' }));

    if (response.body && typeof response.body.getReader === 'function') {
      var reader = response.body.getReader();
      var chunks = [];
      while (true) {
        var next = await reader.read();
        if (next.done) break;
        var value = next.value;
        if (!value) continue;
        chunks.push(value);
        bytesReceived += value.byteLength || value.length || 0;
        var now = Date.now();
        if (now - lastEmitAt >= 100) {
          lastEmitAt = now;
          cpUpdateRecentProgress(cpRecentTransferPatch('downloading', startedAt, bytesReceived, totalBytes, { status: response.status, message: '正在接收最近消息列表…' }));
        }
      }
      var finalTotal = totalBytes || bytesReceived;
      cpUpdateRecentProgress(cpRecentTransferPatch('rendering', startedAt, bytesReceived, finalTotal, { status: response.status, percent: finalTotal ? 100 : null, etaMs: 0, message: '正在解析并渲染最近消息…' }));
      var responseText = await new Response(new Blob(chunks)).text();
      return { body: responseText, text: responseText, bytesReceived: bytesReceived, totalBytes: finalTotal || null };
    }

    var text = await response.text();
    bytesReceived = utf8Bytes(text || '');
    var fallbackTotal = totalBytes || bytesReceived;
    cpUpdateRecentProgress(cpRecentTransferPatch('rendering', startedAt, bytesReceived, fallbackTotal, { status: response.status, percent: fallbackTotal ? 100 : null, etaMs: 0, message: '正在解析并渲染最近消息…' }));
    return { body: text, text: text, bytesReceived: bytesReceived, totalBytes: fallbackTotal || null };
  }


  function cpRecentPatchKey(bodyObject) {
    try {
      var clean = Object.assign({}, bodyObject || {});
      delete clean.cpRecentPatch;
      return stableStringify(clean);
    } catch (_) {
      return '{}';
    }
  }

  function cpApplyRecentPatch(baseData, ops) {
    var next = Array.isArray(baseData) ? baseData.slice() : [];
    if (!Array.isArray(ops)) return next;
    ops.forEach(function (op) {
      if (!op || typeof op !== 'object') return;
      if (op.op === 'set') {
        var index = Number(op.index);
        if (Number.isInteger(index) && index >= 0) next[index] = op.value;
      } else if (op.op === 'splice') {
        var spliceIndex = Math.max(0, Number(op.index) || 0);
        var deleteCount = Math.max(0, Number(op.deleteCount) || 0);
        var items = Array.isArray(op.items) ? op.items : [];
        next.splice.apply(next, [spliceIndex, deleteCount].concat(items));
      }
    });
    return next;
  }

  function cpRememberRecentBaseline(key, hash, data) {
    if (!key || !hash || !Array.isArray(data)) return;
    recentChatsPatchBaselines.set(key, { hash: hash, data: data });
  }

  function cpResolveRecentPatchedData(key, response, text) {
    var mode = response.headers.get(HEADER_PREFIX + '-recent-patch') || 'full';
    var hash = response.headers.get(HEADER_PREFIX + '-recent-hash') || '';
    var baseline = recentChatsPatchBaselines.get(key);
    var data = [];
    if (mode === 'noop' && baseline && Array.isArray(baseline.data)) {
      data = baseline.data;
    } else if (mode === 'patch' && baseline && Array.isArray(baseline.data)) {
      var patch = JSON.parse(text || '{}');
      data = cpApplyRecentPatch(baseline.data, patch.ops);
      hash = patch.nextHash || hash;
    } else {
      var parsed = JSON.parse(text || '[]');
      data = Array.isArray(parsed) ? parsed : [];

    }
    if (hash) cpRememberRecentBaseline(key, hash, data);
    return data;
  }



  function cpCharacterGetKey(bodyObject) {
    try {
      return String((bodyObject || {}).avatar_url || '');
    } catch (_) {
      return '';
    }
  }

  function cpSetAtPath(target, path, value) {
    if (!Array.isArray(path) || path.length === 0) return value;
    var parent = target;
    for (var i = 0; i < path.length - 1; i++) {
      var key = path[i];
      var nextKey = path[i + 1];
      if (parent[key] === null || typeof parent[key] !== 'object') parent[key] = typeof nextKey === 'number' ? [] : {};
      parent = parent[key];
    }
    parent[path[path.length - 1]] = value;
    return target;
  }

  function cpDeleteAtPath(target, path) {
    if (!Array.isArray(path) || path.length === 0) return target;
    var parent = target;
    for (var i = 0; i < path.length - 1; i++) {
      if (!parent || typeof parent !== 'object') return target;
      parent = parent[path[i]];
    }
    if (parent && typeof parent === 'object') delete parent[path[path.length - 1]];
    return target;
  }

  function cpApplyCharacterPatch(baseData, ops) {
    var next = JSON.parse(JSON.stringify(baseData || {}));
    if (!Array.isArray(ops)) return next;
    ops.forEach(function (op) {
      if (!op || typeof op !== 'object') return;
      if (op.op === 'set') next = cpSetAtPath(next, op.path, op.value);
      else if (op.op === 'delete') next = cpDeleteAtPath(next, op.path);
    });
    return next;
  }

  function cpRememberCharacterGetBaseline(key, hash, data) {
    if (!key || !hash || !data || typeof data !== 'object') return;
    characterGetPatchBaselines.set(key, { hash: hash, data: data });
  }

  function cpResolveCharacterGetPatchedData(key, response, text) {
    var mode = response.headers.get(HEADER_PREFIX + '-character-get-patch') || 'full';
    var hash = response.headers.get(HEADER_PREFIX + '-character-get-hash') || '';
    var baseline = characterGetPatchBaselines.get(key);
    var data;
    if (mode === 'noop' && baseline && baseline.data) {
      data = baseline.data;
    } else if (mode === 'dedup') {
      var dedup = JSON.parse(text || '{}');
      var jsonData = String(dedup.json_data || '');
      data = JSON.parse(jsonData || '{}');
      if (data && typeof data === 'object') delete data.json_data;
      data = cpApplyCharacterPatch(data, dedup.ops);
      data.json_data = jsonData;
      hash = dedup.hash || hash;
    } else if (mode === 'patch' && baseline && baseline.data) {
      var patch = JSON.parse(text || '{}');
      data = cpApplyCharacterPatch(baseline.data, patch.ops);
      hash = patch.nextHash || hash;
    } else {
      data = JSON.parse(text || '{}');
    }
    if (hash) cpRememberCharacterGetBaseline(key, hash, data);
    return data;
  }

  async function handleCharacterGetFetch(rawFetch, input, init, url, method) {
    if (!rawFetch || !url || method !== 'POST') return null;
    try {
      var probeText = await getBodyText(input, init, method);
      var probeBody = {};
      try { probeBody = probeText ? JSON.parse(probeText) : {}; } catch (_) { probeBody = {}; }
      var headers = cloneHeaders(input, init);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      var bodyText = probeText;
      var bodyObject = probeBody;
      var key = cpCharacterGetKey(bodyObject);
      var baseline = key ? characterGetPatchBaselines.get(key) : null;
      if (baseline && baseline.hash) bodyObject.cpCharacterGetPatch = { hash: baseline.hash };
      var response = await rawFetch(PREFIX + '/fast/characters-get', { method: 'POST', headers: headers, credentials: (init && init.credentials) || 'same-origin', cache: 'no-store', redirect: 'manual', body: JSON.stringify(bodyObject || {}) });
      if (!response || !response.ok || response.headers.get(HEADER_PREFIX + '-character-get-ready') !== '1') return response;
      var text = await response.text();
      var data = cpResolveCharacterGetPatchedData(key, response, text);
      cpScheduleCharacterEditorJsonSync(key, data && data.json_data);
      var responseHeaders = cpHeadersFromResponse(response);
      try { responseHeaders.delete('content-length'); } catch (_) {}
      remember('character.get.fast-response', { avatar: key, mode: response.headers.get(HEADER_PREFIX + '-character-get-patch') || 'full', status: response.status });
      return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText || 'OK', headers: responseHeaders });
    } catch (error) {
      remember('character.get.fast-error', { error: String(error && error.message || error) });
      return null;
    }
  }

  function cpFormDataToPlainObject(formData) {
    var out = {};
    try {
      formData.forEach(function (value, key) {
        if (value instanceof File) {
          if (value && value.size > 0 && value.name) out[key] = value;
          return;
        }
        if (Object.prototype.hasOwnProperty.call(out, key)) {
          if (!Array.isArray(out[key])) out[key] = [out[key]];
          out[key].push(String(value));
        } else {
          out[key] = String(value);
        }
      });
    } catch (_) {}
    return out;
  }

  function cpTagsString(value) {
    if (Array.isArray(value)) return value.join(', ');
    return typeof value === 'string' ? value : '';
  }

  function cpCharacterEditBaseFields(raw, meta) {
    raw = raw || {};
    meta = meta || {};
    var data = raw.data && typeof raw.data === 'object' ? raw.data : {};
    var extensions = data.extensions && typeof data.extensions === 'object' ? data.extensions : {};
    var depth = extensions.depth_prompt && typeof extensions.depth_prompt === 'object' ? extensions.depth_prompt : {};
    return {
      avatar_url: meta.avatar_url || raw.avatar || '',
      ch_name: data.name ?? raw.name ?? '',
      description: data.description ?? raw.description ?? '',
      personality: data.personality ?? raw.personality ?? '',
      scenario: data.scenario ?? raw.scenario ?? '',
      first_mes: data.first_mes ?? raw.first_mes ?? '',
      mes_example: data.mes_example ?? raw.mes_example ?? '',
      creator_notes: data.creator_notes ?? raw.creatorcomment ?? '',
      system_prompt: data.system_prompt ?? '',
      post_history_instructions: data.post_history_instructions ?? '',
      tags: cpTagsString(data.tags ?? raw.tags),
      creator: data.creator ?? raw.creator ?? '',
      character_version: data.character_version ?? raw.character_version ?? '',
      alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.slice() : [],
      talkativeness: String(extensions.talkativeness ?? raw.talkativeness ?? 0.5),
      fav: String(Boolean(extensions.fav ?? raw.fav)),
      world: extensions.world ?? '',
      depth_prompt_prompt: depth.prompt ?? raw.depth_prompt_prompt ?? '',
      depth_prompt_depth: String(depth.depth ?? raw.depth_prompt_depth ?? 4),
      depth_prompt_role: depth.role ?? raw.depth_prompt_role ?? 'system',
      chat: meta.chat ?? raw.chat ?? '',
      create_date: meta.create_date ?? raw.create_date ?? '',
      extensions: meta.extensions ?? '',
    };
  }

  function cpMakeStringPatch(base, next) {
    base = String(base ?? '');
    next = String(next ?? '');
    if (base === next) return null;
    var prefix = 0;
    var min = Math.min(base.length, next.length);
    while (prefix < min && base[prefix] === next[prefix]) prefix++;
    var suffix = 0;
    while (suffix < min - prefix && base[base.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
    var patch = { type: 'splice', start: prefix, deleteCount: base.length - prefix - suffix, insert: next.slice(prefix, next.length - suffix) };
    var patchText = JSON.stringify(patch);
    return patchText.length < next.length ? patch : { type: 'set', value: next };
  }

  async function cpBuildCharacterEditPayload(plain, rawJson) {
    var raw = JSON.parse(String(rawJson || '{}'));
    var baseHash = await sha256Hex(rawJson);
    var baseFields = cpCharacterEditBaseFields(raw, plain);
    var payload = { avatar_url: String(plain.avatar_url), baseHash: baseHash, fields: {}, patches: {}, meta: { avatar_url: String(plain.avatar_url), chat: plain.chat || '', create_date: plain.create_date || '', extensions: plain.extensions || '' } };
    Object.keys(plain).forEach(function (key) {
      if (key === 'json_data' || key === 'avatar') return;
      var nextValue = plain[key];
      var baseValue = baseFields[key];
      if (Array.isArray(nextValue) || Array.isArray(baseValue)) {
        if (!sameJson(nextValue, baseValue)) payload.fields[key] = nextValue;
        return;
      }
      if (String(nextValue ?? '') === String(baseValue ?? '')) return;
      if (typeof nextValue === 'string' && typeof baseValue === 'string') payload.patches[key] = cpMakeStringPatch(baseValue, nextValue);
      else payload.fields[key] = nextValue;
    });
    return payload;
  }

  async function cpPostCharacterEditPayload(rawFetch, input, init, payload) {
    var headers = cloneHeaders(input, init);
    headers.set('content-type', 'application/json');
    headers.delete && headers.delete('content-encoding');
    return await rawFetch(PREFIX + '/fast/characters-edit', { method: 'POST', headers: headers, credentials: (init && init.credentials) || 'same-origin', cache: 'no-store', redirect: 'manual', body: JSON.stringify(payload) });
  }

  function cpSyncCharacterEditJsonData(avatar, data, jsonData) {
    var expectedAvatar = String(avatar || '');
    var text = String(jsonData || '');
    if (!expectedAvatar || !text) return;
    try {
      var hidden = document.querySelector('#character_json_data');
      var avatarPole = document.querySelector('#avatar_url_pole');
      if (hidden && avatarPole && String(avatarPole.value || '') === expectedAvatar) hidden.value = text;
    } catch (_) {}
    try {
      var ctx = window.SillyTavern && typeof window.SillyTavern.getContext === 'function' ? window.SillyTavern.getContext() : null;
      var chars = ctx && Array.isArray(ctx.characters) ? ctx.characters : null;
      if (chars) {
        var index = chars.findIndex(function (item) { return item && item.avatar === expectedAvatar; });
        if (index >= 0 && data && typeof data === 'object') {
          Object.assign(chars[index], data);
          chars[index].json_data = text;
        }
      }
    } catch (_) {}
  }

  async function cpFetchLatestCharacterJsonForEdit(rawFetch, input, init, avatar) {
    var expectedAvatar = String(avatar || '');
    if (!expectedAvatar) return null;
    var headers = cloneHeaders(input, init);
    headers.set('content-type', 'application/json');
    headers.delete && headers.delete('content-encoding');
    try {
      var response = await rawFetch('/api/characters/get', { method: 'POST', headers: headers, credentials: (init && init.credentials) || 'same-origin', cache: 'no-store', redirect: 'manual', body: JSON.stringify({ avatar_url: expectedAvatar }) });
      if (!response || !response.ok) {
        remember('character.edit.stale-refresh-failed', { avatar: expectedAvatar, status: response && response.status });
        return null;
      }
      var text = await response.text();
      var data = JSON.parse(text || '{}');
      var jsonData = String(data && data.json_data || '');
      if (!jsonData) {
        remember('character.edit.stale-refresh-empty', { avatar: expectedAvatar, bytes: text.length });
        return null;
      }
      cpSyncCharacterEditJsonData(expectedAvatar, data, jsonData);
      return { data: data, jsonData: jsonData };
    } catch (error) {
      remember('character.edit.stale-refresh-error', { avatar: expectedAvatar, error: String(error && error.message || error) });
      return null;
    }
  }

  function cpEnqueueCharacterEditRecovery(avatar, task) {
    var key = String(avatar || '__unknown__');
    var previous = characterEditRecoveryQueues.get(key) || Promise.resolve();
    var run = previous.catch(function () {}).then(task);
    var stored = run.finally(function () {
      if (characterEditRecoveryQueues.get(key) === stored) characterEditRecoveryQueues.delete(key);
    });
    characterEditRecoveryQueues.set(key, stored);
    return run;
  }

  async function cpRecoverCharacterEditStale(rawFetch, input, init, plain, staleResponse) {
    var avatar = String(plain && plain.avatar_url || '');
    remember('character.edit.stale-fallback', { avatar: avatar });
    return await cpEnqueueCharacterEditRecovery(avatar, async function () {
      var latest = await cpFetchLatestCharacterJsonForEdit(rawFetch, input, init, avatar);
      if (!latest || !latest.jsonData) return staleResponse;
      var retryPlain = Object.assign({}, plain, { json_data: latest.jsonData });
      var retryPayload;
      try {
        retryPayload = await cpBuildCharacterEditPayload(retryPlain, latest.jsonData);
      } catch (error) {
        remember('character.edit.stale-retry-build-error', { avatar: avatar, error: String(error && error.message || error) });
        return staleResponse;
      }
      var retryResponse;
      try {
        retryResponse = await cpPostCharacterEditPayload(rawFetch, input, init, retryPayload);
      } catch (error) {
        remember('character.edit.stale-retry-error', { avatar: avatar, error: String(error && error.message || error) });
        return staleResponse;
      }
      if (retryResponse && retryResponse.ok) {
        remember('character.edit.stale-retry', { avatar: avatar, fields: Object.keys(retryPayload.fields).length, patches: Object.keys(retryPayload.patches).length, status: retryResponse.status });
        characterGetPatchBaselines.delete(avatar);
        return retryResponse;
      }
      remember('character.edit.stale-retry-failed', { avatar: avatar, status: retryResponse && retryResponse.status });
      return retryResponse || staleResponse;
    });
  }

  async function handleCharacterEditFetch(rawFetch, input, init, url, method) {
    if (!rawFetch || !url || method !== 'POST') return null;
    try {
      var formData = init && init.body instanceof FormData ? init.body : null;
      if (!formData && input instanceof Request) {
        try { formData = await input.clone().formData(); } catch (_) {}
      }
      if (!formData) return null;
      var plain = cpFormDataToPlainObject(formData);
      if (plain.avatar instanceof File) return null;
      var rawJson = String(plain.json_data || '');
      if (!rawJson || !plain.avatar_url) return null;
      var payload = await cpBuildCharacterEditPayload(plain, rawJson);
      var fastResponse = await cpPostCharacterEditPayload(rawFetch, input, init, payload);
      if (fastResponse && fastResponse.ok) {
        remember('character.edit.optimized', { avatar: plain.avatar_url, fields: Object.keys(payload.fields).length, patches: Object.keys(payload.patches).length });
        characterGetPatchBaselines.delete(String(plain.avatar_url));
        return fastResponse;
      }
      if (fastResponse && fastResponse.status === 409) return await cpRecoverCharacterEditStale(rawFetch, input, init, plain, fastResponse);
      return fastResponse;
    } catch (error) {
      remember('character.edit.fast-error', { error: String(error && error.message || error) });
      return new Response(JSON.stringify({ ok: false, error: String(error && error.message || error) }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  }





  async function handleRecentChatsFetch(rawFetch, input, init, url, method) {
    if (!rawFetch || !url || method !== 'POST') return null;
    var startedAt = state.recentChatsLoad && state.recentChatsLoad.active && state.recentChatsLoad.startedAt ? state.recentChatsLoad.startedAt : Date.now();
    cpUpdateRecentProgress({ active: true, phase: 'requesting', startedAt: startedAt, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null, message: '等待 /recent 返回最近消息…' });
    remember('recent.fetch.start', { path: url.pathname });
    try {
      var headers = cloneHeaders(input, init);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      var bodyText = await getBodyText(input, init, method);
      var bodyObject = {};
      try { bodyObject = bodyText ? JSON.parse(bodyText) : {}; } catch (_) { bodyObject = {}; }
      var patchKey = cpRecentPatchKey(bodyObject);
      var baseline = recentChatsPatchBaselines.get(patchKey);
      if (baseline && baseline.hash) bodyObject.cpRecentPatch = { hash: baseline.hash };
      var fastInit = {
        method: 'POST',
        headers: headers,
        credentials: (init && init.credentials) || 'same-origin',
        cache: 'no-store',
        redirect: 'manual'
      };
      fastInit.body = JSON.stringify(bodyObject || {});
      var response = await rawFetch(PREFIX + '/fast/recent-chats', fastInit);
      var read = await cpReadRecentResponseWithProgress(response, startedAt);
      var recentData = cpResolveRecentPatchedData(patchKey, response, read.text);
      var responseBody = JSON.stringify(recentData);
      var expectedItems = null;
      try {
        if (Array.isArray(recentData)) expectedItems = recentData.length;
      } catch (_) {}
      cpUpdateRecentProgress({ phase: 'rendering', expectedItems: expectedItems, status: response.status, percent: read.totalBytes ? 100 : null, etaMs: 0, message: '正在解析并渲染最近消息…' });
      remember('recent.fetch.response', { path: url.pathname, status: response.status, mode: response.headers.get(HEADER_PREFIX + '-recent-patch') || 'full', bytesReceived: read.bytesReceived, totalBytes: read.totalBytes, durationMs: Date.now() - startedAt });
      var responseHeaders = cpHeadersFromResponse(response);
      try { responseHeaders.delete('content-length'); } catch (_) {}
      return new Response(responseBody, { status: response.status, statusText: response.statusText || 'OK', headers: responseHeaders });
    } catch (error) {
      cpFailRecentChatsProgress(error);
      remember('recent.fetch.error', { path: url.pathname, error: String(error && error.message || error), durationMs: Date.now() - startedAt });
      throw error;
    }
  }

  async function callFast(rawFetch, input, init, route, url, method) {
    var startedAt = Date.now();
    var isCharactersAll = url && url.pathname === '/api/characters/all';
    var cpCharactersAllSlowTimer = null;
    var cpCharactersAllVerySlowTimer = null;
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

    if (isCharactersAll) {
      remember('intercept.characters-all.enter', { fastPath: route.path, method: method, controller: navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL || '' });
      cpCharactersAllSlowTimer = setTimeout(function () { remember('intercept.characters-all.waiting-over-500ms', { fastPath: route.path, elapsedMs: Date.now() - startedAt }); }, 500);
      cpCharactersAllVerySlowTimer = setTimeout(function () { remember('intercept.characters-all.waiting-over-2000ms', { fastPath: route.path, elapsedMs: Date.now() - startedAt }); }, 2000);
      cpUpdateCharacterProgress({ active: true, phase: 'requesting', cache: '', message: '正在加载角色列表…', bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, error: null, startedAt: startedAt });
      cpStartCharacterStatusPolling(rawFetch, headers);
    }
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
        if (cpCharactersAllSlowTimer) { clearTimeout(cpCharactersAllSlowTimer); cpCharactersAllSlowTimer = null; }
        if (cpCharactersAllVerySlowTimer) { clearTimeout(cpCharactersAllVerySlowTimer); cpCharactersAllVerySlowTimer = null; }
        var cacheState = response.headers.get(HEADER_PREFIX + '-state') || response.headers.get('x-cocktail-cache') || '';
        if (isCharactersAll) {
          cpUpdateCharacterProgress({ phase: cacheState === 'ASYNC-MISS' ? 'requesting' : 'rendering', cache: cacheState, status: response.status, percent: cacheState === 'ASYNC-MISS' ? null : 100, etaMs: 0, message: cacheState === 'ASYNC-MISS' ? '后端正在构建角色缓存，首次加载可能较久…' : '角色数据已返回，正在解析并渲染列表…' });
          if (cacheState !== 'ASYNC-MISS') {
            if (characterProgressStatusTimer) { clearTimeout(characterProgressStatusTimer); characterProgressStatusTimer = null; }
            cpWaitRowsThenRemove(20000);
          }
        }
        remember('intercept.fast-response', { path: url.pathname, status: response.status, cache: cacheState, durationMs: Date.now() - startedAt });
        if (isCharactersAll) remember('intercept.characters-all.fast-return', { status: response.status, cache: cacheState, durationMs: Date.now() - startedAt, async: response.headers.get(HEADER_PREFIX + '-async') || '' });
        return response;
      }
      if (cpCharactersAllSlowTimer) { clearTimeout(cpCharactersAllSlowTimer); cpCharactersAllSlowTimer = null; }
      if (cpCharactersAllVerySlowTimer) { clearTimeout(cpCharactersAllVerySlowTimer); cpCharactersAllVerySlowTimer = null; }
      if (isCharactersAll) cpUpdateCharacterProgress({ phase: 'requesting', message: '快速接口不可用，回退原始角色接口…' });
      remember('intercept.fallback-status', { path: url.pathname, status: response && response.status, durationMs: Date.now() - startedAt });
    } catch (error) {
      if (cpCharactersAllSlowTimer) { clearTimeout(cpCharactersAllSlowTimer); cpCharactersAllSlowTimer = null; }
      if (cpCharactersAllVerySlowTimer) { clearTimeout(cpCharactersAllVerySlowTimer); cpCharactersAllVerySlowTimer = null; }
      if (isCharactersAll) cpUpdateCharacterProgress({ phase: 'error', error: String(error && error.message || error), message: '快速接口请求失败，正在回退原始角色接口…' });
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
      if (url && url.origin === location.origin && url.pathname === '/api/characters/get' && method === 'POST') {
        var characterGetResponse = await handleCharacterGetFetch(rawFetch, input, init, url, method);
        if (characterGetResponse) return characterGetResponse;
      }
      if (url && url.origin === location.origin && url.pathname === '/api/characters/edit' && method === 'POST') {
        var characterEditResponse = await handleCharacterEditFetch(rawFetch, input, init, url, method);
        if (characterEditResponse) return characterEditResponse;
      }
      if (url && url.origin === location.origin && (url.pathname === CHAT_SAVE.originalGetPath || url.pathname === CHAT_SAVE.originalGroupGetPath) && method === CHAT_SAVE.method) {
        var chatGetResponse = await handleChatGetFetch(rawFetch, input, init, url, method);
        if (chatGetResponse) return chatGetResponse;
      }
      if (url && url.origin === location.origin && url.pathname === '/api/chats/recent' && method === 'POST') {
        var recentChatsResponse = await handleRecentChatsFetch(rawFetch, input, init, url, method);
        if (recentChatsResponse) return recentChatsResponse;
      }
      if (url && url.origin === location.origin && url.pathname === '/api/extensions/discover' && method === 'GET') {
        if (!extensionDiscoverPrefetch) startExtensionDiscoverPrefetch(rawFetch, 'fetch-intercept');
        var extensionResponse = await consumePrefetchRecord(extensionDiscoverPrefetch, 'extensions.discover', Date.now());
        if (extensionResponse) return extensionResponse;
      }
      if (url && url.origin === location.origin && url.pathname.startsWith('/scripts/extensions/') && url.pathname.endsWith('/manifest.json') && method === 'GET') {
        var cacheMode = getCacheMode(input, init);
        if (cacheMode === 'no-store' || cacheMode === 'reload' || cacheMode === 'no-cache') {
          remember('extensions.manifest.prefetch-bypass', { path: url.pathname, cache: cacheMode });
        } else {
          var manifestRecord = extensionManifestPrefetches.get(url.pathname);
          var manifestAgeMs = manifestRecord && manifestRecord.startedAt ? Date.now() - manifestRecord.startedAt : Infinity;
          if (manifestAgeMs <= EXTENSION_PRELOAD.manifestMaxAgeMs) {
            var manifestResponse = await consumePrefetchRecord(manifestRecord && manifestRecord.promise, 'extensions.manifest', Date.now());
            if (manifestResponse) return manifestResponse;
          } else {
            if (manifestRecord) extensionManifestPrefetches.delete(url.pathname);
            remember('extensions.manifest.prefetch-expired', { path: url.pathname, ageMs: manifestAgeMs });
          }
        }
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
      return await cpFetchWithInvalidation(rawFetch, input, init, url, method);
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
  cpInstallBrowserLogCapture();
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
