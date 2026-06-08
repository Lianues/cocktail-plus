const EXTENSION_NAME = "cocktail-plus";
const DISPLAY_NAME = "鸡尾酒+";
const API_PREFIX = "/api/plugins/cocktail-plus";
const HEADER_PREFIX = "x-cocktail-plus";
const SW_MESSAGE_SOURCE = "cocktail-plus-sw";
const ROOT_ID = "cocktail-plus-panel-root";
const DRAWER_ID = "cocktail-plus-drawer";
const EXTENSION_LOADED_FLAG = "__cocktailPlusLoaded";
const FETCH_OBSERVER_FLAG = "__cocktailPlusFetchObserverInstalled";
function getCtx() {
  var _a, _b;
  try {
    return ((_b = (_a = globalThis.SillyTavern) == null ? void 0 : _a.getContext) == null ? void 0 : _b.call(_a)) ?? null;
  } catch {
    return null;
  }
}
function saveSettings() {
  var _a, _b;
  try {
    (_b = (_a = getCtx()) == null ? void 0 : _a.saveSettingsDebounced) == null ? void 0 : _b.call(_a);
  } catch {
  }
}
function getRequestHeaders() {
  const ctx = getCtx();
  const headers = {};
  if (ctx == null ? void 0 : ctx.getRequestHeaders) Object.assign(headers, ctx.getRequestHeaders());
  headers["Content-Type"] = "application/json";
  return headers;
}
function log(_message, _extra) {
}
const DEFAULT_LOCAL_SETTINGS = {
  autoRegisterServiceWorker: true,
  autoWarm: true,
  autoRefreshCharactersAfterAsyncMiss: true,
  autoCheckUpdates: true,
  skippedUpdateVersion: ""
};
const DEFAULT_UPDATE_STATUS = {
  checking: false,
  checked: false,
  frontendCurrentVersion: null,
  frontendLatestVersion: null,
  frontendUpdateAvailable: false,
  backendCurrentVersion: null,
  backendLatestVersion: null,
  backendUpdateAvailable: false,
  currentVersion: null,
  latestVersion: null,
  updateAvailable: false,
  error: null,
  lastCheckedAt: null
};
const state = {
  backend: null,
  update: { ...DEFAULT_UPDATE_STATUS },
  sw: {
    supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    registered: false,
    controlled: false,
    scriptURL: "",
    scope: ""
  },
  busy: false,
  localSettings: { ...DEFAULT_LOCAL_SETTINGS }
};
function getServiceWorkerScriptURL(reg) {
  var _a, _b, _c;
  return ((_a = reg.active) == null ? void 0 : _a.scriptURL) || ((_b = reg.waiting) == null ? void 0 : _b.scriptURL) || ((_c = reg.installing) == null ? void 0 : _c.scriptURL) || "";
}
function isOurRegistration(reg) {
  const scriptURL = getServiceWorkerScriptURL(reg);
  return scriptURL.includes(`${API_PREFIX}/sw.js`);
}
async function refreshServiceWorkerState() {
  var _a;
  state.sw.supported = "serviceWorker" in navigator;
  state.sw.registered = false;
  state.sw.controlled = Boolean((_a = navigator.serviceWorker) == null ? void 0 : _a.controller);
  state.sw.scriptURL = "";
  state.sw.scope = "";
  if (!state.sw.supported) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  const reg = regs.find(isOurRegistration);
  if (reg) {
    state.sw.registered = true;
    state.sw.scriptURL = getServiceWorkerScriptURL(reg);
    state.sw.scope = reg.scope;
  }
}
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("当前浏览器不支持 Service Worker");
  const reg = await navigator.serviceWorker.register(`${API_PREFIX}/sw.js`, { scope: "/" });
  await navigator.serviceWorker.ready.catch(() => void 0);
  await refreshServiceWorkerState();
  log(navigator.serviceWorker.controller ? "Service Worker 已注册并控制当前页面" : "Service Worker 已注册；通常需要刷新一次页面才会接管当前页面", {
    scope: reg.scope
  });
}
async function unregisterServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    if (isOurRegistration(reg)) {
      if (await reg.unregister()) ;
    }
  }
  await refreshServiceWorkerState();
}
async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify(body ?? {}),
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${url} failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
  }
  return await response.json();
}
async function probeBackend() {
  try {
    state.backend = await postJson(`${API_PREFIX}/probe`, {});
    log(`后端插件可用：v${state.backend.version ?? "unknown"}`);
  } catch (error) {
    state.backend = null;
    log("后端插件不可用", error instanceof Error ? error.message : String(error));
  }
}
async function warm(wait = false) {
  await postJson(`${API_PREFIX}/warm`, { endpoints: ["characters-all", "version"], wait });
  await refreshStatus();
}
async function clearCache() {
  await postJson(`${API_PREFIX}/cache/clear`, { endpoints: ["characters-all", "version"] });
  await refreshStatus();
}
async function refreshStatus() {
  await refreshServiceWorkerState();
  if (state.backend) {
    try {
      const status = await postJson(`${API_PREFIX}/status`, {});
      state.backend = { ...state.backend, ...status };
    } catch (error) {
      log("刷新状态失败", error instanceof Error ? error.message : String(error));
    }
  }
}
async function refreshEarlyBridgeStatus() {
  const result = await postJson(`${API_PREFIX}/early/status`, {});
  if (state.backend) state.backend.earlyBridge = result.status;
  log("early bridge 状态已刷新", result.status);
}
async function installEarlyBridge() {
  const result = await postJson(`${API_PREFIX}/early/install`, {});
  if (state.backend && result.status) state.backend.earlyBridge = result.status;
}
async function uninstallEarlyBridge() {
  const result = await postJson(`${API_PREFIX}/early/uninstall`, {});
  if (state.backend && result.status) state.backend.earlyBridge = result.status;
}
async function fullProbe() {
  var _a, _b, _c;
  log("fullProbe.start", { controller: ((_b = (_a = navigator.serviceWorker) == null ? void 0 : _a.controller) == null ? void 0 : _b.scriptURL) || "" });
  await Promise.allSettled([probeBackend(), refreshServiceWorkerState()]);
  log("fullProbe.end", { backendOk: !!((_c = state.backend) == null ? void 0 : _c.ok) });
}
let appReady = false;
let charactersRefreshScheduled = false;
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getEarlyBridge() {
  return globalThis.__cocktailPlusEarlyBridge;
}
function syncEarlyCharacterProgress(row) {
  try {
    const early = getEarlyBridge();
    if (!(early == null ? void 0 : early.updateCharactersLoadProgress)) return;
    if (row == null ? void 0 : row.progress) {
      early.updateCharactersLoadProgress({ cache: "ASYNC-MISS", ...row.progress });
    } else {
      early.updateCharactersLoadProgress({ cache: "ASYNC-MISS", phase: (row == null ? void 0 : row.refreshing) ? "requesting" : "starting" });
    }
  } catch {
  }
}
function markAppReady() {
  appReady = true;
}
async function waitForAppReady() {
  if (appReady) return;
  const ctx = getCtx();
  await new Promise((resolve) => {
    var _a, _b, _c, _d, _e, _f;
    const done = () => {
      appReady = true;
      resolve();
    };
    try {
      (_c = (_a = ctx == null ? void 0 : ctx.eventSource) == null ? void 0 : _a.once) == null ? void 0 : _c.call(_a, (_b = ctx == null ? void 0 : ctx.eventTypes) == null ? void 0 : _b.APP_READY, done);
      (_f = (_d = ctx == null ? void 0 : ctx.eventSource) == null ? void 0 : _d.on) == null ? void 0 : _f.call(_d, (_e = ctx == null ? void 0 : ctx.eventTypes) == null ? void 0 : _e.APP_READY, done);
    } catch {
    }
    setTimeout(done, 15e3);
  });
}
async function waitForCharactersCacheReady(maxMs = 6e4) {
  var _a, _b, _c;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const status = await postJson(`${API_PREFIX}/status`, {});
      state.backend = { ...state.backend || { ok: true }, ...status };
      const row = (_a = status.status) == null ? void 0 : _a.find((x) => x.endpointKey === "characters-all");
      syncEarlyCharacterProgress(row);
      if ((row == null ? void 0 : row.entry) && !row.refreshing) {
        try {
          (_c = (_b = getEarlyBridge()) == null ? void 0 : _b.finishCharactersLoadProgress) == null ? void 0 : _c.call(_b, "cached", 1200);
        } catch {
        }
        log("characters cache ready for async refresh", row.entry);
        return true;
      }
      log("characters cache not ready yet", { refreshing: row == null ? void 0 : row.refreshing, hasEntry: !!(row == null ? void 0 : row.entry) });
    } catch (error) {
      log("poll characters cache failed", error instanceof Error ? error.message : String(error));
    }
    await delay(700);
  }
  return false;
}
async function reloadCharactersFromCore() {
  const scriptModuleUrl = "/script.js";
  const mod = await import(
    /* @vite-ignore */
    scriptModuleUrl
  );
  if (typeof (mod == null ? void 0 : mod.getCharacters) !== "function") throw new Error("/script.js getCharacters export not found");
  await mod.getCharacters();
}
function scheduleCharactersRefreshAfterAsyncMiss(source) {
  if (!state.localSettings.autoRefreshCharactersAfterAsyncMiss) {
    return;
  }
  if (charactersRefreshScheduled) return;
  charactersRefreshScheduled = true;
  void (async () => {
    await waitForAppReady();
    const ready = await waitForCharactersCacheReady();
    if (!ready) {
      charactersRefreshScheduled = false;
      return;
    }
    await reloadCharactersFromCore();
    charactersRefreshScheduled = false;
  })().catch((error) => {
    charactersRefreshScheduled = false;
    log("characters async refresh failed", error instanceof Error ? error.message : String(error));
  });
}
async function readRequestBodyText(input, init2) {
  try {
    const body = init2 == null ? void 0 : init2.body;
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof Blob) return await body.text();
    if (input instanceof Request) return await input.clone().text();
  } catch {
  }
  return "";
}
function isCocktailPlusExtensionUpdate(body) {
  const name = String((body == null ? void 0 : body.extensionName) || "").replace(/^\//, "").trim();
  return name === EXTENSION_NAME;
}
async function maybeHandleCocktailPlusNativeUpdate(baseFetch, input, init2, pathname, method) {
  if (pathname !== "/api/extensions/update" || method !== "POST") return null;
  try {
    const bodyText = await readRequestBodyText(input, init2);
    const body = bodyText ? JSON.parse(bodyText) : {};
    if (!isCocktailPlusExtensionUpdate(body)) return null;
    const response = await baseFetch(`${API_PREFIX}/update/frontend`, {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify({ extensionName: `/${EXTENSION_NAME}`, global: !!body.global }),
      cache: "no-store"
    });
    log("native cocktail-plus extension update redirected to backend updater", { status: response.status, global: !!body.global });
    return response;
  } catch (error) {
    log("native cocktail-plus extension update redirect failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}
function endpointsToInvalidate(pathname) {
  const out = [];
  if (pathname.startsWith("/api/characters/") && pathname !== "/api/characters/all" && pathname !== "/api/characters/get" && pathname !== "/api/characters/chats" && pathname !== "/api/characters/export") out.push("characters-all");
  if (pathname === "/api/chats/save" || pathname === "/api/chats/group/save" || pathname === "/api/chats/delete" || pathname === "/api/chats/group/delete" || pathname === "/api/chats/import" || pathname === "/api/chats/group/import") out.push("characters-all");
  return Array.from(new Set(out));
}
async function notifyInvalidate(baseFetch, endpoints, reason) {
  if (!endpoints.length) return;
  try {
    await baseFetch(`${API_PREFIX}/invalidate`, {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify({ endpoints, reason }),
      cache: "no-store"
    });
  } catch (error) {
    log("invalidate failed", error instanceof Error ? error.message : String(error));
  }
}
function installFetchObserver() {
  if (globalThis[FETCH_OBSERVER_FLAG]) return;
  globalThis[FETCH_OBSERVER_FLAG] = true;
  const baseFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init2) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = (() => {
      try {
        return new URL(url, location.href).pathname;
      } catch {
        return "";
      }
    })();
    const watched = pathname === "/api/characters/all" || pathname === "/version" || pathname === "/api/settings/get" || pathname === "/api/settings/save" || pathname === "/api/chats/save" || pathname === "/api/chats/group/save";
    const startedAt = watched ? performance.now() : 0;
    if (watched) log("window.fetch target observed after extension load", { method: (init2 == null ? void 0 : init2.method) || (input instanceof Request ? input.method : "GET"), controller: ((_b = (_a = navigator.serviceWorker) == null ? void 0 : _a.controller) == null ? void 0 : _b.scriptURL) || "" });
    const method = String((init2 == null ? void 0 : init2.method) || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const redirectedUpdate = await maybeHandleCocktailPlusNativeUpdate(baseFetch, input, init2, pathname, method);
    if (redirectedUpdate) return redirectedUpdate;
    const invalidates = method === "POST" ? endpointsToInvalidate(pathname) : [];
    const response = await baseFetch(input, init2);
    if (response.ok && invalidates.length) await notifyInvalidate(baseFetch, invalidates, pathname);
    if (watched) {
      const cacheState = response.headers.get(`${HEADER_PREFIX}-state`) || response.headers.get("x-cocktail-cache") || "";
      response.headers.get(`${HEADER_PREFIX}-settings-get-state`) || "";
      response.headers.get(`${HEADER_PREFIX}-settings-save-state`) || "";
      response.headers.get(`${HEADER_PREFIX}-chat-save-state`) || "";
      log("window.fetch target response after extension load", { status: response.status, durationMs: Math.round(performance.now() - startedAt) });
      if (pathname === "/api/characters/all" && cacheState === "ASYNC-MISS") {
        try {
          (_d = (_c = globalThis.__cocktailPlusEarlyBridge) == null ? void 0 : _c.updateCharactersLoadProgress) == null ? void 0 : _d.call(_c, { cache: "ASYNC-MISS", phase: "requesting", status: response.status });
        } catch {
        }
        scheduleCharactersRefreshAfterAsyncMiss();
      } else if (pathname === "/api/characters/all" && cacheState) {
        try {
          (_f = (_e = globalThis.__cocktailPlusEarlyBridge) == null ? void 0 : _e.updateCharactersLoadProgress) == null ? void 0 : _f.call(_e, { cache: cacheState, phase: "downloading", status: response.status });
          (_h = (_g = globalThis.__cocktailPlusEarlyBridge) == null ? void 0 : _g.finishCharactersLoadProgress) == null ? void 0 : _h.call(_g, "downloaded", 3e3);
        } catch {
        }
      }
    }
    return response;
  };
}
function ensureLocalSettings() {
  const ctx = getCtx();
  const root = ctx == null ? void 0 : ctx.extensionSettings;
  if (!root) return state.localSettings;
  root[EXTENSION_NAME] = root[EXTENSION_NAME] || {};
  const s = root[EXTENSION_NAME];
  for (const [k, v] of Object.entries(DEFAULT_LOCAL_SETTINGS)) {
    if (s[k] === void 0) s[k] = v;
  }
  s.autoRegisterServiceWorker = Boolean(s.autoRegisterServiceWorker);
  s.autoWarm = Boolean(s.autoWarm);
  s.autoRefreshCharactersAfterAsyncMiss = Boolean(s.autoRefreshCharactersAfterAsyncMiss);
  s.autoCheckUpdates = Boolean(s.autoCheckUpdates);
  s.skippedUpdateVersion = String(s.skippedUpdateVersion ?? "").trim();
  state.localSettings = s;
  return s;
}
function updateLocalBool(key, value) {
  const s = ensureLocalSettings();
  s[key] = Boolean(value);
  state.localSettings = s;
  saveSettings();
}
function updateLocalString(key, value) {
  const s = ensureLocalSettings();
  s[key] = String(value ?? "");
  state.localSettings = s;
  saveSettings();
}
const REPO_URLS = Object.freeze([
  "https://github.com/Lianues/cocktail-plus",
  "https://gitee.com/lianues/cocktail-plus"
]);
const DEFAULT_REMOTE_MANIFEST_URLS = Object.freeze([
  "https://raw.githubusercontent.com/Lianues/cocktail-plus/main/manifest.json",
  "https://gitee.com/lianues/cocktail-plus/raw/main/manifest.json",
  "https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main/manifest.json"
]);
const DEFAULT_REMOTE_BACKEND_VERSION_URLS = Object.freeze([
  "https://raw.githubusercontent.com/Lianues/cocktail-plus/main/server-plugins/cocktail-plus/version.json",
  "https://gitee.com/lianues/cocktail-plus/raw/main/server-plugins/cocktail-plus/version.json",
  "https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main/server-plugins/cocktail-plus/version.json"
]);
let promptedUpdateVersionThisSession = "";
function normalizeVersionString(version) {
  return String(version ?? "").trim();
}
function parseSemver(version) {
  const v = normalizeVersionString(version);
  const m = v.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
}
function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
function toast(type, message, title = "鸡尾酒+") {
  var _a, _b;
  try {
    (_b = (_a = globalThis.toastr) == null ? void 0 : _a[type]) == null ? void 0 : _b.call(_a, message, title, { timeOut: type === "error" ? 6e3 : 3500 });
  } catch {
  }
}
async function fetchJsonWithTimeout(url, timeoutMs = 8e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      mode: "cors",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
function getLocalManifestUrl() {
  try {
    const url = new URL(import.meta.url);
    url.pathname = url.pathname.replace(/\/dist\/index\.js$/, "/manifest.json");
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return `${location.origin}/scripts/extensions/third-party/${EXTENSION_NAME}/manifest.json`;
  }
}
function getUpdateRepoUrls() {
  return [...REPO_URLS];
}
async function getCurrentVersion() {
  const local = await fetchJsonWithTimeout(getLocalManifestUrl(), 5e3);
  const version = normalizeVersionString(local == null ? void 0 : local.version);
  return version || null;
}
async function getCurrentBackendVersion() {
  var _a;
  const cached = normalizeVersionString((_a = state.backend) == null ? void 0 : _a.version);
  if (cached) return cached;
  try {
    const response = await fetch("/api/plugins/cocktail-plus/probe", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify({}),
      cache: "no-store"
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const version = normalizeVersionString(data == null ? void 0 : data.version);
    return version || null;
  } catch {
    return null;
  }
}
function uniqueUrls(groups) {
  const seen = /* @__PURE__ */ new Set();
  return groups.map((group) => group.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  })).filter((group) => group.length > 0);
}
function splitPrimaryFallbackUrls(urls) {
  return uniqueUrls([[urls[0]], [...urls].slice(1).filter(Boolean)]);
}
function getRemoteManifestUrlGroups() {
  return splitPrimaryFallbackUrls(DEFAULT_REMOTE_MANIFEST_URLS);
}
function getRemoteBackendVersionUrlGroups() {
  return splitPrimaryFallbackUrls(DEFAULT_REMOTE_BACKEND_VERSION_URLS);
}
async function getLatestVersion(kind = "frontend") {
  const groups = kind === "backend" ? getRemoteBackendVersionUrlGroups() : getRemoteManifestUrlGroups();
  for (const group of groups) {
    for (const url of group) {
      try {
        const remote = await fetchJsonWithTimeout(url, 8e3);
        const version = normalizeVersionString(remote == null ? void 0 : remote.version);
        if (version) return { version, raw: remote, source: url };
      } catch {
      }
    }
  }
  return null;
}
function guessExternalId() {
  try {
    const path = new URL(import.meta.url).pathname || "";
    const marker = "/scripts/extensions/third-party/";
    const idx = path.indexOf(marker);
    if (idx === -1) return `/${EXTENSION_NAME}`;
    const rest = path.slice(idx + marker.length);
    const folder = rest.split("/")[0];
    return folder ? `/${folder}` : `/${EXTENSION_NAME}`;
  } catch {
    return `/${EXTENSION_NAME}`;
  }
}
function externalIdToDiscoverName(externalId) {
  const folder = String(externalId || "").replace(/^\//, "").trim();
  return folder ? `third-party/${folder}` : null;
}
async function discoverExtensionType(externalId) {
  const name = externalIdToDiscoverName(externalId);
  if (!name) return null;
  try {
    const response = await fetch("/api/extensions/discover", {
      method: "GET",
      headers: getRequestHeaders(),
      cache: "no-store"
    });
    if (!response.ok) return null;
    const list = await response.json();
    if (!Array.isArray(list)) return null;
    const hit = list.find((item) => item && typeof item === "object" && item.name === name);
    const type = hit == null ? void 0 : hit.type;
    return type === "global" || type === "local" || type === "system" ? type : null;
  } catch {
    return null;
  }
}
async function updateFrontendViaApi() {
  var _a;
  const externalId = guessExternalId();
  const type = await discoverExtensionType(externalId);
  const payload = { extensionName: externalId, global: type === "global" };
  if ((_a = state.backend) == null ? void 0 : _a.ok) {
    const response2 = await fetch(`${API_PREFIX}/update/frontend`, {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const data2 = await response2.json().catch(() => ({}));
    if (!response2.ok || (data2 == null ? void 0 : data2.ok) === false) {
      throw new Error((data2 == null ? void 0 : data2.error) || response2.statusText || String(response2.status));
    }
    return { ...data2, externalId, type, global: type === "global", updater: "cocktail-plus-backend" };
  }
  const response = await fetch("/api/extensions/update", {
    method: "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || response.statusText || String(response.status));
  }
  const data = await response.json().catch(() => ({}));
  return { ...data, externalId, type, global: type === "global", updater: "sillytavern" };
}
async function checkForUpdates(options = {}) {
  if (state.update.checking) return state.update;
  state.update.checking = true;
  state.update.error = null;
  try {
    ensureLocalSettings();
    const frontendCurrentVersion = await getCurrentVersion();
    const backendCurrentVersion = await getCurrentBackendVersion();
    const [frontendLatest, backendLatest] = await Promise.all([
      getLatestVersion("frontend"),
      getLatestVersion("backend")
    ]);
    const frontendLatestVersion = (frontendLatest == null ? void 0 : frontendLatest.version) ?? null;
    const backendLatestVersion = (backendLatest == null ? void 0 : backendLatest.version) ?? null;
    const frontendUpdateAvailable = !!frontendCurrentVersion && !!frontendLatestVersion && compareSemver(frontendLatestVersion, frontendCurrentVersion) > 0;
    const backendUpdateAvailable = !!backendCurrentVersion && !!backendLatestVersion && compareSemver(backendLatestVersion, backendCurrentVersion) > 0;
    state.update = {
      ...state.update,
      checking: false,
      checked: true,
      frontendCurrentVersion,
      frontendLatestVersion,
      frontendUpdateAvailable,
      backendCurrentVersion,
      backendLatestVersion,
      backendUpdateAvailable,
      // Backward-compatible aliases for the frontend extension update flow.
      currentVersion: frontendCurrentVersion,
      latestVersion: frontendLatestVersion,
      updateAvailable: frontendUpdateAvailable,
      error: null,
      lastCheckedAt: Date.now()
    };
    if (frontendUpdateAvailable) {
      const skipped = normalizeVersionString(state.localSettings.skippedUpdateVersion);
      if (skipped && skipped === frontendLatestVersion && !options.manual) return state.update;
      if (skipped && compareSemver(frontendLatestVersion, skipped) > 0) updateLocalString("skippedUpdateVersion", "");
      if (options.prompt) {
        if (!options.manual && promptedUpdateVersionThisSession === frontendLatestVersion) return state.update;
        promptedUpdateVersionThisSession = frontendLatestVersion;
        await promptAndMaybeUpdate(frontendCurrentVersion, frontendLatestVersion);
      }
    } else if (options.manual) {
      const frontendText = frontendCurrentVersion ? `前端扩展已是最新版本：${frontendCurrentVersion}` : "无法读取前端扩展版本";
      const backendText = backendCurrentVersion ? backendUpdateAvailable ? `后端插件发现新版本：${backendLatestVersion}（当前 ${backendCurrentVersion}，请使用脚本助手更新）` : `后端插件当前版本：${backendCurrentVersion}${backendLatestVersion ? "，已是最新" : ""}` : "未检测到后端插件版本";
      toast(backendUpdateAvailable ? "warning" : "info", `${frontendText}
${backendText}`);
    }
    return state.update;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.update = {
      ...state.update,
      checking: false,
      checked: true,
      error: message,
      lastCheckedAt: Date.now()
    };
    if (options.manual) toast("error", message, "检查更新失败");
    return state.update;
  }
}
async function promptAndMaybeUpdate(currentVersion, latestVersion) {
  var _a;
  const ctx = getCtx();
  const Popup = ctx == null ? void 0 : ctx.Popup;
  const POPUP_RESULT = ctx == null ? void 0 : ctx.POPUP_RESULT;
  const skipResult = Number((POPUP_RESULT == null ? void 0 : POPUP_RESULT.CUSTOM1) ?? 1001);
  const title = "鸡尾酒+ 发现新版本";
  const text = `前端当前版本：${currentVersion || "-"}
前端最新版本：${latestVersion}

是否现在更新前端扩展？
后端扩展是全局服务，如需更新/卸载后端，请使用面板中的后端插件脚本助手。`;
  let action = "later";
  try {
    if (((_a = Popup == null ? void 0 : Popup.show) == null ? void 0 : _a.confirm) && POPUP_RESULT) {
      const result = await Popup.show.confirm(title, text, {
        okButton: "更新并刷新",
        cancelButton: "稍后",
        customButtons: [{ text: "跳过此版本", result: skipResult, appendAtEnd: true }],
        defaultResult: POPUP_RESULT.NEGATIVE
      });
      if (result === POPUP_RESULT.AFFIRMATIVE) action = "update";
      else if (result === skipResult) action = "skip";
    } else {
      action = globalThis.confirm(`${title}

${text}`) ? "update" : "later";
    }
  } catch {
    action = "later";
  }
  if (action === "skip") {
    updateLocalString("skippedUpdateVersion", latestVersion);
    toast("info", `已跳过 ${latestVersion}，此版本将不再自动提醒。`);
    return;
  }
  if (action === "update") await performUpdate();
}
async function performUpdate() {
  var _a, _b;
  if (state.update.checking) return;
  state.update.checking = true;
  state.update.error = null;
  try {
    const expectedVersion = normalizeVersionString(state.update.frontendLatestVersion || state.update.latestVersion);
    toast("info", "开始更新前端扩展…");
    const frontendResult = await updateFrontendViaApi();
    log("frontend update result", frontendResult);
    await sleep(300);
    const currentAfterUpdate = await getCurrentVersion().catch(() => null);
    const latestAfterUpdate = await getLatestVersion("frontend").catch(() => null);
    const latestVersion = (latestAfterUpdate == null ? void 0 : latestAfterUpdate.version) || expectedVersion || null;
    const updateAvailable = !!currentAfterUpdate && !!latestVersion && compareSemver(latestVersion, currentAfterUpdate) > 0;
    state.update = {
      ...state.update,
      checking: false,
      checked: true,
      frontendCurrentVersion: currentAfterUpdate,
      frontendLatestVersion: latestVersion,
      frontendUpdateAvailable: updateAvailable,
      currentVersion: currentAfterUpdate,
      latestVersion,
      updateAvailable,
      error: null,
      lastCheckedAt: Date.now()
    };
    if (!updateAvailable) updateLocalString("skippedUpdateVersion", "");
    if (updateAvailable) {
      toast(
        "warning",
        `更新请求已完成，但本地 manifest 仍为 ${currentAfterUpdate || "-"}，远端为 ${latestVersion || "-"}。已保留“可更新”状态，请刷新后重新检查或稍后重试。`,
        "前端扩展仍有可用更新"
      );
      return;
    }
    toast("success", "前端扩展已更新。后端扩展是全局服务，如需更新请使用“后端插件脚本助手”。");
    await sleep(800);
    try {
      (_b = (_a = globalThis.location) == null ? void 0 : _a.reload) == null ? void 0 : _b.call(_a);
    } catch {
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.update.error = message;
    toast("error", message, "扩展更新失败");
  } finally {
    state.update.checking = false;
  }
}
async function startAutoUpdateCheck(onDone) {
  ensureLocalSettings();
  if (!state.localSettings.autoCheckUpdates) return;
  await sleep(1200);
  void checkForUpdates({ manual: false, prompt: true }).catch((error) => log("auto update check failed", error instanceof Error ? error.message : String(error))).finally(() => {
    try {
      onDone == null ? void 0 : onDone();
    } catch {
    }
  });
}
function fmtAge(ms) {
  if (ms === null || ms === void 0 || !Number.isFinite(ms)) return "-";
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  if (ms < 6e4) return `${Math.round(ms / 1e3)}s`;
  return `${Math.round(ms / 6e4)}min`;
}
function fmtBytes(bytes) {
  if (bytes === null || bytes === void 0 || !Number.isFinite(bytes)) return "-";
  const n = Math.max(0, Number(bytes));
  if (n < 1024) return `${Math.round(n)}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}
function fmtTime(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "-";
  }
}
function statusText() {
  var _a;
  const backend = ((_a = state.backend) == null ? void 0 : _a.ok) ? "后端：可用" : "后端：未安装/未启用";
  const sw = state.sw.supported ? `SW：${state.sw.registered ? "已注册" : "未注册"} / ${state.sw.controlled ? "已接管" : "未接管当前页"}` : "SW：浏览器不支持";
  return `${backend}；${sw}`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function quoteSingle(value) {
  return String(value).replace(/'/g, "'\\''");
}
function quotePowerShellSingle(value) {
  return String(value).replace(/'/g, "''");
}
const HELPER_SCRIPT_REMOTE_BASE_URLS = [
  "https://raw.githubusercontent.com/Lianues/cocktail-plus/main",
  "https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main"
];
function getHelperScriptUrls(fileName) {
  return HELPER_SCRIPT_REMOTE_BASE_URLS.map((baseUrl) => `${baseUrl}/server-plugins/cocktail-plus/scripts/${fileName}`);
}
function getWindowsHelperCommand() {
  const urls = getHelperScriptUrls("cocktail-plus-helper.ps1").map((url) => `'${quotePowerShellSingle(url)}'`).join(",");
  return `$urls=@(${urls}); $p=Join-Path $env:TEMP 'cocktail-plus-helper.ps1'; $ok=$false; foreach($u in $urls){ try { if(Test-Path $p){Remove-Item $p -Force -ErrorAction SilentlyContinue}; Invoke-WebRequest -UseBasicParsing $u -OutFile $p; if((Test-Path $p) -and ((Get-Item $p).Length -gt 0)){ $ok=$true; break } } catch {} }; if($ok){ try{ Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction SilentlyContinue }catch{}; try{ Unblock-File -LiteralPath $p -ErrorAction SilentlyContinue }catch{}; & $p } else { Write-Host '下载 cocktail-plus 后端脚本助手失败：请检查 GitHub/Gitee 网络。' -ForegroundColor Red }`;
}
function getUnixHelperCommand() {
  const urls = getHelperScriptUrls("cocktail-plus-helper.sh").map((url) => `'${quoteSingle(url)}'`).join(" ");
  return `urls=(${urls}); f="\${TMPDIR:-/tmp}/cocktail-plus-helper.sh"; ok=0; for u in "\${urls[@]}"; do curl -fsSL "$u" -o "$f" && ok=1 && break; done; if [ "$ok" = 1 ]; then bash "$f"; else echo '下载 cocktail-plus 后端脚本助手失败：请检查 GitHub/Gitee 网络。'; fi`;
}
function renderHelperSection() {
  return `
    <div class="cp-section">
      <b>后端插件脚本助手</b>
      <div class="cp-muted">复制对应系统命令到运行 SillyTavern 的机器终端中执行；命令直接从 GitHub/Gitee 下载脚本，不经过酒馆本地网页地址，因此不受酒馆登录验证影响。脚本会定位 <code>config.yaml</code>，并可安装/删除后端插件、维护后端 <code>config.json</code>、开关 <code>enableServerPlugins</code> 或重启酒馆。</div>
      <div class="cp-command-block">
        <div class="cp-command-title">Windows PowerShell</div>
        <textarea id="cp_helper_windows_command" class="cp-command" rows="4" readonly>${escapeHtml(getWindowsHelperCommand())}</textarea>
        <button id="cp_copy_windows_helper" class="menu_button">复制 Windows 命令</button>
      </div>
      <div class="cp-command-block">
        <div class="cp-command-title">Termux / Linux / macOS Bash</div>
        <textarea id="cp_helper_unix_command" class="cp-command" rows="4" readonly>${escapeHtml(getUnixHelperCommand())}</textarea>
        <button id="cp_copy_unix_helper" class="menu_button">复制 Linux/macOS 命令</button>
      </div>
    </div>
  `;
}
function versionLabel(value) {
  return escapeHtml(value || "-");
}
function renderVersionLine(label, current, latest, available, hint = "") {
  const suffix = hint ? `，${hint}` : "";
  if (available) {
    return `${label}：发现新版本 ${versionLabel(latest)}（当前 ${versionLabel(current)}${suffix}）`;
  }
  if (latest) {
    return `${label}：当前 ${versionLabel(current)}，远端 ${versionLabel(latest)}，已是最新`;
  }
  return `${label}：当前 ${versionLabel(current)}，远端未检查`;
}
function renderUpdateSection() {
  var _a;
  const u = state.update;
  const frontendCurrent = u.frontendCurrentVersion ?? u.currentVersion;
  const frontendLatest = u.frontendLatestVersion ?? u.latestVersion;
  const frontendUpdateAvailable = u.frontendUpdateAvailable ?? u.updateAvailable;
  const backendCurrent = u.backendCurrentVersion ?? ((_a = state.backend) == null ? void 0 : _a.version) ?? null;
  const backendLatest = u.backendLatestVersion;
  const backendUpdateAvailable = u.backendUpdateAvailable;
  const status = u.checking ? "检查中…" : u.error ? `检查失败：${escapeHtml(u.error)}` : !u.checked ? `尚未检查远端版本；前端：${versionLabel(frontendCurrent)}；后端：${versionLabel(backendCurrent)}` : [
    renderVersionLine("前端扩展", frontendCurrent, frontendLatest, frontendUpdateAvailable),
    renderVersionLine("后端插件", backendCurrent, backendLatest, backendUpdateAvailable, "需用脚本助手单独更新")
  ].join("<br>");
  return `
    <div class="cp-section">
      <b>更新检查（后端扩展和前端扩展更新是独立的，需要分别进行更新）</b>
      <div class="cp-muted">
        远端：${getUpdateRepoUrls().map(
    (url, index) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${index === 0 ? "GitHub" : "Gitee"}</a>`
  ).join(" / ")}
        （自动检查时先 GitHub，失败后 Gitee）
      </div>
      <div class="cp-status cp-status-compact">${status}</div>
      <div class="cp-muted">上次检查：${fmtTime(u.lastCheckedAt)}；前端已跳过版本：${escapeHtml(state.localSettings.skippedUpdateVersion || "-")}</div>
      <div class="cp-actions cp-actions-top">
        <button id="cp_check_update" class="menu_button" ${u.checking ? "disabled" : ""}>检查更新</button>
        <button id="cp_run_update" class="menu_button" ${frontendUpdateAvailable && !u.checking ? "" : "disabled"}>更新前端</button>
      </div>
    </div>
  `;
}
function getHost() {
  return document.getElementById("extensions_settings2") || document.getElementById("extensions_settings");
}
function ensurePanelShell() {
  const host = getHost();
  if (!host) return null;
  let root = document.getElementById(ROOT_ID);
  if (root) return root;
  const drawer = document.createElement("div");
  drawer.id = DRAWER_ID;
  drawer.className = "inline-drawer";
  drawer.innerHTML = `
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>${DISPLAY_NAME}</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div id="${ROOT_ID}" class="cp-panel"></div>
    </div>
  `;
  host.appendChild(drawer);
  root = document.getElementById(ROOT_ID);
  return root;
}
function checkbox(id, label, checked, disabled = false) {
  return `<label class="cp-check"><input id="${id}" type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}> ${label}</label>`;
}
function renderCacheTable() {
  var _a;
  const rows = ((_a = state.backend) == null ? void 0 : _a.status) ?? [];
  if (!rows.length) return '<div class="cp-muted">暂无缓存状态。</div>';
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>状态</th><th>大小</th><th>年龄</th><th>耗时</th><th>命中</th><th>stale</th></tr></thead>
      <tbody>
        ${rows.map((row) => {
    const e = row.entry;
    return `<tr>
            <td><code>${row.endpointKey}</code></td>
            <td>${row.refreshing ? "刷新中" : e ? e.status : "-"}</td>
            <td>${e ? `${Math.round(e.bytes / 1024)}KB` : "-"}</td>
            <td>${e ? fmtAge(e.ageMs) : "-"}</td>
            <td>${e ? fmtAge(e.durationMs) : "-"}</td>
            <td>${(e == null ? void 0 : e.hitCount) ?? 0}</td>
            <td>${(e == null ? void 0 : e.staleHitCount) ?? 0}</td>
          </tr>`;
  }).join("")}
      </tbody>
    </table>
  `;
}
function renderSettingsGetStats() {
  var _a;
  const status = (_a = state.backend) == null ? void 0 : _a.settingsGet;
  if (!status) return '<div class="cp-muted">暂无 settings/get 优化状态。</div>';
  const s = status.stats;
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>启用</th><th>缓存</th><th>请求</th><th>HIT</th><th>MISS</th><th>错误</th><th>返回大小</th><th>最后状态</th><th>构建</th></tr></thead>
      <tbody>
        <tr>
          <td><code>${status.endpointKey}</code></td>
          <td>${status.enabled ? "是" : "否"}</td>
          <td>${status.cacheEnabled ? "是" : "否"}</td>
          <td>${s.requests}</td>
          <td>${s.hits}</td>
          <td>${s.misses}</td>
          <td>${s.errors}</td>
          <td>${fmtBytes(s.responseBytes)}</td>
          <td>${s.lastState ?? "-"}</td>
          <td>${fmtAge(s.lastBuildMs)}</td>
        </tr>
      </tbody>
    </table>
    <div class="cp-muted">
      fast settings/get 保持原始响应结构，返回真实 Kobold/NovelAI/TextGen/OpenAI 预设、themes、instruct/context/sysprompt/reasoning 等字段；优化点是并行读取目录与内存缓存，不再做大字段过滤。
    </div>
  `;
}
function renderSettingsSaveStats() {
  var _a;
  const status = (_a = state.backend) == null ? void 0 : _a.settingsSave;
  if (!status) return '<div class="cp-muted">暂无 settings/save 优化状态。</div>';
  const s = status.stats;
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>启用</th><th>请求</th><th>patch</th><th>no-op</th><th>冲突</th><th>错误</th><th>节省上传</th><th>最后状态</th></tr></thead>
      <tbody>
        <tr>
          <td><code>${status.endpointKey}</code></td>
          <td>${status.enabled ? "是" : "否"}</td>
          <td>${s.requests}</td>
          <td>${s.patches}</td>
          <td>${s.noops}</td>
          <td>${s.conflicts}</td>
          <td>${s.errors}</td>
          <td>${fmtBytes(s.savedBytes)} / ${fmtBytes(s.originalBytes)} → ${fmtBytes(s.optimizedBytes)}</td>
          <td>${s.lastState ?? "-"}</td>
        </tr>
      </tbody>
    </table>
    <div class="cp-muted">
      工作方式：Early Bridge / Service Worker 捕获 <code>/api/settings/get</code> 作为基线，保存时将 <code>/api/settings/save</code> 改为 no-op hash 或深层 JSON patch；冲突/失败自动回退原始完整保存。
    </div>
  `;
}
function renderChatSaveStats() {
  var _a;
  const status = (_a = state.backend) == null ? void 0 : _a.chatSave;
  if (!status) return '<div class="cp-muted">暂无 chat/save 优化状态。</div>';
  const s = status.stats;
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>启用</th><th>请求</th><th>patch</th><th>no-op</th><th>冲突</th><th>错误</th><th>缓存</th><th>节省上传</th><th>最后状态</th></tr></thead>
      <tbody>
        <tr>
          <td><code>${status.endpointKey}</code></td>
          <td>${status.enabled ? "是" : "否"}</td>
          <td>${s.requests}</td>
          <td>${s.patches}</td>
          <td>${s.noops}</td>
          <td>${s.conflicts}</td>
          <td>${s.errors}</td>
          <td>${status.cacheEntries} 项 / hit ${s.cacheHits} / miss ${s.cacheMisses} / 失效 ${s.cacheInvalidations}</td>
          <td>${fmtBytes(s.savedBytes)} / ${fmtBytes(s.originalBytes)} → ${fmtBytes(s.optimizedBytes)}</td>
          <td>${s.lastState ?? "-"}</td>
        </tr>
      </tbody>
    </table>
    <div class="cp-muted">
      工作方式：Early Bridge 捕获 <code>/api/chats/get</code> / <code>/api/chats/group/get</code> 作为基线，保存时将完整聊天上传改为 no-op hash 或聊天数组 patch；后端以内存缓存和文件 stat 校验当前 JSONL，冲突/失败自动回退原始保存。
    </div>
  `;
}
function renderPanel() {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const root = ensurePanelShell();
  if (!root) return;
  const s = ensureLocalSettings();
  root.innerHTML = `
    <div class="cp-status">${statusText()}</div>
    <div class="cp-status">Early Bridge：${((_b = (_a = state.backend) == null ? void 0 : _a.earlyBridge) == null ? void 0 : _b.installed) ? state.backend.earlyBridge.upToDate ? "已安装（最新）" : "已安装（需更新）" : "未安装"}；注入位置：<code>${((_d = (_c = state.backend) == null ? void 0 : _c.earlyBridge) == null ? void 0 : _d.bridgeSrc) ?? "-"}</code></div>
    <div class="cp-help">
      通过 Service Worker + Early Bridge + 后端 Server Plugin 优化 SillyTavern 原始接口；当前优化 <code>/api/characters/all</code>、<code>/version</code>、<code>/api/settings/save</code> 与 <code>/api/chats/save</code>。
    </div>

    <div class="cp-actions">
      <button id="cp_refresh" class="menu_button">刷新状态</button>
      <button id="cp_register_sw" class="menu_button" ${((_e = state.backend) == null ? void 0 : _e.ok) && state.sw.supported ? "" : "disabled"}>注册/更新 SW</button>
      <button id="cp_unregister_sw" class="menu_button" ${state.sw.registered ? "" : "disabled"}>注销 SW</button>
      <button id="cp_warm" class="menu_button" ${((_f = state.backend) == null ? void 0 : _f.ok) ? "" : "disabled"}>后台预热</button>
      <button id="cp_warm_wait" class="menu_button" ${((_g = state.backend) == null ? void 0 : _g.ok) ? "" : "disabled"}>预热并等待</button>
      <button id="cp_clear" class="menu_button" ${((_h = state.backend) == null ? void 0 : _h.ok) ? "" : "disabled"}>清空缓存</button>
      <button id="cp_early_status" class="menu_button" ${((_i = state.backend) == null ? void 0 : _i.ok) ? "" : "disabled"}>刷新 Early 状态</button>
      <button id="cp_early_install" class="menu_button" ${((_j = state.backend) == null ? void 0 : _j.ok) ? "" : "disabled"}>安装/更新 Early Bridge</button>
      <button id="cp_early_uninstall" class="menu_button" ${((_l = (_k = state.backend) == null ? void 0 : _k.earlyBridge) == null ? void 0 : _l.installed) ? "" : "disabled"}>卸载 Early Bridge</button>
    </div>

    ${renderUpdateSection()}

    ${renderHelperSection()}

    <div class="cp-section">
      <b>前端本地选项</b>
      <div class="cp-grid">
        ${checkbox("cp_auto_sw", "后端可用时自动注册 SW", s.autoRegisterServiceWorker)}
        ${checkbox("cp_auto_warm", "后端可用时自动预热", s.autoWarm)}
        ${checkbox("cp_auto_refresh_chars", "ASYNC-MISS 后缓存就绪自动刷新角色列表", s.autoRefreshCharactersAfterAsyncMiss)}
        ${checkbox("cp_auto_check_updates", "启动后自动异步检查 GitHub 更新", s.autoCheckUpdates)}
      </div>
    </div>

    <div class="cp-section">
      <b>缓存状态</b>
      ${renderCacheTable()}
    </div>

    <div class="cp-section">
      <b>settings/get 优化状态</b>
      ${renderSettingsGetStats()}
    </div>

    <div class="cp-section">
      <b>settings/save 优化状态</b>
      ${renderSettingsSaveStats()}
    </div>

    <div class="cp-section">
      <b>chat/save 优化状态</b>
      ${renderChatSaveStats()}
    </div>
  `;
  bindPanelEvents(root);
}
function bindPanelEvents(root) {
  const onClick = (id, fn) => {
    var _a;
    (_a = root.querySelector(`#${id}`)) == null ? void 0 : _a.addEventListener("click", () => runBusy(fn));
  };
  onClick("cp_refresh", fullProbe);
  onClick("cp_register_sw", registerServiceWorker);
  onClick("cp_unregister_sw", unregisterServiceWorker);
  onClick("cp_warm", async () => warm(false));
  onClick("cp_warm_wait", async () => warm(true));
  onClick("cp_clear", clearCache);
  onClick("cp_early_status", refreshEarlyBridgeStatus);
  onClick("cp_early_install", installEarlyBridge);
  onClick("cp_early_uninstall", uninstallEarlyBridge);
  onClick("cp_check_update", async () => {
    await checkForUpdates({ manual: true, prompt: true });
  });
  onClick("cp_run_update", performUpdate);
  bindCopyCommand(root, "cp_copy_windows_helper", "cp_helper_windows_command");
  bindCopyCommand(root, "cp_copy_unix_helper", "cp_helper_unix_command");
  const onLocalBool = (id, key) => {
    const el = root.querySelector(`#${id}`);
    el == null ? void 0 : el.addEventListener("change", () => {
      updateLocalBool(key, Boolean(el.checked));
      renderPanel();
    });
  };
  onLocalBool("cp_auto_sw", "autoRegisterServiceWorker");
  onLocalBool("cp_auto_warm", "autoWarm");
  onLocalBool("cp_auto_refresh_chars", "autoRefreshCharactersAfterAsyncMiss");
  onLocalBool("cp_auto_check_updates", "autoCheckUpdates");
}
async function runBusy(fn) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
  } catch (error) {
    log("操作失败", error instanceof Error ? error.message : String(error));
  } finally {
    state.busy = false;
    renderPanel();
  }
}
function bindCopyCommand(root, buttonId, textareaId) {
  const button = root.querySelector(`#${buttonId}`);
  const textarea = root.querySelector(`#${textareaId}`);
  if (!button || !textarea) return;
  button.addEventListener("click", async () => {
    var _a;
    const text = textarea.value;
    try {
      if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
      }
      const oldText = button.textContent || "复制";
      button.textContent = "已复制";
      setTimeout(() => {
        button.textContent = oldText;
      }, 1500);
    } catch (error) {
      log("复制命令失败，请手动选中文本复制", error instanceof Error ? error.message : String(error));
    }
  });
}
async function init() {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  if (globalThis[EXTENSION_LOADED_FLAG]) return;
  globalThis[EXTENSION_LOADED_FLAG] = true;
  const shouldRefreshCharactersAfterFastState = (cache) => {
    const state2 = String(cache || "");
    return state2 === "ASYNC-MISS" || state2 === "STALE-SIGNATURE";
  };
  ensureLocalSettings();
  const early = globalThis.__cocktailPlusEarlyBridge;
  if (early) {
    log("early bridge detected", {
      version: early.version,
      patchedFetch: early.patchedFetch,
      swRegisterStarted: early.swRegisterStarted,
      events: Array.isArray(early.events) ? early.events.slice(-10) : []
    });
    if (Array.isArray(early.events) && early.events.some((e) => {
      var _a2, _b2;
      return ((_a2 = e == null ? void 0 : e.detail) == null ? void 0 : _a2.path) === "/api/characters/all" && shouldRefreshCharactersAfterFastState((_b2 = e == null ? void 0 : e.detail) == null ? void 0 : _b2.cache);
    })) {
      scheduleCharactersRefreshAfterAsyncMiss();
    }
  }
  window.addEventListener("cocktail-plus:early", (event) => {
    var _a2, _b2;
    const item = event == null ? void 0 : event.detail;
    log(`EARLY: ${(item == null ? void 0 : item.type) || "event"}`);
    if (((_a2 = item == null ? void 0 : item.detail) == null ? void 0 : _a2.path) === "/api/characters/all" && shouldRefreshCharactersAfterFastState((_b2 = item == null ? void 0 : item.detail) == null ? void 0 : _b2.cache)) scheduleCharactersRefreshAfterAsyncMiss();
  });
  installFetchObserver();
  log("extension init", {
    controller: ((_b = (_a = navigator.serviceWorker) == null ? void 0 : _a.controller) == null ? void 0 : _b.scriptURL) || ""
  });
  renderPanel();
  await fullProbe();
  renderPanel();
  if (((_c = state.backend) == null ? void 0 : _c.ok) && state.localSettings.autoRegisterServiceWorker) {
    await registerServiceWorker().catch((error) => log("自动注册 SW 失败", error instanceof Error ? error.message : String(error)));
    renderPanel();
  }
  if (((_d = state.backend) == null ? void 0 : _d.ok) && state.localSettings.autoWarm) {
    await warm(false).catch((error) => log("自动预热失败", error instanceof Error ? error.message : String(error)));
    renderPanel();
  }
  void startAutoUpdateCheck(renderPanel);
  (_e = navigator.serviceWorker) == null ? void 0 : _e.addEventListener("message", (event) => {
    var _a2, _b2, _c2, _d2;
    const data = event.data;
    if ((data == null ? void 0 : data.source) === SW_MESSAGE_SOURCE) {
      log(`SW: ${data.type || "message"}`);
      if (data.path === "/api/characters/all" && shouldRefreshCharactersAfterFastState(data.cache)) {
        try {
          (_b2 = (_a2 = globalThis.__cocktailPlusEarlyBridge) == null ? void 0 : _a2.updateCharactersLoadProgress) == null ? void 0 : _b2.call(_a2, { cache: data.cache, phase: "requesting", ...data.progress || {} });
        } catch {
        }
        scheduleCharactersRefreshAfterAsyncMiss();
      } else if (data.path === "/api/characters/all" && data.progress) {
        try {
          (_d2 = (_c2 = globalThis.__cocktailPlusEarlyBridge) == null ? void 0 : _c2.updateCharactersLoadProgress) == null ? void 0 : _d2.call(_c2, data.progress);
        } catch {
        }
      }
    }
  });
  (_f = navigator.serviceWorker) == null ? void 0 : _f.addEventListener("controllerchange", () => {
    var _a2, _b2;
    log("SW controllerchange", { controller: ((_b2 = (_a2 = navigator.serviceWorker) == null ? void 0 : _a2.controller) == null ? void 0 : _b2.scriptURL) || "" });
    void refreshServiceWorkerState().then(renderPanel);
  });
  const ctx = getCtx();
  (_i = (_g = ctx == null ? void 0 : ctx.eventSource) == null ? void 0 : _g.on) == null ? void 0 : _i.call(_g, (_h = ctx == null ? void 0 : ctx.eventTypes) == null ? void 0 : _h.APP_READY, () => {
    markAppReady();
    void refreshStatus().then(renderPanel);
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void init();
  }, { once: true });
} else {
  void init();
}
//# sourceMappingURL=index.js.map
