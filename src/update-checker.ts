import { API_PREFIX, EXTENSION_NAME } from './constants';
import { ensureLocalSettings, updateLocalString } from './settings';
import { state } from './state';
import { getCtx, getRequestHeaders, log } from './st-context';

const REPO_URLS = Object.freeze([
  'https://github.com/Lianues/cocktail-plus',
  'https://gitee.com/lianues/cocktail-plus',
]);
const REMOTE_MANIFEST_URLS = Object.freeze([
  'https://raw.githubusercontent.com/Lianues/cocktail-plus/main/manifest.json',
  'https://gitee.com/lianues/cocktail-plus/raw/main/manifest.json',
]);

function normalizeVersionString(version: unknown) {
  return String(version ?? '').trim();
}

function parseSemver(version: unknown) {
  const v = normalizeVersionString(version);
  const m = v.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
}

function compareSemver(a: unknown, b: unknown) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

function toast(type: 'success' | 'info' | 'warning' | 'error', message: string, title = '鸡尾酒+') {
  try { (globalThis as any).toastr?.[type]?.(message, title, { timeOut: type === 'error' ? 6000 : 2500 }); } catch { /* ignore */ }
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
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
    url.pathname = url.pathname.replace(/\/dist\/index\.js$/, '/manifest.json');
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return `${location.origin}/scripts/extensions/third-party/${EXTENSION_NAME}/manifest.json`;
  }
}

export function getUpdateRepoUrl() {
  return REPO_URLS[0];
}

export function getUpdateRepoUrls() {
  return [...REPO_URLS];
}

async function getCurrentVersion() {
  const local = await fetchJsonWithTimeout(getLocalManifestUrl(), 5000);
  const version = normalizeVersionString(local?.version);
  return version || null;
}

async function getLatestVersion() {
  for (const url of REMOTE_MANIFEST_URLS) {
    try {
      const remote = await fetchJsonWithTimeout(url, 8000);
      const version = normalizeVersionString(remote?.version);
      if (version) return { version, raw: remote, source: url };
    } catch {
      // Try next mirror.
    }
  }
  return null;
}

function guessExternalId() {
  try {
    const path = new URL(import.meta.url).pathname || '';
    const marker = '/scripts/extensions/third-party/';
    const idx = path.indexOf(marker);
    if (idx === -1) return `/${EXTENSION_NAME}`;
    const rest = path.slice(idx + marker.length);
    const folder = rest.split('/')[0];
    return folder ? `/${folder}` : `/${EXTENSION_NAME}`;
  } catch {
    return `/${EXTENSION_NAME}`;
  }
}

function externalIdToDiscoverName(externalId: string) {
  const folder = String(externalId || '').replace(/^\//, '').trim();
  return folder ? `third-party/${folder}` : null;
}

async function discoverExtensionType(externalId: string) {
  const name = externalIdToDiscoverName(externalId);
  if (!name) return null;
  try {
    const response = await fetch('/api/extensions/discover', {
      method: 'GET',
      headers: getRequestHeaders(),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const list = await response.json();
    if (!Array.isArray(list)) return null;
    const hit = list.find(item => item && typeof item === 'object' && item.name === name);
    const type = hit?.type;
    return type === 'global' || type === 'local' || type === 'system' ? type : null;
  } catch {
    return null;
  }
}

async function updateFrontendViaApi() {
  const externalId = guessExternalId();
  const type = await discoverExtensionType(externalId);
  const response = await fetch('/api/extensions/update', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ extensionName: externalId, global: type === 'global' }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || response.statusText || String(response.status));
  }
  return await response.json().catch(() => ({}));
}

async function syncBackendFromUpdatedFrontend() {
  if (!state.backend?.ok) return { ok: true, skipped: true, reason: 'backend-not-connected' };
  const response = await fetch(`${API_PREFIX}/backend/install-from-frontend`, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({}),
    cache: 'no-store',
  });
  const data = await response.json().catch(async () => ({ ok: false, error: await response.text().catch(() => '') }));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || response.statusText || String(response.status));
  }
  return data;
}

export async function checkForUpdates(options: { manual?: boolean; prompt?: boolean } = {}) {
  if (state.update.checking) return state.update;
  state.update.checking = true;
  state.update.error = null;

  try {
    ensureLocalSettings();
    const currentVersion = await getCurrentVersion();
    const latest = await getLatestVersion();
    const latestVersion = latest?.version ?? null;
    const updateAvailable = !!currentVersion && !!latestVersion && compareSemver(latestVersion, currentVersion) > 0;

    state.update = {
      ...state.update,
      checking: false,
      checked: true,
      currentVersion,
      latestVersion,
      updateAvailable,
      error: null,
      lastCheckedAt: Date.now(),
    };

    if (updateAvailable) {
      const skipped = normalizeVersionString(state.localSettings.skippedUpdateVersion);
      if (skipped && skipped === latestVersion && !options.manual) return state.update;
      if (options.prompt) await promptAndMaybeUpdate(currentVersion, latestVersion);
    } else if (options.manual) {
      toast('info', currentVersion ? `当前已是最新版本：${currentVersion}` : '无法读取本地版本。');
    }

    return state.update;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.update = {
      ...state.update,
      checking: false,
      checked: true,
      error: message,
      lastCheckedAt: Date.now(),
    };
    if (options.manual) toast('error', message, '检查更新失败');
    return state.update;
  }
}

async function promptAndMaybeUpdate(currentVersion: string | null, latestVersion: string) {
  const ctx = getCtx();
  const Popup = ctx?.Popup;
  const POPUP_RESULT = ctx?.POPUP_RESULT;
  const skipResult = Number(POPUP_RESULT?.CUSTOM1 ?? 1001);
  const title = '鸡尾酒+ 发现新版本';
  const text = `当前版本：${currentVersion || '-'}\n最新版本：${latestVersion}\n\n是否现在更新？\n如果后端已连接，更新前端后会同步覆盖后端插件，完成后需要重启 SillyTavern。`;

  let action: 'update' | 'skip' | 'later' = 'later';
  try {
    if (Popup?.show?.confirm && POPUP_RESULT) {
      const result = await Popup.show.confirm(title, text, {
        okButton: '更新并刷新',
        cancelButton: '稍后',
        customButtons: [{ text: '跳过此版本', result: skipResult, appendAtEnd: true }],
        defaultResult: POPUP_RESULT.NEGATIVE,
      });
      if (result === POPUP_RESULT.AFFIRMATIVE) action = 'update';
      else if (result === skipResult) action = 'skip';
    } else {
      action = globalThis.confirm(`${title}\n\n${text}`) ? 'update' : 'later';
    }
  } catch {
    action = 'later';
  }

  if (action === 'skip') {
    updateLocalString('skippedUpdateVersion', latestVersion);
    toast('info', `已跳过 ${latestVersion}，此版本将不再自动提醒。`);
    return;
  }
  if (action === 'update') await performUpdate();
}

export async function performUpdate() {
  if (state.update.checking) return;
  state.update.checking = true;
  state.update.error = null;
  state.update.backendSync = null;

  try {
    toast('info', '开始更新前端扩展…');
    const frontendResult = await updateFrontendViaApi();
    log('frontend update result', frontendResult);
    updateLocalString('skippedUpdateVersion', '');

    let backendResult: unknown = null;
    try {
      backendResult = await syncBackendFromUpdatedFrontend();
      state.update.backendSync = { ok: true, result: backendResult };
      if ((backendResult as any)?.skipped) toast('info', '前端已更新；后端未连接，跳过后端同步。');
      else toast('success', '前端已更新，后端插件已同步覆盖。重启 SillyTavern 后后端更新生效。');
    } catch (backendError) {
      const message = backendError instanceof Error ? backendError.message : String(backendError);
      state.update.backendSync = { ok: false, error: message };
      toast('warning', `前端已更新，但后端同步失败：${message}`);
    }

    await sleep(800);
    try { globalThis.location?.reload?.(); } catch { /* ignore */ }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.update.error = message;
    toast('error', message, '扩展更新失败');
  } finally {
    state.update.checking = false;
  }
}

export async function startAutoUpdateCheck(onDone?: () => void) {
  ensureLocalSettings();
  if (!state.localSettings.autoCheckUpdates) return;
  await sleep(1200);
  void checkForUpdates({ manual: false, prompt: true })
    .catch(error => log('auto update check failed', error instanceof Error ? error.message : String(error)))
    .finally(() => { try { onDone?.(); } catch { /* ignore */ } });
}
