// server-plugins/cocktail-plus/src/cache-store.ts
import fs7 from "node:fs";
import path8 from "node:path";

// server-plugins/cocktail-plus/src/constants.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ID = "cocktail-plus";
var PLUGIN_NAME = "cocktail-plus";
var VERSION = "0.1.0";
var API_PREFIX = `/api/plugins/${PLUGIN_ID}`;
var HEADER_PREFIX = "x-cocktail-plus";
var SW_MESSAGE_SOURCE = `${PLUGIN_ID}-sw`;
var PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
var CONFIG_PATH = path.join(PLUGIN_DIR, "config.json");
var SERVER_ROOT = path.resolve(PLUGIN_DIR, "..", "..");
var info = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description: "Optional SillyTavern cocktail-plus plugin for frontend/backend startup and interaction paths."
};

// server-plugins/cocktail-plus/src/config.ts
import fs from "node:fs";
import path2 from "node:path";
var DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  serviceWorkerEnabled: true,
  cacheCharactersAll: true,
  cacheVersion: true,
  staleWhileRevalidate: true,
  maxStaleMs: 10 * 60 * 1e3,
  // Store/return SillyTavern-compatible shallow character objects for /api/characters/all.
  shallowCharactersAll: true,
  // Persist shallow characters cache to survive backend restarts.
  diskCacheCharactersAll: true,
  // /version is tiny and non-sensitive; persist it to survive backend restarts.
  diskCacheVersion: true,
  fastVersionOnMiss: true,
  // If there is no characters cache yet, don't block the frontend on the huge original response.
  // Return [] immediately and build the shallow cache in background.
  asyncCharactersAllOnMiss: true,
  // Install a tiny bridge script into public/index.html. It runs before script.js and can patch fetch on first page load.
  earlyBridgeEnabled: true,
  autoInstallEarlyBridge: true,
  earlyBridgePatchFetch: true,
  // Intercept /api/settings/save before the large body leaves the browser.
  // The bridge/SW sends either a no-op hash or a deep JSON patch to /fast/settings-save.
  optimizeSettingsSave: true,
  settingsSaveNoopEnabled: true,
  settingsSavePatchEnabled: true,
  settingsSaveMaxPatchOperations: 2e3,
  // If the patch request is too close to the full payload size, the browser falls back to the original full save.
  settingsSaveMaxPatchBytesRatio: 0.85,
  // Intercept /api/chats/save and /api/chats/group/save before the whole chat file leaves the browser.
  // The bridge sends either a no-op hash or a chat-array patch to /fast/chats-save.
  optimizeChatSave: true,
  chatSaveNoopEnabled: true,
  chatSavePatchEnabled: true,
  chatSaveMaxPatchOperations: 5e3,
  chatSaveMaxPatchBytesRatio: 0.85,
  chatSaveCacheMaxEntries: 64,
  // Replace /api/settings/get with a cached fast endpoint that preserves the original response shape and reads directories in parallel.
  optimizeSettingsGet: true,
  cacheSettingsGet: true,
  // Preload /scripts/templates/*.html in parallel and serve renderTemplateAsync XHR calls from the preloaded memory records.
  templatePreloadEnabled: true,
  // Prefetch /version early so script.js can reuse the fast response. Static resource preloads are intentionally not handled here.
  startupPreloadEnabled: true,
  // Optional Service Worker fallbacks. Early Bridge remains the primary path; these are disabled by default for explicit opt-in.
  serviceWorkerFastRouteFallback: false,
  serviceWorkerSettingsGetFallback: false,
  serviceWorkerSettingsSaveFallback: false,
  serviceWorkerChatSaveFallback: false,
  serviceWorkerTemplateFallback: false,
  // Module proxy rewrites selected SillyTavern ES modules at response time. This does not edit SillyTavern source files.
  moduleProxyEnabled: true,
  patchStartupInit: true,
  patchI18nInit: true,
  patchSystemMessagesInit: true,
  patchExtensionManifests: true,
  patchParallelActivateExtensions: true
});
function asBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off"].includes(s)) return false;
  }
  return fallback;
}
function clampInt(value, min, max, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}
function normalizeConfig(input = {}) {
  const out = { ...DEFAULT_CONFIG };
  out.enabled = asBool(input.enabled, DEFAULT_CONFIG.enabled);
  out.serviceWorkerEnabled = asBool(input.serviceWorkerEnabled, DEFAULT_CONFIG.serviceWorkerEnabled);
  out.cacheCharactersAll = asBool(input.cacheCharactersAll, DEFAULT_CONFIG.cacheCharactersAll);
  out.cacheVersion = asBool(input.cacheVersion, DEFAULT_CONFIG.cacheVersion);
  out.staleWhileRevalidate = asBool(input.staleWhileRevalidate, DEFAULT_CONFIG.staleWhileRevalidate);
  out.maxStaleMs = clampInt(input.maxStaleMs, 0, 24 * 60 * 60 * 1e3, DEFAULT_CONFIG.maxStaleMs);
  out.shallowCharactersAll = asBool(input.shallowCharactersAll, DEFAULT_CONFIG.shallowCharactersAll);
  out.diskCacheCharactersAll = asBool(input.diskCacheCharactersAll, DEFAULT_CONFIG.diskCacheCharactersAll);
  out.diskCacheVersion = asBool(input.diskCacheVersion, DEFAULT_CONFIG.diskCacheVersion);
  out.fastVersionOnMiss = asBool(input.fastVersionOnMiss, DEFAULT_CONFIG.fastVersionOnMiss);
  out.asyncCharactersAllOnMiss = asBool(input.asyncCharactersAllOnMiss, DEFAULT_CONFIG.asyncCharactersAllOnMiss);
  out.earlyBridgeEnabled = asBool(input.earlyBridgeEnabled, DEFAULT_CONFIG.earlyBridgeEnabled);
  out.autoInstallEarlyBridge = asBool(input.autoInstallEarlyBridge, DEFAULT_CONFIG.autoInstallEarlyBridge);
  out.earlyBridgePatchFetch = asBool(input.earlyBridgePatchFetch, DEFAULT_CONFIG.earlyBridgePatchFetch);
  out.optimizeSettingsSave = asBool(input.optimizeSettingsSave, DEFAULT_CONFIG.optimizeSettingsSave);
  out.settingsSaveNoopEnabled = asBool(input.settingsSaveNoopEnabled, DEFAULT_CONFIG.settingsSaveNoopEnabled);
  out.settingsSavePatchEnabled = asBool(input.settingsSavePatchEnabled, DEFAULT_CONFIG.settingsSavePatchEnabled);
  out.settingsSaveMaxPatchOperations = clampInt(input.settingsSaveMaxPatchOperations, 1, 1e5, DEFAULT_CONFIG.settingsSaveMaxPatchOperations);
  out.settingsSaveMaxPatchBytesRatio = Math.max(0.05, Math.min(2, Number(input.settingsSaveMaxPatchBytesRatio) || DEFAULT_CONFIG.settingsSaveMaxPatchBytesRatio));
  out.optimizeChatSave = asBool(input.optimizeChatSave, DEFAULT_CONFIG.optimizeChatSave);
  out.chatSaveNoopEnabled = asBool(input.chatSaveNoopEnabled, DEFAULT_CONFIG.chatSaveNoopEnabled);
  out.chatSavePatchEnabled = asBool(input.chatSavePatchEnabled, DEFAULT_CONFIG.chatSavePatchEnabled);
  out.chatSaveMaxPatchOperations = clampInt(input.chatSaveMaxPatchOperations, 1, 1e5, DEFAULT_CONFIG.chatSaveMaxPatchOperations);
  out.chatSaveMaxPatchBytesRatio = Math.max(0.05, Math.min(2, Number(input.chatSaveMaxPatchBytesRatio) || DEFAULT_CONFIG.chatSaveMaxPatchBytesRatio));
  out.chatSaveCacheMaxEntries = clampInt(input.chatSaveCacheMaxEntries, 0, 1024, DEFAULT_CONFIG.chatSaveCacheMaxEntries);
  out.optimizeSettingsGet = asBool(input.optimizeSettingsGet, DEFAULT_CONFIG.optimizeSettingsGet);
  out.cacheSettingsGet = asBool(input.cacheSettingsGet, DEFAULT_CONFIG.cacheSettingsGet);
  out.templatePreloadEnabled = asBool(input.templatePreloadEnabled, DEFAULT_CONFIG.templatePreloadEnabled);
  out.startupPreloadEnabled = asBool(input.startupPreloadEnabled, DEFAULT_CONFIG.startupPreloadEnabled);
  out.serviceWorkerFastRouteFallback = asBool(input.serviceWorkerFastRouteFallback, DEFAULT_CONFIG.serviceWorkerFastRouteFallback);
  out.serviceWorkerSettingsGetFallback = asBool(input.serviceWorkerSettingsGetFallback, DEFAULT_CONFIG.serviceWorkerSettingsGetFallback);
  out.serviceWorkerSettingsSaveFallback = asBool(input.serviceWorkerSettingsSaveFallback, DEFAULT_CONFIG.serviceWorkerSettingsSaveFallback);
  out.serviceWorkerChatSaveFallback = asBool(input.serviceWorkerChatSaveFallback, DEFAULT_CONFIG.serviceWorkerChatSaveFallback);
  out.serviceWorkerTemplateFallback = asBool(input.serviceWorkerTemplateFallback, DEFAULT_CONFIG.serviceWorkerTemplateFallback);
  out.moduleProxyEnabled = asBool(input.moduleProxyEnabled, DEFAULT_CONFIG.moduleProxyEnabled);
  out.patchStartupInit = asBool(input.patchStartupInit, DEFAULT_CONFIG.patchStartupInit);
  out.patchI18nInit = asBool(input.patchI18nInit, DEFAULT_CONFIG.patchI18nInit);
  out.patchSystemMessagesInit = asBool(input.patchSystemMessagesInit, DEFAULT_CONFIG.patchSystemMessagesInit);
  out.patchExtensionManifests = asBool(input.patchExtensionManifests, DEFAULT_CONFIG.patchExtensionManifests);
  out.patchParallelActivateExtensions = asBool(input.patchParallelActivateExtensions, DEFAULT_CONFIG.patchParallelActivateExtensions);
  return out;
}
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return normalizeConfig({});
    return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
  } catch (error) {
    console.warn(`[${PLUGIN_ID}] Failed to read config.json, using defaults:`, error);
    return normalizeConfig({});
  }
}
function saveConfig(nextConfig) {
  const normalized = normalizeConfig(nextConfig);
  fs.mkdirSync(path2.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 4), "utf8");
  config = normalized;
  return config;
}
function asBoolean(value, fallback = false) {
  return asBool(value, fallback);
}
var config = loadConfig();

// server-plugins/cocktail-plus/src/utils.ts
import fs2 from "node:fs";
import path3 from "node:path";
import crypto from "node:crypto";
function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}
function stableStringify(value) {
  if (value === null || value === void 0) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function getDataRoot() {
  return globalThis.DATA_ROOT || process.cwd();
}
function safeStatRecord(filePath, label = filePath) {
  try {
    const stat = fs2.statSync(filePath);
    return { label, exists: true, file: stat.isFile(), directory: stat.isDirectory(), size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
  } catch {
    return { label, exists: false };
  }
}
function scanDirectoryShallow(dirPath, options = {}) {
  const out = [];
  if (!dirPath) return out;
  const exts = Array.isArray(options.extensions) ? options.extensions.map((x) => String(x).toLowerCase()) : null;
  try {
    const entries = fs2.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const ext = path3.extname(entry.name).toLowerCase();
      if (entry.isFile() && exts && !exts.includes(ext)) continue;
      out.push(safeStatRecord(path3.join(dirPath, entry.name), `${options.label || dirPath}/${entry.name}`));
    }
  } catch {
    out.push({ label: options.label || dirPath, exists: false });
  }
  return out;
}
function signatureFromRecords(records) {
  return sha256(stableStringify(records));
}
function readTextIfExists(filePath) {
  try {
    if (!fs2.existsSync(filePath)) return "";
    return fs2.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}
function getServerRoot() {
  return fs2.existsSync(path3.join(SERVER_ROOT, "server.js")) ? SERVER_ROOT : process.cwd();
}
function getPathValue(obj, pathValue, fallback = void 0) {
  try {
    const parts = String(pathValue).split(".");
    let cur = obj;
    for (const part of parts) {
      if (cur === null || cur === void 0) return fallback;
      cur = cur[part];
    }
    return cur === void 0 ? fallback : cur;
  } catch {
    return fallback;
  }
}

// server-plugins/cocktail-plus/src/endpoints/characters-all.ts
function toShallowCharacter(character) {
  return {
    shallow: true,
    name: character?.name,
    avatar: character?.avatar,
    chat: character?.chat,
    fav: character?.fav,
    date_added: character?.date_added,
    create_date: character?.create_date,
    date_last_chat: character?.date_last_chat,
    chat_size: character?.chat_size,
    data_size: character?.data_size,
    tags: character?.tags,
    data: {
      name: getPathValue(character, "data.name", ""),
      character_version: getPathValue(character, "data.character_version", ""),
      creator: getPathValue(character, "data.creator", ""),
      creator_notes: getPathValue(character, "data.creator_notes", ""),
      tags: getPathValue(character, "data.tags", []),
      extensions: {
        fav: getPathValue(character, "data.extensions.fav", false)
      }
    }
  };
}
function getCharactersSignature(ctx) {
  return signatureFromRecords(scanDirectoryShallow(ctx.directories?.characters, { label: "characters", extensions: [".png"] }));
}
function transformBodyForCache(ctx, bodyText, config2) {
  if (!config2.shallowCharactersAll) {
    return { bodyText, transformed: false, sourceBytes: Buffer.byteLength(bodyText || "", "utf8"), cachedBytes: Buffer.byteLength(bodyText || "", "utf8") };
  }
  const sourceBytes = Buffer.byteLength(bodyText || "", "utf8");
  try {
    const parsed = JSON.parse(bodyText);
    if (!Array.isArray(parsed)) throw new Error("characters/all response is not an array");
    const shallow = parsed.map(toShallowCharacter).filter((c) => c && c.name);
    const transformedBodyText = JSON.stringify(shallow);
    const cachedBytes = Buffer.byteLength(transformedBodyText, "utf8");
    return { bodyText: transformedBodyText, transformed: true, sourceBytes, cachedBytes, count: shallow.length };
  } catch (error) {
    return { bodyText, transformed: false, sourceBytes, cachedBytes: sourceBytes, error: error instanceof Error ? error.message : String(error) };
  }
}
function makeAsyncMiss(ctx, signature, config2) {
  if (!config2.asyncCharactersAllOnMiss) return null;
  return {
    state: "ASYNC-MISS",
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json; charset=utf-8" },
    extraResponseHeaders: {
      [`${HEADER_PREFIX}-async`]: "1",
      [`${HEADER_PREFIX}-retry-after-ms`]: "1000"
    },
    bodyText: "[]",
    durationMs: 0,
    refreshReason: "async-miss"
  };
}
var charactersAllEndpoint = {
  key: "characters-all",
  aliases: ["characters", "characters-all", "/api/characters/all"],
  originalPath: "/api/characters/all",
  fastPath: "/fast/characters-all",
  configKey: "cacheCharactersAll",
  diskCacheConfigKey: "diskCacheCharactersAll",
  method: "POST",
  getSignature: getCharactersSignature,
  transformBodyForCache,
  makeAsyncMiss
};

// server-plugins/cocktail-plus/src/endpoints/chat-save.ts
import fs3 from "node:fs";
import path4 from "node:path";

// server-plugins/cocktail-plus/src/original-fetch.ts
function pickResponseHeaders(response) {
  const headers = {};
  const contentType = response.headers.get("content-type");
  headers["content-type"] = contentType || "application/json; charset=utf-8";
  return headers;
}
async function fetchOriginal(ctx, endpoint) {
  const method = endpoint.method || "POST";
  const url = `${ctx.protocol}://${ctx.host}${endpoint.originalPath}`;
  const headers = {};
  for (const [key, value] of Object.entries(ctx.headers || {})) {
    if (typeof value === "string" && value.length > 0) headers[key] = value;
  }
  if (method !== "GET") {
    headers["content-type"] = headers["content-type"] || "application/json";
  }
  headers[HEADER_PREFIX] = VERSION;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5 * 60 * 1e3);
  try {
    const fetchOptions = { method, headers, redirect: "manual", signal: controller.signal };
    if (method !== "GET" && method !== "HEAD") {
      fetchOptions.body = ctx.bodyText;
    }
    const response = await fetch(url, fetchOptions);
    const bodyText = await response.text();
    const durationMs = Date.now() - startedAt;
    return { ok: response.ok, status: response.status, statusText: response.statusText, headers: pickResponseHeaders(response), bodyText, durationMs };
  } finally {
    clearTimeout(timer);
  }
}

// server-plugins/cocktail-plus/src/request-context.ts
function getUserHandleFromRequest(req) {
  return String(req?.user?.profile?.handle || req?.user?.profile?.name || "default");
}
function getUserKeyFromHandle(handle) {
  return sha256(`${getDataRoot()}
${handle}`).slice(0, 32);
}
function makeRequestContext(req, options = {}) {
  const handle = getUserHandleFromRequest(req);
  const userKey = getUserKeyFromHandle(handle);
  const body = options.bodyOverride !== void 0 ? options.bodyOverride : req.body ?? {};
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || (req.secure ? "https" : "http");
  const host = req.get?.("host") || req.headers?.host || "127.0.0.1";
  return {
    requestId: options.requestId || null,
    handle,
    userKey,
    directories: req.user?.directories || {},
    body,
    bodyText: options.bodyTextOverride !== void 0 ? String(options.bodyTextOverride) : stableStringify(body),
    protocol,
    host,
    headers: {
      cookie: req.headers?.cookie,
      "x-csrf-token": req.headers?.["x-csrf-token"],
      "content-type": req.headers?.["content-type"] || "application/json",
      accept: req.headers?.accept,
      "user-agent": req.headers?.["user-agent"]
    }
  };
}

// server-plugins/cocktail-plus/src/endpoints/chat-save.ts
var CHAT_SAVE_HASH_ALGORITHM = "cp-chat-stable-sha256-v1";
var chatSaveEndpoint = {
  key: "chats-save",
  aliases: ["chats-save", "/api/chats/save"],
  originalPath: "/api/chats/save",
  fastPath: "/fast/chats-save",
  configKey: "optimizeChatSave",
  method: "POST",
  kind: "character"
};
var groupChatSaveEndpoint = {
  key: "chats-group-save",
  aliases: ["chats-group-save", "/api/chats/group/save"],
  originalPath: "/api/chats/group/save",
  fastPath: "/fast/chats-group-save",
  configKey: "optimizeChatSave",
  method: "POST",
  kind: "group"
};
var chatSaveStats = {
  requests: 0,
  noops: 0,
  patches: 0,
  fulls: 0,
  conflicts: 0,
  errors: 0,
  originalBytes: 0,
  optimizedBytes: 0,
  savedBytes: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheInvalidations: 0,
  cacheEvictions: 0,
  lastMode: null,
  lastState: null,
  lastError: null,
  lastAt: null
};
var chatFileCache = /* @__PURE__ */ new Map();
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function hashChat(value) {
  return sha256(stableStringify(Array.isArray(value) ? value : []));
}
function cloneJson(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function asString(value) {
  return String(value ?? "");
}
function sanitizeFileName(value) {
  let out = asString(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/[\u{0080}-\u{009F}]/gu, "").trim();
  if (!out || /^\.+$/.test(out)) out = "untitled";
  if (out.length > 240) {
    const ext = path4.extname(out);
    out = out.slice(0, Math.max(1, 240 - ext.length)) + ext;
  }
  return out;
}
function isPathUnderParent(parent, candidate) {
  const relative = path4.relative(parent, candidate);
  return !!relative && !relative.startsWith("..") && !path4.isAbsolute(relative);
}
function getSafeStat(filePath) {
  try {
    const stat = fs3.statSync(filePath);
    return { exists: true, size: stat.size, mtimeMs: Math.round(stat.mtimeMs), file: stat.isFile() };
  } catch {
    return { exists: false, size: 0, mtimeMs: 0, file: false };
  }
}
function sameStat(a, b) {
  return !!a && !!b && a.exists === b.exists && a.size === b.size && a.mtimeMs === b.mtimeMs && a.file === b.file;
}
function parseJsonl(text) {
  if (!text) return [];
  const out = [];
  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const item = JSON.parse(trimmed);
      if (item) out.push(item);
    } catch {
    }
  }
  return out;
}
function readChatFromFile(filePath) {
  try {
    if (!fs3.existsSync(filePath)) return [];
    return parseJsonl(fs3.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}
function getCacheLimit() {
  const value = Number(config.chatSaveCacheMaxEntries);
  if (!Number.isFinite(value)) return 64;
  return Math.max(0, Math.min(1024, Math.trunc(value)));
}
function setCacheEntry(key, entry) {
  const limit = getCacheLimit();
  if (limit <= 0) {
    chatFileCache.clear();
    return;
  }
  if (chatFileCache.has(key)) chatFileCache.delete(key);
  chatFileCache.set(key, entry);
  while (chatFileCache.size > limit) {
    const oldest = chatFileCache.keys().next().value;
    if (oldest === void 0) break;
    chatFileCache.delete(oldest);
    chatSaveStats.cacheEvictions++;
  }
}
function getIdentityValue(body, key) {
  if (body?.identity && body.identity[key] !== void 0) return body.identity[key];
  return body?.[key];
}
function makeDescriptor(req, endpoint, body) {
  const ctx = makeRequestContext(req, { bodyOverride: {} });
  const kind = endpoint.kind || body?.kind || "character";
  if (kind === "group") {
    const id = asString(getIdentityValue(body, "id"));
    if (!id) throw new Error("group chat id is required");
    const root = req?.user?.directories?.groupChats;
    if (!root) throw new Error("User group chats directory is unavailable");
    const filePath2 = path4.join(root, sanitizeFileName(`${id}.jsonl`));
    if (!isPathUnderParent(root, filePath2)) throw new Error("Resolved group chat path is outside user directory");
    return {
      kind,
      endpoint,
      cacheKey: `${ctx.userKey}:group:${id}`,
      filePath: filePath2,
      root,
      identity: { id },
      originalBody: (nextChat) => ({ id, chat: nextChat, force: !!body?.force })
    };
  }
  const avatarUrl = asString(getIdentityValue(body, "avatar_url"));
  const fileName = asString(getIdentityValue(body, "file_name"));
  const chName = asString(getIdentityValue(body, "ch_name"));
  if (!avatarUrl || !fileName) throw new Error("avatar_url and file_name are required");
  const chatsRoot = req?.user?.directories?.chats;
  if (!chatsRoot) throw new Error("User chats directory is unavailable");
  const cardName = avatarUrl.replace(/\.png$/i, "");
  const directoryPath = path4.join(chatsRoot, cardName);
  const filePath = path4.join(directoryPath, sanitizeFileName(`${fileName}.jsonl`));
  if (!isPathUnderParent(chatsRoot, filePath)) throw new Error("Resolved chat path is outside user directory");
  return {
    kind,
    endpoint,
    cacheKey: `${ctx.userKey}:character:${avatarUrl}:${fileName}`,
    filePath,
    root: chatsRoot,
    identity: { avatar_url: avatarUrl, file_name: fileName, ch_name: chName },
    originalBody: (nextChat) => ({ ch_name: chName, file_name: fileName, chat: nextChat, avatar_url: avatarUrl, force: !!body?.force })
  };
}
function getCurrentChat(descriptor) {
  const stat = getSafeStat(descriptor.filePath);
  const cached = chatFileCache.get(descriptor.cacheKey);
  if (cached && sameStat(cached.stat, stat)) {
    chatFileCache.delete(descriptor.cacheKey);
    chatFileCache.set(descriptor.cacheKey, cached);
    chatSaveStats.cacheHits++;
    return { ...cached, stat };
  }
  if (cached) chatSaveStats.cacheInvalidations++;
  chatSaveStats.cacheMisses++;
  const chat = readChatFromFile(descriptor.filePath);
  const hash = hashChat(chat);
  const entry = { chat, hash, stat, updatedAt: Date.now(), approxBytes: Buffer.byteLength(JSON.stringify(chat), "utf8") };
  setCacheEntry(descriptor.cacheKey, entry);
  return entry;
}
function updateCurrentChatCache(descriptor, nextChat) {
  const stat = getSafeStat(descriptor.filePath);
  const entry = { chat: cloneJson(nextChat), hash: hashChat(nextChat), stat, updatedAt: Date.now(), approxBytes: Buffer.byteLength(JSON.stringify(nextChat), "utf8") };
  setCacheEntry(descriptor.cacheKey, entry);
}
function noteTraffic(body, fallbackMode = "unknown") {
  const originalBytes = Math.max(0, Number(body?.originalBytes) || 0);
  const optimizedBytes = Math.max(0, Number(body?.optimizedBytes) || Buffer.byteLength(JSON.stringify(body || {}), "utf8"));
  chatSaveStats.originalBytes += originalBytes;
  chatSaveStats.optimizedBytes += optimizedBytes;
  chatSaveStats.savedBytes += Math.max(0, originalBytes - optimizedBytes);
  chatSaveStats.lastMode = body?.mode || fallbackMode;
  chatSaveStats.lastAt = nowIso();
}
function sendJson(res, status, data, state) {
  chatSaveStats.lastState = state;
  res.status(status);
  res.setHeader(HEADER_PREFIX, VERSION);
  res.setHeader(`${HEADER_PREFIX}-chat-save-state`, state);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(data));
}
function sendText(res, status, bodyText, state, contentType = "application/json; charset=utf-8") {
  chatSaveStats.lastState = state;
  res.status(status || 200);
  res.setHeader(HEADER_PREFIX, VERSION);
  res.setHeader(`${HEADER_PREFIX}-chat-save-state`, state);
  res.setHeader("content-type", contentType);
  res.send(bodyText ?? "");
}
function conflict(res, data) {
  chatSaveStats.conflicts++;
  return sendJson(res, 409, { ok: false, fallback: true, ...data }, "CONFLICT");
}
function toSafeInteger(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} is out of range`);
  return n;
}
function isSafePathSegment(segment) {
  if (typeof segment !== "string" && typeof segment !== "number") return false;
  const value = String(segment);
  return value !== "__proto__" && value !== "prototype" && value !== "constructor" && value.length > 0 && value.length < 512;
}
function normalizePatchPath(value) {
  if (!Array.isArray(value)) throw new Error("Patch path must be an array");
  if (value.length === 0) throw new Error("Patch path cannot be empty");
  if (value.length > 128) throw new Error("Patch path is too deep");
  if (!value.every(isSafePathSegment)) throw new Error("Patch path contains unsafe segments");
  return value.map((segment) => typeof segment === "number" ? segment : String(segment));
}
function ensureContainer(parent, key, nextKey) {
  if (parent[key] === null || typeof parent[key] !== "object" || Array.isArray(parent[key])) {
    parent[key] = typeof nextKey === "number" ? [] : {};
  }
  return parent[key];
}
function setAtPath(target, patchPath, value) {
  let parent = target;
  for (let i = 0; i < patchPath.length - 1; i++) {
    const key = patchPath[i];
    const nextKey = patchPath[i + 1];
    parent = ensureContainer(parent, key, nextKey);
  }
  parent[patchPath[patchPath.length - 1]] = cloneJson(value);
}
function deleteAtPath(target, patchPath) {
  let parent = target;
  for (let i = 0; i < patchPath.length - 1; i++) {
    const key = patchPath[i];
    if (parent === null || typeof parent !== "object" || !(key in parent)) return;
    parent = parent[key];
  }
  if (parent && typeof parent === "object") delete parent[patchPath[patchPath.length - 1]];
}
function applyPatch(baseChat, ops) {
  if (!Array.isArray(ops)) throw new Error("Patch ops must be an array");
  if (ops.length > config.chatSaveMaxPatchOperations) {
    throw new Error(`Too many patch operations: ${ops.length}`);
  }
  const next = cloneJson(Array.isArray(baseChat) ? baseChat : []);
  for (const op of ops) {
    const kind = String(op?.op || "").toLowerCase();
    if (kind === "splice") {
      const index = toSafeInteger(op.index, 0, next.length, "splice.index");
      const deleteCount = toSafeInteger(op.deleteCount ?? 0, 0, next.length - index, "splice.deleteCount");
      const items = Array.isArray(op.items) ? cloneJson(op.items) : [];
      next.splice(index, deleteCount, ...items);
      continue;
    }
    if (kind === "set") {
      const index = toSafeInteger(op.index, 0, Math.max(0, next.length), "set.index");
      if (index >= next.length) throw new Error("set.index must point to an existing message");
      next[index] = cloneJson(op.value);
      continue;
    }
    if (kind === "set-path") {
      const index = toSafeInteger(op.index, 0, Math.max(0, next.length - 1), "set-path.index");
      const patchPath = normalizePatchPath(op.path);
      if (next[index] === null || typeof next[index] !== "object") next[index] = {};
      setAtPath(next[index], patchPath, op.value);
      continue;
    }
    if (kind === "delete-path") {
      const index = toSafeInteger(op.index, 0, Math.max(0, next.length - 1), "delete-path.index");
      const patchPath = normalizePatchPath(op.path);
      deleteAtPath(next[index], patchPath);
      continue;
    }
    throw new Error(`Unsupported patch op: ${kind}`);
  }
  return next;
}
async function callOriginalChatSave(req, descriptor, nextChat) {
  const originalBody = descriptor.originalBody(nextChat);
  const ctx = makeRequestContext(req, {
    bodyOverride: originalBody,
    bodyTextOverride: JSON.stringify(originalBody)
  });
  return await fetchOriginal(ctx, descriptor.endpoint);
}
function getChatSaveStatus() {
  return {
    endpointKey: "chat-save",
    enabled: !!config.enabled && !!config.optimizeChatSave,
    patchEnabled: !!config.chatSavePatchEnabled,
    noopEnabled: !!config.chatSaveNoopEnabled,
    cacheEntries: chatFileCache.size,
    stats: { ...chatSaveStats }
  };
}
async function handleChatSaveFast(req, res, endpoint = chatSaveEndpoint) {
  chatSaveStats.requests++;
  const body = req.body || {};
  chatSaveStats.lastMode = body?.mode || null;
  chatSaveStats.lastAt = nowIso();
  if (!config.enabled || !config.optimizeChatSave) {
    return sendJson(res, 503, { ok: false, fallback: true, error: "chat-save optimization disabled" }, "DISABLED");
  }
  try {
    const mode = String(body.mode || "").toLowerCase();
    if (body.hashAlgorithm && body.hashAlgorithm !== CHAT_SAVE_HASH_ALGORITHM) {
      return sendJson(res, 400, { ok: false, fallback: true, error: "unsupported hash algorithm" }, "BAD-HASH-ALGORITHM");
    }
    const descriptor = makeDescriptor(req, endpoint, body);
    const current = getCurrentChat(descriptor);
    const currentHash = current.hash;
    if (mode === "noop") {
      if (!config.chatSaveNoopEnabled) {
        return sendJson(res, 503, { ok: false, fallback: true, error: "chat-save noop optimization disabled" }, "NOOP-DISABLED");
      }
      chatSaveStats.noops++;
      noteTraffic(body);
      const fresh = currentHash === body.baseHash || currentHash === body.nextHash;
      return sendJson(res, 200, {
        ok: true,
        result: "ok",
        optimized: true,
        mode: "noop",
        state: fresh ? "NOOP" : "NOOP-STALE",
        currentHash
      }, fresh ? "NOOP" : "NOOP-STALE");
    }
    if (mode === "patch") {
      if (!config.chatSavePatchEnabled) {
        return sendJson(res, 503, { ok: false, fallback: true, error: "chat-save patch optimization disabled" }, "PATCH-DISABLED");
      }
      if (!body.baseHash || !body.nextHash) {
        return sendJson(res, 400, { ok: false, fallback: true, error: "baseHash and nextHash are required" }, "BAD-PATCH");
      }
      if (currentHash !== body.baseHash) {
        return conflict(res, { error: "base hash mismatch", currentHash, baseHash: body.baseHash });
      }
      const nextChat = applyPatch(current.chat, body.ops || []);
      const appliedHash = hashChat(nextChat);
      if (appliedHash !== body.nextHash) {
        return sendJson(res, 400, { ok: false, fallback: true, error: "patch hash mismatch", appliedHash, nextHash: body.nextHash }, "PATCH-HASH-MISMATCH");
      }
      const result = await callOriginalChatSave(req, descriptor, nextChat);
      if (result.ok) {
        chatSaveStats.patches++;
        noteTraffic(body);
        updateCurrentChatCache(descriptor, nextChat);
      }
      const state = result.ok ? "PATCH" : "PATCH-ORIGINAL-ERROR";
      return sendText(res, result.status, result.bodyText, state, result.headers?.["content-type"]);
    }
    return sendJson(res, 400, { ok: false, fallback: true, error: `unsupported mode: ${mode || "(empty)"}` }, "BAD-MODE");
  } catch (error) {
    chatSaveStats.errors++;
    chatSaveStats.lastError = error instanceof Error ? error.message : String(error);
    chatSaveStats.lastAt = nowIso();
    return sendJson(res, 500, { ok: false, fallback: true, error: chatSaveStats.lastError }, "ERROR");
  }
}

// server-plugins/cocktail-plus/src/endpoints/settings-get.ts
import fs4 from "node:fs";
import path5 from "node:path";
var SETTINGS_FILE = "settings.json";
var JSON_CONTENT_TYPE = "application/json; charset=utf-8";
var settingsGetEndpoint = {
  key: "settings-get",
  aliases: ["settings-get", "/api/settings/get"],
  originalPath: "/api/settings/get",
  fastPath: "/fast/settings-get",
  configKey: "optimizeSettingsGet",
  method: "POST"
};
var settingsGetStats = {
  requests: 0,
  hits: 0,
  misses: 0,
  bypasses: 0,
  errors: 0,
  responseBytes: 0,
  lastState: null,
  lastError: null,
  lastAt: null,
  lastBuildMs: 0
};
var settingsGetCache = /* @__PURE__ */ new Map();
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function settingsPathFromRequest(req) {
  const root = req?.user?.directories?.root;
  if (!root) throw new Error("User settings root directory is unavailable");
  return path5.join(root, SETTINGS_FILE);
}
async function listFiles(directoryPath, fileExtension = ".json") {
  try {
    const files = await fs4.promises.readdir(directoryPath);
    return files.filter((name) => path5.extname(name).toLowerCase() === fileExtension).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
async function safeStatRecordAsync(filePath, label = filePath) {
  try {
    const stat = await fs4.promises.stat(filePath);
    return { label, exists: true, file: stat.isFile(), directory: stat.isDirectory(), size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
  } catch {
    return { label, exists: false };
  }
}
async function safeDirectoryRecords(dirPath, label, extensions = null) {
  try {
    const names = (await fs4.promises.readdir(dirPath)).sort((a, b) => a.localeCompare(b));
    const filtered = names.filter((name) => {
      if (name.startsWith(".")) return false;
      const ext = path5.extname(name).toLowerCase();
      return !extensions || extensions.includes(ext);
    });
    return await Promise.all(filtered.map((name) => safeStatRecordAsync(path5.join(dirPath, name), `${label}/${name}`)));
  } catch {
    return [{ label, exists: false }];
  }
}
async function getSettingsGetSignature(req) {
  const directories = req.user?.directories || {};
  const groups = await Promise.all([
    safeStatRecordAsync(settingsPathFromRequest(req), "settings.json").then((record) => [record]),
    safeDirectoryRecords(directories.koboldAI_Settings, "koboldai-settings", [".json"]),
    safeDirectoryRecords(directories.novelAI_Settings, "novelai-settings", [".json"]),
    safeDirectoryRecords(directories.openAI_Settings, "openai-settings", [".json"]),
    safeDirectoryRecords(directories.textGen_Settings, "textgen-settings", [".json"]),
    safeDirectoryRecords(directories.worlds, "worlds", [".json"]),
    safeDirectoryRecords(directories.themes, "themes", [".json"]),
    safeDirectoryRecords(directories.movingUI, "moving-ui", [".json"]),
    safeDirectoryRecords(directories.quickreplies, "quick-replies", [".json"]),
    safeDirectoryRecords(directories.instruct, "instruct", [".json"]),
    safeDirectoryRecords(directories.context, "context", [".json"]),
    safeDirectoryRecords(directories.sysprompt, "sysprompt", [".json"]),
    safeDirectoryRecords(directories.reasoning, "reasoning", [".json"])
  ]);
  const records = groups.flat();
  return sha256(stableStringify(records));
}
async function readPresetsFromDirectory(directoryPath, options = {}) {
  const {
    removeFileExtension = false,
    fileExtension = ".json"
  } = options;
  const files = await listFiles(directoryPath, fileExtension);
  const rows = await Promise.all(files.map(async (fileName) => {
    try {
      const filePath = path5.join(directoryPath, fileName);
      const text = await fs4.promises.readFile(filePath, "utf8");
      if (fileExtension === ".json") JSON.parse(text);
      return {
        name: removeFileExtension ? fileName.replace(/\.[^/.]+$/, "") : fileName,
        text
      };
    } catch (error) {
      console.warn(`[cocktail-plus] settings/get preset skipped: ${fileName}`, error?.message || error);
      return null;
    }
  }));
  const valid = rows.filter(Boolean);
  return {
    fileContents: valid.map((row) => row.text),
    fileNames: valid.map((row) => row.name)
  };
}
async function readAndParseFromDirectory(directoryPath, fileExtension = ".json") {
  const files = await listFiles(directoryPath, fileExtension);
  const rows = await Promise.all(files.map(async (fileName) => {
    try {
      const filePath = path5.join(directoryPath, fileName);
      const text = await fs4.promises.readFile(filePath, "utf8");
      return fileExtension === ".json" ? JSON.parse(text) : text;
    } catch {
      return null;
    }
  }));
  return rows.filter((value) => value !== null);
}
async function readWorldNames(directoryPath) {
  const files = await listFiles(directoryPath, ".json");
  return files.map((item) => path5.parse(item).name);
}
async function buildSettingsGetPayload(req) {
  const directories = req.user?.directories || {};
  const startedAt = Date.now();
  const [
    settings,
    kobold,
    novelai,
    openai,
    textgen,
    world_names,
    themes,
    movingUIPresets,
    quickReplyPresets,
    instruct,
    context,
    sysprompt,
    reasoning
  ] = await Promise.all([
    fs4.promises.readFile(settingsPathFromRequest(req), "utf8"),
    readPresetsFromDirectory(directories.koboldAI_Settings, { removeFileExtension: true }),
    readPresetsFromDirectory(directories.novelAI_Settings, { removeFileExtension: true }),
    readPresetsFromDirectory(directories.openAI_Settings, { removeFileExtension: true }),
    readPresetsFromDirectory(directories.textGen_Settings, { removeFileExtension: true }),
    readWorldNames(directories.worlds),
    readAndParseFromDirectory(directories.themes),
    readAndParseFromDirectory(directories.movingUI),
    readAndParseFromDirectory(directories.quickreplies),
    readAndParseFromDirectory(directories.instruct),
    readAndParseFromDirectory(directories.context),
    readAndParseFromDirectory(directories.sysprompt),
    readAndParseFromDirectory(directories.reasoning)
  ]);
  const payload = {
    settings,
    koboldai_settings: kobold.fileContents,
    koboldai_setting_names: kobold.fileNames,
    world_names,
    novelai_settings: novelai.fileContents,
    novelai_setting_names: novelai.fileNames,
    openai_settings: openai.fileContents,
    openai_setting_names: openai.fileNames,
    textgenerationwebui_presets: textgen.fileContents,
    textgenerationwebui_preset_names: textgen.fileNames,
    themes,
    movingUIPresets,
    quickReplyPresets,
    instruct,
    context,
    sysprompt,
    reasoning,
    enable_extensions: true,
    enable_extensions_auto_update: true,
    enable_accounts: false,
    request_compression: {
      enabled: false,
      minPayloadSize: 262144,
      maxPayloadSize: 8388608,
      timeout: 4e3
    }
  };
  const bodyText = JSON.stringify(payload);
  const responseBytes = Buffer.byteLength(bodyText, "utf8");
  return {
    bodyText,
    responseBytes,
    buildMs: Date.now() - startedAt
  };
}
function getCacheKey(req) {
  const ctx = makeRequestContext(req, { bodyOverride: {} });
  return ctx.userKey;
}
function noteTraffic2(result) {
  settingsGetStats.responseBytes += result.responseBytes || 0;
  settingsGetStats.lastBuildMs = result.buildMs || 0;
  settingsGetStats.lastAt = nowIso2();
}
function sendBody(res, status, bodyText, state, result = null) {
  settingsGetStats.lastState = state;
  res.status(status || 200);
  res.setHeader(HEADER_PREFIX, VERSION);
  res.setHeader(`${HEADER_PREFIX}-settings-get-state`, state);
  if (result) {
    res.setHeader(`${HEADER_PREFIX}-settings-get-build-ms`, String(result.buildMs || 0));
    res.setHeader(`${HEADER_PREFIX}-settings-get-bytes`, String(result.responseBytes || 0));
  }
  res.setHeader("content-type", JSON_CONTENT_TYPE);
  res.send(bodyText ?? "{}");
}
function getSettingsGetStatus() {
  return {
    endpointKey: settingsGetEndpoint.key,
    enabled: !!config.enabled && !!config.optimizeSettingsGet,
    cacheEnabled: !!config.cacheSettingsGet,
    stats: { ...settingsGetStats }
  };
}
function clearSettingsGetCache() {
  settingsGetCache.clear();
}
async function handleSettingsGetFast(req, res) {
  settingsGetStats.requests++;
  settingsGetStats.lastAt = nowIso2();
  if (!config.enabled || !config.optimizeSettingsGet) {
    settingsGetStats.bypasses++;
    return sendBody(res, 503, JSON.stringify({ ok: false, fallback: true, error: "settings-get optimization disabled" }), "DISABLED");
  }
  try {
    const cacheKey = getCacheKey(req);
    const cached = settingsGetCache.get(cacheKey);
    if (config.cacheSettingsGet && cached) {
      const signature2 = await getSettingsGetSignature(req);
      if (cached.signature === signature2) {
        settingsGetStats.hits++;
        cached.hitCount = Number(cached.hitCount || 0) + 1;
        cached.lastHitAt = Date.now();
        return sendBody(res, 200, cached.bodyText, "HIT", cached);
      }
      settingsGetStats.misses++;
      const result2 = await buildSettingsGetPayload(req);
      result2.signature = signature2;
      result2.createdAt = Date.now();
      result2.hitCount = 0;
      settingsGetCache.set(cacheKey, result2);
      noteTraffic2(result2);
      return sendBody(res, 200, result2.bodyText, "MISS", result2);
    }
    settingsGetStats.misses++;
    const [signature, result] = await Promise.all([
      getSettingsGetSignature(req),
      buildSettingsGetPayload(req)
    ]);
    result.signature = signature;
    result.createdAt = Date.now();
    result.hitCount = 0;
    if (config.cacheSettingsGet) settingsGetCache.set(cacheKey, result);
    noteTraffic2(result);
    return sendBody(res, 200, result.bodyText, "MISS", result);
  } catch (error) {
    settingsGetStats.errors++;
    settingsGetStats.lastError = error instanceof Error ? error.message : String(error);
    settingsGetStats.lastAt = nowIso2();
    return sendBody(res, 500, JSON.stringify({ ok: false, fallback: true, error: settingsGetStats.lastError }), "ERROR");
  }
}

// server-plugins/cocktail-plus/src/endpoints/settings-save.ts
import fs5 from "node:fs";
import path6 from "node:path";
var SETTINGS_FILE2 = "settings.json";
var SETTINGS_HASH_ALGORITHM = "cp-stable-sha256-v1";
var settingsSaveEndpoint = {
  key: "settings-save",
  aliases: ["settings-save", "/api/settings/save"],
  originalPath: "/api/settings/save",
  fastPath: "/fast/settings-save",
  configKey: "optimizeSettingsSave",
  method: "POST"
};
var settingsSaveStats = {
  requests: 0,
  noops: 0,
  patches: 0,
  fulls: 0,
  conflicts: 0,
  errors: 0,
  originalBytes: 0,
  optimizedBytes: 0,
  savedBytes: 0,
  lastMode: null,
  lastState: null,
  lastError: null,
  lastAt: null
};
function nowIso3() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function hashSettings(value) {
  return sha256(stableStringify(value));
}
function settingsPathFromRequest2(req) {
  const root = req?.user?.directories?.root;
  if (!root) throw new Error("User settings root directory is unavailable");
  return path6.join(root, SETTINGS_FILE2);
}
function readCurrentSettings(req) {
  const settingsPath = settingsPathFromRequest2(req);
  const text = fs5.readFileSync(settingsPath, "utf8");
  return { settingsPath, text, settings: JSON.parse(text) };
}
function cloneJson2(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function isSafePathSegment2(segment) {
  if (typeof segment !== "string" && typeof segment !== "number") return false;
  const value = String(segment);
  return value !== "__proto__" && value !== "prototype" && value !== "constructor" && value.length > 0 && value.length < 512;
}
function normalizePatchPath2(value) {
  if (!Array.isArray(value)) throw new Error("Patch path must be an array");
  if (value.length === 0) throw new Error("Patch path cannot be empty");
  if (value.length > 128) throw new Error("Patch path is too deep");
  if (!value.every(isSafePathSegment2)) throw new Error("Patch path contains unsafe segments");
  return value.map((segment) => typeof segment === "number" ? segment : String(segment));
}
function ensureContainer2(parent, key, nextKey) {
  if (parent[key] === null || typeof parent[key] !== "object" || Array.isArray(parent[key])) {
    parent[key] = typeof nextKey === "number" ? [] : {};
  }
  return parent[key];
}
function setAtPath2(target, patchPath, value) {
  let parent = target;
  for (let i = 0; i < patchPath.length - 1; i++) {
    const key = patchPath[i];
    const nextKey = patchPath[i + 1];
    parent = ensureContainer2(parent, key, nextKey);
  }
  parent[patchPath[patchPath.length - 1]] = cloneJson2(value);
}
function deleteAtPath2(target, patchPath) {
  let parent = target;
  for (let i = 0; i < patchPath.length - 1; i++) {
    const key = patchPath[i];
    if (parent === null || typeof parent !== "object" || !(key in parent)) return;
    parent = parent[key];
  }
  if (parent && typeof parent === "object") {
    delete parent[patchPath[patchPath.length - 1]];
  }
}
function applyPatch2(base, ops) {
  if (!Array.isArray(ops)) throw new Error("Patch ops must be an array");
  if (ops.length > config.settingsSaveMaxPatchOperations) {
    throw new Error(`Too many patch operations: ${ops.length}`);
  }
  const next = cloneJson2(base) || {};
  for (const op of ops) {
    const kind = String(op?.op || "").toLowerCase();
    const patchPath = normalizePatchPath2(op?.path);
    if (kind === "set") {
      setAtPath2(next, patchPath, op.value);
    } else if (kind === "delete") {
      deleteAtPath2(next, patchPath);
    } else {
      throw new Error(`Unsupported patch op: ${kind}`);
    }
  }
  return next;
}
function noteTraffic3(body, fallbackMode = "unknown") {
  const originalBytes = Math.max(0, Number(body?.originalBytes) || 0);
  const optimizedBytes = Math.max(0, Number(body?.optimizedBytes) || Buffer.byteLength(JSON.stringify(body || {}), "utf8"));
  settingsSaveStats.originalBytes += originalBytes;
  settingsSaveStats.optimizedBytes += optimizedBytes;
  settingsSaveStats.savedBytes += Math.max(0, originalBytes - optimizedBytes);
  settingsSaveStats.lastMode = body?.mode || fallbackMode;
  settingsSaveStats.lastAt = nowIso3();
}
function sendJson2(res, status, data, state) {
  settingsSaveStats.lastState = state;
  res.status(status);
  res.setHeader(HEADER_PREFIX, VERSION);
  res.setHeader(`${HEADER_PREFIX}-settings-save-state`, state);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.send(JSON.stringify(data));
}
function sendText2(res, status, bodyText, state, contentType = "application/json; charset=utf-8") {
  settingsSaveStats.lastState = state;
  res.status(status || 200);
  res.setHeader(HEADER_PREFIX, VERSION);
  res.setHeader(`${HEADER_PREFIX}-settings-save-state`, state);
  res.setHeader("content-type", contentType);
  res.send(bodyText ?? "");
}
function conflict2(res, data) {
  settingsSaveStats.conflicts++;
  return sendJson2(res, 409, { ok: false, fallback: true, ...data }, "CONFLICT");
}
async function callOriginalSettingsSave(req, nextSettings) {
  const ctx = makeRequestContext(req, { bodyOverride: nextSettings });
  return await fetchOriginal(ctx, settingsSaveEndpoint);
}
function getSettingsSaveStatus() {
  return {
    endpointKey: settingsSaveEndpoint.key,
    enabled: !!config.enabled && !!config.optimizeSettingsSave,
    patchEnabled: !!config.settingsSavePatchEnabled,
    noopEnabled: !!config.settingsSaveNoopEnabled,
    stats: { ...settingsSaveStats }
  };
}
async function handleSettingsSaveFast(req, res) {
  settingsSaveStats.requests++;
  const body = req.body || {};
  settingsSaveStats.lastMode = body?.mode || null;
  settingsSaveStats.lastAt = nowIso3();
  if (!config.enabled || !config.optimizeSettingsSave) {
    return sendJson2(res, 503, { ok: false, fallback: true, error: "settings-save optimization disabled" }, "DISABLED");
  }
  try {
    const mode = String(body.mode || "").toLowerCase();
    const { settings: currentSettings } = readCurrentSettings(req);
    const currentHash = hashSettings(currentSettings);
    if (body.hashAlgorithm && body.hashAlgorithm !== SETTINGS_HASH_ALGORITHM) {
      return sendJson2(res, 400, { ok: false, fallback: true, error: "unsupported hash algorithm" }, "BAD-HASH-ALGORITHM");
    }
    if (mode === "noop") {
      if (!config.settingsSaveNoopEnabled) {
        return sendJson2(res, 503, { ok: false, fallback: true, error: "settings-save noop optimization disabled" }, "NOOP-DISABLED");
      }
      settingsSaveStats.noops++;
      noteTraffic3(body);
      return sendJson2(res, 200, {
        ok: true,
        result: "ok",
        optimized: true,
        mode: "noop",
        state: currentHash === body.baseHash || currentHash === body.nextHash ? "NOOP" : "NOOP-STALE",
        currentHash
      }, currentHash === body.baseHash || currentHash === body.nextHash ? "NOOP" : "NOOP-STALE");
    }
    if (mode === "patch") {
      if (!config.settingsSavePatchEnabled) {
        return sendJson2(res, 503, { ok: false, fallback: true, error: "settings-save patch optimization disabled" }, "PATCH-DISABLED");
      }
      if (!body.baseHash || !body.nextHash) {
        return sendJson2(res, 400, { ok: false, fallback: true, error: "baseHash and nextHash are required" }, "BAD-PATCH");
      }
      if (currentHash !== body.baseHash) {
        return conflict2(res, { error: "base hash mismatch", currentHash, baseHash: body.baseHash });
      }
      const nextSettings = applyPatch2(currentSettings, body.ops || []);
      const appliedHash = hashSettings(nextSettings);
      if (appliedHash !== body.nextHash) {
        return sendJson2(res, 400, { ok: false, fallback: true, error: "patch hash mismatch", appliedHash, nextHash: body.nextHash }, "PATCH-HASH-MISMATCH");
      }
      const result = await callOriginalSettingsSave(req, nextSettings);
      if (result.ok) {
        settingsSaveStats.patches++;
        noteTraffic3(body);
      }
      const state = result.ok ? "PATCH" : "PATCH-ORIGINAL-ERROR";
      return sendText2(res, result.status, result.bodyText, state, result.headers?.["content-type"]);
    }
    if (mode === "full") {
      const nextSettings = body.settings;
      if (!nextSettings || typeof nextSettings !== "object" || Array.isArray(nextSettings)) {
        return sendJson2(res, 400, { ok: false, fallback: true, error: "settings object is required for full mode" }, "BAD-FULL");
      }
      if (body.nextHash && hashSettings(nextSettings) !== body.nextHash) {
        return sendJson2(res, 400, { ok: false, fallback: true, error: "full settings hash mismatch" }, "FULL-HASH-MISMATCH");
      }
      const result = await callOriginalSettingsSave(req, nextSettings);
      if (result.ok) {
        settingsSaveStats.fulls++;
        noteTraffic3(body, "full");
      }
      const state = result.ok ? "FULL" : "FULL-ORIGINAL-ERROR";
      return sendText2(res, result.status, result.bodyText, state, result.headers?.["content-type"]);
    }
    return sendJson2(res, 400, { ok: false, fallback: true, error: `unsupported mode: ${mode || "(empty)"}` }, "BAD-MODE");
  } catch (error) {
    settingsSaveStats.errors++;
    settingsSaveStats.lastError = error instanceof Error ? error.message : String(error);
    settingsSaveStats.lastAt = nowIso3();
    return sendJson2(res, 500, { ok: false, fallback: true, error: settingsSaveStats.lastError }, "ERROR");
  }
}

// server-plugins/cocktail-plus/src/endpoints/version.ts
import fs6 from "node:fs";
import path7 from "node:path";
function getGitHeadInfo(serverRoot = getServerRoot()) {
  const gitDir = path7.join(serverRoot, ".git");
  const headPath = path7.join(gitDir, "HEAD");
  const head = readTextIfExists(headPath);
  let branch = null;
  let revision = null;
  let refPath = null;
  if (head.startsWith("ref:")) {
    const ref = head.slice(4).trim();
    branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : path7.basename(ref);
    refPath = path7.join(gitDir, ...ref.split("/"));
    revision = readTextIfExists(refPath) || null;
    if (!revision) {
      const packedRefs = readTextIfExists(path7.join(gitDir, "packed-refs"));
      const line = packedRefs.split(/\r?\n/g).find((x) => x && !x.startsWith("#") && x.endsWith(` ${ref}`));
      revision = line ? line.split(" ")[0] : null;
    }
  } else if (/^[0-9a-f]{40}$/i.test(head)) {
    revision = head;
  }
  return { gitDir, headPath, head, branch, revision, refPath };
}
function getVersionSignature(ctx) {
  const serverRoot = getServerRoot();
  const git = getGitHeadInfo(serverRoot);
  const records = [safeStatRecord(path7.join(serverRoot, "package.json"), "package.json"), safeStatRecord(git.headPath, ".git/HEAD")];
  if (git.refPath) records.push(safeStatRecord(git.refPath, `.git/refs/heads/${git.branch}`));
  records.push(safeStatRecord(path7.join(git.gitDir, "packed-refs"), ".git/packed-refs"));
  records.push({ label: "head", value: git.head });
  records.push({ label: "revision", value: git.revision || "" });
  return signatureFromRecords(records);
}
function buildFastVersionObject(ctx) {
  const serverRoot = getServerRoot();
  let pkgVersion = "UNKNOWN";
  try {
    const pkg = JSON.parse(fs6.readFileSync(path7.join(serverRoot, "package.json"), "utf8"));
    pkgVersion = String(pkg.version || "UNKNOWN");
  } catch {
  }
  const git = getGitHeadInfo(serverRoot);
  const gitRevision = git.revision ? git.revision.slice(0, 9) : null;
  const gitBranch = git.branch || null;
  return {
    agent: `SillyTavern:${pkgVersion}:Cohee#1207`,
    pkgVersion,
    gitRevision,
    gitBranch,
    // Fast path deliberately avoids expensive git show. Background refresh will replace this with exact data.
    commitDate: null,
    isLatest: true
  };
}
function makeFastMiss(ctx, signature, config2) {
  if (!config2.fastVersionOnMiss) return null;
  return {
    state: "FAST-MISS",
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json; charset=utf-8" },
    bodyText: JSON.stringify(buildFastVersionObject(ctx)),
    durationMs: 0,
    transform: { fastVersion: true },
    refreshReason: "fast-version-refresh"
  };
}
var versionEndpoint = {
  key: "version",
  aliases: ["version", "/version"],
  originalPath: "/version",
  fastPath: "/fast/version",
  configKey: "cacheVersion",
  diskCacheConfigKey: "diskCacheVersion",
  method: "GET",
  getSignature: getVersionSignature,
  makeFastMiss
};

// server-plugins/cocktail-plus/src/endpoint-registry.ts
var ENDPOINT_LIST = Object.freeze([
  charactersAllEndpoint,
  versionEndpoint
]);
var MUTATION_ENDPOINT_LIST = Object.freeze([
  settingsSaveEndpoint,
  chatSaveEndpoint,
  groupChatSaveEndpoint
]);
var DIRECT_ENDPOINT_LIST = Object.freeze([
  settingsGetEndpoint
]);
var ALL_ENDPOINT_LIST = Object.freeze([...ENDPOINT_LIST, ...DIRECT_ENDPOINT_LIST, ...MUTATION_ENDPOINT_LIST]);
var ENDPOINTS = Object.freeze(Object.fromEntries(ENDPOINT_LIST.map((endpoint) => [endpoint.key, endpoint])));
function normalizeEndpointName(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  for (const def of ENDPOINT_LIST) {
    if (def.aliases.includes(raw)) return def.key;
  }
  return null;
}
function parseEndpointList(value, fallback = ["characters-all"]) {
  if (!value) return fallback;
  const arr = Array.isArray(value) ? value : [value];
  const out = [];
  for (const item of arr) {
    const key = normalizeEndpointName(item);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

// server-plugins/cocktail-plus/src/stats.ts
var stats = {
  startedAt: Date.now(),
  requests: 0,
  hits: 0,
  staleHits: 0,
  misses: 0,
  refreshes: 0,
  errors: 0,
  invalidations: 0,
  lastError: null
};
var requestSeq = 0;
function nextRequestId(endpointKey = "request") {
  requestSeq += 1;
  return `${endpointKey}-${Date.now().toString(36)}-${requestSeq}`;
}

// server-plugins/cocktail-plus/src/cache-store.ts
var memoryCache = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
function getDiskRoot() {
  return path8.join(PLUGIN_DIR, "cache");
}
function getCacheKey2(ctx, endpointKey) {
  return `${ctx.userKey}:${endpointKey}:${sha256(ctx.bodyText).slice(0, 32)}`;
}
function getDiskCachePath(ctx, endpointKey) {
  const bodyHash = sha256(ctx.bodyText).slice(0, 32);
  return path8.join(getDiskRoot(), ctx.userKey, `${endpointKey}-${bodyHash}.json`);
}
function shouldUseDiskCache(endpointKey) {
  const endpoint = ENDPOINTS[endpointKey];
  if (!endpoint?.diskCacheConfigKey) return false;
  return !!config[endpoint.diskCacheConfigKey];
}
function readDiskEntry(ctx, endpointKey) {
  if (!shouldUseDiskCache(endpointKey)) return null;
  try {
    const file = getDiskCachePath(ctx, endpointKey);
    if (!fs7.existsSync(file)) return null;
    const entry = JSON.parse(fs7.readFileSync(file, "utf8"));
    if (!entry || typeof entry.bodyText !== "string") return null;
    return entry;
  } catch {
    return null;
  }
}
function writeDiskEntry(ctx, endpointKey, entry) {
  if (!shouldUseDiskCache(endpointKey)) return;
  try {
    const file = getDiskCachePath(ctx, endpointKey);
    fs7.mkdirSync(path8.dirname(file), { recursive: true });
    fs7.writeFileSync(file, JSON.stringify(entry), "utf8");
  } catch {
  }
}
function listDiskEntriesForUser(ctx) {
  const dir = path8.join(getDiskRoot(), ctx.userKey);
  try {
    if (!fs7.existsSync(dir)) return [];
    return fs7.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => path8.join(dir, name));
  } catch {
    return [];
  }
}
function getCachedEntry(ctx, endpointKey) {
  const key = getCacheKey2(ctx, endpointKey);
  let entry = memoryCache.get(key);
  if (entry) return entry;
  entry = readDiskEntry(ctx, endpointKey);
  if (entry) memoryCache.set(key, entry);
  return entry || null;
}
function summarizeEntry(entry) {
  if (!entry) return null;
  return {
    endpointKey: entry.endpointKey,
    status: entry.status,
    bytes: typeof entry.bodyText === "string" ? Buffer.byteLength(entry.bodyText, "utf8") : 0,
    transform: entry.transform || null,
    createdAt: entry.createdAt,
    refreshedAt: entry.refreshedAt,
    ageMs: entry.refreshedAt ? Date.now() - entry.refreshedAt : null,
    durationMs: entry.durationMs,
    hitCount: entry.hitCount || 0,
    staleHitCount: entry.staleHitCount || 0,
    lastError: entry.lastError || null
  };
}
function getUserStatus(ctx) {
  const baseCtx = { ...ctx, body: {}, bodyText: "{}" };
  return Object.keys(ENDPOINTS).map((endpointKey) => ({
    endpointKey,
    entry: summarizeEntry(getCachedEntry(baseCtx, endpointKey)),
    refreshing: inflight.has(getCacheKey2(baseCtx, endpointKey))
  }));
}
function invalidateForUser(ctx, endpointKeys) {
  let removed = 0;
  for (const endpointKey of endpointKeys) {
    const prefix = `${ctx.userKey}:${endpointKey}:`;
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
        removed++;
      }
    }
  }
  for (const file of listDiskEntriesForUser(ctx)) {
    const base = path8.basename(file);
    if (endpointKeys.some((endpointKey) => base.startsWith(`${endpointKey}-`))) {
      try {
        fs7.rmSync(file, { force: true });
        removed++;
      } catch {
      }
    }
  }
  stats.invalidations++;
  return removed;
}
function clearCacheStores() {
  memoryCache.clear();
  inflight.clear();
}

// server-plugins/cocktail-plus/src/early-bridge.ts
import fs8 from "node:fs";
import path9 from "node:path";
var MARKER_START = "<!-- cocktail-plus early bridge start -->";
var MARKER_END = "<!-- cocktail-plus early bridge end -->";
var BRIDGE_SCRIPT_ID = "cocktail-plus-early-bridge";
var BRIDGE_SRC = `${API_PREFIX}/early/bridge.js`;
var INDEX_PATH = path9.join(SERVER_ROOT, "public", "index.html");
var BACKUP_DIR = path9.join(PLUGIN_DIR, "backups");
var MODULE_IMPORT_MAP_ID = "cocktail-plus-module-import-map";
var MODULE_PROXY_ENTRY_PATHS = ["/scripts/i18n.js", "/script.js"];
var MODULE_PROXY_IMPORT_PATHS = ["/script.js", "/scripts/i18n.js", "/scripts/system-messages.js", "/scripts/extensions.js", "/scripts/welcome-screen.js"];
var MODULE_SCRIPT_PROXY_EXCLUDED_PREFIXES = ["/scripts/extensions/third-party/"];
function normalizePublicModulePath(value) {
  let out = String(value || "").replace(/\\/g, "/");
  if (!out.startsWith("/")) out = `/${out}`;
  return out;
}
function collectModuleProxyImportPaths() {
  return MODULE_PROXY_IMPORT_PATHS.map(normalizePublicModulePath).filter((value, index, list) => list.indexOf(value) === index).sort((a, b) => a.localeCompare(b));
}
function getModuleProxyImportMap() {
  const imports = {};
  for (const publicPath of collectModuleProxyImportPaths()) {
    imports[publicPath] = getModuleProxySrc(publicPath);
  }
  return { imports };
}
function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
function getBridgeBlock() {
  const lines = [MARKER_START];
  if (config.moduleProxyEnabled) {
    lines.push(`<script type="importmap" id="${MODULE_IMPORT_MAP_ID}" data-cp-module-proxy-importmap="1">${escapeScriptJson(getModuleProxyImportMap())}</script>`);
  }
  lines.push(`<script id="${BRIDGE_SCRIPT_ID}" src="${BRIDGE_SRC}" data-cocktail-plus-early="1"></script>`);
  lines.push(MARKER_END);
  return lines.join("\n");
}
function getModuleProxySrc(publicPath) {
  return `${API_PREFIX}/module?path=${encodeURIComponent(publicPath)}`;
}
function stripLeadingSlash(value) {
  return String(value || "").replace(/^\//, "");
}
function normalizeHtmlScriptSrc(value) {
  let src = String(value || "").trim();
  if (!src) return "";
  try {
    if (/^https?:\/\//i.test(src)) {
      const url = new URL(src);
      src = url.pathname;
    }
  } catch (_) {
  }
  src = src.split("#")[0].split("?")[0].replace(/^\//, "");
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
  if (!fs8.existsSync(INDEX_PATH)) return "";
  return fs8.readFileSync(INDEX_PATH, "utf8");
}
function countOccurrences(text, needle) {
  if (!needle) return 0;
  return String(text || "").split(needle).length - 1;
}
function getMarkerRegex() {
  return new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`, "g");
}
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function makeBackup(html) {
  fs8.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path9.join(BACKUP_DIR, `index.html.${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.bak`);
  fs8.writeFileSync(file, html, "utf8");
  return file;
}
function rewriteIndexModuleProxyTags(html) {
  if (!config.moduleProxyEnabled) return restoreIndexModuleProxyTags(html);
  let out = restoreIndexModuleProxyTags(html);
  const targets = new Map(MODULE_PROXY_ENTRY_PATHS.map((publicPath) => [normalizeHtmlScriptSrc(publicPath), publicPath]));
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
  return String(html || "").replace(/<script\b[^>]*\bdata-cp-module-proxy-original=["']([^"']+)["'][^>]*><\/script>/gi, (tag, original) => {
    let restored = replaceScriptSrcAttribute(tag, original);
    restored = restored.replace(/\s*data-cp-module-proxy-original=["'][^"']+["']/i, "");
    return restored;
  });
}
function insertBridgeBlock(html) {
  const block = getBridgeBlock();
  const markerRegex = getMarkerRegex();
  if (markerRegex.test(html)) {
    markerRegex.lastIndex = 0;
    return { html: html.replace(markerRegex, block), mode: "replace-marker" };
  }
  const headOpen = html.match(/<head\b[^>]*>/i);
  if (headOpen && typeof headOpen.index === "number") {
    const pos = headOpen.index + headOpen[0].length;
    return { html: `${html.slice(0, pos)}
${block}
${html.slice(pos)}`, mode: "after-head-open" };
  }
  const scriptJs = html.match(/<script\b[^>]*\bsrc=["']script\.js["'][^>]*><\/script>/i);
  if (scriptJs && typeof scriptJs.index === "number") {
    return { html: `${html.slice(0, scriptJs.index)}${block}
${html.slice(scriptJs.index)}`, mode: "before-script-js" };
  }
  return { html: `${block}
${html}`, mode: "file-start" };
}
function getEarlyBridgeStatus() {
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
    backupDir: BACKUP_DIR
  };
}
function installEarlyBridge(options = {}) {
  const html = readIndexHtml();
  if (!html) return { ok: false, error: `index.html not found: ${INDEX_PATH}`, status: getEarlyBridgeStatus() };
  const beforeStatus = getEarlyBridgeStatus();
  const { html: nextHtml, mode } = insertBridgeBlock(html);
  const finalHtml = rewriteIndexModuleProxyTags(nextHtml);
  if (finalHtml === html) {
    return { ok: true, changed: false, mode: "unchanged", backup: null, status: beforeStatus };
  }
  let backup = null;
  if (!options.noBackup) backup = makeBackup(html);
  fs8.writeFileSync(INDEX_PATH, finalHtml, "utf8");
  return { ok: true, changed: true, mode, backup, status: getEarlyBridgeStatus() };
}
function uninstallEarlyBridge(options = {}) {
  const html = readIndexHtml();
  if (!html) return { ok: false, error: `index.html not found: ${INDEX_PATH}`, status: getEarlyBridgeStatus() };
  const markerRegex = getMarkerRegex();
  markerRegex.lastIndex = 0;
  if (!markerRegex.test(html)) {
    return { ok: true, changed: false, backup: null, status: getEarlyBridgeStatus() };
  }
  markerRegex.lastIndex = 0;
  const nextHtml = restoreIndexModuleProxyTags(html.replace(markerRegex, "").replace(/\n{3,}/g, "\n\n"));
  let backup = null;
  if (!options.noBackup) backup = makeBackup(html);
  fs8.writeFileSync(INDEX_PATH, nextHtml, "utf8");
  return { ok: true, changed: true, backup, status: getEarlyBridgeStatus() };
}
function makeFastRoutesLiteral() {
  return ENDPOINT_LIST.map((endpoint) => `  [${JSON.stringify(endpoint.originalPath)}, { path: PREFIX + ${JSON.stringify(endpoint.fastPath)}, method: ${JSON.stringify(endpoint.method)} }]`).join(",\n");
}
function makeTemplatePreloadList() {
  const fallback = ["help.html", "hotkeys.html", "formatting.html", "welcome.html", "welcomePrompt.html", "assistantNote.html"];
  try {
    const dir = path9.join(SERVER_ROOT, "public", "scripts", "templates");
    const names = fs8.readdirSync(dir).filter((name) => name.endsWith(".html")).sort((a, b) => a.localeCompare(b));
    const list = names.length ? names : fallback;
    return list.map((name) => `/scripts/templates/${name}`);
  } catch {
    return fallback.map((name) => `/scripts/templates/${name}`);
  }
}
function makeEarlyBridgeScript() {
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
function autoEnsureEarlyBridge() {
  if (!config.earlyBridgeEnabled || !config.autoInstallEarlyBridge) return { ok: true, skipped: true, reason: "disabled", status: getEarlyBridgeStatus() };
  try {
    return installEarlyBridge({ noBackup: false });
  } catch (error) {
    console.warn("[cocktail-plus] Failed to install early bridge:", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error), status: getEarlyBridgeStatus() };
  }
}

// server-plugins/cocktail-plus/src/fast-handler.ts
function makeEntryFromBody(ctx, endpointKey, status, statusText, headers, bodyText, signature, durationMs, transform = null) {
  const now = Date.now();
  return { endpointKey, status, statusText, headers, bodyText, createdAt: now, refreshedAt: now, signature, durationMs, transform, hitCount: 0, staleHitCount: 0, lastError: null };
}
function defaultTransformBodyForCache(bodyText) {
  return { bodyText, transformed: false, sourceBytes: Buffer.byteLength(bodyText || "", "utf8"), cachedBytes: Buffer.byteLength(bodyText || "", "utf8") };
}
async function refreshEntry(ctx, endpointKey, reason = "refresh") {
  const endpoint = ENDPOINTS[endpointKey];
  const key = getCacheKey2(ctx, endpointKey);
  if (inflight.has(key)) {
    return await inflight.get(key);
  }
  const promise = (async () => {
    stats.refreshes++;
    const signature = endpoint.getSignature(ctx);
    const result = await fetchOriginal(ctx, endpoint);
    if (result.ok && result.status >= 200 && result.status < 300) {
      const now = Date.now();
      const transformed = endpoint.transformBodyForCache ? endpoint.transformBodyForCache(ctx, result.bodyText, config) : defaultTransformBodyForCache(result.bodyText);
      const entry = {
        endpointKey,
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        bodyText: transformed.bodyText,
        createdAt: now,
        refreshedAt: now,
        signature,
        durationMs: result.durationMs,
        transform: {
          transformed: transformed.transformed,
          sourceBytes: transformed.sourceBytes,
          cachedBytes: transformed.cachedBytes,
          count: transformed.count,
          error: transformed.error
        },
        hitCount: 0,
        staleHitCount: 0,
        lastError: null
      };
      memoryCache.set(key, entry);
      writeDiskEntry(ctx, endpointKey, entry);
      return { result, entry, cached: true };
    }
    return { result, entry: null, cached: false };
  })().catch((error) => {
    stats.errors++;
    stats.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return await promise;
}
function getFreshCacheState(ctx, endpointKey) {
  const endpoint = ENDPOINTS[endpointKey];
  const signatureStartedAt = Date.now();
  const signature = endpoint.getSignature(ctx);
  const signatureMs = Date.now() - signatureStartedAt;
  const entry = getCachedEntry(ctx, endpointKey);
  if (!entry) return { entry: null, fresh: false, signature, signatureMs, reason: "missing" };
  const ageMs = Date.now() - Number(entry.refreshedAt || entry.createdAt || 0);
  const signatureMatches = entry.signature === signature;
  const withinMaxStale = config.maxStaleMs <= 0 || ageMs <= config.maxStaleMs;
  return { entry, fresh: signatureMatches && withinMaxStale, signature, signatureMs, ageMs, signatureMatches, withinMaxStale, reason: signatureMatches ? withinMaxStale ? "fresh" : "expired" : "signature-changed" };
}
async function warmEntry(ctx, endpointKey, reason = "warm", force = false) {
  if (!force) {
    const state = getFreshCacheState(ctx, endpointKey);
    if (state.fresh && state.entry) {
      return { result: { ok: true, status: state.entry.status, statusText: state.entry.statusText, durationMs: 0 }, entry: state.entry, cached: true, skipped: true };
    }
  }
  return await refreshEntry(ctx, endpointKey, reason);
}
function setCacheHeaders(res, state, entry = null) {
  res.setHeader(HEADER_PREFIX, VERSION);
  res.setHeader(`${HEADER_PREFIX}-state`, state);
  res.setHeader("x-cocktail-cache", state);
  if (entry?.refreshedAt) res.setHeader(`${HEADER_PREFIX}-age-ms`, String(Math.max(0, Date.now() - entry.refreshedAt)));
}
function setExtraHeaders(res, extraHeaders = null) {
  if (!extraHeaders) return;
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (value !== void 0 && value !== null) res.setHeader(key, String(value));
  }
}
function sendEntry(res, entry, state, extraHeaders = null) {
  setCacheHeaders(res, state, entry);
  setExtraHeaders(res, extraHeaders);
  res.status(entry.status || 200);
  res.setHeader("content-type", entry.headers?.["content-type"] || "application/json; charset=utf-8");
  res.send(entry.bodyText);
}
function sendFetchResult(res, result, state, entry = null, extraHeaders = null) {
  setCacheHeaders(res, state, entry);
  setExtraHeaders(res, extraHeaders);
  res.status(result.status || 200);
  res.setHeader("content-type", result.headers?.["content-type"] || "application/json; charset=utf-8");
  res.send(result.bodyText ?? "");
}
async function handleFast(req, res, endpointKey) {
  stats.requests++;
  const endpoint = ENDPOINTS[endpointKey];
  const ctx = makeRequestContext(req);
  ctx.requestId = nextRequestId(endpointKey);
  if (!config.enabled || !config[endpoint.configKey]) {
    const result = await fetchOriginal(ctx, endpoint);
    return sendFetchResult(res, result, "BYPASS");
  }
  const signature = endpoint.getSignature(ctx);
  const entry = getCachedEntry(ctx, endpointKey);
  const now = Date.now();
  const cacheKey = getCacheKey2(ctx, endpointKey);
  if (entry) {
    const ageMs = now - Number(entry.refreshedAt || entry.createdAt || 0);
    const signatureMatches = entry.signature === signature;
    const withinMaxStale = config.maxStaleMs <= 0 || ageMs <= config.maxStaleMs;
    if (signatureMatches && withinMaxStale) {
      stats.hits++;
      entry.hitCount = Number(entry.hitCount || 0) + 1;
      memoryCache.set(cacheKey, entry);
      return sendEntry(res, entry, "HIT");
    }
    if (config.staleWhileRevalidate) {
      stats.staleHits++;
      entry.staleHitCount = Number(entry.staleHitCount || 0) + 1;
      memoryCache.set(cacheKey, entry);
      const state = signatureMatches ? "STALE" : "STALE-SIGNATURE";
      void refreshEntry(ctx, endpointKey, signatureMatches ? "max-stale-expired" : "signature-changed").catch(() => {
      });
      return sendEntry(res, entry, state);
    }
  }
  const fastMiss = endpoint.makeFastMiss?.(ctx, signature, config);
  if (fastMiss) {
    stats.misses++;
    const fastEntry = makeEntryFromBody(
      ctx,
      endpointKey,
      fastMiss.status,
      fastMiss.statusText,
      fastMiss.headers,
      fastMiss.bodyText,
      signature,
      fastMiss.durationMs || 0,
      fastMiss.transform || null
    );
    memoryCache.set(cacheKey, fastEntry);
    writeDiskEntry(ctx, endpointKey, fastEntry);
    if (fastMiss.refreshReason) void refreshEntry(ctx, endpointKey, fastMiss.refreshReason).catch(() => {
    });
    return sendEntry(res, fastEntry, fastMiss.state, fastMiss.extraResponseHeaders);
  }
  const asyncMiss = endpoint.makeAsyncMiss?.(ctx, signature, config);
  if (asyncMiss) {
    stats.misses++;
    if (asyncMiss.refreshReason) void refreshEntry(ctx, endpointKey, asyncMiss.refreshReason).catch(() => {
    });
    return sendFetchResult(res, asyncMiss, asyncMiss.state, null, asyncMiss.extraResponseHeaders);
  }
  stats.misses++;
  try {
    const { result, entry: refreshedEntry } = await refreshEntry(ctx, endpointKey, entry ? "blocking-refresh" : "miss");
    if (refreshedEntry) {
      return sendEntry(res, refreshedEntry, entry ? "REFRESH" : "MISS");
    }
    return sendFetchResult(res, result, entry ? "REFRESH" : "MISS");
  } catch (error) {
    if (entry) {
      entry.lastError = error instanceof Error ? error.message : String(error);
      return sendEntry(res, entry, "STALE-ERROR");
    }
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error), plugin: info });
  }
}

// server-plugins/cocktail-plus/src/service-worker.ts
import fs9 from "node:fs";
import path10 from "node:path";
function makeFastRoutesLiteral2() {
  return ENDPOINT_LIST.map((endpoint) => `  [${JSON.stringify(endpoint.originalPath)}, { path: PREFIX + ${JSON.stringify(endpoint.fastPath)}, method: ${JSON.stringify(endpoint.method)} }]`).join(",\n");
}
function makeTemplatePreloadList2() {
  const fallback = ["help.html", "hotkeys.html", "formatting.html", "welcome.html", "welcomePrompt.html", "assistantNote.html"];
  try {
    const dir = path10.join(SERVER_ROOT, "public", "scripts", "templates");
    const names = fs9.readdirSync(dir).filter((name) => name.endsWith(".html")).sort((a, b) => a.localeCompare(b));
    const list = names.length ? names : fallback;
    return list.map((name) => `/scripts/templates/${name}`);
  } catch {
    return fallback.map((name) => `/scripts/templates/${name}`);
  }
}
function makeServiceWorkerScript() {
  const fastRoutes = makeFastRoutesLiteral2();
  const templatePreloadList = makeTemplatePreloadList2();
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
      event.waitUntil(notifyInvalidate(request, endpoints, pathname));
    }
  }
});
`;
}

// server-plugins/cocktail-plus/src/module-proxy.ts
import crypto2 from "node:crypto";
import fs10 from "node:fs";
import path11 from "node:path";
var PUBLIC_ROOT = path11.join(SERVER_ROOT, "public");
var TARGET_PROXY_MODULE_PATHS = /* @__PURE__ */ new Set(["/script.js", "/scripts/i18n.js", "/scripts/system-messages.js", "/scripts/extensions.js", "/scripts/welcome-screen.js"]);
function normalizePublicPath(value) {
  let raw = String(value || "").split("?")[0].split("#")[0];
  if (!raw.startsWith("/")) raw = `/${raw}`;
  raw = decodeURIComponent(raw);
  if (!raw.endsWith(".js")) throw new Error("Only JavaScript modules can be proxied");
  if (raw.includes("\0")) throw new Error("Invalid module path");
  const fullPath = path11.resolve(PUBLIC_ROOT, `.${raw}`);
  if (!fullPath.startsWith(PUBLIC_ROOT + path11.sep) && fullPath !== PUBLIC_ROOT) {
    throw new Error("Module path escapes public root");
  }
  return { publicPath: raw.replace(/\\/g, "/"), fullPath };
}
function isProxyableModulePath(normalized) {
  return TARGET_PROXY_MODULE_PATHS.has(normalized);
}
function toProxySpecifier(currentPublicPath, specifier) {
  if (!specifier || typeof specifier !== "string") return specifier;
  if (/^(?:[a-zA-Z][a-zA-Z\d+.-]*:|#)/.test(specifier)) return specifier;
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return specifier;
  const [withoutHash, hash = ""] = specifier.split("#");
  const [withoutQuery, query = ""] = withoutHash.split("?");
  const baseDir = path11.posix.dirname(currentPublicPath);
  const resolved = specifier.startsWith("/") ? path11.posix.normalize(withoutQuery) : path11.posix.normalize(path11.posix.join(baseDir, withoutQuery));
  const normalized = resolved.startsWith("/") ? resolved : `/${resolved}`;
  const suffix = `${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (normalized === "/lib.js" || normalized.startsWith("/lib/")) {
    return `${normalized}${suffix}`;
  }
  if (isProxyableModulePath(normalized)) {
    return `/api/plugins/cocktail-plus/module?path=${encodeURIComponent(normalized)}${suffix}`;
  }
  return `${normalized}${suffix}`;
}
function rewriteModuleSpecifiers(source, currentPublicPath) {
  const rewrite = (specifier) => toProxySpecifier(currentPublicPath, specifier);
  let out = source;
  out = out.replace(/(import\s+(?:[^'";]*?\s+from\s*)?)(['"])([^'"]+)(\2)/g, (match, prefix, quote, spec, suffix) => {
    return `${prefix}${quote}${rewrite(spec)}${suffix}`;
  });
  out = out.replace(/(export\s+[^'";]*?\s+from\s*)(['"])([^'"]+)(\2)/g, (match, prefix, quote, spec, suffix) => {
    return `${prefix}${quote}${rewrite(spec)}${suffix}`;
  });
  out = out.replace(/(import\s*\(\s*)(['"])([^'"]+)(\2\s*\))/g, (match, prefix, quote, spec, suffix) => {
    return `${prefix}${quote}${rewrite(spec)}${suffix}`;
  });
  return out;
}
function patchScriptJs(source) {
  const bootstrapRegex = /([ \t]*)await\s+getClientVersion\(\);\s*\r?\n\1await\s+initSecrets\(\);\s*\r?\n\1await\s+readSecretState\(\);\s*\r?\n\1await\s+initLocales\(\);/;
  const systemMessagesSettingsRegex = /([ \t]*)await\s+initPresetManager\(\)\s*;?\s*\r?\n\1await\s+initSystemMessages\(\)\s*;?\s*\r?\n\1await\s+getSettings\(([^)]*)\)\s*;?/;
  const coreDataRegex = /([ \t]*)await\s+getUserAvatars\(true,\s*user_avatar\);\s*\r?\n\1await\s+getCharacters\(\);\s*\r?\n\1await\s+getBackgrounds\(\);\s*\r?\n\1await\s+initTokenizers\(\);/;
  const loaderViewportRegex = /([ \t]*)await\s+((?:hideLoader|initLoaderHandle\.hide)\(\))\s*;?\s*\r?\n\1await\s+fixViewport\(\)\s*;?\s*\r?\n\1await\s+eventSource\.emit\(event_types\.APP_READY\)\s*;?/;
  const postFirstPaintRegex = /([ \t]*)initServerHistory\(\);\s*\r?\n\1initSettingsSearch\(\);\s*\r?\n\1initBulkEdit\(\);\s*\r?\n\1initReasoning\(\);\s*\r?\n\1initWelcomeScreen\(\);\s*\r?\n\1await\s+initScrapers\(\);\s*\r?\n\1initCustomSelectedSamplers\(\);\s*\r?\n\1initDataMaid\(\);\s*\r?\n\1initItemizedPrompts\(\);\s*\r?\n\1initAccessibility\(\);\s*\r?\n(?:\1initSwipePicker\(\);\s*\r?\n)?\1addDebugFunctions\(\);\s*\r?\n\1doDailyExtensionUpdatesCheck\(\);/;
  const fixViewportFunctionRegex = /(async\s+function\s+fixViewport\s*\(\s*\)\s*\{\s*\r?\n[ \t]*document\.body\.style\.position\s*=\s*['"]absolute['"]\s*;\s*\r?\n[ \t]*await\s+delay\(1\)\s*;\s*\r?\n[ \t]*document\.body\.style\.position\s*=\s*['"]['"]\s*;\s*\r?\n\})/;
  const readyCallbackStartRegex = /(jQuery\s*\(\s*async\s+function\s*\(\s*\)\s*\{\s*\r?\n)/;
  const readyFirstLoadCallRegex = /([ \t]*)\/\/ Added here to prevent execution before script\.js is loaded and get rid of quirky timeouts\s*\r?\n\1await\s+firstLoadInit\(\)\s*;?/;
  const patchFlags = {
    patchStartupInit: !!config.patchStartupInit,
    bootstrapParallel: bootstrapRegex.test(source),
    systemMessagesSettingsParallel: systemMessagesSettingsRegex.test(source),
    coreDataParallel: coreDataRegex.test(source),
    loaderViewportParallel: loaderViewportRegex.test(source),
    postFirstPaintDeferred: postFirstPaintRegex.test(source),
    fixViewportFunction: fixViewportFunctionRegex.test(source),
    readyCallbackStart: readyCallbackStartRegex.test(source),
    readyFirstLoadCall: readyFirstLoadCallRegex.test(source)
  };
  let out = source;
  if (config.patchStartupInit) out = out.replace(bootstrapRegex, (_match, indent) => [
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-version-secrets-locales');`,
    `${indent}const clientVersionPromise = getClientVersion();`,
    `${indent}await initSecrets();`,
    `${indent}const secretStatePromise = readSecretState();`,
    `${indent}const localesPromise = initLocales();`,
    `${indent}await Promise.all([clientVersionPromise, secretStatePromise, localesPromise]);`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-version-secrets-locales');`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.startExtensionPrefetch?.('after-initLocales');`
  ].join("\n"));
  if (config.patchStartupInit) out = out.replace(systemMessagesSettingsRegex, (_match, indent, getSettingsArgs) => [
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-initPresetManager');`,
    `${indent}await initPresetManager();`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-initPresetManager');`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-systemMessages-settings-parallel');`,
    `${indent}const systemMessagesPromise = initSystemMessages().finally(() => globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-initSystemMessages'));`,
    `${indent}const settingsPromise = getSettings(${getSettingsArgs || ""}).finally(() => globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-getSettings'));`,
    `${indent}await Promise.all([systemMessagesPromise, settingsPromise]);`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-systemMessages-settings-parallel');`
  ].join("\n"));
  if (config.patchStartupInit) out = out.replace(coreDataRegex, (_match, indent) => [
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-core-data-parallel');`,
    `${indent}const userAvatarsPromise = getUserAvatars(true, user_avatar);`,
    `${indent}const charactersPromise = getCharacters();`,
    `${indent}const backgroundsPromise = getBackgrounds();`,
    `${indent}const tokenizersPromise = initTokenizers();`,
    `${indent}await Promise.all([userAvatarsPromise, charactersPromise, backgroundsPromise, tokenizersPromise]);`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-core-data-parallel');`
  ].join("\n"));
  if (config.patchStartupInit) out = out.replace(loaderViewportRegex, (_match, indent, hideCall) => [
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-loader-viewport-parallel');`,
    `${indent}const loaderHidePromise = ${hideCall};`,
    `${indent}await fixViewport();`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-app-ready');`,
    `${indent}const appReadyPromise = eventSource.emit(event_types.APP_READY);`,
    `${indent}await Promise.all([loaderHidePromise, appReadyPromise]);`,
    `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-loader-app-ready-parallel');`
  ].join("\n"));
  if (config.patchStartupInit) out = out.replace(postFirstPaintRegex, (_match, indent) => [
    `${indent}initServerHistory();`,
    `${indent}initWelcomeScreen();`,
    `${indent}const cpRunPostFirstPaintInit = async () => {`,
    `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.post-first-paint-init-start');`,
    `${indent}    try {`,
    `${indent}        initSettingsSearch();`,
    `${indent}        initBulkEdit();`,
    `${indent}        initReasoning();`,
    `${indent}        await initScrapers();`,
    `${indent}        initCustomSelectedSamplers();`,
    `${indent}        initDataMaid();`,
    `${indent}        initItemizedPrompts();`,
    `${indent}        initAccessibility();`,
    `${indent}        if (typeof initSwipePicker === 'function') initSwipePicker();`,
    `${indent}        addDebugFunctions();`,
    `${indent}        doDailyExtensionUpdatesCheck();`,
    `${indent}    } finally {`,
    `${indent}        globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.post-first-paint-init-end');`,
    `${indent}    }`,
    `${indent}};`,
    `${indent}(globalThis.requestIdleCallback || function (cb) { return setTimeout(cb, 1); })(() => { void cpRunPostFirstPaintInit(); });`
  ].join("\n"));
  if (config.patchStartupInit && fixViewportFunctionRegex.test(out) && readyFirstLoadCallRegex.test(out)) {
    out = out.replace(fixViewportFunctionRegex, (match) => `${match}

const cpFirstLoadInitPromise = (async () => {
    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('module.firstLoadInit-start');
    try {
        await firstLoadInit();
    } finally {
        globalThis.__cocktailPlusEarlyBridge?.markStartup?.('module.firstLoadInit-end');
    }
})();`);
  }
  if (config.patchStartupInit && readyCallbackStartRegex.test(out)) {
    out = out.replace(readyCallbackStartRegex, (match) => `${match}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('ready-callback.enter');
`);
  }
  if (config.patchStartupInit && out.includes("const cpFirstLoadInitPromise") && readyFirstLoadCallRegex.test(out)) {
    out = out.replace(readyFirstLoadCallRegex, (_match, indent) => [
      `${indent}// First load starts during module evaluation; wait here only to preserve following beforeunload setup order.`,
      `${indent}await cpFirstLoadInitPromise;`
    ].join("\n"));
  }
  patchFlags.bootstrapApplied = out.includes("firstLoadInit.before-version-secrets-locales");
  patchFlags.systemMessagesSettingsApplied = out.includes("firstLoadInit.before-systemMessages-settings-parallel");
  patchFlags.coreDataApplied = out.includes("firstLoadInit.before-core-data-parallel");
  patchFlags.loaderViewportApplied = out.includes("firstLoadInit.before-loader-viewport-parallel");
  patchFlags.postFirstPaintDeferredApplied = out.includes("firstLoadInit.post-first-paint-init-start");
  patchFlags.readyFirstLoadStartedEarlyApplied = out.includes("module.firstLoadInit-start");
  const firstLoadRegex = /(async\s+function\s+firstLoadInit\s*\(\s*\)\s*\{\r?\n)/;
  patchFlags.firstLoadDiagnosticInserted = config.patchStartupInit && firstLoadRegex.test(out);
  const diagnostic = JSON.stringify({ version: VERSION, ...patchFlags });
  if (patchFlags.firstLoadDiagnosticInserted) {
    out = out.replace(firstLoadRegex, `$1    console.info('[cp:module-proxy] firstLoadInit patches active', ${diagnostic});
    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.enter', ${diagnostic});
`);
  }
  out += `
try { console.info('[cp:module-proxy] loaded /script.js', ${diagnostic}); } catch (_) {}
`;
  return out;
}
function patchI18nJs(source) {
  if (!config.patchI18nInit) return source;
  return source.replace(
    `export async function initLocales() {
    langs = await fetch('/locales/lang.json').then(response => response.json());
    localeData = await getLocaleData(localeFile);`,
    `export async function initLocales() {
    const localePromise = fetch(\`./locales/\${localeFile}.json\`)
        .then(response => {
            console.log(\`Loading locale data from ./locales/\${localeFile}.json\`);
            if (!response.ok) return {};
            return response.json();
        })
        .catch(() => ({}));
    const langsPromise = fetch('/locales/lang.json').then(response => response.json());
    langs = await langsPromise;
    localeData = findLang(localeFile) ? await localePromise : {};`
  );
}
function patchSystemMessagesJs(source) {
  if (!config.patchSystemMessagesInit) return source;
  if (source.includes("const [help, hotkeys, formatting, welcome, welcomePrompt, assistantNote]")) return source;
  const markerRegex = /(\s*\/\*\* @type \{Record<string, ChatMessage>\} \*\/\r?\n\s*const result = \{)/;
  const preload = `
    const [help, hotkeys, formatting, welcome, welcomePrompt, assistantNote] = await Promise.all([
        renderTemplateAsync('help'),
        renderTemplateAsync('hotkeys'),
        renderTemplateAsync('formatting'),
        renderTemplateAsync('welcome', { displayVersion }),
        renderTemplateAsync('welcomePrompt'),
        renderTemplateAsync('assistantNote'),
    ]);
`;
  let inserted = false;
  let out = source.replace(markerRegex, (match) => {
    inserted = true;
    return `${preload}${match}`;
  });
  if (!inserted) {
    console.warn("[cocktail-plus] system-messages patch skipped: marker not found");
    return source;
  }
  out = out.replace(`mes: await renderTemplateAsync('help'),`, `mes: help,`).replace(`mes: await renderTemplateAsync('hotkeys'),`, `mes: hotkeys,`).replace(`mes: await renderTemplateAsync('formatting'),`, `mes: formatting,`).replace(`mes: await renderTemplateAsync('welcome', { displayVersion }),`, `mes: welcome,`).replace(`mes: await renderTemplateAsync('welcomePrompt'),`, `mes: welcomePrompt,`).replace(`mes: await renderTemplateAsync('assistantNote'),`, `mes: assistantNote,`);
  return out;
}
function patchExtensionsJs(source) {
  let out = source;
  if (config.patchExtensionManifests) {
    out = out.replace(
      `            fetch(\`/scripts/extensions/\${name}/manifest.json\`).then(async response => {
                if (response.ok) {
                    const json = await response.json();`,
      `            (globalThis.__cocktailPlusEarlyBridge?.getExtensionManifest?.(name)?.then(json => json ?? fetch(\`/scripts/extensions/\${name}/manifest.json\`).then(r => r.ok ? r.json() : Promise.reject())) ?? fetch(\`/scripts/extensions/\${name}/manifest.json\`).then(r => r.ok ? r.json() : Promise.reject())).then(async json => {
                if (json) {`
    );
  }
  if (config.patchExtensionManifests) {
    out = out.replace(
      `    const extensions = await discoverExtensions();
    extensionNames = extensions.map(x => x.name);
    extensionTypes = Object.fromEntries(extensions.map(x => [x.name, x.type]));
    manifests = await getManifests(extensionNames);`,
      `    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.before-discover');
    const extensions = await discoverExtensions();
    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.after-discover', { count: extensions.length });
    extensionNames = extensions.map(x => x.name);
    extensionTypes = Object.fromEntries(extensions.map(x => [x.name, x.type]));
    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.before-getManifests', { count: extensionNames.length });
    manifests = await getManifests(extensionNames);
    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.after-getManifests', { count: Object.keys(manifests || {}).length });`
    );
  }
  if (config.patchParallelActivateExtensions) {
    out = out.replace(
      /([ \t]*)await\s+activateExtensions\(\)\s*;?\s*\r?\n\1if\s*\(extension_settings\.autoConnect\s*&&\s*extension_settings\.apiUrl\)\s*\{\s*\r?\n\1[ \t]*connectToApi\(extension_settings\.apiUrl\);\s*\r?\n\1\}/,
      (_match, indent) => [
        `${indent}const cpActivateExtensionsAfterFirstPaint = async () => {`,
        `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('extensions.activate.deferred-start');`,
        `${indent}    try {`,
        `${indent}        await activateExtensions();`,
        `${indent}        if (extension_settings.autoConnect && extension_settings.apiUrl) {`,
        `${indent}            connectToApi(extension_settings.apiUrl);`,
        `${indent}        }`,
        `${indent}    } finally {`,
        `${indent}        globalThis.__cocktailPlusEarlyBridge?.markStartup?.('extensions.activate.deferred-end');`,
        `${indent}    }`,
        `${indent}};`,
        `${indent}const cpScheduleExtensionActivation = () => {`,
        `${indent}    const run = () => setTimeout(() => {`,
        `${indent}        void cpActivateExtensionsAfterFirstPaint().catch(error => console.error('[cocktail-plus] deferred extension activation failed', error));`,
        `${indent}    }, 0);`,
        `${indent}    try {`,
        `${indent}        eventSource.once(event_types.APP_READY, run);`,
        `${indent}    } catch (_) {`,
        `${indent}        run();`,
        `${indent}    }`,
        `${indent}};`,
        `${indent}cpScheduleExtensionActivation();`
      ].join("\n")
    );
  }
  if (config.patchParallelActivateExtensions) {
    out = out.replace(
      `                const promise = addExtensionLocale(name, manifest).finally(() =>
                    Promise.all([addExtensionScript(name, manifest), addExtensionStyle(name, manifest)]),
                );
                await promise
                    .then(() => activeExtensions.add(name))
                    .catch(err => {
                        console.log('Could not activate extension', name, err);
                        extensionLoadErrors.add(t\`Extension "\${displayName}" failed to load: \${err}\`);
                    });
                promises.push(promise);`,
      `                const promise = addExtensionLocale(name, manifest).finally(() =>
                    Promise.all([addExtensionScript(name, manifest), addExtensionStyle(name, manifest)]),
                )
                    .then(() => activeExtensions.add(name))
                    .catch(err => {
                        console.log('Could not activate extension', name, err);
                        extensionLoadErrors.add(t\`Extension "\${displayName}" failed to load: \${err}\`);
                    });
                promises.push(promise);`
    );
  }
  return out;
}
function patchWelcomeScreenJs(source) {
  let out = source;
  out = out.replace(
    /([ \t]*)const\s+recentChats\s*=\s*await\s+getRecentChats\(\)\s*;\s*\r?\n\1const\s+chatAfterFetch\s*=\s*getCurrentChatId\(\)\s*;\s*\r?\n\1if\s*\(chatAfterFetch\s*!==\s*currentChatId\)\s*\{\s*\r?\n\1[ \t]*console\.debug\('Chat changed while fetching recent chats\.'\);\s*\r?\n\1[ \t]*return;\s*\r?\n\1\}\s*\r?\n\s*\r?\n\1if\s*\(chatAfterFetch\s*===\s*undefined\s*&&\s*force\)\s*\{\s*\r?\n\1[ \t]*console\.debug\('Forcing welcome screen open\.'\);\s*\r?\n\1[ \t]*chat\.splice\(0,\s*chat\.length\);\s*\r?\n\1[ \t]*\$\('#chat'\)\.empty\(\);\s*\r?\n\1\}\s*\r?\n\s*\r?\n\1await\s+sendWelcomePanel\(recentChats,\s*expand\)\s*;\s*\r?\n\1await\s+unshallowPermanentAssistant\(\)\s*;\s*\r?\n\1sendAssistantMessage\(\)\s*;\s*\r?\n\1sendWelcomePrompt\(\)\s*;/,
    (_match, indent) => [
      `${indent}const recentChatsPromise = getRecentChats();`,
      `${indent}if (currentChatId === undefined && force) {`,
      `${indent}    console.debug('Forcing welcome screen open.');`,
      `${indent}    chat.splice(0, chat.length);`,
      `${indent}    $('#chat').empty();`,
      `${indent}}`,
      `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.skeleton-before');`,
      `${indent}await sendWelcomePanel([], expand);`,
      `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.skeleton-after');`,
      `${indent}void recentChatsPromise.then(async (recentChats) => {`,
      `${indent}    const chatAfterFetch = getCurrentChatId();`,
      `${indent}    if (chatAfterFetch !== currentChatId) {`,
      `${indent}        console.debug('Chat changed while fetching recent chats.');`,
      `${indent}        return;`,
      `${indent}    }`,
      `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.recent-before');`,
      `${indent}    await sendWelcomePanel(recentChats, expand);`,
      `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.recent-after');`,
      `${indent}}).catch(error => console.error('Welcome recent chats error:', error));`,
      `${indent}void (async () => {`,
      `${indent}    await unshallowPermanentAssistant();`,
      `${indent}    sendAssistantMessage();`,
      `${indent}    sendWelcomePrompt();`,
      `${indent}})().catch(error => console.error('Welcome assistant error:', error));`
    ].join("\n")
  );
  out = out.replace(
    /([ \t]*)chatElement\.append\(fragment\.firstChild\);/,
    (_match, indent) => [
      `${indent}const nextWelcomePanel = fragment.firstChild;`,
      `${indent}const existingWelcomePanel = chatElement.querySelector('.welcomePanel');`,
      `${indent}if (existingWelcomePanel) existingWelcomePanel.replaceWith(nextWelcomePanel);`,
      `${indent}else chatElement.append(nextWelcomePanel);`
    ].join("\n")
  );
  return out;
}
function applyTargetedPatches(source, publicPath) {
  switch (publicPath) {
    case "/script.js":
      return patchScriptJs(source);
    case "/scripts/i18n.js":
      return patchI18nJs(source);
    case "/scripts/system-messages.js":
      return patchSystemMessagesJs(source);
    case "/scripts/extensions.js":
      return patchExtensionsJs(source);
    case "/scripts/welcome-screen.js":
      return patchWelcomeScreenJs(source);
    default:
      return source;
  }
}
function makeEtag(source) {
  return `"cp-module-${VERSION}-${crypto2.createHash("sha256").update(source).digest("base64url")}"`;
}
async function handleModuleProxy(req, res) {
  try {
    const { publicPath, fullPath } = normalizePublicPath(req.query?.path || req.path || "");
    let source = await fs10.promises.readFile(fullPath, "utf8");
    source = applyTargetedPatches(source, publicPath);
    source = rewriteModuleSpecifiers(source, publicPath);
    source += `
//# sourceURL=${publicPath}
`;
    const etag = makeEtag(source);
    res.setHeader(HEADER_PREFIX, VERSION);
    res.setHeader(`${HEADER_PREFIX}-module-proxy`, publicPath);
    res.setHeader("etag", etag);
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.setHeader("cache-control", "no-cache");
    if (req.headers?.["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.send(source);
  } catch (error) {
    res.status(404).type("text/plain").send(error instanceof Error ? error.message : String(error));
  }
}

// server-plugins/cocktail-plus/src/self-install.ts
import fs11 from "node:fs";
import path12 from "node:path";
function safeStat(filePath) {
  try {
    return fs11.statSync(filePath);
  } catch {
    return null;
  }
}
function isDirectoryWithIndex(filePath) {
  const stat = safeStat(filePath);
  return !!stat?.isDirectory?.() && fs11.existsSync(path12.join(filePath, "index.mjs"));
}
function samePath(a, b) {
  try {
    return path12.resolve(a) === path12.resolve(b);
  } catch {
    return String(a) === String(b);
  }
}
function uniquePush(list, value) {
  if (!value) return;
  const full = path12.resolve(value);
  if (!list.some((item) => samePath(item, full))) list.push(full);
}
function getCandidateFrontendBackendPaths() {
  const candidates = [];
  uniquePush(candidates, path12.join(SERVER_ROOT, "public", "scripts", "extensions", "third-party", PLUGIN_ID, "server-plugins", PLUGIN_ID));
  const dataRoot = getDataRoot();
  uniquePush(candidates, path12.join(dataRoot, "default-user", "extensions", PLUGIN_ID, "server-plugins", PLUGIN_ID));
  try {
    if (fs11.existsSync(dataRoot) && fs11.statSync(dataRoot).isDirectory()) {
      for (const entry of fs11.readdirSync(dataRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        uniquePush(candidates, path12.join(dataRoot, entry.name, "extensions", PLUGIN_ID, "server-plugins", PLUGIN_ID));
      }
    }
  } catch {
  }
  return candidates;
}
function getSelfInstallStatus() {
  const candidates = getCandidateFrontendBackendPaths();
  const sourcePath = candidates.find(isDirectoryWithIndex) || null;
  return {
    ok: true,
    pluginDir: PLUGIN_DIR,
    serverRoot: SERVER_ROOT,
    dataRoot: getDataRoot(),
    sourcePath,
    candidates: candidates.map((candidate) => ({
      path: candidate,
      exists: !!safeStat(candidate),
      usable: isDirectoryWithIndex(candidate)
    }))
  };
}
function copyRecursive(source, target) {
  fs11.cpSync(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
    dereference: false,
    filter: (src) => {
      const base = path12.basename(src);
      if (base === "node_modules" || base === ".git" || base === ".deploy-backups") return false;
      return true;
    }
  });
}
function preserveExistingRuntimeFiles(targetDir, tempDir) {
  const preserveItems = ["config.json", "cache"];
  for (const item of preserveItems) {
    const src = path12.join(targetDir, item);
    if (!fs11.existsSync(src)) continue;
    const dst = path12.join(tempDir, item);
    try {
      fs11.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
    } catch {
    }
  }
}
function installBackendFromFrontend(options = {}) {
  const noBackup = !!options.noBackup;
  const status = getSelfInstallStatus();
  const sourcePath = status.sourcePath;
  if (!sourcePath) {
    return { ok: false, error: "Frontend bundled backend plugin not found.", status };
  }
  if (samePath(sourcePath, PLUGIN_DIR)) {
    return { ok: true, changed: false, reason: "source-is-current-plugin-dir", sourcePath, targetPath: PLUGIN_DIR, status };
  }
  const pluginsRoot = path12.dirname(PLUGIN_DIR);
  fs11.mkdirSync(pluginsRoot, { recursive: true });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const tempDir = path12.join(pluginsRoot, `.${PLUGIN_ID}-update-tmp-${stamp}`);
  const backupRoot = path12.join(pluginsRoot, ".cocktail-plus-backups");
  const backupDir = path12.join(backupRoot, `${PLUGIN_ID}-${stamp}`);
  try {
    if (fs11.existsSync(tempDir)) fs11.rmSync(tempDir, { recursive: true, force: true });
    copyRecursive(sourcePath, tempDir);
    preserveExistingRuntimeFiles(PLUGIN_DIR, tempDir);
    let backup = null;
    if (fs11.existsSync(PLUGIN_DIR)) {
      if (noBackup) {
        fs11.rmSync(PLUGIN_DIR, { recursive: true, force: true });
      } else {
        fs11.mkdirSync(backupRoot, { recursive: true });
        fs11.renameSync(PLUGIN_DIR, backupDir);
        backup = backupDir;
      }
    }
    fs11.renameSync(tempDir, PLUGIN_DIR);
    return {
      ok: true,
      changed: true,
      sourcePath,
      targetPath: PLUGIN_DIR,
      backup,
      restartRequired: true,
      status: getSelfInstallStatus()
    };
  } catch (error) {
    try {
      if (fs11.existsSync(tempDir)) fs11.rmSync(tempDir, { recursive: true, force: true });
    } catch {
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error), sourcePath, targetPath: PLUGIN_DIR, status };
  }
}

// server-plugins/cocktail-plus/src/routes.ts
function sendJson3(res, data) {
  res.setHeader(HEADER_PREFIX, VERSION);
  res.json(data);
}
function registerFastRoutes(router) {
  for (const endpoint of ENDPOINT_LIST) {
    const method = String(endpoint.method || "POST").toLowerCase();
    const register = router[method]?.bind(router);
    if (!register) throw new Error(`Unsupported route method: ${endpoint.method}`);
    register(endpoint.fastPath, async (req, res) => handleFast(req, res, endpoint.key));
  }
}
function registerRoutes(router) {
  router.post("/probe", async (req, res) => {
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    sendJson3(res, {
      ok: true,
      plugin: info,
      version: VERSION,
      config,
      serviceWorker: { enabled: !!config.serviceWorkerEnabled, url: `${API_PREFIX}/sw.js`, scope: "/" },
      earlyBridge: getEarlyBridgeStatus(),
      stats,
      status: getUserStatus(ctx),
      settingsSave: getSettingsSaveStatus(),
      chatSave: getChatSaveStatus(),
      settingsGet: getSettingsGetStatus(),
      selfInstall: getSelfInstallStatus()
    });
  });
  router.get("/sw.js", async (_req, res) => {
    if (!config.enabled || !config.serviceWorkerEnabled) {
      res.status(503).type("text/plain").send("cocktail-plus Service Worker is disabled.");
      return;
    }
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("service-worker-allowed", "/");
    res.send(makeServiceWorkerScript());
  });
  router.post("/config/get", async (_req, res) => {
    sendJson3(res, { ok: true, config });
  });
  router.get("/early/bridge.js", async (_req, res) => {
    if (!config.earlyBridgeEnabled) {
      res.setHeader("content-type", "application/javascript; charset=utf-8");
      res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.send(`console.info('[cocktail-plus:early] disabled');`);
      return;
    }
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.send(makeEarlyBridgeScript());
  });
  router.get("/module", async (req, res) => handleModuleProxy(req, res));
  router.post("/early/status", async (_req, res) => {
    sendJson3(res, { ok: true, status: getEarlyBridgeStatus() });
  });
  router.post("/early/install", async (req, res) => {
    const noBackup = asBoolean(req.body?.noBackup, false);
    const result = installEarlyBridge({ noBackup });
    sendJson3(res, result);
  });
  router.post("/early/uninstall", async (req, res) => {
    const noBackup = asBoolean(req.body?.noBackup, false);
    const result = uninstallEarlyBridge({ noBackup });
    sendJson3(res, result);
  });
  router.post("/config/set", async (req, res) => {
    const next = saveConfig({ ...config, ...req.body?.config || req.body || {} });
    sendJson3(res, { ok: true, config: next });
  });
  registerFastRoutes(router);
  router.post(settingsGetEndpoint.fastPath, async (req, res) => handleSettingsGetFast(req, res));
  router.post(settingsSaveEndpoint.fastPath, async (req, res) => handleSettingsSaveFast(req, res));
  router.post(chatSaveEndpoint.fastPath, async (req, res) => handleChatSaveFast(req, res, chatSaveEndpoint));
  router.post(groupChatSaveEndpoint.fastPath, async (req, res) => handleChatSaveFast(req, res, groupChatSaveEndpoint));
  router.post("/warm", async (req, res) => {
    const endpointKeys = parseEndpointList(req.body?.endpoints, ["characters-all"]);
    const wait = asBoolean(req.body?.wait, false);
    const force = asBoolean(req.body?.force, false);
    const tasks = endpointKeys.map((endpointKey) => {
      const ctx = makeRequestContext(req, { bodyOverride: {} });
      ctx.requestId = nextRequestId(`warm-${endpointKey}`);
      return warmEntry(ctx, endpointKey, "warm", force).then(({ result, entry, cached, skipped }) => ({ endpointKey, ok: !!result?.ok, status: result?.status, cached, skipped: !!skipped, entry: summarizeEntry(entry) })).catch((error) => ({ endpointKey, ok: false, error: error instanceof Error ? error.message : String(error) }));
    });
    if (wait) {
      const results = await Promise.all(tasks);
      sendJson3(res, { ok: true, waited: true, results });
    } else {
      void Promise.all(tasks).catch(() => {
      });
      sendJson3(res, { ok: true, waited: false, endpoints: endpointKeys });
    }
  });
  router.post("/invalidate", async (req, res) => {
    const endpointKeys = parseEndpointList(req.body?.endpoints, []);
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    const removed = invalidateForUser(ctx, endpointKeys);
    sendJson3(res, { ok: true, endpoints: endpointKeys, removed });
  });
  router.post("/status", async (req, res) => {
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    sendJson3(res, { ok: true, config, stats, status: getUserStatus(ctx), earlyBridge: getEarlyBridgeStatus(), settingsSave: getSettingsSaveStatus(), chatSave: getChatSaveStatus(), settingsGet: getSettingsGetStatus(), selfInstall: getSelfInstallStatus() });
  });
  router.post("/backend/install-from-frontend", async (req, res) => {
    const noBackup = asBoolean(req.body?.noBackup, false);
    sendJson3(res, installBackendFromFrontend({ noBackup }));
  });
  router.post("/backend/install-status", async (_req, res) => {
    sendJson3(res, getSelfInstallStatus());
  });
  router.post("/cache/clear", async (req, res) => {
    const endpointKeys = parseEndpointList(req.body?.endpoints, ["characters-all"]);
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    const removed = invalidateForUser(ctx, endpointKeys);
    clearSettingsGetCache();
    sendJson3(res, { ok: true, endpoints: endpointKeys, removed });
  });
}

// server-plugins/cocktail-plus/src/index.ts
async function init(router) {
  const earlyResult = autoEnsureEarlyBridge();
  if (earlyResult?.ok) {
    console.log("[cocktail-plus] early bridge status:", earlyResult.status || earlyResult);
  } else {
    console.warn("[cocktail-plus] early bridge install failed:", earlyResult);
  }
  registerRoutes(router);
}
async function exit() {
  clearCacheStores();
}
export {
  exit,
  info,
  init
};
