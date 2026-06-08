// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { API_PREFIX, HEADER_PREFIX, SW_MESSAGE_SOURCE, VERSION } from './constants.js';
import { config } from './config.js';
import { ENDPOINT_LIST } from './endpoint-registry.js';
import { CHAT_SAVE_HASH_ALGORITHM, chatSaveEndpoint, groupChatSaveEndpoint } from './endpoints/chat-save.js';
import { settingsGetEndpoint } from './endpoints/settings-get.js';
import { SETTINGS_HASH_ALGORITHM, settingsSaveEndpoint } from './endpoints/settings-save.js';
import { getServerRoot } from './utils.js';

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

export function makeServiceWorkerScript() {
    const fastRoutes = makeFastRoutesLiteral();
    const templatePreloadList = makeTemplatePreloadList();
    return `/* cocktail-plus Service Worker v${VERSION} */
const VERSION = ${JSON.stringify(VERSION)};
const PREFIX = ${JSON.stringify(API_PREFIX)};
const HEADER_PREFIX = ${JSON.stringify(HEADER_PREFIX)};
const MESSAGE_SOURCE = ${JSON.stringify(SW_MESSAGE_SOURCE)};
const FAST_ROUTES = new Map([
${fastRoutes}
]);
const FAST_ROUTE_FALLBACK_ENABLED = ${JSON.stringify(!!config.serviceWorkerFastRouteFallback)};
const SETTINGS_GET = {
  fallbackEnabled: ${JSON.stringify(!!config.serviceWorkerSettingsGetFallback)},
  originalPath: ${JSON.stringify(settingsGetEndpoint.originalPath)},
  fastPath: PREFIX + ${JSON.stringify(settingsGetEndpoint.fastPath)},
  method: ${JSON.stringify(settingsGetEndpoint.method)}
};
const SETTINGS_SAVE = {
  fallbackEnabled: ${JSON.stringify(!!config.serviceWorkerSettingsSaveFallback)},
  originalPath: ${JSON.stringify(settingsSaveEndpoint.originalPath)},
  fastPath: PREFIX + ${JSON.stringify(settingsSaveEndpoint.fastPath)},
  method: ${JSON.stringify(settingsSaveEndpoint.method)},
  hashAlgorithm: ${JSON.stringify(SETTINGS_HASH_ALGORITHM)},
  maxPatchOperations: ${JSON.stringify(config.settingsSaveMaxPatchOperations)},
  maxPatchBytesRatio: ${JSON.stringify(config.settingsSaveMaxPatchBytesRatio)}
};
const CHAT_SAVE = {
  fallbackEnabled: ${JSON.stringify(!!config.serviceWorkerChatSaveFallback)},
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
const TEMPLATE_FALLBACK = {
  enabled: ${JSON.stringify(!!config.serviceWorkerTemplateFallback)},
  cacheName: ${JSON.stringify(`cp-template-${VERSION}`)},
  paths: ${JSON.stringify(templatePreloadList)}
};
let settingsBaseline = null;
const chatBaselines = new Map();

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([self.clients.claim(), prewarmTemplates()]));
});

function sameOrigin(url) { return url.origin === self.location.origin; }

function copyHeaders(request) {
  const headers = new Headers();
  try {
    request.headers.forEach((value, key) => {
      if (String(key).toLowerCase() === 'content-length') return;
      headers.set(key, value);
    });
  } catch {}
  headers.set(HEADER_PREFIX + '-sw', VERSION);
  return headers;
}

async function readBody(request) {
  try { return await request.clone().arrayBuffer(); } catch { return undefined; }
}

async function decodeGzipBodyToText(buffer) {
  try {
    if (typeof DecompressionStream !== 'function') return '';
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    return '';
  }
}

async function readRequestText(request) {
  try {
    const encoding = String(request.headers.get('content-encoding') || '').toLowerCase();
    const buffer = await request.clone().arrayBuffer();
    if (encoding.includes('gzip')) return await decodeGzipBodyToText(buffer);
    return new TextDecoder().decode(buffer);
  } catch {
    return '';
  }
}


async function notifyClients(message) {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const client of clients) client.postMessage({ source: MESSAGE_SOURCE, version: VERSION, ...message });
  } catch {}
}

function remember(event, detail) {
  notifyClients({ type: 'cocktail-plus-sw-fallback', event, detail: detail || {} });
}

function utf8Bytes(text) {
  try { return new TextEncoder().encode(String(text || '')).byteLength; } catch (_) { return String(text || '').length; }
}

function bytesToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function sha256Hex(text) {
  if (!globalThis.crypto || !crypto.subtle) throw new Error('crypto.subtle is unavailable');
  const data = new TextEncoder().encode(String(text));
  return bytesToHex(await crypto.subtle.digest('SHA-256', data));
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
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

async function updateSettingsBaseline(settingsObject, reason) {
  try {
    const hash = await hashSettingsObject(settingsObject);
    settingsBaseline = { object: cloneJson(settingsObject), hash, capturedAt: Date.now() };
    remember('settings.baseline', { reason, hash, bytes: utf8Bytes(JSON.stringify(settingsObject)) });
  } catch (error) {
    remember('settings.baseline-error', { reason, error: String(error && error.message || error) });
  }
}

async function captureSettingsGetResponse(response, reason) {
  try {
    if (!response || !response.ok) return;
    const text = await response.clone().text();
    const data = JSON.parse(text);
    if (!data || data.settings === undefined) return;
    const settingsObject = typeof data.settings === 'string' ? JSON.parse(data.settings) : data.settings;
    if (settingsObject && typeof settingsObject === 'object') await updateSettingsBaseline(settingsObject, reason);
  } catch (error) {
    remember('settings.get.capture-error', { reason, error: String(error && error.message || error) });
  }
}

function addDiffOps(base, next, path, ops) {
  if (ops.length > SETTINGS_SAVE.maxPatchOperations) return;
  if (sameJson(base, next)) return;
  if (isPlainObject(base) && isPlainObject(next)) {
    const seen = Object.create(null);
    Object.keys(base).forEach(key => { seen[key] = true; });
    Object.keys(next).forEach(key => { seen[key] = true; });
    Object.keys(seen).sort().forEach(key => {
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
  ops.push({ op: 'set', path, value: cloneJson(next) });
}

async function buildSettingsSavePatch(nextObject, originalBytes) {
  if (!settingsBaseline) return null;
  const nextHash = await hashSettingsObject(nextObject);
  if (nextHash === settingsBaseline.hash) {
    const noopBody = {
      mode: 'noop',
      hashAlgorithm: SETTINGS_SAVE.hashAlgorithm,
      baseHash: settingsBaseline.hash,
      nextHash,
      originalBytes,
    };
    let noopText = JSON.stringify(noopBody);
    noopBody.optimizedBytes = utf8Bytes(noopText);
    noopText = JSON.stringify(noopBody);
    const optimizedBytes = utf8Bytes(noopText);
    noopBody.optimizedBytes = optimizedBytes;
    noopText = JSON.stringify(noopBody);
    return { mode: 'noop', text: noopText, nextHash, savedBytes: Math.max(0, originalBytes - optimizedBytes) };
  }

  const ops = [];
  addDiffOps(settingsBaseline.object, nextObject, [], ops);
  if (ops.length === 0 || ops.length > SETTINGS_SAVE.maxPatchOperations) return null;
  const patchBody = {
    mode: 'patch',
    hashAlgorithm: SETTINGS_SAVE.hashAlgorithm,
    baseHash: settingsBaseline.hash,
    nextHash,
    ops,
    originalBytes,
  };
  let patchText = JSON.stringify(patchBody);
  patchBody.optimizedBytes = utf8Bytes(patchText);
  patchText = JSON.stringify(patchBody);
  const optimizedBytes = utf8Bytes(patchText);
  patchBody.optimizedBytes = optimizedBytes;
  patchText = JSON.stringify(patchBody);
  if (originalBytes > 0 && optimizedBytes > originalBytes * SETTINGS_SAVE.maxPatchBytesRatio) return null;
  return { mode: 'patch', text: patchText, nextHash, ops: ops.length, savedBytes: Math.max(0, originalBytes - optimizedBytes) };
}


function chatIdentityFor(kind, data) {
  if (kind === 'group') {
    const id = String(data && data.id || '');
    return id ? { kind: 'group', id } : null;
  }
  const avatarUrl = String(data && data.avatar_url || '');
  const fileName = String(data && data.file_name || '');
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
  const limit = Math.max(0, Number(CHAT_SAVE.maxBaselines) || 0);
  if (limit <= 0) chatBaselines.clear();
  while (limit > 0 && chatBaselines.size > limit) {
    const oldest = chatBaselines.keys().next().value;
    if (oldest === undefined) break;
    chatBaselines.delete(oldest);
  }
}

async function updateChatBaseline(identity, chatArray, reason) {
  try {
    if (!CHAT_SAVE.fallbackEnabled || !identity || !Array.isArray(chatArray)) return;
    const key = chatIdentityKey(identity);
    if (!key) return;
    const hash = await hashChatArray(chatArray);
    if (chatBaselines.has(key)) chatBaselines.delete(key);
    chatBaselines.set(key, { identity: cloneJson(identity), chat: cloneJson(chatArray), hash, capturedAt: Date.now() });
    pruneChatBaselines();
    remember('chat.baseline', { reason, kind: identity.kind, key, hash, messages: chatArray.length });
  } catch (error) {
    remember('chat.baseline-error', { reason, error: String(error && error.message || error) });
  }
}

async function captureChatGetResponse(response, identity, reason) {
  try {
    if (!CHAT_SAVE.fallbackEnabled || !identity || !response || !response.ok) return;
    const text = await response.clone().text();
    const chatArray = JSON.parse(text);
    if (Array.isArray(chatArray)) await updateChatBaseline(identity, chatArray, reason);
  } catch (error) {
    remember('chat.get.capture-error', { reason, error: String(error && error.message || error) });
  }
}

function commonPrefixLength(base, next) {
  const len = Math.min(base.length, next.length);
  let i = 0;
  while (i < len && sameJson(base[i], next[i])) i++;
  return i;
}

function commonSuffixLength(base, next, prefix) {
  const max = Math.min(base.length, next.length) - prefix;
  let i = 0;
  while (i < max && sameJson(base[base.length - 1 - i], next[next.length - 1 - i])) i++;
  return i;
}

function buildChatDiffOps(baseChat, nextChat) {
  if (!Array.isArray(baseChat) || !Array.isArray(nextChat)) return [];
  const ops = [];
  if (baseChat.length === nextChat.length) {
    for (let i = 0; i < nextChat.length; i++) {
      if (!sameJson(baseChat[i], nextChat[i])) ops.push({ op: 'set', index: i, value: cloneJson(nextChat[i]) });
      if (ops.length > CHAT_SAVE.maxPatchOperations) return ops;
    }
    return ops;
  }
  const prefix = commonPrefixLength(baseChat, nextChat);
  const suffix = commonSuffixLength(baseChat, nextChat, prefix);
  ops.push({ op: 'splice', index: prefix, deleteCount: Math.max(0, baseChat.length - prefix - suffix), items: cloneJson(nextChat.slice(prefix, nextChat.length - suffix)) });
  return ops;
}

async function buildChatSavePatch(identity, baseline, nextChat, force, originalBytes) {
  if (!identity || !baseline || !Array.isArray(nextChat)) return null;
  const nextHash = await hashChatArray(nextChat);
  if (nextHash === baseline.hash) {
    if (!CHAT_SAVE.noopEnabled) return null;
    const noopBody = { mode: 'noop', kind: identity.kind, identity: cloneJson(identity), force: !!force, hashAlgorithm: CHAT_SAVE.hashAlgorithm, baseHash: baseline.hash, nextHash, originalBytes };
    let noopText = JSON.stringify(noopBody);
    noopBody.optimizedBytes = utf8Bytes(noopText);
    noopText = JSON.stringify(noopBody);
    const optimizedBytes = utf8Bytes(noopText);
    noopBody.optimizedBytes = optimizedBytes;
    noopText = JSON.stringify(noopBody);
    return { mode: 'noop', text: noopText, nextHash, savedBytes: Math.max(0, originalBytes - optimizedBytes) };
  }
  if (!CHAT_SAVE.patchEnabled) return null;
  const ops = buildChatDiffOps(baseline.chat, nextChat);
  if (ops.length === 0 || ops.length > CHAT_SAVE.maxPatchOperations) return null;
  const patchBody = { mode: 'patch', kind: identity.kind, identity: cloneJson(identity), force: !!force, hashAlgorithm: CHAT_SAVE.hashAlgorithm, baseHash: baseline.hash, nextHash, ops, originalBytes };
  let patchText = JSON.stringify(patchBody);
  patchBody.optimizedBytes = utf8Bytes(patchText);
  patchText = JSON.stringify(patchBody);
  const optimizedBytes = utf8Bytes(patchText);
  patchBody.optimizedBytes = optimizedBytes;
  patchText = JSON.stringify(patchBody);
  if (originalBytes > 0 && optimizedBytes > originalBytes * CHAT_SAVE.maxPatchBytesRatio) return null;
  return { mode: 'patch', text: patchText, nextHash, ops: ops.length, savedBytes: Math.max(0, originalBytes - optimizedBytes) };
}

async function fetchFast(event, fastPath) {
  const request = event.request;
  const body = await readBody(request);
  const headers = copyHeaders(request);
  if (request.method !== 'GET' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const originalPath = new URL(request.url).pathname;
  const startedAt = Date.now();

  try {
    const init = {
      method: request.method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD' && body && body.byteLength) init.body = body;
    const response = await fetch(fastPath, init);
    if (response && response.status !== 404 && response.status !== 503) {
      const cacheState = response.headers.get(HEADER_PREFIX + '-state') || response.headers.get('x-cocktail-cache') || '';
      notifyClients({
        type: 'cocktail-plus-response',
        path: originalPath,
        cache: cacheState,
        status: response.status,
        progress: originalPath === '/api/characters/all' ? {
          cache: cacheState,
          phase: (cacheState === 'ASYNC-MISS' || cacheState === 'STALE-SIGNATURE') ? 'requesting' : 'downloading',
          status: response.status,
        } : null,
        shouldPollStatus: originalPath === '/api/characters/all' && (cacheState === 'ASYNC-MISS' || cacheState === 'STALE-SIGNATURE'),
        durationMs: Date.now() - startedAt,
      });
      return response;
    }
  } catch (error) {
    notifyClients({ type: 'cocktail-plus-error', path: originalPath, error: String(error && error.message || error) });
  }
  return fetch(request);
}

async function handleSettingsGetFallback(request) {
  if (!SETTINGS_GET.fallbackEnabled || request.method !== SETTINGS_GET.method) return fetch(request);
  const startedAt = Date.now();
  try {
    const body = await readBody(request);
    const headers = copyHeaders(request);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(SETTINGS_GET.fastPath, {
      method: SETTINGS_GET.method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
      body: body && body.byteLength ? body : '{}',
    });
    if (response && response.ok) {
      await captureSettingsGetResponse(response, 'sw-settings-get');
      remember('settings.get.fast', { status: response.status, durationMs: Date.now() - startedAt, state: response.headers.get(HEADER_PREFIX + '-settings-get-state') || '' });
      return response;
    }
    remember('settings.get.fallback-status', { status: response && response.status, durationMs: Date.now() - startedAt });
  } catch (error) {
    remember('settings.get.error', { error: String(error && error.message || error), durationMs: Date.now() - startedAt });
  }
  const original = await fetch(request);
  await captureSettingsGetResponse(original, 'sw-settings-get-original');
  return original;
}

async function handleSettingsSaveFallback(request) {
  if (!SETTINGS_SAVE.fallbackEnabled || request.method !== SETTINGS_SAVE.method) return fetch(request);
  const startedAt = Date.now();
  let bodyText = '';
  try { bodyText = await readRequestText(request); } catch { return fetch(request); }
  if (!bodyText) return fetch(request);
  let nextObject;
  try { nextObject = JSON.parse(bodyText); } catch { return fetch(request); }
  const originalBytes = utf8Bytes(bodyText);
  let patch = null;
  try { patch = await buildSettingsSavePatch(nextObject, originalBytes); }
  catch (error) { remember('settings.save.patch-error', { error: String(error && error.message || error) }); }

  if (patch) {
    try {
      const headers = copyHeaders(request);
      headers.set('content-type', 'application/json');
      headers.delete('content-encoding');
      const fastResponse = await fetch(SETTINGS_SAVE.fastPath, { method: SETTINGS_SAVE.method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'manual', body: patch.text });
      if (fastResponse && fastResponse.ok) {
        await updateSettingsBaseline(nextObject, 'sw-settings-save-' + patch.mode);
        remember('settings.save.fast', { mode: patch.mode, status: fastResponse.status, savedBytes: patch.savedBytes || 0, durationMs: Date.now() - startedAt });
        return fastResponse;
      }
      remember('settings.save.fallback-status', { mode: patch.mode, status: fastResponse && fastResponse.status, durationMs: Date.now() - startedAt });
    } catch (error) {
      remember('settings.save.error', { mode: patch.mode, error: String(error && error.message || error), durationMs: Date.now() - startedAt });
    }
  }

  const fallbackResponse = await fetch(request);
  if (fallbackResponse && fallbackResponse.ok) await updateSettingsBaseline(nextObject, patch ? 'sw-settings-save-fallback' : 'sw-settings-save-original');
  return fallbackResponse;
}

async function handleChatGetFallback(request, pathname) {
  if (!CHAT_SAVE.fallbackEnabled || request.method !== CHAT_SAVE.method) return fetch(request);
  const kind = pathname === CHAT_SAVE.originalGroupGetPath ? 'group' : 'character';
  let identity = null;
  try {
    const bodyText = await readRequestText(request);
    const body = bodyText ? JSON.parse(bodyText) : null;
    identity = chatIdentityFor(kind, body || {});
  } catch {}
  const response = await fetch(request);
  await captureChatGetResponse(response, identity, kind === 'group' ? 'sw-group-chat-get' : 'sw-chat-get');
  return response;
}

async function handleChatSaveFallback(request, pathname) {
  if (!CHAT_SAVE.fallbackEnabled || request.method !== CHAT_SAVE.method) return fetch(request);
  const startedAt = Date.now();
  let bodyText = '';
  try { bodyText = await readRequestText(request); } catch { return fetch(request); }
  if (!bodyText) return fetch(request);
  let body;
  try { body = JSON.parse(bodyText); } catch { return fetch(request); }
  if (!body || !Array.isArray(body.chat)) return fetch(request);
  const kind = pathname === CHAT_SAVE.originalGroupSavePath ? 'group' : 'character';
  const identity = chatIdentityFor(kind, body);
  const key = chatIdentityKey(identity);
  const baseline = key ? chatBaselines.get(key) : null;
  if (!identity || !baseline) return fetch(request);
  const originalBytes = utf8Bytes(bodyText);
  let patch = null;
  try { patch = await buildChatSavePatch(identity, baseline, body.chat, body.force, originalBytes); }
  catch (error) { remember('chat.save.patch-error', { error: String(error && error.message || error) }); }

  if (patch) {
    try {
      const headers = copyHeaders(request);
      headers.set('content-type', 'application/json');
      headers.delete('content-encoding');
      const fastPath = kind === 'group' ? CHAT_SAVE.groupFastPath : CHAT_SAVE.fastPath;
      const fastResponse = await fetch(fastPath, { method: CHAT_SAVE.method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'manual', body: patch.text });
      if (fastResponse && fastResponse.ok) {
        const saveState = fastResponse.headers.get(HEADER_PREFIX + '-chat-save-state') || '';
        if (saveState !== 'NOOP-STALE') await updateChatBaseline(identity, body.chat, 'sw-chat-save-' + patch.mode);
        remember('chat.save.fast', { mode: patch.mode, kind, status: fastResponse.status, state: saveState, savedBytes: patch.savedBytes || 0, durationMs: Date.now() - startedAt });
        return fastResponse;
      }
      remember('chat.save.fallback-status', { mode: patch.mode, kind, status: fastResponse && fastResponse.status, durationMs: Date.now() - startedAt });
    } catch (error) {
      remember('chat.save.error', { mode: patch.mode, kind, error: String(error && error.message || error), durationMs: Date.now() - startedAt });
    }
  }

  const fallbackResponse = await fetch(request);
  if (fallbackResponse && fallbackResponse.ok) await updateChatBaseline(identity, body.chat, patch ? 'sw-chat-save-fallback' : 'sw-chat-save-original');
  return fallbackResponse;
}


function isTemplatePath(pathname) {
  return pathname.startsWith('/scripts/templates/') && pathname.endsWith('.html');
}

async function prewarmTemplates() {
  if (!TEMPLATE_FALLBACK.enabled || !self.caches) return;
  try {
    const cache = await caches.open(TEMPLATE_FALLBACK.cacheName);
    await Promise.allSettled((TEMPLATE_FALLBACK.paths || []).map(async (pathname) => {
      try {
        const request = new Request(pathname, { method: 'GET', credentials: 'same-origin', cache: 'force-cache' });
        const cached = await cache.match(request);
        if (cached) return;
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
      } catch {}
    }));
  } catch {}
}

async function handleTemplateFallback(request) {
  if (!TEMPLATE_FALLBACK.enabled || !self.caches) return fetch(request);
  try {
    const cache = await caches.open(TEMPLATE_FALLBACK.cacheName);
    const cached = await cache.match(request);
    if (cached) {
      remember('templates.hit', { path: new URL(request.url).pathname });
      return cached;
    }
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    remember('templates.miss', { path: new URL(request.url).pathname, status: response && response.status });
    return response;
  } catch (error) {
    remember('templates.error', { error: String(error && error.message || error) });
    return fetch(request);
  }
}

function endpointsToInvalidate(pathname) {
  const out = [];
  if (pathname.startsWith('/api/characters/') && pathname !== '/api/characters/all' && pathname !== '/api/characters/get' && pathname !== '/api/characters/chats') out.push('characters-all');
  if (pathname === '/api/chats/save' || pathname === '/api/chats/group/save' || pathname === '/api/chats/delete' || pathname === '/api/chats/group/delete' || pathname === '/api/chats/import' || pathname === '/api/chats/group/import') out.push('characters-all');
  return Array.from(new Set(out));
}

async function notifyInvalidate(request, endpoints, reason) {
  if (!endpoints.length) return;
  const headers = copyHeaders(request);
  headers.set('content-type', 'application/json');
  try {
    await fetch(PREFIX + '/invalidate', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ endpoints, reason }),
    });
  } catch (error) {
  }
}


async function fetchAndInvalidate(request, endpoints, reason) {
  const response = await fetch(request);
  if (response && response.ok) {
    await notifyInvalidate(request, endpoints, reason);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  const pathname = url.pathname;

  if (TEMPLATE_FALLBACK.enabled && request.method === 'GET' && isTemplatePath(pathname)) {
    event.respondWith(handleTemplateFallback(request));
    return;
  }

  if (SETTINGS_GET.fallbackEnabled && pathname === SETTINGS_GET.originalPath && request.method === SETTINGS_GET.method) {
    event.respondWith(handleSettingsGetFallback(request));
    return;
  }

  if (SETTINGS_SAVE.fallbackEnabled && pathname === SETTINGS_SAVE.originalPath && request.method === SETTINGS_SAVE.method) {
    event.respondWith(handleSettingsSaveFallback(request));
    return;
  }

  if (CHAT_SAVE.fallbackEnabled && (pathname === CHAT_SAVE.originalGetPath || pathname === CHAT_SAVE.originalGroupGetPath) && request.method === CHAT_SAVE.method) {
    event.respondWith(handleChatGetFallback(request, pathname));
    return;
  }

  if (CHAT_SAVE.fallbackEnabled && (pathname === CHAT_SAVE.originalSavePath || pathname === CHAT_SAVE.originalGroupSavePath) && request.method === CHAT_SAVE.method) {
    event.respondWith(handleChatSaveFallback(request, pathname));
    return;
  }


  const route = FAST_ROUTES.get(pathname);
  if (FAST_ROUTE_FALLBACK_ENABLED && route && request.method === route.method) {
    event.respondWith(fetchFast(event, route.path));
    return;
  }

  if (request.method === 'POST') {
    const endpoints = endpointsToInvalidate(pathname);
    if (endpoints.length) {
      event.respondWith(fetchAndInvalidate(request, endpoints, pathname));
      return;
    }
  }
});
`;
}
