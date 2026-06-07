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
  currentVersion: null,
  latestVersion: null,
  updateAvailable: false,
  error: null,
  lastCheckedAt: null,
  backendSync: null
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
async function updateBackendConfig(partial) {
  const result = await postJson(`${API_PREFIX}/config/set`, { config: partial });
  if (state.backend) state.backend.config = result.config;
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
  var _a;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const status = await postJson(`${API_PREFIX}/status`, {});
      state.backend = { ...state.backend || { ok: true }, ...status };
      const row = (_a = status.status) == null ? void 0 : _a.find((x) => x.endpointKey === "characters-all");
      if ((row == null ? void 0 : row.entry) && !row.refreshing) {
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
function installFetchObserver() {
  if (globalThis[FETCH_OBSERVER_FLAG]) return;
  globalThis[FETCH_OBSERVER_FLAG] = true;
  const baseFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init2) => {
    var _a, _b;
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
    const response = await baseFetch(input, init2);
    if (watched) {
      const cacheState = response.headers.get(`${HEADER_PREFIX}-state`) || response.headers.get("x-cocktail-cache") || "";
      response.headers.get(`${HEADER_PREFIX}-settings-get-state`) || "";
      response.headers.get(`${HEADER_PREFIX}-settings-save-state`) || "";
      response.headers.get(`${HEADER_PREFIX}-chat-save-state`) || "";
      log("window.fetch target response after extension load", { status: response.status, durationMs: Math.round(performance.now() - startedAt) });
      if (pathname === "/api/characters/all" && cacheState === "ASYNC-MISS") {
        scheduleCharactersRefreshAfterAsyncMiss();
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
const REMOTE_MANIFEST_URLS = Object.freeze([
  "https://raw.githubusercontent.com/Lianues/cocktail-plus/main/manifest.json",
  "https://gitee.com/lianues/cocktail-plus/raw/main/manifest.json"
]);
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
    (_b = (_a = globalThis.toastr) == null ? void 0 : _a[type]) == null ? void 0 : _b.call(_a, message, title, { timeOut: type === "error" ? 6e3 : 2500 });
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
async function getLatestVersion() {
  for (const url of REMOTE_MANIFEST_URLS) {
    try {
      const remote = await fetchJsonWithTimeout(url, 8e3);
      const version = normalizeVersionString(remote == null ? void 0 : remote.version);
      if (version) return { version, raw: remote, source: url };
    } catch {
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
  const externalId = guessExternalId();
  const type = await discoverExtensionType(externalId);
  const response = await fetch("/api/extensions/update", {
    method: "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify({ extensionName: externalId, global: type === "global" })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || response.statusText || String(response.status));
  }
  return await response.json().catch(() => ({}));
}
async function syncBackendFromUpdatedFrontend() {
  var _a;
  if (!((_a = state.backend) == null ? void 0 : _a.ok)) return { ok: true, skipped: true, reason: "backend-not-connected" };
  const response = await fetch(`${API_PREFIX}/backend/install-from-frontend`, {
    method: "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify({}),
    cache: "no-store"
  });
  const data = await response.json().catch(async () => ({ ok: false, error: await response.text().catch(() => "") }));
  if (!response.ok || !(data == null ? void 0 : data.ok)) {
    throw new Error((data == null ? void 0 : data.error) || response.statusText || String(response.status));
  }
  return data;
}
async function checkForUpdates(options = {}) {
  if (state.update.checking) return state.update;
  state.update.checking = true;
  state.update.error = null;
  try {
    ensureLocalSettings();
    const currentVersion = await getCurrentVersion();
    const latest = await getLatestVersion();
    const latestVersion = (latest == null ? void 0 : latest.version) ?? null;
    const updateAvailable = !!currentVersion && !!latestVersion && compareSemver(latestVersion, currentVersion) > 0;
    state.update = {
      ...state.update,
      checking: false,
      checked: true,
      currentVersion,
      latestVersion,
      updateAvailable,
      error: null,
      lastCheckedAt: Date.now()
    };
    if (updateAvailable) {
      const skipped = normalizeVersionString(state.localSettings.skippedUpdateVersion);
      if (skipped && skipped === latestVersion && !options.manual) return state.update;
      if (options.prompt) await promptAndMaybeUpdate(currentVersion, latestVersion);
    } else if (options.manual) {
      toast("info", currentVersion ? `当前已是最新版本：${currentVersion}` : "无法读取本地版本。");
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
  const text = `当前版本：${currentVersion || "-"}
最新版本：${latestVersion}

是否现在更新？
如果后端已连接，更新前端后会同步覆盖后端插件，完成后需要重启 SillyTavern。`;
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
  state.update.backendSync = null;
  try {
    toast("info", "开始更新前端扩展…");
    const frontendResult = await updateFrontendViaApi();
    log("frontend update result", frontendResult);
    updateLocalString("skippedUpdateVersion", "");
    let backendResult = null;
    try {
      backendResult = await syncBackendFromUpdatedFrontend();
      state.update.backendSync = { ok: true, result: backendResult };
      if (backendResult == null ? void 0 : backendResult.skipped) toast("info", "前端已更新；后端未连接，跳过后端同步。");
      else toast("success", "前端已更新，后端插件已同步覆盖。重启 SillyTavern 后后端更新生效。");
    } catch (backendError) {
      const message = backendError instanceof Error ? backendError.message : String(backendError);
      state.update.backendSync = { ok: false, error: message };
      toast("warning", `前端已更新，但后端同步失败：${message}`);
    }
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
function getHelperScriptUrl(fileName) {
  try {
    const url = new URL(import.meta.url);
    url.pathname = url.pathname.replace(/\/dist\/index\.js$/, `/scripts/${fileName}`);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return `${location.origin}/scripts/extensions/third-party/cocktail-plus/scripts/${fileName}`;
  }
}
function getWindowsHelperCommand() {
  const url = quotePowerShellSingle(getHelperScriptUrl("cocktail-plus-helper.ps1"));
  return `$u='${url}'; $p=Join-Path $env:TEMP 'cocktail-plus-helper.ps1'; Invoke-WebRequest -UseBasicParsing $u -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p`;
}
function getUnixHelperCommand() {
  const url = quoteSingle(getHelperScriptUrl("cocktail-plus-helper.sh"));
  return `u='${url}'; f="\${TMPDIR:-/tmp}/cocktail-plus-helper.sh"; curl -fsSL "$u" -o "$f" && bash "$f"`;
}
function renderHelperSection() {
  return `
    <div class="cp-section">
      <b>后端插件脚本助手</b>
      <div class="cp-muted">复制对应系统命令到运行 SillyTavern 的机器终端中执行；脚本会优先从进程定位 SillyTavern，失败后扫描/手动选择 <code>config.yaml</code>，并可安装/删除后端插件或开关 <code>enableServerPlugins</code>。</div>
      <div class="cp-command-block">
        <div class="cp-command-title">Windows PowerShell</div>
        <textarea id="cp_helper_windows_command" class="cp-command" rows="4" readonly>${escapeHtml(getWindowsHelperCommand())}</textarea>
        <button id="cp_copy_windows_helper" class="menu_button">复制 Windows 命令</button>
      </div>
      <div class="cp-command-block">
        <div class="cp-command-title">Linux / macOS Bash</div>
        <textarea id="cp_helper_unix_command" class="cp-command" rows="4" readonly>${escapeHtml(getUnixHelperCommand())}</textarea>
        <button id="cp_copy_unix_helper" class="menu_button">复制 Linux/macOS 命令</button>
      </div>
    </div>
  `;
}
function renderUpdateSection() {
  var _a;
  const u = state.update;
  const status = u.checking ? "检查中…" : u.error ? `检查失败：${escapeHtml(u.error)}` : !u.checked ? "尚未检查" : u.updateAvailable ? `发现新版本：${escapeHtml(u.latestVersion)}（当前 ${escapeHtml(u.currentVersion)}）` : `当前已是最新版本：${escapeHtml(u.currentVersion ?? "-")}`;
  const backendSync = u.backendSync ? `<div class="cp-muted">后端同步：${u.backendSync.ok ? "成功/已跳过" : `失败：${escapeHtml(u.backendSync.error ?? "")}`}</div>` : "";
  return `
    <div class="cp-section">
      <b>更新检查</b>
      <div class="cp-muted">
        远端：${getUpdateRepoUrls().map(
    (url, index) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${index === 0 ? "GitHub" : "Gitee"}</a>`
  ).join(" / ")}
        （自动检查时先 GitHub，失败后 Gitee）
      </div>
      <div class="cp-status cp-status-compact">${status}</div>
      <div class="cp-muted">上次检查：${fmtTime(u.lastCheckedAt)}；已跳过版本：${escapeHtml(state.localSettings.skippedUpdateVersion || "-")}</div>
      ${backendSync}
      <div class="cp-actions cp-actions-top">
        <button id="cp_check_update" class="menu_button" ${u.checking ? "disabled" : ""}>检查更新</button>
        <button id="cp_run_update" class="menu_button" ${u.updateAvailable && !u.checking ? "" : "disabled"}>更新前端${((_a = state.backend) == null ? void 0 : _a.ok) ? "并同步后端" : ""}</button>
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
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  const root = ensurePanelShell();
  if (!root) return;
  const cfg = (_a = state.backend) == null ? void 0 : _a.config;
  const s = ensureLocalSettings();
  root.innerHTML = `
    <div class="cp-status">${statusText()}</div>
    <div class="cp-status">Early Bridge：${((_c = (_b = state.backend) == null ? void 0 : _b.earlyBridge) == null ? void 0 : _c.installed) ? state.backend.earlyBridge.upToDate ? "已安装（最新）" : "已安装（需更新）" : "未安装"}；注入位置：<code>${((_e = (_d = state.backend) == null ? void 0 : _d.earlyBridge) == null ? void 0 : _e.bridgeSrc) ?? "-"}</code></div>
    <div class="cp-help">
      通过 Service Worker + Early Bridge + 后端 Server Plugin 优化 SillyTavern 原始接口；当前优化 <code>/api/characters/all</code>、<code>/version</code>、<code>/api/settings/save</code> 与 <code>/api/chats/save</code>。
    </div>

    <div class="cp-actions">
      <button id="cp_refresh" class="menu_button">刷新状态</button>
      <button id="cp_register_sw" class="menu_button" ${((_f = state.backend) == null ? void 0 : _f.ok) && state.sw.supported ? "" : "disabled"}>注册/更新 SW</button>
      <button id="cp_unregister_sw" class="menu_button" ${state.sw.registered ? "" : "disabled"}>注销 SW</button>
      <button id="cp_warm" class="menu_button" ${((_g = state.backend) == null ? void 0 : _g.ok) ? "" : "disabled"}>后台预热</button>
      <button id="cp_warm_wait" class="menu_button" ${((_h = state.backend) == null ? void 0 : _h.ok) ? "" : "disabled"}>预热并等待</button>
      <button id="cp_clear" class="menu_button" ${((_i = state.backend) == null ? void 0 : _i.ok) ? "" : "disabled"}>清空缓存</button>
      <button id="cp_early_status" class="menu_button" ${((_j = state.backend) == null ? void 0 : _j.ok) ? "" : "disabled"}>刷新 Early 状态</button>
      <button id="cp_early_install" class="menu_button" ${((_k = state.backend) == null ? void 0 : _k.ok) ? "" : "disabled"}>安装/更新 Early Bridge</button>
      <button id="cp_early_uninstall" class="menu_button" ${((_m = (_l = state.backend) == null ? void 0 : _l.earlyBridge) == null ? void 0 : _m.installed) ? "" : "disabled"}>卸载 Early Bridge</button>
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
      <b>后端配置</b>
      ${cfg ? `
        <div class="cp-grid">
          ${checkbox("cp_cfg_enabled", "启用后端加速", cfg.enabled)}
          ${checkbox("cp_cfg_sw", "允许提供 Service Worker", cfg.serviceWorkerEnabled)}
          ${checkbox("cp_cfg_characters", "缓存 characters/all", cfg.cacheCharactersAll)}
          ${checkbox("cp_cfg_version", "缓存 /version", cfg.cacheVersion)}
          ${checkbox("cp_cfg_stale", "允许 stale-while-revalidate", cfg.staleWhileRevalidate)}
          ${checkbox("cp_cfg_shallow_chars", "characters/all 返回浅层角色列表", cfg.shallowCharactersAll)}
          ${checkbox("cp_cfg_disk_characters", "characters/all 浅层磁盘缓存（推荐）", cfg.diskCacheCharactersAll)}
          ${checkbox("cp_cfg_disk_version", "/version 磁盘缓存", cfg.diskCacheVersion)}
          ${checkbox("cp_cfg_fast_version", "/version 无缓存时快速文件响应并后台刷新", cfg.fastVersionOnMiss)}
          ${checkbox("cp_cfg_async_chars", "无 characters 缓存时先返回空列表并后台构建", cfg.asyncCharactersAllOnMiss)}
          ${checkbox("cp_cfg_early_enabled", "启用 Early Bridge 脚本", cfg.earlyBridgeEnabled)}
          ${checkbox("cp_cfg_early_auto_install", "后端启动时自动注入 Early Bridge", cfg.autoInstallEarlyBridge)}
          ${checkbox("cp_cfg_early_patch_fetch", "Early Bridge 在 script.js 前 patch fetch", cfg.earlyBridgePatchFetch)}
          ${checkbox("cp_cfg_settings_get", "优化 /api/settings/get 下载", cfg.optimizeSettingsGet)}
          ${checkbox("cp_cfg_settings_get_cache", "缓存 settings/get 轻量响应", cfg.cacheSettingsGet)}
          ${checkbox("cp_cfg_startup_preload", "提前预取 /version 响应", cfg.startupPreloadEnabled)}
          ${checkbox("cp_cfg_template_preload", "并行预取 scripts/templates 模板", cfg.templatePreloadEnabled)}
          ${checkbox("cp_cfg_sw_fast_route_fallback", "SW 兜底 /version 与 characters/all（默认关）", cfg.serviceWorkerFastRouteFallback)}
          ${checkbox("cp_cfg_sw_settings_get_fallback", "SW 兜底 settings/get（默认关）", cfg.serviceWorkerSettingsGetFallback)}
          ${checkbox("cp_cfg_sw_settings_save_fallback", "SW 兜底 settings/save（默认关）", cfg.serviceWorkerSettingsSaveFallback)}
          ${checkbox("cp_cfg_sw_chat_save_fallback", "SW 兜底 chat/save（默认关）", cfg.serviceWorkerChatSaveFallback)}
          ${checkbox("cp_cfg_sw_template_fallback", "SW 兜底模板缓存（默认关）", cfg.serviceWorkerTemplateFallback)}
          ${checkbox("cp_cfg_module_proxy", "模块代理替换酒馆串行代码", cfg.moduleProxyEnabled)}
          ${checkbox("cp_cfg_patch_startup_init", "替换 firstLoadInit 串行等待", cfg.patchStartupInit)}
          ${checkbox("cp_cfg_patch_i18n_init", "替换 initLocales 串行等待", cfg.patchI18nInit)}
          ${checkbox("cp_cfg_patch_system_messages", "替换 initSystemMessages 模板串行", cfg.patchSystemMessagesInit)}
          ${checkbox("cp_cfg_patch_extension_manifests", "替换 getManifests 使用预取结果", cfg.patchExtensionManifests)}
          ${checkbox("cp_cfg_patch_parallel_extensions", "并行激活扩展（实验）", cfg.patchParallelActivateExtensions)}
          ${checkbox("cp_cfg_settings_save", "优化 /api/settings/save 大上传", cfg.optimizeSettingsSave)}
          ${checkbox("cp_cfg_settings_save_noop", "settings/save 启用 no-op hash", cfg.settingsSaveNoopEnabled)}
          ${checkbox("cp_cfg_settings_save_patch", "settings/save 启用深层 JSON patch", cfg.settingsSavePatchEnabled)}
          ${checkbox("cp_cfg_chat_save", "优化 /api/chats/save 大上传", cfg.optimizeChatSave)}
          ${checkbox("cp_cfg_chat_save_noop", "chat/save 启用 no-op hash", cfg.chatSaveNoopEnabled)}
          ${checkbox("cp_cfg_chat_save_patch", "chat/save 启用聊天 patch", cfg.chatSavePatchEnabled)}
          <label class="cp-field">最大 stale 时间(ms)<input id="cp_cfg_max_stale" type="number" min="0" max="86400000" step="1000" value="${cfg.maxStaleMs}"></label>
          <label class="cp-field">settings patch 最大操作数<input id="cp_cfg_settings_save_max_ops" type="number" min="1" max="100000" step="100" value="${cfg.settingsSaveMaxPatchOperations}"></label>
          <label class="cp-field">settings patch/full 比例阈值<input id="cp_cfg_settings_save_ratio" type="number" min="0.05" max="2" step="0.05" value="${cfg.settingsSaveMaxPatchBytesRatio}"></label>
          <label class="cp-field">chat patch 最大操作数<input id="cp_cfg_chat_save_max_ops" type="number" min="1" max="100000" step="100" value="${cfg.chatSaveMaxPatchOperations}"></label>
          <label class="cp-field">chat patch/full 比例阈值<input id="cp_cfg_chat_save_ratio" type="number" min="0.05" max="2" step="0.05" value="${cfg.chatSaveMaxPatchBytesRatio}"></label>
          <label class="cp-field">chat 后端缓存条目<input id="cp_cfg_chat_save_cache_entries" type="number" min="0" max="1024" step="1" value="${cfg.chatSaveCacheMaxEntries}"></label>
        </div>
      ` : '<div class="cp-muted">后端不可用，无法显示配置。</div>'}
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
  const onCfgBool = (id, key) => {
    const el = root.querySelector(`#${id}`);
    el == null ? void 0 : el.addEventListener("change", () => runBusy(() => updateBackendConfig({ [key]: Boolean(el.checked) })));
  };
  onCfgBool("cp_cfg_enabled", "enabled");
  onCfgBool("cp_cfg_sw", "serviceWorkerEnabled");
  onCfgBool("cp_cfg_characters", "cacheCharactersAll");
  onCfgBool("cp_cfg_version", "cacheVersion");
  onCfgBool("cp_cfg_stale", "staleWhileRevalidate");
  onCfgBool("cp_cfg_shallow_chars", "shallowCharactersAll");
  onCfgBool("cp_cfg_disk_characters", "diskCacheCharactersAll");
  onCfgBool("cp_cfg_disk_version", "diskCacheVersion");
  onCfgBool("cp_cfg_fast_version", "fastVersionOnMiss");
  onCfgBool("cp_cfg_async_chars", "asyncCharactersAllOnMiss");
  onCfgBool("cp_cfg_early_enabled", "earlyBridgeEnabled");
  onCfgBool("cp_cfg_early_auto_install", "autoInstallEarlyBridge");
  onCfgBool("cp_cfg_early_patch_fetch", "earlyBridgePatchFetch");
  onCfgBool("cp_cfg_settings_get", "optimizeSettingsGet");
  onCfgBool("cp_cfg_settings_get_cache", "cacheSettingsGet");
  onCfgBool("cp_cfg_startup_preload", "startupPreloadEnabled");
  onCfgBool("cp_cfg_template_preload", "templatePreloadEnabled");
  onCfgBool("cp_cfg_sw_fast_route_fallback", "serviceWorkerFastRouteFallback");
  onCfgBool("cp_cfg_sw_settings_get_fallback", "serviceWorkerSettingsGetFallback");
  onCfgBool("cp_cfg_sw_settings_save_fallback", "serviceWorkerSettingsSaveFallback");
  onCfgBool("cp_cfg_sw_chat_save_fallback", "serviceWorkerChatSaveFallback");
  onCfgBool("cp_cfg_sw_template_fallback", "serviceWorkerTemplateFallback");
  onCfgBool("cp_cfg_module_proxy", "moduleProxyEnabled");
  onCfgBool("cp_cfg_patch_startup_init", "patchStartupInit");
  onCfgBool("cp_cfg_patch_i18n_init", "patchI18nInit");
  onCfgBool("cp_cfg_patch_system_messages", "patchSystemMessagesInit");
  onCfgBool("cp_cfg_patch_extension_manifests", "patchExtensionManifests");
  onCfgBool("cp_cfg_patch_parallel_extensions", "patchParallelActivateExtensions");
  onCfgBool("cp_cfg_settings_save", "optimizeSettingsSave");
  onCfgBool("cp_cfg_settings_save_noop", "settingsSaveNoopEnabled");
  onCfgBool("cp_cfg_settings_save_patch", "settingsSavePatchEnabled");
  onCfgBool("cp_cfg_chat_save", "optimizeChatSave");
  onCfgBool("cp_cfg_chat_save_noop", "chatSaveNoopEnabled");
  onCfgBool("cp_cfg_chat_save_patch", "chatSavePatchEnabled");
  const staleEl = root.querySelector("#cp_cfg_max_stale");
  staleEl == null ? void 0 : staleEl.addEventListener("change", () => {
    const value = Math.max(0, Math.min(864e5, Math.trunc(Number(staleEl.value) || 0)));
    runBusy(() => updateBackendConfig({ maxStaleMs: value }));
  });
  const settingsSaveMaxOpsEl = root.querySelector("#cp_cfg_settings_save_max_ops");
  settingsSaveMaxOpsEl == null ? void 0 : settingsSaveMaxOpsEl.addEventListener("change", () => {
    const value = Math.max(1, Math.min(1e5, Math.trunc(Number(settingsSaveMaxOpsEl.value) || 2e3)));
    runBusy(() => updateBackendConfig({ settingsSaveMaxPatchOperations: value }));
  });
  const settingsSaveRatioEl = root.querySelector("#cp_cfg_settings_save_ratio");
  settingsSaveRatioEl == null ? void 0 : settingsSaveRatioEl.addEventListener("change", () => {
    const value = Math.max(0.05, Math.min(2, Number(settingsSaveRatioEl.value) || 0.85));
    runBusy(() => updateBackendConfig({ settingsSaveMaxPatchBytesRatio: value }));
  });
  const chatSaveMaxOpsEl = root.querySelector("#cp_cfg_chat_save_max_ops");
  chatSaveMaxOpsEl == null ? void 0 : chatSaveMaxOpsEl.addEventListener("change", () => {
    const value = Math.max(1, Math.min(1e5, Math.trunc(Number(chatSaveMaxOpsEl.value) || 5e3)));
    runBusy(() => updateBackendConfig({ chatSaveMaxPatchOperations: value }));
  });
  const chatSaveRatioEl = root.querySelector("#cp_cfg_chat_save_ratio");
  chatSaveRatioEl == null ? void 0 : chatSaveRatioEl.addEventListener("change", () => {
    const value = Math.max(0.05, Math.min(2, Number(chatSaveRatioEl.value) || 0.85));
    runBusy(() => updateBackendConfig({ chatSaveMaxPatchBytesRatio: value }));
  });
  const chatSaveCacheEntriesEl = root.querySelector("#cp_cfg_chat_save_cache_entries");
  chatSaveCacheEntriesEl == null ? void 0 : chatSaveCacheEntriesEl.addEventListener("change", () => {
    const value = Math.max(0, Math.min(1024, Math.trunc(Number(chatSaveCacheEntriesEl.value) || 64)));
    runBusy(() => updateBackendConfig({ chatSaveCacheMaxEntries: value }));
  });
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
      return ((_a2 = e == null ? void 0 : e.detail) == null ? void 0 : _a2.path) === "/api/characters/all" && ((_b2 = e == null ? void 0 : e.detail) == null ? void 0 : _b2.cache) === "ASYNC-MISS";
    })) {
      scheduleCharactersRefreshAfterAsyncMiss();
    }
  }
  window.addEventListener("cocktail-plus:early", (event) => {
    var _a2, _b2;
    const item = event == null ? void 0 : event.detail;
    log(`EARLY: ${(item == null ? void 0 : item.type) || "event"}`);
    if (((_a2 = item == null ? void 0 : item.detail) == null ? void 0 : _a2.path) === "/api/characters/all" && ((_b2 = item == null ? void 0 : item.detail) == null ? void 0 : _b2.cache) === "ASYNC-MISS") scheduleCharactersRefreshAfterAsyncMiss();
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
    const data = event.data;
    if ((data == null ? void 0 : data.source) === SW_MESSAGE_SOURCE) {
      log(`SW: ${data.type || "message"}`);
      if (data.path === "/api/characters/all" && data.cache === "ASYNC-MISS") {
        scheduleCharactersRefreshAfterAsyncMiss();
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
