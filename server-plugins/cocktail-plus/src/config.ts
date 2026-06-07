// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH, PLUGIN_ID } from './constants.js';

export const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    serviceWorkerEnabled: true,
    cacheCharactersAll: true,
    cacheVersion: true,
    staleWhileRevalidate: true,
    maxStaleMs: 10 * 60 * 1000,
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
    settingsSaveMaxPatchOperations: 2000,
    // If the patch request is too close to the full payload size, the browser falls back to the original full save.
    settingsSaveMaxPatchBytesRatio: 0.85,
    // Intercept /api/chats/save and /api/chats/group/save before the whole chat file leaves the browser.
    // The bridge sends either a no-op hash or a chat-array patch to /fast/chats-save.
    optimizeChatSave: true,
    chatSaveNoopEnabled: true,
    chatSavePatchEnabled: true,
    chatSaveMaxPatchOperations: 5000,
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
    autoPatchChatsEnoentGuard: false,
});

function asBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const s = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(s)) return true;
        if (['0', 'false', 'no', 'off'].includes(s)) return false;
    }
    return fallback;
}

function clampInt(value, min, max, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    const i = Math.trunc(n);
    if (i < min) return min;
    if (i > max) return max;
    return i;
}

export function normalizeConfig(input = {}) {
    const out = { ...DEFAULT_CONFIG };
    out.enabled = asBool(input.enabled, DEFAULT_CONFIG.enabled);
    out.serviceWorkerEnabled = asBool(input.serviceWorkerEnabled, DEFAULT_CONFIG.serviceWorkerEnabled);
    out.cacheCharactersAll = asBool(input.cacheCharactersAll, DEFAULT_CONFIG.cacheCharactersAll);
    out.cacheVersion = asBool(input.cacheVersion, DEFAULT_CONFIG.cacheVersion);
    out.staleWhileRevalidate = asBool(input.staleWhileRevalidate, DEFAULT_CONFIG.staleWhileRevalidate);
    out.maxStaleMs = clampInt(input.maxStaleMs, 0, 24 * 60 * 60 * 1000, DEFAULT_CONFIG.maxStaleMs);
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
    out.settingsSaveMaxPatchOperations = clampInt(input.settingsSaveMaxPatchOperations, 1, 100000, DEFAULT_CONFIG.settingsSaveMaxPatchOperations);
    out.settingsSaveMaxPatchBytesRatio = Math.max(0.05, Math.min(2, Number(input.settingsSaveMaxPatchBytesRatio) || DEFAULT_CONFIG.settingsSaveMaxPatchBytesRatio));
    out.optimizeChatSave = asBool(input.optimizeChatSave, DEFAULT_CONFIG.optimizeChatSave);
    out.chatSaveNoopEnabled = asBool(input.chatSaveNoopEnabled, DEFAULT_CONFIG.chatSaveNoopEnabled);
    out.chatSavePatchEnabled = asBool(input.chatSavePatchEnabled, DEFAULT_CONFIG.chatSavePatchEnabled);
    out.chatSaveMaxPatchOperations = clampInt(input.chatSaveMaxPatchOperations, 1, 100000, DEFAULT_CONFIG.chatSaveMaxPatchOperations);
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

export function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return normalizeConfig({});
        return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
    } catch (error) {
        console.warn(`[${PLUGIN_ID}] Failed to read config.json, using defaults:`, error);
        return normalizeConfig({});
    }
}

export function saveConfig(nextConfig) {
    const normalized = normalizeConfig(nextConfig);
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 4), 'utf8');
    config = normalized;
    return config;
}

export function asBoolean(value, fallback = false) {
    return asBool(value, fallback);
}

export let config = loadConfig();
