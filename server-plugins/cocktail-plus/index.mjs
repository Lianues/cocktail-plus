// server-plugins/cocktail-plus/src/cache-store.ts
import fs9 from "node:fs";
import path8 from "node:path";

// server-plugins/cocktail-plus/src/constants.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_ID = "cocktail-plus";
var PLUGIN_NAME = "cocktail-plus";
var API_PREFIX = `/api/plugins/${PLUGIN_ID}`;
var HEADER_PREFIX = "x-cocktail-plus";
var SW_MESSAGE_SOURCE = `${PLUGIN_ID}-sw`;
var PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
var CONFIG_PATH = path.join(PLUGIN_DIR, "config.json");
var SERVER_ROOT = path.resolve(PLUGIN_DIR, "..", "..");
function readVersion() {
  try {
    const raw = fs.readFileSync(path.join(PLUGIN_DIR, "version.json"), "utf8");
    const parsed = JSON.parse(raw);
    const version = String(parsed?.version || "").trim();
    if (version) return version;
  } catch {
  }
  return "0.1.18";
}
var VERSION = readVersion();
var info = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  version: VERSION,
  description: "Optional SillyTavern cocktail-plus plugin for frontend/backend startup and interaction paths."
};

// server-plugins/cocktail-plus/src/config.ts
import fs2 from "node:fs";
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
  patchParallelActivateExtensions: true,
  // Optional ST source hotfix. When enabled, plugin patches src/endpoints/chats.js on startup;
  // a restart is still required for the patched source to be loaded by SillyTavern.
  autoPatchChatsEnoentGuard: false
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
  out.autoPatchChatsEnoentGuard = asBool(input.autoPatchChatsEnoentGuard, DEFAULT_CONFIG.autoPatchChatsEnoentGuard);
  return out;
}
function loadConfig() {
  try {
    if (!fs2.existsSync(CONFIG_PATH)) return normalizeConfig({});
    return normalizeConfig(JSON.parse(fs2.readFileSync(CONFIG_PATH, "utf8")));
  } catch (error) {
    console.warn(`[${PLUGIN_ID}] Failed to read config.json, using defaults:`, error);
    return normalizeConfig({});
  }
}
function asBoolean(value, fallback = false) {
  return asBool(value, fallback);
}
var config = loadConfig();

// server-plugins/cocktail-plus/src/endpoints/characters-all.ts
import fs4 from "node:fs";
import path3 from "node:path";

// server-plugins/cocktail-plus/src/utils.ts
import fs3 from "node:fs";
import path2 from "node:path";
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
function isSillyTavernRoot(root) {
  try {
    return !!root && fs3.existsSync(path2.join(root, "server.js")) && fs3.existsSync(path2.join(root, "package.json")) && fs3.existsSync(path2.join(root, "public", "index.html"));
  } catch {
    return false;
  }
}
function safeStatRecord(filePath, label = filePath) {
  try {
    const stat = fs3.statSync(filePath);
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
    const entries = fs3.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const ext = path2.extname(entry.name).toLowerCase();
      if (entry.isFile() && exts && !exts.includes(ext)) continue;
      out.push(safeStatRecord(path2.join(dirPath, entry.name), `${options.label || dirPath}/${entry.name}`));
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
    if (!fs3.existsSync(filePath)) return "";
    return fs3.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}
function getServerRoot() {
  const cwd = process.cwd();
  if (isSillyTavernRoot(cwd)) return cwd;
  if (isSillyTavernRoot(SERVER_ROOT)) return SERVER_ROOT;
  return cwd;
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
var JSON_CONTENT_TYPE = "application/json; charset=utf-8";
var MAX_CARD_TEXT_CHUNK_BYTES = 64 * 1024 * 1024;
function callProgress(onProgress, patch) {
  try {
    if (typeof onProgress === "function") onProgress(patch);
  } catch {
  }
}
function progressPatch(phase, startedAt, bytesReceived, totalBytes, extra = {}) {
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const speedBps = bytesReceived > 0 ? bytesReceived / (elapsedMs / 1e3) : 0;
  const hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;
  const percent = hasTotal ? Math.max(0, Math.min(100, bytesReceived / totalBytes * 100)) : null;
  const etaMs = hasTotal && speedBps > 0 ? Math.max(0, (totalBytes - bytesReceived) / speedBps * 1e3) : null;
  return {
    phase,
    bytesReceived,
    totalBytes: hasTotal ? totalBytes : null,
    speedBps,
    percent,
    etaMs,
    ...extra
  };
}
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
function normalizeBoolean(value) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  return false;
}
function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}
function calculateChatSize(chatsRoot, avatarFileName) {
  let chatSize = 0;
  let dateLastChat = 0;
  try {
    const charDir = path3.join(chatsRoot, String(avatarFileName || "").replace(/\.png$/i, ""));
    if (!fs4.existsSync(charDir)) return { chatSize, dateLastChat };
    const chats = fs4.readdirSync(charDir);
    for (const chat of chats) {
      try {
        const stat = fs4.statSync(path3.join(charDir, chat));
        if (!stat.isFile()) continue;
        chatSize += stat.size;
        dateLastChat = Math.max(dateLastChat, stat.mtimeMs);
      } catch {
      }
    }
  } catch {
  }
  return { chatSize, dateLastChat };
}
function calculateDataSize(data) {
  try {
    return data && typeof data === "object" ? Object.values(data).reduce((acc, val) => acc + String(val).length, 0) : 0;
  } catch {
    return 0;
  }
}
function extractPngTextChunks(buffer) {
  const chunks = [];
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return chunks;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const typeEnd = offset + 8;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (length < 0 || dataEnd > buffer.length || nextOffset > buffer.length) break;
    const type = buffer.toString("ascii", typeStart, typeEnd);
    if (type === "tEXt") {
      const separator = buffer.indexOf(0, dataStart);
      if (separator >= dataStart && separator < dataEnd) {
        const keyword = buffer.toString("latin1", dataStart, separator).toLowerCase();
        if (keyword === "chara" || keyword === "ccv3") {
          const textLength = dataEnd - separator - 1;
          if (textLength > MAX_CARD_TEXT_CHUNK_BYTES) {
            throw new Error(`PNG ${keyword} metadata is too large: ${textLength} bytes`);
          }
          const text = buffer.toString("latin1", separator + 1, dataEnd);
          chunks.push({ keyword, text });
        }
      }
    }
    if (type === "IEND") break;
    offset = nextOffset;
  }
  return chunks;
}
async function readCharacterCardJson(filePath) {
  const buffer = await fs4.promises.readFile(filePath);
  const textChunks = extractPngTextChunks(buffer);
  const selected = textChunks.find((chunk) => chunk.keyword === "ccv3") || textChunks.find((chunk) => chunk.keyword === "chara");
  if (!selected) throw new Error("No character metadata found");
  return Buffer.from(selected.text, "base64").toString("utf8");
}
function makeShallowCharacterFromCard(raw, avatarFileName, stat, directories) {
  const data = raw && typeof raw.data === "object" && raw.data !== null ? raw.data : {};
  const extensions = data.extensions && typeof data.extensions === "object" ? data.extensions : {};
  const name = String(data.name || raw?.name || path3.basename(avatarFileName, path3.extname(avatarFileName)) || "").trim();
  if (!name) return null;
  const tags = normalizeArray(data.tags).length ? normalizeArray(data.tags) : normalizeArray(raw?.tags);
  const fav = normalizeBoolean(raw?.fav ?? extensions.fav);
  const { chatSize, dateLastChat } = calculateChatSize(directories.chats, avatarFileName);
  const createDate = raw?.create_date || data.create_date || new Date(Math.round(stat?.ctimeMs || Date.now())).toISOString();
  return toShallowCharacter({
    name,
    avatar: avatarFileName,
    chat: raw?.chat || data.chat || "",
    fav,
    date_added: stat?.ctimeMs || 0,
    create_date: createDate,
    date_last_chat: dateLastChat,
    chat_size: chatSize,
    data_size: calculateDataSize(data),
    tags,
    data: {
      name,
      character_version: data.character_version || raw?.character_version || "",
      creator: data.creator || raw?.creator || "",
      creator_notes: data.creator_notes || raw?.creator_notes || raw?.creatorcomment || "",
      tags,
      extensions: {
        fav
      }
    }
  });
}
async function processCharacterFileDirect(fileName, directories) {
  const filePath = path3.join(directories.characters, fileName);
  const stat = await fs4.promises.stat(filePath);
  const jsonText = await readCharacterCardJson(filePath);
  const raw = JSON.parse(jsonText);
  return { character: makeShallowCharacterFromCard(raw, fileName, stat, directories), stat };
}
async function fetchCharactersAllDirect(ctx, config2, options = {}) {
  if (!config2.shallowCharactersAll) return null;
  const startedAt = Date.now();
  const onProgress = options?.onProgress;
  const directories = ctx.directories || {};
  const charactersDir = directories.characters;
  if (!charactersDir) throw new Error("Characters directory is not available");
  callProgress(onProgress, progressPatch("scanning", startedAt, 0, null, { status: null, error: null }));
  const dirents = await fs4.promises.readdir(charactersDir, { withFileTypes: true });
  const pngFiles = dirents.filter((entry) => entry.isFile() && path3.extname(entry.name).toLowerCase() === ".png").map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  const fileStats = /* @__PURE__ */ new Map();
  let totalBytes = 0;
  for (const fileName of pngFiles) {
    try {
      const stat = await fs4.promises.stat(path3.join(charactersDir, fileName));
      fileStats.set(fileName, stat);
      totalBytes += stat.size;
    } catch {
    }
  }
  const characters = [];
  let processedBytes = 0;
  let errors = 0;
  let lastEmitAt = 0;
  callProgress(onProgress, progressPatch("reading", startedAt, 0, totalBytes, { count: 0, totalCount: pngFiles.length }));
  for (let index = 0; index < pngFiles.length; index++) {
    const fileName = pngFiles[index];
    const stat = fileStats.get(fileName);
    try {
      const { character } = await processCharacterFileDirect(fileName, directories);
      if (character?.name) characters.push(character);
    } catch (error) {
      errors++;
      console.warn(`[cocktail-plus] Could not build shallow character cache entry for ${fileName}:`, error instanceof Error ? error.message : error);
    } finally {
      processedBytes += stat?.size || 0;
      const now = Date.now();
      if (now - lastEmitAt >= 100 || index === pngFiles.length - 1) {
        lastEmitAt = now;
        callProgress(onProgress, progressPatch("reading", startedAt, processedBytes, totalBytes, { count: index + 1, totalCount: pngFiles.length, errors }));
      }
    }
  }
  callProgress(onProgress, progressPatch("transforming", startedAt, processedBytes, totalBytes, { count: characters.length, totalCount: pngFiles.length, errors, etaMs: 0 }));
  const bodyText = JSON.stringify(characters);
  const cachedBytes = Buffer.byteLength(bodyText, "utf8");
  const durationMs = Date.now() - startedAt;
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { "content-type": JSON_CONTENT_TYPE },
    bodyText,
    durationMs,
    bytesReceived: processedBytes,
    totalBytes,
    transform: {
      transformed: true,
      direct: true,
      sourceBytes: processedBytes,
      cachedBytes,
      count: characters.length,
      errors
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
    headers: { "content-type": JSON_CONTENT_TYPE },
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
  fetchForCache: fetchCharactersAllDirect,
  staleOnSignatureChange: true,
  transformBodyForCache,
  makeAsyncMiss
};

// server-plugins/cocktail-plus/src/endpoints/chat-save.ts
import fs5 from "node:fs";
import path4 from "node:path";

// server-plugins/cocktail-plus/src/original-fetch.ts
function pickResponseHeaders(response) {
  const headers = {};
  const contentType = response.headers.get("content-type");
  headers["content-type"] = contentType || "application/json; charset=utf-8";
  return headers;
}
function callProgress2(onProgress, patch) {
  try {
    if (typeof onProgress === "function") onProgress(patch);
  } catch {
  }
}
function parseContentLength(response) {
  const raw = response.headers.get("content-length");
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function progressPatch2(phase, startedAt, bytesReceived, totalBytes, extra = {}) {
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const speedBps = bytesReceived > 0 ? bytesReceived / (elapsedMs / 1e3) : 0;
  const hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;
  const percent = hasTotal ? Math.max(0, Math.min(100, bytesReceived / totalBytes * 100)) : null;
  const etaMs = hasTotal && speedBps > 0 ? Math.max(0, (totalBytes - bytesReceived) / speedBps * 1e3) : null;
  return {
    phase,
    bytesReceived,
    totalBytes: hasTotal ? totalBytes : null,
    speedBps,
    percent,
    etaMs,
    ...extra
  };
}
async function readBodyWithProgress(response, onProgress, startedAt) {
  const totalBytes = parseContentLength(response);
  let bytesReceived = 0;
  let lastEmitAt = 0;
  callProgress2(onProgress, progressPatch2("downloading", startedAt, 0, totalBytes, { status: response.status }));
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const buffer = Buffer.from(value);
      chunks.push(buffer);
      bytesReceived += buffer.byteLength;
      const now = Date.now();
      if (now - lastEmitAt >= 100) {
        lastEmitAt = now;
        callProgress2(onProgress, progressPatch2("downloading", startedAt, bytesReceived, totalBytes, { status: response.status }));
      }
    }
    callProgress2(onProgress, progressPatch2("downloading", startedAt, bytesReceived, totalBytes, { status: response.status, etaMs: 0, percent: totalBytes ? 100 : null }));
    return { bodyText: Buffer.concat(chunks).toString("utf8"), bytesReceived, totalBytes };
  }
  const bodyText = await response.text();
  bytesReceived = Buffer.byteLength(bodyText || "", "utf8");
  callProgress2(onProgress, progressPatch2("downloading", startedAt, bytesReceived, totalBytes || bytesReceived, { status: response.status, etaMs: 0, percent: 100 }));
  return { bodyText, bytesReceived, totalBytes: totalBytes || bytesReceived };
}
async function fetchOriginal(ctx, endpoint, options = {}) {
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
  const onProgress = options?.onProgress;
  try {
    const fetchOptions = { method, headers, redirect: "manual", signal: controller.signal };
    if (method !== "GET" && method !== "HEAD") {
      fetchOptions.body = ctx.bodyText;
    }
    callProgress2(onProgress, { phase: "requesting", startedAt, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null });
    const response = await fetch(url, fetchOptions);
    callProgress2(onProgress, { phase: "downloading", status: response.status, totalBytes: parseContentLength(response), bytesReceived: 0, speedBps: 0, percent: null, etaMs: null });
    const { bodyText, bytesReceived, totalBytes } = await readBodyWithProgress(response, onProgress, startedAt);
    const durationMs = Date.now() - startedAt;
    return { ok: response.ok, status: response.status, statusText: response.statusText, headers: pickResponseHeaders(response), bodyText, durationMs, bytesReceived, totalBytes };
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
      authorization: req.headers?.authorization,
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
    const stat = fs5.statSync(filePath);
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
    if (!fs5.existsSync(filePath)) return [];
    return parseJsonl(fs5.readFileSync(filePath, "utf8"));
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
import fs6 from "node:fs";
import path5 from "node:path";
var SETTINGS_FILE = "settings.json";
var JSON_CONTENT_TYPE2 = "application/json; charset=utf-8";
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
var REQUEST_COMPRESSION_DEFAULTS = Object.freeze({
  enabled: false,
  minPayloadSize: "256kb",
  maxPayloadSize: "8mb",
  timeout: 4e3
});
var stConfigFallbackCache = null;
function keyToEnv(key) {
  return "SILLYTAVERN_" + String(key).toUpperCase().replace(/\./g, "_");
}
function toBoolean(value) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return Boolean(value);
}
function getPathValue2(object, key, fallback = void 0) {
  try {
    const parts = String(key).split(".");
    let current = object;
    for (const part of parts) {
      if (current === null || current === void 0 || !Object.prototype.hasOwnProperty.call(current, part)) return fallback;
      current = current[part];
    }
    return current === void 0 ? fallback : current;
  } catch {
    return fallback;
  }
}
function stripInlineComment(value) {
  let quote = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if ((char === '"' || char === "'") && value[i - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
    if (char === "#" && !quote) return value.slice(0, i).trimEnd();
  }
  return value.trimEnd();
}
function parseYamlScalar(raw) {
  const value = stripInlineComment(String(raw ?? "").trim());
  if (value === "") return "";
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}
function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, object: root }];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^(\s*)([^:#][^:]*):(?:\s*(.*))?$/);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, "    ").length;
    const key = match[2].trim();
    const rawValue = match[3];
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].object;
    if (rawValue === void 0 || stripInlineComment(rawValue).trim() === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, object: child });
    } else {
      parent[key] = parseYamlScalar(rawValue);
    }
  }
  return root;
}
function getFallbackConfig() {
  if (stConfigFallbackCache) return stConfigFallbackCache;
  const candidates = [
    process.env.SILLYTAVERN_CONFIG_PATH,
    process.env.CONFIG_PATH,
    globalThis.COMMAND_LINE_ARGS?.configPath,
    path5.join(getServerRoot(), "config.yaml"),
    path5.join(getServerRoot(), "config.yml")
  ].filter(Boolean);
  for (const filePath of candidates) {
    try {
      if (fs6.existsSync(filePath)) {
        stConfigFallbackCache = parseSimpleYaml(fs6.readFileSync(filePath, "utf8"));
        return stConfigFallbackCache;
      }
    } catch {
    }
  }
  stConfigFallbackCache = {};
  return stConfigFallbackCache;
}
function getRuntimeConfigValue(key, defaultValue = null, typeConverter = null) {
  const envKey = keyToEnv(key);
  let value = Object.prototype.hasOwnProperty.call(process.env, envKey) ? process.env[envKey] : getPathValue2(getFallbackConfig(), key, defaultValue);
  switch (typeConverter) {
    case "number":
      return Number.isNaN(parseFloat(value)) ? defaultValue : parseFloat(value);
    case "boolean":
      return toBoolean(value);
    default:
      return value;
  }
}
function parseByteSize(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?i?b?|bytes?)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] || "b").replace(/bytes?/, "b");
  const multipliers = { b: 1, k: 1024, kb: 1024, kib: 1024, m: 1024 ** 2, mb: 1024 ** 2, mib: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3, gib: 1024 ** 3, t: 1024 ** 4, tb: 1024 ** 4, tib: 1024 ** 4 };
  return Math.floor(amount * (multipliers[unit] || 1));
}
function getSettingsRuntimeConfig() {
  const [
    enableExtensions,
    enableExtensionsAutoUpdate,
    enableAccounts,
    requestCompressionEnabled,
    requestCompressionMin,
    requestCompressionMax,
    requestCompressionTimeout
  ] = [
    getRuntimeConfigValue("extensions.enabled", true, "boolean"),
    getRuntimeConfigValue("extensions.autoUpdate", true, "boolean"),
    getRuntimeConfigValue("enableUserAccounts", false, "boolean"),
    getRuntimeConfigValue("performance.requestCompression.enabled", REQUEST_COMPRESSION_DEFAULTS.enabled, "boolean"),
    getRuntimeConfigValue("performance.requestCompression.minPayloadSize", REQUEST_COMPRESSION_DEFAULTS.minPayloadSize),
    getRuntimeConfigValue("performance.requestCompression.maxPayloadSize", REQUEST_COMPRESSION_DEFAULTS.maxPayloadSize),
    getRuntimeConfigValue("performance.requestCompression.timeout", REQUEST_COMPRESSION_DEFAULTS.timeout, "number")
  ];
  return {
    enable_extensions: !!enableExtensions,
    enable_extensions_auto_update: !!enableExtensionsAutoUpdate,
    enable_accounts: !!enableAccounts,
    request_compression: {
      enabled: !!requestCompressionEnabled,
      minPayloadSize: parseByteSize(requestCompressionMin) || 0,
      maxPayloadSize: parseByteSize(requestCompressionMax) || 0,
      timeout: Number(requestCompressionTimeout) || 0
    }
  };
}
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
    const files = await fs6.promises.readdir(directoryPath);
    return files.filter((name) => path5.extname(name).toLowerCase() === fileExtension).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
async function safeStatRecordAsync(filePath, label = filePath) {
  try {
    const stat = await fs6.promises.stat(filePath);
    return { label, exists: true, file: stat.isFile(), directory: stat.isDirectory(), size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
  } catch {
    return { label, exists: false };
  }
}
async function safeDirectoryRecords(dirPath, label, extensions = null) {
  try {
    const names = (await fs6.promises.readdir(dirPath)).sort((a, b) => a.localeCompare(b));
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
      const text = await fs6.promises.readFile(filePath, "utf8");
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
      const text = await fs6.promises.readFile(filePath, "utf8");
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
    reasoning,
    runtimeConfig
  ] = await Promise.all([
    fs6.promises.readFile(settingsPathFromRequest(req), "utf8"),
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
    readAndParseFromDirectory(directories.reasoning),
    getSettingsRuntimeConfig()
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
    ...runtimeConfig
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
  res.setHeader("content-type", JSON_CONTENT_TYPE2);
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
import fs7 from "node:fs";
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
  const text = fs7.readFileSync(settingsPath, "utf8");
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
import fs8 from "node:fs";
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
    const pkg = JSON.parse(fs8.readFileSync(path7.join(serverRoot, "package.json"), "utf8"));
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
var refreshProgress = /* @__PURE__ */ new Map();
var PROGRESS_RETENTION_MS = 30 * 1e3;
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
    if (!fs9.existsSync(file)) return null;
    const entry = JSON.parse(fs9.readFileSync(file, "utf8"));
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
    fs9.mkdirSync(path8.dirname(file), { recursive: true });
    fs9.writeFileSync(file, JSON.stringify(entry), "utf8");
  } catch {
  }
}
function listDiskEntriesForUser(ctx) {
  const dir = path8.join(getDiskRoot(), ctx.userKey);
  try {
    if (!fs9.existsSync(dir)) return [];
    return fs9.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => path8.join(dir, name));
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
function finiteNumber(value, fallback = null) {
  if (value === null || value === void 0 || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
function normalizeProgress(progress) {
  if (!progress) return null;
  const startedAt = finiteNumber(progress.startedAt, Date.now());
  const updatedAt = finiteNumber(progress.updatedAt, startedAt);
  const bytesReceived = Math.max(0, finiteNumber(progress.bytesReceived, 0) || 0);
  const totalBytesRaw = finiteNumber(progress.totalBytes, null);
  const totalBytes = totalBytesRaw && totalBytesRaw > 0 ? totalBytesRaw : null;
  const speedBps = Math.max(0, finiteNumber(progress.speedBps, 0) || 0);
  const percentRaw = finiteNumber(progress.percent, null);
  const percent = percentRaw === null ? null : Math.max(0, Math.min(100, percentRaw));
  const etaRaw = finiteNumber(progress.etaMs, null);
  return {
    endpointKey: progress.endpointKey || null,
    reason: progress.reason || null,
    phase: progress.phase || "starting",
    startedAt,
    updatedAt,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    ageMs: Math.max(0, Date.now() - updatedAt),
    bytesReceived,
    totalBytes,
    speedBps,
    percent,
    etaMs: etaRaw === null ? null : Math.max(0, etaRaw),
    status: finiteNumber(progress.status, null),
    error: progress.error || null
  };
}
function setRefreshProgress(key, endpointKey, patch = {}) {
  if (!key) return null;
  const now = Date.now();
  const previous = refreshProgress.get(key) || {
    key,
    endpointKey,
    phase: "starting",
    reason: null,
    startedAt: now,
    updatedAt: now,
    bytesReceived: 0,
    totalBytes: null,
    speedBps: 0,
    percent: null,
    etaMs: null,
    status: null,
    error: null
  };
  const next = {
    ...previous,
    ...patch,
    key,
    endpointKey: endpointKey || previous.endpointKey,
    updatedAt: now
  };
  if (patch.startedAt !== void 0) next.startedAt = patch.startedAt;
  if (!next.startedAt) next.startedAt = now;
  refreshProgress.set(key, next);
  return normalizeProgress(next);
}
function getRefreshProgress(key) {
  return normalizeProgress(refreshProgress.get(key));
}
function scheduleClearRefreshProgress(key, delayMs = PROGRESS_RETENTION_MS) {
  if (!key) return;
  const snapshot = refreshProgress.get(key);
  const updatedAt = snapshot?.updatedAt || Date.now();
  const timer = setTimeout(() => {
    const current = refreshProgress.get(key);
    if (current && (current.updatedAt || 0) <= updatedAt) refreshProgress.delete(key);
  }, Math.max(0, delayMs));
  if (typeof timer.unref === "function") timer.unref();
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
  return Object.keys(ENDPOINTS).map((endpointKey) => {
    const key = getCacheKey2(baseCtx, endpointKey);
    return {
      endpointKey,
      entry: summarizeEntry(getCachedEntry(baseCtx, endpointKey)),
      refreshing: inflight.has(key),
      progress: getRefreshProgress(key)
    };
  });
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
    for (const key of Array.from(refreshProgress.keys())) {
      if (key.startsWith(prefix)) {
        refreshProgress.delete(key);
      }
    }
  }
  for (const file of listDiskEntriesForUser(ctx)) {
    const base = path8.basename(file);
    if (endpointKeys.some((endpointKey) => base.startsWith(`${endpointKey}-`))) {
      try {
        fs9.rmSync(file, { force: true });
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
  refreshProgress.clear();
}

// server-plugins/cocktail-plus/src/early-bridge.ts
import fs10 from "node:fs";
import path9 from "node:path";
var MARKER_START = "<!-- cocktail-plus early bridge start -->";
var MARKER_END = "<!-- cocktail-plus early bridge end -->";
var BRIDGE_SCRIPT_ID = "cocktail-plus-early-bridge";
var BRIDGE_SRC = `${API_PREFIX}/early/bridge.js`;
var BACKUP_DIR = path9.join(PLUGIN_DIR, "backups");
var MODULE_IMPORT_MAP_ID = "cocktail-plus-module-import-map";
var MODULE_PROXY_ENTRY_PATHS = ["/scripts/i18n.js", "/script.js"];
var MODULE_PROXY_IMPORT_PATHS = ["/script.js", "/scripts/i18n.js", "/scripts/system-messages.js", "/scripts/extensions.js", "/scripts/welcome-screen.js"];
var MODULE_SCRIPT_PROXY_EXCLUDED_PREFIXES = ["/scripts/extensions/third-party/"];
function getIndexPath() {
  return path9.join(getServerRoot(), "public", "index.html");
}
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
  const indexPath = getIndexPath();
  if (!fs10.existsSync(indexPath)) return "";
  return fs10.readFileSync(indexPath, "utf8");
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
  fs10.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path9.join(BACKUP_DIR, `index.html.${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.bak`);
  fs10.writeFileSync(file, html, "utf8");
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
    backupDir: BACKUP_DIR
  };
}
function installEarlyBridge(options = {}) {
  const indexPath = getIndexPath();
  const html = readIndexHtml();
  if (!html) return { ok: false, error: `index.html not found: ${indexPath}`, status: getEarlyBridgeStatus() };
  const beforeStatus = getEarlyBridgeStatus();
  const { html: nextHtml, mode } = insertBridgeBlock(html);
  const finalHtml = rewriteIndexModuleProxyTags(nextHtml);
  if (finalHtml === html) {
    return { ok: true, changed: false, mode: "unchanged", backup: null, status: beforeStatus };
  }
  let backup = null;
  if (!options.noBackup) backup = makeBackup(html);
  fs10.writeFileSync(indexPath, finalHtml, "utf8");
  return { ok: true, changed: true, mode, backup, status: getEarlyBridgeStatus() };
}
function uninstallEarlyBridge(options = {}) {
  const indexPath = getIndexPath();
  const html = readIndexHtml();
  if (!html) return { ok: false, error: `index.html not found: ${indexPath}`, status: getEarlyBridgeStatus() };
  const markerRegex = getMarkerRegex();
  markerRegex.lastIndex = 0;
  if (!markerRegex.test(html)) {
    return { ok: true, changed: false, backup: null, status: getEarlyBridgeStatus() };
  }
  markerRegex.lastIndex = 0;
  const nextHtml = restoreIndexModuleProxyTags(html.replace(markerRegex, "").replace(/\n{3,}/g, "\n\n"));
  let backup = null;
  if (!options.noBackup) backup = makeBackup(html);
  fs10.writeFileSync(indexPath, nextHtml, "utf8");
  return { ok: true, changed: true, backup, status: getEarlyBridgeStatus() };
}
function makeFastRoutesLiteral() {
  return ENDPOINT_LIST.map((endpoint) => `  [${JSON.stringify(endpoint.originalPath)}, { path: PREFIX + ${JSON.stringify(endpoint.fastPath)}, method: ${JSON.stringify(endpoint.method)} }]`).join(",\n");
}
function makeTemplatePreloadList() {
  const fallback = ["help.html", "hotkeys.html", "formatting.html", "welcome.html", "welcomePrompt.html", "assistantNote.html"];
  try {
    const dir = path9.join(getServerRoot(), "public", "scripts", "templates");
    const names = fs10.readdirSync(dir).filter((name) => name.endsWith(".html")).sort((a, b) => a.localeCompare(b));
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
  var FLAG = '__cocktailPlusEarlyBridge';
  var state = window[FLAG] = window[FLAG] || { version: VERSION, installedAt: Date.now(), events: [], patchedFetch: false, swRegisterStarted: false, settingsSave: { baselineHash: '', captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0 }, chatSave: { baselineCount: 0, captures: 0, optimized: 0, fallbacks: 0, savedBytes: 0, evictions: 0 } };
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
      el.innerHTML = '<div class="cp-char-progress-title">\u9E21\u5C3E\u9152+ \u6B63\u5728\u52A0\u8F7D\u89D2\u8272\u5217\u8868</div><div class="cp-char-progress-message"></div><div class="cp-char-progress-track"><div class="cp-char-progress-bar"></div></div><div class="cp-char-progress-meta"></div>';
    }
    if (el.parentNode !== block) block.insertBefore(el, block.firstChild || null);
    return el;
  }

  function cpProgressMessage(data) {
    if (data && data.message) return data.message;
    var cache = String(data && data.cache || '');
    var phase = String(data && data.phase || '');
    if (cache === 'ASYNC-MISS') return '\u540E\u7AEF\u6B63\u5728\u6784\u5EFA\u89D2\u8272\u7F13\u5B58\uFF0C\u9996\u6B21\u52A0\u8F7D\u53EF\u80FD\u8F83\u4E45\u2026';
    if (phase === 'requesting' || phase === 'starting') return '\u7B49\u5F85 SillyTavern \u539F\u59CB\u63A5\u53E3\u8FD4\u56DE\u89D2\u8272\u5217\u8868\u2026';
    if (phase === 'scanning') return '\u6B63\u5728\u626B\u63CF\u89D2\u8272\u5361\u6587\u4EF6\u2026';
    if (phase === 'reading') return '\u6B63\u5728\u8BFB\u53D6\u89D2\u8272\u5361\u5143\u6570\u636E\u5E76\u6784\u5EFA\u7F13\u5B58\u2026';
    if (phase === 'downloading') return '\u6B63\u5728\u4E0B\u8F7D\u89D2\u8272\u5217\u8868\u6570\u636E\u2026';
    if (phase === 'transforming') return '\u6B63\u5728\u6574\u7406\u89D2\u8272\u7F13\u5B58\u2026';
    if (phase === 'cached') return '\u7F13\u5B58\u5DF2\u5C31\u7EEA\uFF0C\u6B63\u5728\u5237\u65B0\u89D2\u8272\u5217\u8868\u2026';
    if (phase === 'rendering') return '\u89D2\u8272\u6570\u636E\u5DF2\u8FD4\u56DE\uFF0C\u6B63\u5728\u89E3\u6790\u5E76\u6E32\u67D3\u5217\u8868\u2026';
    if (phase === 'error') return '\u89D2\u8272\u5217\u8868\u52A0\u8F7D\u9047\u5230\u95EE\u9898\uFF0C\u6B63\u5728\u56DE\u9000/\u7B49\u5F85\u91CD\u8BD5\u2026';
    return '\u6B63\u5728\u52A0\u8F7D\u89D2\u8272\u5217\u8868\u2026';
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
      var bytesLabel = (phase === 'reading' || phase === 'scanning') ? '\u5DF2\u8BFB\u53D6 ' : (phase === 'transforming' || phase === 'cached') ? '\u5DF2\u5904\u7406 ' : '\u5DF2\u63A5\u6536 ';
      var speedLabel = (phase === 'reading' || phase === 'scanning') ? '\u8BFB\u53D6\u901F\u5EA6 ' : (phase === 'transforming' || phase === 'cached') ? '\u5904\u7406\u901F\u5EA6 ' : '';
      if (total && total > 0) parts.push(bytesLabel + cpFormatBytes(received) + ' / ' + cpFormatBytes(total));
      else if (received > 0) parts.push(bytesLabel + cpFormatBytes(received));
      if (determinate) parts.push(percent.toFixed(1) + '%');
      if ((cpNumber(data.speedBps, 0) || 0) > 0) parts.push(speedLabel + cpFormatBytes(data.speedBps) + '/s');
      if (cpNumber(data.etaMs, null) !== null && (cpNumber(data.etaMs, 0) || 0) > 0) parts.push('\u5269\u4F59 ' + cpFormatDuration(data.etaMs));
      else if (data.startedAt) parts.push('\u5DF2\u7528 ' + cpFormatDuration(Date.now() - data.startedAt));
      if (cpNumber(data.totalCount, null) !== null) parts.push('\u89D2\u8272 ' + (cpNumber(data.count, 0) || 0) + ' / ' + (cpNumber(data.totalCount, 0) || 0));
      else if (cpNumber(data.count, null) !== null) parts.push('\u89D2\u8272 ' + (cpNumber(data.count, 0) || 0));
      if ((cpNumber(data.errors, 0) || 0) > 0) parts.push('\u8DF3\u8FC7 ' + (cpNumber(data.errors, 0) || 0));
      if (data.cache) parts.push('\u7F13\u5B58\u72B6\u6001 ' + data.cache);
      if (data.phase) parts.push('\u9636\u6BB5 ' + data.phase);
      if (data.error) parts.push('\u9519\u8BEF ' + data.error);
      var meta = el.querySelector('.cp-char-progress-meta');
      if (meta) meta.textContent = parts.join(' \xB7 ');
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
    if (reason) cpUpdateCharacterProgress({ phase: reason === 'rendered' ? 'rendered' : 'cached', message: reason === 'rendered' ? '\u89D2\u8272\u5217\u8868\u5DF2\u663E\u793A' : '\u7F13\u5B58\u5DF2\u5C31\u7EEA\uFF0C\u6B63\u5728\u5237\u65B0\u89D2\u8272\u5217\u8868\u2026', percent: 100, etaMs: 0 });
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
      el.innerHTML = '<span class="cp-recent-progress-title">\u52A0\u8F7D\u6700\u8FD1</span><span class="cp-recent-progress-message"></span><span class="cp-recent-progress-track"><span class="cp-recent-progress-bar"></span></span><span class="cp-recent-progress-meta"></span>';
    }
    if (el.parentNode !== host) host.appendChild(el);
    return el;
  }

  function cpRecentProgressMessage(data) {
    if (data && data.message) return data.message;
    var phase = String(data && data.phase || '');
    if (phase === 'requesting' || phase === 'starting') return '\u7B49\u5F85 /recent \u8FD4\u56DE\u6700\u8FD1\u6D88\u606F\u2026';
    if (phase === 'downloading') return '\u6B63\u5728\u63A5\u6536\u6700\u8FD1\u6D88\u606F\u5217\u8868\u2026';
    if (phase === 'rendering' || phase === 'parsing') return '\u6B63\u5728\u89E3\u6790\u5E76\u6E32\u67D3\u6700\u8FD1\u6D88\u606F\u2026';
    if (phase === 'rendered') return '\u6700\u8FD1\u6D88\u606F\u5DF2\u663E\u793A';
    if (phase === 'cancelled') return '\u6700\u8FD1\u6D88\u606F\u52A0\u8F7D\u5DF2\u53D6\u6D88';
    if (phase === 'error') return '\u6700\u8FD1\u6D88\u606F\u52A0\u8F7D\u9047\u5230\u95EE\u9898\u3002';
    return '\u6B63\u5728\u52A0\u8F7D\u6700\u8FD1\u6D88\u606F\u2026';
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
      if (total && total > 0) parts.push('\u5DF2\u63A5\u6536 ' + cpFormatBytes(received) + ' / ' + cpFormatBytes(total));
      else if (received > 0) parts.push('\u5DF2\u63A5\u6536 ' + cpFormatBytes(received));
      if (determinate) parts.push(percent.toFixed(1) + '%');
      if ((cpNumber(data.speedBps, 0) || 0) > 0) parts.push(cpFormatBytes(data.speedBps) + '/s');
      if (cpNumber(data.etaMs, null) !== null && (cpNumber(data.etaMs, 0) || 0) > 0) parts.push('\u5269\u4F59 ' + cpFormatDuration(data.etaMs));
      if (data.startedAt) {
        var currentPhase = String(data.phase || '');
        parts.push((currentPhase === 'requesting' || currentPhase === 'starting' ? '\u7B49\u5F85 ' : '\u5DF2\u7528 ') + cpFormatDuration(Date.now() - data.startedAt));
      }
      if (data.status) parts.push('HTTP ' + data.status);
      if (data.phase) parts.push('\u9636\u6BB5 ' + data.phase);
      if (data.error) parts.push('\u9519\u8BEF ' + data.error);
      var meta = el.querySelector('.cp-recent-progress-meta');
      if (meta) meta.textContent = parts.join(' \xB7 ');
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
    return cpUpdateRecentProgress({ active: true, phase: 'requesting', startedAt: Date.now(), updatedAt: Date.now(), bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null, message: '\u6B63\u5728\u52A0\u8F7D\u6700\u8FD1\u6D88\u606F\u2026' });
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
    var message = reason === 'cancelled' ? '\u6700\u8FD1\u6D88\u606F\u52A0\u8F7D\u5DF2\u53D6\u6D88' : '\u6700\u8FD1\u6D88\u606F\u5DF2\u663E\u793A';
    cpUpdateRecentProgress({ phase: phase, message: message, percent: 100, etaMs: 0, error: null });
    if (recentProgressRemoveTimer) { clearTimeout(recentProgressRemoveTimer); recentProgressRemoveTimer = null; }
    var removeDelayMs = Math.max(0, delayMs === undefined ? 0 : delayMs);
    if (removeDelayMs <= 0) { cpRemoveRecentProgress(); return; }
    recentProgressRemoveTimer = setTimeout(cpRemoveRecentProgress, removeDelayMs);
  }

  function cpFailRecentChatsProgress(error, delayMs) {
    cpUpdateRecentProgress({ phase: 'error', message: '\u6700\u8FD1\u6D88\u606F\u52A0\u8F7D\u9047\u5230\u95EE\u9898\u3002', error: String(error && error.message || error), etaMs: null });
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
    cpUpdateRecentProgress(cpRecentTransferPatch('downloading', startedAt, 0, totalBytes, { status: response.status, message: '\u6B63\u5728\u63A5\u6536\u6700\u8FD1\u6D88\u606F\u5217\u8868\u2026' }));

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
          cpUpdateRecentProgress(cpRecentTransferPatch('downloading', startedAt, bytesReceived, totalBytes, { status: response.status, message: '\u6B63\u5728\u63A5\u6536\u6700\u8FD1\u6D88\u606F\u5217\u8868\u2026' }));
        }
      }
      var finalTotal = totalBytes || bytesReceived;
      cpUpdateRecentProgress(cpRecentTransferPatch('rendering', startedAt, bytesReceived, finalTotal, { status: response.status, percent: finalTotal ? 100 : null, etaMs: 0, message: '\u6B63\u5728\u89E3\u6790\u5E76\u6E32\u67D3\u6700\u8FD1\u6D88\u606F\u2026' }));
      var responseText = await new Response(new Blob(chunks)).text();
      return { body: responseText, text: responseText, bytesReceived: bytesReceived, totalBytes: finalTotal || null };
    }

    var text = await response.text();
    bytesReceived = utf8Bytes(text || '');
    var fallbackTotal = totalBytes || bytesReceived;
    cpUpdateRecentProgress(cpRecentTransferPatch('rendering', startedAt, bytesReceived, fallbackTotal, { status: response.status, percent: fallbackTotal ? 100 : null, etaMs: 0, message: '\u6B63\u5728\u89E3\u6790\u5E76\u6E32\u67D3\u6700\u8FD1\u6D88\u606F\u2026' }));
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
    cpUpdateRecentProgress({ active: true, phase: 'requesting', startedAt: startedAt, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null, message: '\u7B49\u5F85 /recent \u8FD4\u56DE\u6700\u8FD1\u6D88\u606F\u2026' });
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
      cpUpdateRecentProgress({ phase: 'rendering', expectedItems: expectedItems, status: response.status, percent: read.totalBytes ? 100 : null, etaMs: 0, message: '\u6B63\u5728\u89E3\u6790\u5E76\u6E32\u67D3\u6700\u8FD1\u6D88\u606F\u2026' });
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
      cpUpdateCharacterProgress({ active: true, phase: 'requesting', cache: '', message: '\u6B63\u5728\u52A0\u8F7D\u89D2\u8272\u5217\u8868\u2026', bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, error: null, startedAt: startedAt });
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
        var cacheState = response.headers.get(HEADER_PREFIX + '-state') || response.headers.get('x-cocktail-cache') || '';
        if (isCharactersAll) {
          cpUpdateCharacterProgress({ phase: cacheState === 'ASYNC-MISS' ? 'requesting' : 'rendering', cache: cacheState, status: response.status, percent: cacheState === 'ASYNC-MISS' ? null : 100, etaMs: 0, message: cacheState === 'ASYNC-MISS' ? '\u540E\u7AEF\u6B63\u5728\u6784\u5EFA\u89D2\u8272\u7F13\u5B58\uFF0C\u9996\u6B21\u52A0\u8F7D\u53EF\u80FD\u8F83\u4E45\u2026' : '\u89D2\u8272\u6570\u636E\u5DF2\u8FD4\u56DE\uFF0C\u6B63\u5728\u89E3\u6790\u5E76\u6E32\u67D3\u5217\u8868\u2026' });
          if (cacheState !== 'ASYNC-MISS') {
            if (characterProgressStatusTimer) { clearTimeout(characterProgressStatusTimer); characterProgressStatusTimer = null; }
            cpWaitRowsThenRemove(20000);
          }
        }
        remember('intercept.fast-response', { path: url.pathname, status: response.status, cache: cacheState, durationMs: Date.now() - startedAt });
        return response;
      }
      if (isCharactersAll) cpUpdateCharacterProgress({ phase: 'requesting', message: '\u5FEB\u901F\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u56DE\u9000\u539F\u59CB\u89D2\u8272\u63A5\u53E3\u2026' });
      remember('intercept.fallback-status', { path: url.pathname, status: response && response.status, durationMs: Date.now() - startedAt });
    } catch (error) {
      if (isCharactersAll) cpUpdateCharacterProgress({ phase: 'error', error: String(error && error.message || error), message: '\u5FEB\u901F\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25\uFF0C\u6B63\u5728\u56DE\u9000\u539F\u59CB\u89D2\u8272\u63A5\u53E3\u2026' });
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

// server-plugins/cocktail-plus/src/routes.ts
import fs18 from "node:fs";
import path17 from "node:path";

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
  const startedAt = Date.now();
  const updateProgress = (patch = {}) => setRefreshProgress(key, endpointKey, patch);
  if (inflight.has(key)) {
    return await inflight.get(key);
  }
  const promise = (async () => {
    stats.refreshes++;
    updateProgress({ phase: "starting", reason, startedAt, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null });
    const signature = endpoint.getSignature(ctx);
    let result = null;
    if (typeof endpoint.fetchForCache === "function") {
      result = await endpoint.fetchForCache(ctx, config, { onProgress: updateProgress, startedAt, reason });
    }
    if (!result) result = await fetchOriginal(ctx, endpoint, { onProgress: updateProgress });
    if (result.ok && result.status >= 200 && result.status < 300) {
      const now = Date.now();
      updateProgress({ phase: "transforming", status: result.status, bytesReceived: result.bytesReceived ?? Buffer.byteLength(result.bodyText || "", "utf8"), totalBytes: result.totalBytes ?? null, etaMs: 0 });
      const transformed = result.transform ? { bodyText: result.bodyText, ...result.transform } : endpoint.transformBodyForCache ? endpoint.transformBodyForCache(ctx, result.bodyText, config) : defaultTransformBodyForCache(result.bodyText);
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
          error: transformed.error,
          direct: transformed.direct,
          errors: transformed.errors
        },
        hitCount: 0,
        staleHitCount: 0,
        lastError: null
      };
      memoryCache.set(key, entry);
      writeDiskEntry(ctx, endpointKey, entry);
      updateProgress({ phase: "cached", status: result.status, bytesReceived: result.bytesReceived ?? Buffer.byteLength(result.bodyText || "", "utf8"), totalBytes: result.totalBytes ?? null, percent: result.totalBytes ? 100 : null, etaMs: 0, error: null });
      scheduleClearRefreshProgress(key);
      return { result, entry, cached: true };
    }
    updateProgress({ phase: "error", status: result.status, bytesReceived: result.bytesReceived ?? Buffer.byteLength(result.bodyText || "", "utf8"), totalBytes: result.totalBytes ?? null, error: `HTTP ${result.status || 0}` });
    scheduleClearRefreshProgress(key);
    return { result, entry: null, cached: false };
  })().catch((error) => {
    stats.errors++;
    stats.lastError = error instanceof Error ? error.message : String(error);
    updateProgress({ phase: "error", error: stats.lastError, status: null });
    scheduleClearRefreshProgress(key);
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
    if (config.staleWhileRevalidate && (signatureMatches || endpoint.staleOnSignatureChange)) {
      stats.staleHits++;
      entry.staleHitCount = Number(entry.staleHitCount || 0) + 1;
      memoryCache.set(cacheKey, entry);
      const state = signatureMatches ? "STALE" : "STALE-SIGNATURE";
      const reason = signatureMatches ? "max-stale-expired" : "signature-changed";
      void refreshEntry(ctx, endpointKey, reason).catch(() => {
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
  const asyncMiss = !entry ? endpoint.makeAsyncMiss?.(ctx, signature, config) : null;
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
import fs11 from "node:fs";
import path10 from "node:path";
function makeFastRoutesLiteral2() {
  return ENDPOINT_LIST.map((endpoint) => `  [${JSON.stringify(endpoint.originalPath)}, { path: PREFIX + ${JSON.stringify(endpoint.fastPath)}, method: ${JSON.stringify(endpoint.method)} }]`).join(",\n");
}
function makeTemplatePreloadList2() {
  const fallback = ["help.html", "hotkeys.html", "formatting.html", "welcome.html", "welcomePrompt.html", "assistantNote.html"];
  try {
    const dir = path10.join(getServerRoot(), "public", "scripts", "templates");
    const names = fs11.readdirSync(dir).filter((name) => name.endsWith(".html")).sort((a, b) => a.localeCompare(b));
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

// server-plugins/cocktail-plus/src/endpoints/characters-edit.ts
import fs12 from "node:fs";
import path11 from "node:path";
var JSON_CONTENT_TYPE3 = "application/json; charset=utf-8";
var characterEditEndpoint = {
  key: "character-edit",
  aliases: ["character-edit", "/api/characters/edit"],
  originalPath: "/api/characters/edit",
  fastPath: "/fast/characters-edit",
  configKey: "cacheCharactersAll",
  method: "POST"
};
function extractPngTextChunks2(buffer) {
  const chunks = [];
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return chunks;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (dataEnd > buffer.length || nextOffset > buffer.length) break;
    if (type === "tEXt") {
      const separator = buffer.indexOf(0, dataStart);
      if (separator >= dataStart && separator < dataEnd) {
        const keyword = buffer.toString("latin1", dataStart, separator).toLowerCase();
        if (keyword === "chara" || keyword === "ccv3") chunks.push({ keyword, text: buffer.toString("latin1", separator + 1, dataEnd) });
      }
    }
    if (type === "IEND") break;
    offset = nextOffset;
  }
  return chunks;
}
async function readCharacterRawJson(directories, avatar) {
  const filePath = path11.join(directories.characters, path11.basename(avatar));
  const buffer = await fs12.promises.readFile(filePath);
  const chunks = extractPngTextChunks2(buffer);
  const selected = chunks.find((c) => c.keyword === "ccv3") || chunks.find((c) => c.keyword === "chara");
  if (!selected) throw new Error("No character metadata found");
  return Buffer.from(selected.text, "base64").toString("utf8");
}
function asTagsString(value) {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : "";
}
function deriveEditFields(raw, meta = {}) {
  const data = raw?.data && typeof raw.data === "object" ? raw.data : {};
  const extensions = data.extensions && typeof data.extensions === "object" ? data.extensions : {};
  const depth = extensions.depth_prompt && typeof extensions.depth_prompt === "object" ? extensions.depth_prompt : {};
  return {
    avatar_url: meta.avatar_url || raw?.avatar || "",
    ch_name: data.name ?? raw?.name ?? "",
    description: data.description ?? raw?.description ?? "",
    personality: data.personality ?? raw?.personality ?? "",
    scenario: data.scenario ?? raw?.scenario ?? "",
    first_mes: data.first_mes ?? raw?.first_mes ?? "",
    mes_example: data.mes_example ?? raw?.mes_example ?? "",
    creator_notes: data.creator_notes ?? raw?.creatorcomment ?? "",
    system_prompt: data.system_prompt ?? "",
    post_history_instructions: data.post_history_instructions ?? "",
    tags: asTagsString(data.tags ?? raw?.tags),
    creator: data.creator ?? raw?.creator ?? "",
    character_version: data.character_version ?? raw?.character_version ?? "",
    alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.slice() : [],
    talkativeness: String(extensions.talkativeness ?? raw?.talkativeness ?? 0.5),
    fav: String(Boolean(extensions.fav ?? raw?.fav)),
    world: extensions.world ?? "",
    depth_prompt_prompt: depth.prompt ?? raw?.depth_prompt_prompt ?? "",
    depth_prompt_depth: String(depth.depth ?? raw?.depth_prompt_depth ?? 4),
    depth_prompt_role: depth.role ?? raw?.depth_prompt_role ?? "system",
    chat: meta.chat ?? raw?.chat ?? "",
    create_date: meta.create_date ?? raw?.create_date ?? "",
    extensions: meta.extensions ?? ""
  };
}
function applyStringPatch(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  if (patch.type === "set") return String(patch.value ?? "");
  if (patch.type === "splice") {
    const start = Math.max(0, Number(patch.start) || 0);
    const deleteCount = Math.max(0, Number(patch.deleteCount) || 0);
    const insert = String(patch.insert ?? "");
    const source = String(base ?? "");
    return source.slice(0, start) + insert + source.slice(start + deleteCount);
  }
  return base;
}
function applyPayload(baseFields, payload) {
  const out = { ...baseFields };
  const fields = payload.fields && typeof payload.fields === "object" ? payload.fields : {};
  for (const [key, value] of Object.entries(fields)) out[key] = value;
  const patches = payload.patches && typeof payload.patches === "object" ? payload.patches : {};
  for (const [key, patch] of Object.entries(patches)) out[key] = applyStringPatch(out[key], patch);
  return out;
}
async function handleCharacterEditFast(req, res) {
  try {
    const body = req.body || {};
    const avatar = String(body.avatar_url || "").trim();
    if (!avatar) return res.sendStatus(400);
    const rawJson = await readCharacterRawJson(req.user?.directories || {}, avatar);
    const currentHash = sha256(rawJson);
    if (body.baseHash && body.baseHash !== currentHash) {
      res.setHeader(HEADER_PREFIX, "characters-edit-fast");
      return res.status(409).type(JSON_CONTENT_TYPE3).send(JSON.stringify({ ok: false, stale: true }));
    }
    const raw = JSON.parse(rawJson || "{}");
    const baseFields = deriveEditFields(raw, body.meta || { avatar_url: avatar });
    const nextBody = applyPayload(baseFields, body);
    nextBody.avatar_url = avatar;
    nextBody.json_data = rawJson;
    const ctx = makeRequestContext(req, { bodyOverride: nextBody });
    const result = await fetchOriginal(ctx, characterEditEndpoint);
    res.setHeader(HEADER_PREFIX, "characters-edit-fast");
    res.setHeader(`${HEADER_PREFIX}-characters-edit-mode`, "patch");
    res.setHeader("content-type", result.headers?.["content-type"] || "text/plain; charset=utf-8");
    return res.status(result.status || 200).send(result.bodyText ?? "");
  } catch (error) {
    res.setHeader(HEADER_PREFIX, "characters-edit-fast");
    res.setHeader("content-type", JSON_CONTENT_TYPE3);
    return res.status(500).send(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
}

// server-plugins/cocktail-plus/src/endpoints/characters-get.ts
import fs13 from "node:fs";
import path12 from "node:path";
var JSON_CONTENT_TYPE4 = "application/json; charset=utf-8";
var HISTORY_LIMIT = 3;
var characterGetEndpoint = {
  key: "character-get",
  aliases: ["character-get", "/api/characters/get"],
  originalPath: "/api/characters/get",
  fastPath: "/fast/characters-get",
  configKey: "cacheCharactersAll",
  method: "POST"
};
var characterGetCache = /* @__PURE__ */ new Map();
function getAvatar(req) {
  return String(req.body?.avatar_url || "").trim();
}
function getCacheKey3(ctx, avatar) {
  return `${ctx.userKey}:${avatar}`;
}
function getClientHash(req) {
  const hash = req.body?.cpCharacterGetPatch?.hash;
  return typeof hash === "string" && hash ? hash : "";
}
function getCharacterSignature(req, avatar) {
  try {
    const filePath = path12.join(req.user?.directories?.characters || "", path12.basename(avatar));
    const stat = fs13.statSync(filePath);
    return sha256(stableStringify({ avatar, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) }));
  } catch {
    return "";
  }
}
function rememberHistory(entry, hash, data) {
  if (!entry || !hash || data === void 0) return;
  entry.history = entry.history instanceof Map ? entry.history : /* @__PURE__ */ new Map();
  entry.history.set(hash, data);
  while (entry.history.size > HISTORY_LIMIT) {
    const first = entry.history.keys().next().value;
    entry.history.delete(first);
  }
}
function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function cloneJson3(value) {
  return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
}
function buildPatchOps(base, next, patchPath = [], ops = []) {
  if (ops.length > 2e3) return ops;
  if (sameJson(base, next)) return ops;
  const baseIsObj = base && typeof base === "object";
  const nextIsObj = next && typeof next === "object";
  if (baseIsObj && nextIsObj && !Array.isArray(base) && !Array.isArray(next)) {
    const keys = /* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(next)]);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        ops.push({ op: "delete", path: patchPath.concat([key]) });
      } else if (!Object.prototype.hasOwnProperty.call(base, key)) {
        ops.push({ op: "set", path: patchPath.concat([key]), value: cloneJson3(next[key]) });
      } else {
        buildPatchOps(base[key], next[key], patchPath.concat([key]), ops);
      }
      if (ops.length > 2e3) break;
    }
    return ops;
  }
  if (Array.isArray(base) && Array.isArray(next)) {
    if (base.length === next.length) {
      for (let i = 0; i < next.length; i++) buildPatchOps(base[i], next[i], patchPath.concat([i]), ops);
      return ops;
    }
    ops.push({ op: "set", path: patchPath, value: cloneJson3(next) });
    return ops;
  }
  ops.push({ op: "set", path: patchPath, value: cloneJson3(next) });
  return ops;
}
function makeFullEntry(signature, result) {
  const data = JSON.parse(result.bodyText || "{}");
  const hash = sha256(result.bodyText || "{}");
  return {
    signature,
    hash,
    data,
    bodyText: result.bodyText || "{}",
    status: result.status || 200,
    statusText: result.statusText || "OK",
    headers: result.headers || { "content-type": JSON_CONTENT_TYPE4 },
    createdAt: Date.now(),
    history: /* @__PURE__ */ new Map()
  };
}
function buildDedupBodyText(entry) {
  const full = entry?.data;
  const jsonData = typeof full?.json_data === "string" ? full.json_data : "";
  if (!jsonData) return null;
  try {
    const base = JSON.parse(jsonData);
    if (!base || typeof base !== "object") return null;
    const baseClean = cloneJson3(base);
    const target = cloneJson3(full);
    delete baseClean.json_data;
    delete target.json_data;
    const ops = buildPatchOps(baseClean, target);
    if (ops.length > 2e3) return null;
    const bodyText = JSON.stringify({ mode: "dedup", hash: entry.hash, json_data: jsonData, ops });
    return bodyText.length < entry.bodyText.length ? bodyText : null;
  } catch {
    return null;
  }
}
function sendCharacterGet(res, entry, req, meta = {}) {
  const clientHash = getClientHash(req);
  let mode = "full";
  let bodyText = entry.bodyText;
  if (clientHash && clientHash === entry.hash) {
    mode = "noop";
    bodyText = JSON.stringify({ mode, hash: entry.hash });
  } else if (clientHash && entry.history instanceof Map && entry.history.has(clientHash)) {
    const base = entry.history.get(clientHash);
    const ops = buildPatchOps(base, entry.data);
    if (ops.length === 0) {
      mode = "noop";
      bodyText = JSON.stringify({ mode, hash: entry.hash });
    } else if (ops.length <= 2e3) {
      const patchText = JSON.stringify({ mode: "patch", baseHash: clientHash, nextHash: entry.hash, ops });
      if (patchText.length < entry.bodyText.length) {
        mode = "patch";
        bodyText = patchText;
      }
    }
  }
  if (mode === "full") {
    const dedupText = buildDedupBodyText(entry);
    if (dedupText) {
      mode = "dedup";
      bodyText = dedupText;
    }
  }
  res.setHeader(HEADER_PREFIX, "characters-get-fast");
  res.setHeader(`${HEADER_PREFIX}-character-get-ready`, "1");
  res.setHeader(`${HEADER_PREFIX}-character-get-patch`, mode);
  res.setHeader(`${HEADER_PREFIX}-character-get-hash`, entry.hash);
  res.setHeader(`${HEADER_PREFIX}-character-get-cache`, meta.cache || "");
  res.setHeader("content-type", JSON_CONTENT_TYPE4);
  return res.status(entry.status || 200).send(bodyText);
}
async function handleCharacterGetFast(req, res) {
  try {
    const avatar = getAvatar(req);
    if (!avatar) return res.sendStatus(400);
    const ctx = makeRequestContext(req);
    const cacheKey = getCacheKey3(ctx, avatar);
    const signature = getCharacterSignature(req, avatar);
    const cached = characterGetCache.get(cacheKey);
    if (cached && cached.signature === signature) {
      return sendCharacterGet(res, cached, req, { cache: "HIT" });
    }
    const result = await fetchOriginal(ctx, characterGetEndpoint);
    if (!result.ok) {
      res.setHeader(HEADER_PREFIX, "characters-get-fast");
      res.setHeader("content-type", result.headers?.["content-type"] || JSON_CONTENT_TYPE4);
      return res.status(result.status || 500).send(result.bodyText || "{}");
    }
    const entry = makeFullEntry(signature, result);
    if (cached?.hash && cached?.data) rememberHistory(entry, cached.hash, cached.data);
    characterGetCache.set(cacheKey, entry);
    return sendCharacterGet(res, entry, req, { cache: cached ? "MISS" : "INIT" });
  } catch (error) {
    res.setHeader(HEADER_PREFIX, "characters-get-fast");
    res.setHeader("content-type", JSON_CONTENT_TYPE4);
    return res.status(500).send(JSON.stringify({ error: true, message: error instanceof Error ? error.message : String(error) }));
  }
}

// server-plugins/cocktail-plus/src/endpoints/recent-chats.ts
import fs14 from "node:fs";
import path13 from "node:path";
import readline from "node:readline";
var JSON_CONTENT_TYPE5 = "application/json; charset=utf-8";
var DEFAULT_DISPLAYED = 3;
var DEFAULT_MAX = 15;
var MAX_LIMIT = 100;
var SYSTEM_AVATAR = "img/five.png";
var RECENT_PATCH_HISTORY_LIMIT = 3;
var recentChatsCache = /* @__PURE__ */ new Map();
function formatBytes(numBytes) {
  const bytes = Math.max(0, Number(numBytes) || 0);
  if (bytes === 0) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 2 : 2)}${units[index]}`;
}
function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function normalizeMax(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_MAX, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX;
  return Math.min(MAX_LIMIT, parsed);
}
function normalizePinned(value) {
  return Array.isArray(value) ? value : [];
}
function normalizePinnedForKey(pinnedChats) {
  return normalizePinned(pinnedChats).map((p) => ({ avatar: p?.avatar || "", group: p?.group || "", file_name: p?.file_name || "" })).sort((a, b) => `${a.group}|${a.avatar}|${a.file_name}`.localeCompare(`${b.group}|${b.avatar}|${b.file_name}`));
}
function getRecentCacheKey(req, max, pinnedChats) {
  const handle = String(req.user?.profile?.handle || req.user?.profile?.name || "default");
  const root = String(req.user?.directories?.root || "");
  return sha256(stableStringify({ root, handle, max, pinned: normalizePinnedForKey(pinnedChats) })).slice(0, 32);
}
function getClientPatchHash(req) {
  const hash = req.body?.cpRecentPatch?.hash;
  return typeof hash === "string" && hash ? hash : "";
}
function sameJson2(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function buildRecentPatch(base, next) {
  if (!Array.isArray(base) || !Array.isArray(next)) return null;
  if (sameJson2(base, next)) return [];
  const ops = [];
  if (base.length === next.length) {
    for (let i = 0; i < next.length; i++) {
      if (!sameJson2(base[i], next[i])) ops.push({ op: "set", index: i, value: next[i] });
    }
    return ops;
  }
  const min = Math.min(base.length, next.length);
  let prefix = 0;
  while (prefix < min && sameJson2(base[prefix], next[prefix])) prefix++;
  let suffix = 0;
  while (suffix < min - prefix && sameJson2(base[base.length - 1 - suffix], next[next.length - 1 - suffix])) suffix++;
  ops.push({
    op: "splice",
    index: prefix,
    deleteCount: Math.max(0, base.length - prefix - suffix),
    items: next.slice(prefix, next.length - suffix)
  });
  return ops;
}
function rememberRecentHistory(entry, hash, data) {
  if (!entry || !hash || !Array.isArray(data)) return;
  entry.history = entry.history instanceof Map ? entry.history : /* @__PURE__ */ new Map();
  entry.history.set(hash, data);
  while (entry.history.size > RECENT_PATCH_HISTORY_LIMIT) {
    const first = entry.history.keys().next().value;
    entry.history.delete(first);
  }
}
function sendRecentPayload(req, res, entry, meta = {}) {
  const clientHash = getClientPatchHash(req);
  let mode = "full";
  let bodyText = entry.bodyText;
  if (clientHash && clientHash === entry.hash) {
    mode = "noop";
    bodyText = JSON.stringify({ mode, hash: entry.hash });
  } else if (clientHash && entry.history instanceof Map && entry.history.has(clientHash)) {
    const base = entry.history.get(clientHash);
    const ops = buildRecentPatch(base, entry.data);
    if (ops && ops.length === 0) {
      mode = "noop";
      bodyText = JSON.stringify({ mode, hash: entry.hash });
    } else if (ops) {
      const patchText = JSON.stringify({ mode: "patch", baseHash: clientHash, nextHash: entry.hash, ops });
      if (patchText.length < entry.bodyText.length) {
        mode = "patch";
        bodyText = patchText;
      }
    }
  }
  res.setHeader(HEADER_PREFIX, "recent-chats-fast");
  res.setHeader(`${HEADER_PREFIX}-recent-ready`, "1");
  res.setHeader(`${HEADER_PREFIX}-recent-patch`, mode);
  res.setHeader(`${HEADER_PREFIX}-recent-hash`, entry.hash);
  res.setHeader(`${HEADER_PREFIX}-recent-candidates`, String(meta.candidates ?? ""));
  res.setHeader(`${HEADER_PREFIX}-recent-read`, String(meta.read ?? ""));
  res.setHeader(`${HEADER_PREFIX}-recent-cache`, meta.cache || "");
  res.setHeader(`${HEADER_PREFIX}-recent-ms`, String(meta.ms ?? ""));
  res.setHeader("content-type", JSON_CONTENT_TYPE5);
  return res.status(200).send(bodyText);
}
async function statEntityForSignature(ctx, chatFile) {
  try {
    if (chatFile.pngFile && ctx.directories?.characters) {
      const stat = await safeStat(path13.join(ctx.directories.characters, chatFile.pngFile));
      return { avatar: chatFile.pngFile, size: stat?.size || 0, mtime: Math.round(stat?.mtimeMs || 0) };
    }
    if (chatFile.groupId) {
      const group = ctx.groupInfoMap?.get(chatFile.groupId) || {};
      return { group: chatFile.groupId, name: group.name || "", chats: group.chats || [], members: group.members || [], disabled_members: group.disabled_members || [], avatar_url: group.avatar_url || "" };
    }
  } catch {
  }
  return null;
}
async function buildRecentSignature(ctx, selectedFiles, max, pinnedChats) {
  const files = [];
  for (const file of selectedFiles) {
    files.push({
      filePath: file.filePath,
      pngFile: file.pngFile || "",
      groupId: file.groupId || "",
      mtime: Math.round(file.mtime || 0),
      size: file.size || 0,
      entity: await statEntityForSignature(ctx, file)
    });
  }
  return sha256(stableStringify({ max, pinned: normalizePinnedForKey(pinnedChats), files }));
}
function isPinnedChat(chatFile, pinnedChats) {
  const base = path13.basename(chatFile.filePath);
  return pinnedChats.some((p) => p && p.file_name === base && (p.avatar === chatFile.pngFile || p.group === chatFile.groupId));
}
function getThumbnailUrl(type, file) {
  return `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`;
}
function formatDateShort(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleDateString();
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
function formatDateLong(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString();
  } catch {
    return date.toISOString();
  }
}
async function safeStat(filePath) {
  try {
    const stat = await fs14.promises.stat(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}
async function listJsonlFiles(directory) {
  try {
    const entries = await fs14.promises.readdir(directory, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && path13.extname(e.name).toLowerCase() === ".jsonl").map((e) => e.name);
  } catch {
    return [];
  }
}
async function collectCharacterChatFiles(ctx, allChatFiles) {
  const charactersDir = ctx.directories?.characters;
  const chatsRoot = ctx.directories?.chats;
  if (!charactersDir || !chatsRoot) return;
  let entries = [];
  try {
    entries = await fs14.promises.readdir(charactersDir, { withFileTypes: true });
  } catch {
    return;
  }
  const pngFiles = entries.filter((e) => e.isFile() && path13.extname(e.name).toLowerCase() === ".png").map((e) => e.name);
  await Promise.all(pngFiles.map(async (pngFile) => {
    const chatsDirectory = pngFile.replace(/\.png$/i, "");
    const pathToChats = path13.join(chatsRoot, chatsDirectory);
    let dirStat = null;
    try {
      dirStat = await fs14.promises.stat(pathToChats);
    } catch {
      return;
    }
    if (!dirStat.isDirectory()) return;
    const jsonlFiles = await listJsonlFiles(pathToChats);
    await Promise.all(jsonlFiles.map(async (file) => {
      const filePath = path13.join(pathToChats, file);
      const stat = await safeStat(filePath);
      if (stat) allChatFiles.push({ pngFile, filePath, mtime: stat.mtimeMs, size: stat.size });
    }));
  }));
}
async function collectGroupChatFiles(ctx, allChatFiles, groupInfoMap) {
  const groupsDir = ctx.directories?.groups;
  const groupChatsDir = ctx.directories?.groupChats;
  if (!groupsDir || !groupChatsDir) return;
  let entries = [];
  try {
    entries = await fs14.promises.readdir(groupsDir, { withFileTypes: true });
  } catch {
    return;
  }
  const groupFiles = entries.filter((e) => e.isFile() && path13.extname(e.name).toLowerCase() === ".json").map((e) => e.name);
  await Promise.all(groupFiles.map(async (groupFile) => {
    try {
      const groupPath = path13.join(groupsDir, groupFile);
      const groupData = JSON.parse(await fs14.promises.readFile(groupPath, "utf8"));
      if (!groupData?.id) return;
      groupInfoMap.set(groupData.id, {
        id: groupData.id,
        name: groupData.name || path13.parse(groupFile).name,
        avatar_url: groupData.avatar_url || "",
        chats: Array.isArray(groupData.chats) ? groupData.chats.slice() : [],
        members: Array.isArray(groupData.members) ? groupData.members.slice() : [],
        disabled_members: Array.isArray(groupData.disabled_members) ? groupData.disabled_members.slice() : []
      });
      if (!Array.isArray(groupData.chats)) return;
      await Promise.all(groupData.chats.map(async (chat) => {
        const filePath = path13.join(groupChatsDir, `${chat}.jsonl`);
        const stat = await safeStat(filePath);
        if (stat) allChatFiles.push({ groupId: groupData.id, filePath, mtime: stat.mtimeMs, size: stat.size });
      }));
    } catch {
    }
  }));
}
async function collectRootChatFiles(ctx, allChatFiles) {
  const chatsRoot = ctx.directories?.chats;
  if (!chatsRoot) return;
  let entries = [];
  try {
    entries = await fs14.promises.readdir(chatsRoot, { withFileTypes: true });
  } catch {
    return;
  }
  const rootJsonlFiles = entries.filter((e) => e.isFile() && path13.extname(e.name).toLowerCase() === ".jsonl").map((e) => e.name);
  await Promise.all(rootJsonlFiles.map(async (file) => {
    const filePath = path13.join(chatsRoot, file);
    const stat = await safeStat(filePath);
    if (stat) allChatFiles.push({ filePath, mtime: stat.mtimeMs, size: stat.size });
  }));
}
async function getChatInfoFast(chatFile) {
  const parsedPath = path13.parse(chatFile.filePath);
  const stat = await safeStat(chatFile.filePath);
  if (!stat) return null;
  const chatData = {
    match: true,
    file_id: parsedPath.name,
    file_name: parsedPath.base,
    file_size: formatBytes(stat.size),
    chat_items: 0,
    mes: "[The chat is empty]",
    last_mes: stat.mtimeMs,
    avatar: chatFile.pngFile,
    group: chatFile.groupId
  };
  if (stat.size === 0) return chatData;
  return await new Promise((resolve) => {
    const fileStream = fs14.createReadStream(chatFile.filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let lastLine = "";
    let itemCounter = 0;
    let resolved = false;
    const done = (value) => {
      if (resolved) return;
      resolved = true;
      try {
        rl.close();
      } catch {
      }
      try {
        fileStream.destroy();
      } catch {
      }
      resolve(value);
    };
    fileStream.on("error", () => done(null));
    rl.on("line", (line) => {
      itemCounter++;
      lastLine = line;
    });
    rl.on("close", () => {
      if (!lastLine) return done(chatData);
      const jsonData = tryParseJson(lastLine);
      if (!jsonData || !(jsonData.name || jsonData.character_name || jsonData.chat_metadata)) return done(null);
      chatData.chat_items = Math.max(0, itemCounter - 1);
      chatData.mes = jsonData.mes || "[The message is empty]";
      chatData.last_mes = jsonData.send_date || new Date(Math.round(stat.mtimeMs)).toISOString();
      done(chatData);
    });
  });
}
function extractPngTextChunks3(buffer) {
  const chunks = [];
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return chunks;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (dataEnd > buffer.length || nextOffset > buffer.length) break;
    if (type === "tEXt") {
      const separator = buffer.indexOf(0, dataStart);
      if (separator >= dataStart && separator < dataEnd) {
        const keyword = buffer.toString("latin1", dataStart, separator).toLowerCase();
        if (keyword === "chara" || keyword === "ccv3") {
          chunks.push({ keyword, text: buffer.toString("latin1", separator + 1, dataEnd) });
        }
      }
    }
    if (type === "IEND") break;
    offset = nextOffset;
  }
  return chunks;
}
async function readCharacterName(ctx, avatarFile) {
  if (!avatarFile) return "";
  try {
    const filePath = path13.join(ctx.directories.characters, avatarFile);
    const buffer = await fs14.promises.readFile(filePath);
    const chunks = extractPngTextChunks3(buffer);
    const selected = chunks.find((c) => c.keyword === "ccv3") || chunks.find((c) => c.keyword === "chara");
    if (!selected) return path13.basename(avatarFile, path13.extname(avatarFile));
    const raw = JSON.parse(Buffer.from(selected.text, "base64").toString("utf8"));
    return raw?.data?.name || raw?.name || path13.basename(avatarFile, path13.extname(avatarFile));
  } catch {
    return path13.basename(avatarFile, path13.extname(avatarFile));
  }
}
async function enrichRecentChat(ctx, chatInfo, chatFile, index, pinned) {
  const isGroup = !!chatFile.groupId;
  const groupInfo = isGroup ? ctx.groupInfoMap?.get(chatFile.groupId) || {} : null;
  const charName = isGroup ? groupInfo?.name || chatFile.groupId || "" : await readCharacterName(ctx, chatFile.pngFile);
  const lastMes = chatInfo.last_mes || chatFile.mtime;
  const fileName = chatInfo.file_name || path13.basename(chatFile.filePath);
  const avatar = chatInfo.avatar || chatFile.pngFile || "";
  const group = chatInfo.group || chatFile.groupId || "";
  return {
    ...chatInfo,
    file_name: fileName,
    chat_name: fileName.replace(/\.jsonl$/i, ""),
    char_name: charName,
    date_short: formatDateShort(lastMes),
    date_long: formatDateLong(lastMes),
    char_thumbnail: isGroup ? SYSTEM_AVATAR : avatar ? getThumbnailUrl("avatar", avatar) : SYSTEM_AVATAR,
    is_group: isGroup,
    group_chats: isGroup ? Array.isArray(groupInfo?.chats) ? groupInfo.chats : [] : void 0,
    group_members: isGroup ? Array.isArray(groupInfo?.members) ? groupInfo.members : [] : void 0,
    group_disabled_members: isGroup ? Array.isArray(groupInfo?.disabled_members) ? groupInfo.disabled_members : [] : void 0,
    group_avatar_url: isGroup ? groupInfo?.avatar_url || "" : void 0,
    hidden: index >= DEFAULT_DISPLAYED,
    avatar,
    group,
    pinned
  };
}
async function handleRecentChatsFast(req, res) {
  const startedAt = Date.now();
  try {
    const ctx = { directories: req.user?.directories || {}, groupInfoMap: /* @__PURE__ */ new Map() };
    const pinnedChats = normalizePinned(req.body?.pinned);
    const max = normalizeMax(req.body?.max) + pinnedChats.length;
    const cacheKey = getRecentCacheKey(req, max, pinnedChats);
    const allChatFiles = [];
    await Promise.allSettled([
      collectCharacterChatFiles(ctx, allChatFiles),
      collectGroupChatFiles(ctx, allChatFiles, ctx.groupInfoMap),
      collectRootChatFiles(ctx, allChatFiles)
    ]);
    const selectedFiles = allChatFiles.sort((a, b) => {
      const aPinned = isPinnedChat(a, pinnedChats);
      const bPinned = isPinnedChat(b, pinnedChats);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return b.mtime - a.mtime;
    }).slice(0, max);
    const signature = await buildRecentSignature(ctx, selectedFiles, max, pinnedChats);
    const cached = recentChatsCache.get(cacheKey);
    if (cached && cached.signature === signature) {
      return sendRecentPayload(req, res, cached, { candidates: allChatFiles.length, read: 0, cache: "HIT", ms: Date.now() - startedAt });
    }
    const rows = [];
    for (const chatFile of selectedFiles) {
      const chatInfo = await getChatInfoFast(chatFile);
      if (!chatInfo?.file_name) continue;
      rows.push({ chatFile, chatInfo, pinned: isPinnedChat(chatFile, pinnedChats) });
    }
    const valid = [];
    for (let index = 0; index < rows.length; index++) {
      valid.push(await enrichRecentChat(ctx, rows[index].chatInfo, rows[index].chatFile, index, rows[index].pinned));
    }
    const bodyText = JSON.stringify(valid);
    const hash = sha256(bodyText);
    const history = cached?.history instanceof Map ? cached.history : /* @__PURE__ */ new Map();
    if (cached?.hash && Array.isArray(cached?.data)) rememberRecentHistory({ history }, cached.hash, cached.data);
    const entry = {
      signature,
      data: valid,
      bodyText,
      hash,
      history,
      createdAt: Date.now()
    };
    recentChatsCache.set(cacheKey, entry);
    return sendRecentPayload(req, res, entry, { candidates: allChatFiles.length, read: selectedFiles.length, cache: cached ? "MISS" : "INIT", ms: Date.now() - startedAt });
  } catch (error) {
    res.setHeader(HEADER_PREFIX, "recent-chats-fast");
    res.setHeader("content-type", JSON_CONTENT_TYPE5);
    return res.status(500).send(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
}

// server-plugins/cocktail-plus/src/module-proxy.ts
import crypto2 from "node:crypto";
import fs15 from "node:fs";
import path14 from "node:path";
var TARGET_PROXY_MODULE_PATHS = /* @__PURE__ */ new Set(["/script.js", "/scripts/i18n.js", "/scripts/system-messages.js", "/scripts/extensions.js", "/scripts/welcome-screen.js"]);
function getPublicRoot() {
  return path14.join(getServerRoot(), "public");
}
function normalizePublicPath(value) {
  const publicRoot = getPublicRoot();
  let raw = String(value || "").split("?")[0].split("#")[0];
  if (!raw.startsWith("/")) raw = `/${raw}`;
  raw = decodeURIComponent(raw);
  if (!raw.endsWith(".js")) throw new Error("Only JavaScript modules can be proxied");
  if (raw.includes("\0")) throw new Error("Invalid module path");
  const fullPath = path14.resolve(publicRoot, `.${raw}`);
  if (!fullPath.startsWith(publicRoot + path14.sep) && fullPath !== publicRoot) {
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
  const baseDir = path14.posix.dirname(currentPublicPath);
  const resolved = specifier.startsWith("/") ? path14.posix.normalize(withoutQuery) : path14.posix.normalize(path14.posix.join(baseDir, withoutQuery));
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
      `${indent}const cpExistingWelcomePanel = document.querySelector('#chat .welcomePanel');`,
      `${indent}globalThis.__cocktailPlusEarlyBridge?.startRecentChatsProgress?.();`,
      `${indent}const recentChatsPromise = getRecentChats();`,
      `${indent}if (currentChatId === undefined && force && !cpExistingWelcomePanel) {`,
      `${indent}    console.debug('Forcing welcome screen open.');`,
      `${indent}    chat.splice(0, chat.length);`,
      `${indent}    $('#chat').empty();`,
      `${indent}}`,
      `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.skeleton-before');`,
      `${indent}if (!cpExistingWelcomePanel) {`,
      `${indent}await sendWelcomePanel([], expand);`,
      `${indent}}`,
      `${indent}globalThis.__cocktailPlusEarlyBridge?.updateRecentChatsProgress?.({ phase: 'requesting', message: '\u7B49\u5F85 /recent \u8FD4\u56DE\u6700\u8FD1\u6D88\u606F\u2026' });`,
      `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.skeleton-after');`,
      `${indent}void recentChatsPromise.then(async (recentChats) => {`,
      `${indent}    let cpRecentChats = recentChats;`,
      `${indent}    const chatAfterFetch = getCurrentChatId();`,
      `${indent}    if (chatAfterFetch !== currentChatId) {`,
      `${indent}        console.debug('Chat changed while fetching recent chats.');`,
      `${indent}        globalThis.__cocktailPlusEarlyBridge?.finishRecentChatsProgress?.('cancelled', 0);`,
      `${indent}        return;`,
      `${indent}    }`,
      `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.recent-before');`,
      `${indent}    await sendWelcomePanel(cpRecentChats, expand);`,
      `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.recent-after');`,
      `${indent}    globalThis.__cocktailPlusEarlyBridge?.finishRecentChatsProgress?.('rendered');`,
      `${indent}}).catch(error => {`,
      `${indent}    globalThis.__cocktailPlusEarlyBridge?.failRecentChatsProgress?.(error);`,
      `${indent}    console.error('Welcome recent chats error:', error);`,
      `${indent}});`,
      `${indent}if (!cpExistingWelcomePanel) {`,
      `${indent}void (async () => {`,
      `${indent}    await unshallowPermanentAssistant();`,
      `${indent}    sendAssistantMessage();`,
      `${indent}    sendWelcomePrompt();`,
      `${indent}})().catch(error => console.error('Welcome assistant error:', error));`,
      `${indent}}`
    ].join("\n")
  );
  out = out.replace(
    /([ \t]*)const\s+data\s*=\s*await\s+response\.json\(\)\s*;\s*\r?\n/,
    (_match, indent) => [
      `${indent}const data = await response.json();`,
      `${indent}if (response.headers?.get?.('x-cocktail-plus-recent-ready') === '1') {`,
      `${indent}    globalThis.__cocktailPlusEarlyBridge && (globalThis.__cocktailPlusEarlyBridge.recentChatsData = Array.isArray(data) ? data : []);`,
      `${indent}    return Array.isArray(data) ? data : [];`,
      `${indent}}`
    ].join("\n") + "\n"
  );
  if (!out.includes("function cpEnsureRecentCharacterEntity")) {
    out = out.replace(
      /(\/\*\*\s*\r?\n\s*\* Opens a recent character chat\.)/,
      `function cpRecentChatElement(match) {
    try {
        return Array.from(document.querySelectorAll('.recentChat')).find(el => {
            if (!el || typeof el.getAttribute !== 'function') return false;
            if (match.avatarId && el.getAttribute('data-avatar') === match.avatarId) return true;
            if (match.groupId && el.getAttribute('data-group') === match.groupId) return true;
            return false;
        }) || null;
    } catch (_) {
        return null;
    }
}

function cpRecentDisplayName(match, fallback) {
    const element = cpRecentChatElement(match);
    const name = element?.querySelector?.('.characterName')?.textContent?.trim();
    const row = cpRecentData(match);
    return name || row?.char_name || fallback || '';
}

function cpRecentData(match) {
    const rows = globalThis.__cocktailPlusEarlyBridge?.recentChatsData;
    if (!Array.isArray(rows)) return null;
    return rows.find(row => {
        if (!row) return false;
        if (match.avatarId && row.avatar === match.avatarId && (!match.fileName || row.chat_name === match.fileName || row.file_name === match.fileName + '.jsonl')) return true;
        if (match.groupId && row.group === match.groupId && (!match.fileName || row.chat_name === match.fileName || row.file_name === match.fileName + '.jsonl')) return true;
        return false;
    }) || null;
}

function cpEnsureRecentCharacterEntity(avatarId, fileName) {
    let characterId = characters.findIndex(x => x.avatar === avatarId);
    if (characterId === -1 && avatarId) {
        const name = cpRecentDisplayName({ avatarId, fileName }, String(avatarId).replace(/\\.png$/i, ''));
        characters.push({
            shallow: true,
            name,
            avatar: avatarId,
            chat: fileName,
            fav: false,
            tags: [],
            data: { name, tags: [], extensions: { fav: false } },
        });
        characterId = characters.length - 1;
    }
    if (characterId !== -1 && fileName) characters[characterId].chat = fileName;
    return characterId;
}

function cpEnsureRecentGroupEntity(groupId, fileName) {
    let group = groups.find(x => x.id === groupId);
    if (!group && groupId) {
        const row = cpRecentData({ groupId, fileName });
        const chats = Array.isArray(row?.group_chats) && row.group_chats.length ? row.group_chats.slice() : (fileName ? [fileName] : []);
        group = { id: groupId, name: cpRecentDisplayName({ groupId, fileName }, groupId), chat_id: fileName || row?.chat_name || '', chats, members: Array.isArray(row?.group_members) ? row.group_members.slice() : [], disabled_members: Array.isArray(row?.group_disabled_members) ? row.group_disabled_members.slice() : [], avatar_url: row?.group_avatar_url || '' };
        groups.push(group);
    }
    if (group && fileName && Array.isArray(group.chats) && !group.chats.includes(fileName)) group.chats.push(fileName);
    if (group && fileName && !group.chat_id) group.chat_id = fileName;
    return group;
}

$1`
    );
  }
  out = out.replaceAll(
    `const characterId = characters.findIndex(x => x.avatar === avatarId);`,
    `const characterId = cpEnsureRecentCharacterEntity(avatarId, fileName);`
  );
  out = out.replaceAll(
    `const group = groups.find(x => x.id === groupId);`,
    `const group = cpEnsureRecentGroupEntity(groupId, typeof fileName !== 'undefined' ? fileName : undefined);`
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
    let source = await fs15.promises.readFile(fullPath, "utf8");
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

// server-plugins/cocktail-plus/src/source-patches.ts
import fs16 from "node:fs";
import path15 from "node:path";
var CHAT_INFO_ENOENT_SENTINEL = "Chat file no longer exists, skipping";
var CHAT_STREAM_ENOENT_SENTINEL = "Chat file disappeared while reading, skipping";
var ORIGINAL_STAT_LINE = `        const stats = await fs.promises.stat(pathToFile);`;
var PATCHED_STAT_BLOCK = `        let stats;
        try {
            stats = await fs.promises.stat(pathToFile);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                console.debug(\`Chat file no longer exists, skipping: \${pathToFile}\`);
                res({});
                return;
            }
            console.warn('Failed to stat chat file:', pathToFile, error);
            res({});
            return;
        }`;
var ORIGINAL_STREAM_BLOCK = `        const fileStream = fs.createReadStream(pathToFile);
        const rl = readline.createInterface({`;
var PATCHED_STREAM_BLOCK = `        const fileStream = fs.createReadStream(pathToFile);
        fileStream.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                console.debug(\`Chat file disappeared while reading, skipping: \${pathToFile}\`);
            } else {
                console.warn('Failed to read chat file:', pathToFile, error);
            }
            res({});
        });
        const rl = readline.createInterface({`;
function getChatsEndpointPath() {
  return path15.join(getServerRoot(), "src", "endpoints", "chats.js");
}
function readChatsSource(filePath) {
  if (!fs16.existsSync(filePath)) return { exists: false, text: "" };
  return { exists: true, text: fs16.readFileSync(filePath, "utf8") };
}
function writeUtf8NoBom(filePath, text) {
  fs16.writeFileSync(filePath, text, { encoding: "utf8" });
}
function replaceOnce(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`${label} pattern not found`);
  return text.replace(search, replacement);
}
function removeStatPatch(text) {
  if (text.includes(PATCHED_STAT_BLOCK)) {
    return text.replace(PATCHED_STAT_BLOCK, ORIGINAL_STAT_LINE);
  }
  const statPatchRegex = /        let stats;\r?\n        try \{\r?\n            stats = await fs\.promises\.stat\(pathToFile\);[\s\S]*?\r?\n        \}\r?\n        const hasMatcher = \(typeof matcher === 'function'\);/;
  if (!statPatchRegex.test(text)) return text;
  return text.replace(statPatchRegex, `${ORIGINAL_STAT_LINE}
        const hasMatcher = (typeof matcher === 'function');`);
}
function removeStreamPatch(text) {
  if (text.includes(PATCHED_STREAM_BLOCK)) {
    return text.replace(PATCHED_STREAM_BLOCK, ORIGINAL_STREAM_BLOCK);
  }
  const streamPatchRegex = /        const fileStream = fs\.createReadStream\(pathToFile\);\r?\n        fileStream\.on\('error', \(error\) => \{[\s\S]*?\r?\n        \}\);\r?\n        const rl = readline\.createInterface\(\{/;
  if (!streamPatchRegex.test(text)) return text;
  return text.replace(streamPatchRegex, ORIGINAL_STREAM_BLOCK);
}
function getChatsEnoentPatchStatus() {
  const filePath = getChatsEndpointPath();
  let text = "";
  let exists = false;
  try {
    const source = readChatsSource(filePath);
    exists = source.exists;
    text = source.text;
  } catch (error) {
    return { ok: false, filePath, exists, installed: false, error: error instanceof Error ? error.message : String(error) };
  }
  return {
    ok: true,
    name: "chats-enoent-guard",
    version: VERSION,
    filePath,
    exists,
    installed: !!text && text.includes(CHAT_INFO_ENOENT_SENTINEL),
    streamGuardInstalled: !!text && text.includes(CHAT_STREAM_ENOENT_SENTINEL),
    reversible: true,
    backupRequired: false
  };
}
function applyChatsEnoentPatch() {
  const status = getChatsEnoentPatchStatus();
  if (!status.ok) return { ...status, changed: false, action: "apply" };
  if (!status.exists) return { ...status, ok: false, changed: false, action: "apply", error: "chats.js not found" };
  const filePath = status.filePath;
  let text = fs16.readFileSync(filePath, "utf8");
  const original = text;
  if (!text.includes(CHAT_INFO_ENOENT_SENTINEL)) {
    text = replaceOnce(text, ORIGINAL_STAT_LINE, PATCHED_STAT_BLOCK, "stat");
  }
  if (!text.includes(CHAT_STREAM_ENOENT_SENTINEL)) {
    text = replaceOnce(text, ORIGINAL_STREAM_BLOCK, PATCHED_STREAM_BLOCK, "stream");
  }
  if (text === original) {
    return { ...getChatsEnoentPatchStatus(), changed: false, action: "apply", restartRequired: false };
  }
  writeUtf8NoBom(filePath, text);
  return { ...getChatsEnoentPatchStatus(), changed: true, action: "apply", restartRequired: true };
}
function revertChatsEnoentPatch() {
  const status = getChatsEnoentPatchStatus();
  if (!status.ok) return { ...status, changed: false, action: "revert" };
  if (!status.exists) return { ...status, ok: false, changed: false, action: "revert", error: "chats.js not found" };
  const filePath = status.filePath;
  let text = fs16.readFileSync(filePath, "utf8");
  const original = text;
  text = removeStatPatch(text);
  text = removeStreamPatch(text);
  if (text === original) {
    return { ...getChatsEnoentPatchStatus(), changed: false, action: "revert", restartRequired: false };
  }
  writeUtf8NoBom(filePath, text);
  return { ...getChatsEnoentPatchStatus(), changed: true, action: "revert", restartRequired: true };
}
function autoApplySourcePatches() {
  const results = [];
  try {
    results.push(applyChatsEnoentPatch());
  } catch (error) {
    results.push({ ok: false, name: "chats-enoent-guard", action: "apply", error: error instanceof Error ? error.message : String(error) });
  }
  return results;
}

// server-plugins/cocktail-plus/src/frontend-update.ts
import childProcess from "node:child_process";
import fs17 from "node:fs";
import os from "node:os";
import path16 from "node:path";
var JSON_CONTENT_TYPE6 = "application/json; charset=utf-8";
var FRONTEND_REPOS = Object.freeze([
  "https://github.com/Lianues/cocktail-plus.git",
  "https://gitee.com/lianues/cocktail-plus.git"
]);
var SKIP_NAMES = /* @__PURE__ */ new Set(["node_modules", ".deploy-backups"]);
function stamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}
function sendJson3(res, status, data) {
  res.status(status).type(JSON_CONTENT_TYPE6).send(JSON.stringify(data));
}
function getFrontendExtensionPath(req, isGlobal) {
  const base = isGlobal ? path16.join(getServerRoot(), "public", "scripts", "extensions", "third-party") : req.user?.directories?.extensions;
  if (!base) throw new Error("User extensions directory is not available");
  return path16.join(base, PLUGIN_ID);
}
function readVersionFromManifest(dir) {
  try {
    const raw = fs17.readFileSync(path16.join(dir, "manifest.json"), "utf8");
    const version = String(JSON.parse(raw)?.version || "").trim();
    return version || "";
  } catch {
    return "";
  }
}
function assertFrontendSource(dir) {
  const required = [
    "manifest.json",
    path16.join("dist", "index.js"),
    path16.join("server-plugins", PLUGIN_ID, "index.mjs")
  ];
  for (const rel of required) {
    if (!fs17.existsSync(path16.join(dir, rel))) throw new Error(`Downloaded repository is missing ${rel}`);
  }
}
function runGit(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    childProcess.execFile("git", args, { cwd, windowsHide: true, timeout: 5 * 60 * 1e3 }, (error, stdout, stderr) => {
      if (error) {
        const message = String(stderr || stdout || error.message || error).trim();
        reject(new Error(message || `git ${args.join(" ")} failed`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
async function cloneFrontendSource(tempRoot) {
  let lastError = null;
  for (const repo of FRONTEND_REPOS) {
    const cloneDir = path16.join(tempRoot, "repo");
    try {
      fs17.rmSync(cloneDir, { recursive: true, force: true });
      await runGit(["clone", "--depth", "1", repo, cloneDir]);
      assertFrontendSource(cloneDir);
      return { sourceDir: cloneDir, repo };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed to download cocktail-plus from GitHub/Gitee${lastError ? `: ${lastError.message}` : ""}`);
}
function copyTree(source, destination) {
  const stat = fs17.statSync(source);
  if (stat.isDirectory()) {
    fs17.mkdirSync(destination, { recursive: true });
    for (const entry of fs17.readdirSync(source, { withFileTypes: true })) {
      if (SKIP_NAMES.has(entry.name)) continue;
      copyTree(path16.join(source, entry.name), path16.join(destination, entry.name));
    }
    return;
  }
  fs17.mkdirSync(path16.dirname(destination), { recursive: true });
  fs17.copyFileSync(source, destination);
}
function replaceDirectory(source, target) {
  const parent = path16.dirname(target);
  fs17.mkdirSync(parent, { recursive: true });
  const backupRoot = path16.join(parent, ".cocktail-plus-backups");
  let backupPath = "";
  if (fs17.existsSync(target)) {
    fs17.mkdirSync(backupRoot, { recursive: true });
    backupPath = path16.join(backupRoot, `${PLUGIN_ID}-frontend-${stamp()}`);
    fs17.renameSync(target, backupPath);
  }
  try {
    copyTree(source, target);
  } catch (error) {
    fs17.rmSync(target, { recursive: true, force: true });
    if (backupPath && fs17.existsSync(backupPath) && !fs17.existsSync(target)) {
      fs17.renameSync(backupPath, target);
    }
    throw error;
  }
  return backupPath;
}
async function handleFrontendUpdate(req, res) {
  const tempRoot = fs17.mkdtempSync(path16.join(os.tmpdir(), "cocktail-plus-frontend-update-"));
  try {
    const isGlobal = !!req.body?.global;
    const target = getFrontendExtensionPath(req, isGlobal);
    const beforeVersion = readVersionFromManifest(target);
    const { sourceDir, repo } = await cloneFrontendSource(tempRoot);
    const remoteVersion = readVersionFromManifest(sourceDir);
    const backupPath = replaceDirectory(sourceDir, target);
    return sendJson3(res, 200, {
      ok: true,
      updated: true,
      global: isGlobal,
      repo,
      extensionPath: target,
      backupPath,
      previousVersion: beforeVersion || null,
      version: remoteVersion || null
    });
  } catch (error) {
    return sendJson3(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    try {
      fs17.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
    }
  }
}

// server-plugins/cocktail-plus/src/routes.ts
function sendJson4(res, data) {
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
    sendJson4(res, {
      ok: true,
      plugin: info,
      version: VERSION,
      serviceWorker: { enabled: !!config.serviceWorkerEnabled, url: `${API_PREFIX}/sw.js`, scope: "/" },
      earlyBridge: getEarlyBridgeStatus(),
      paths: {
        cwd: process.cwd(),
        serverRoot: getServerRoot(),
        dataRoot: getDataRoot(),
        pluginDir: PLUGIN_DIR
      },
      sourcePatches: {
        chatsEnoentGuard: getChatsEnoentPatchStatus()
      },
      stats,
      status: getUserStatus(ctx),
      settingsSave: getSettingsSaveStatus(),
      chatSave: getChatSaveStatus(),
      settingsGet: getSettingsGetStatus()
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
  router.get("/helper/:file", async (req, res) => {
    const fileName = String(req.params?.file || "");
    if (!["cocktail-plus-helper.ps1", "cocktail-plus-helper.sh"].includes(fileName)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    const filePath = path17.join(PLUGIN_DIR, "scripts", fileName);
    if (!fs18.existsSync(filePath)) {
      res.status(404).type("text/plain").send("Helper script not found");
      return;
    }
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.type("text/plain; charset=utf-8").send(fs18.readFileSync(filePath, "utf8"));
  });
  router.get("/module", async (req, res) => handleModuleProxy(req, res));
  router.post("/early/status", async (_req, res) => {
    sendJson4(res, { ok: true, status: getEarlyBridgeStatus() });
  });
  router.post("/early/install", async (req, res) => {
    const noBackup = asBoolean(req.body?.noBackup, false);
    const result = installEarlyBridge({ noBackup });
    sendJson4(res, result);
  });
  router.post("/early/uninstall", async (req, res) => {
    const noBackup = asBoolean(req.body?.noBackup, false);
    const result = uninstallEarlyBridge({ noBackup });
    sendJson4(res, result);
  });
  router.post("/source-patches/status", async (_req, res) => {
    sendJson4(res, { ok: true, chatsEnoentGuard: getChatsEnoentPatchStatus() });
  });
  router.post("/update/frontend", async (req, res) => handleFrontendUpdate(req, res));
  router.post("/source-patches/chats-enoent/apply", async (req, res) => {
    const result = applyChatsEnoentPatch();
    sendJson4(res, result);
  });
  router.post("/source-patches/chats-enoent/revert", async (_req, res) => {
    sendJson4(res, revertChatsEnoentPatch());
  });
  registerFastRoutes(router);
  router.post(settingsGetEndpoint.fastPath, async (req, res) => handleSettingsGetFast(req, res));
  router.post(settingsSaveEndpoint.fastPath, async (req, res) => handleSettingsSaveFast(req, res));
  router.post(chatSaveEndpoint.fastPath, async (req, res) => handleChatSaveFast(req, res, chatSaveEndpoint));
  router.post(groupChatSaveEndpoint.fastPath, async (req, res) => handleChatSaveFast(req, res, groupChatSaveEndpoint));
  router.post("/fast/recent-chats", async (req, res) => handleRecentChatsFast(req, res));
  router.post("/fast/characters-get", async (req, res) => handleCharacterGetFast(req, res));
  router.post("/fast/characters-edit", async (req, res) => handleCharacterEditFast(req, res));
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
      sendJson4(res, { ok: true, waited: true, results });
    } else {
      void Promise.all(tasks).catch(() => {
      });
      sendJson4(res, { ok: true, waited: false, endpoints: endpointKeys });
    }
  });
  router.post("/invalidate", async (req, res) => {
    const endpointKeys = parseEndpointList(req.body?.endpoints, []);
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    const removed = invalidateForUser(ctx, endpointKeys);
    sendJson4(res, { ok: true, endpoints: endpointKeys, removed });
  });
  router.post("/status", async (req, res) => {
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    sendJson4(res, { ok: true, stats, status: getUserStatus(ctx), earlyBridge: getEarlyBridgeStatus(), settingsSave: getSettingsSaveStatus(), chatSave: getChatSaveStatus(), settingsGet: getSettingsGetStatus() });
  });
  router.post("/cache/clear", async (req, res) => {
    const endpointKeys = parseEndpointList(req.body?.endpoints, ["characters-all"]);
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    const removed = invalidateForUser(ctx, endpointKeys);
    clearSettingsGetCache();
    sendJson4(res, { ok: true, endpoints: endpointKeys, removed });
  });
}

// server-plugins/cocktail-plus/src/index.ts
async function init(router) {
  if (config.autoPatchChatsEnoentGuard) {
    const patchResults = autoApplySourcePatches();
    for (const result of patchResults) {
      if (result?.changed) {
        console.warn("[cocktail-plus] ST source patch applied; restart SillyTavern to load it:", result);
      } else {
        console.log("[cocktail-plus] ST source patch status:", result);
      }
    }
  }
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
