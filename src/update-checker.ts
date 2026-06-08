import { API_PREFIX, EXTENSION_NAME } from './constants';
import { ensureLocalSettings, updateLocalString } from './settings';
import { state } from './state';
import { getCtx, getRequestHeaders, log } from './st-context';

type ExtensionType = 'global' | 'local' | 'system';

const REPO_URLS = Object.freeze([
  'https://github.com/Lianues/cocktail-plus',
  'https://gitee.com/lianues/cocktail-plus',
]);
const DEFAULT_REMOTE_MANIFEST_URLS = Object.freeze([
  'https://raw.githubusercontent.com/Lianues/cocktail-plus/main/manifest.json',
  'https://gitee.com/lianues/cocktail-plus/raw/main/manifest.json',
  'https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main/manifest.json',
]);
const DEFAULT_REMOTE_BACKEND_VERSION_URLS = Object.freeze([
  'https://raw.githubusercontent.com/Lianues/cocktail-plus/main/server-plugins/cocktail-plus/version.json',
  'https://gitee.com/lianues/cocktail-plus/raw/main/server-plugins/cocktail-plus/version.json',
  'https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main/server-plugins/cocktail-plus/version.json',
]);

let promptedUpdateVersionThisSession = '';

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
  try { (globalThis as any).toastr?.[type]?.(message, title, { timeOut: type === 'error' ? 6000 : 3500 }); } catch { /* ignore */ }
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

async function getCurrentBackendVersion() {
  const cached = normalizeVersionString(state.backend?.version);
  if (cached) return cached;

  try {
    const response = await fetch('/api/plugins/cocktail-plus/probe', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({}),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const version = normalizeVersionString(data?.version);
    return version || null;
  } catch {
    return null;
  }
}

function uniqueUrls(groups: string[][]) {
  const seen = new Set<string>();
  return groups
    .map(group => group.filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    }))
    .filter(group => group.length > 0);
}

function splitPrimaryFallbackUrls(urls: readonly string[]) {
  return uniqueUrls([[urls[0]], [...urls].slice(1).filter(Boolean)]);
}

function getRemoteManifestUrlGroups() {
  return splitPrimaryFallbackUrls(DEFAULT_REMOTE_MANIFEST_URLS);
}

function getRemoteBackendVersionUrlGroups() {
  return splitPrimaryFallbackUrls(DEFAULT_REMOTE_BACKEND_VERSION_URLS);
}

async function getLatestVersion(kind: 'frontend' | 'backend' = 'frontend') {
  const groups = kind === 'backend' ? getRemoteBackendVersionUrlGroups() : getRemoteManifestUrlGroups();
  for (const group of groups) {
    for (const url of group) {
      try {
        const remote = await fetchJsonWithTimeout(url, 8000);
        const version = normalizeVersionString(remote?.version);
        if (version) return { version, raw: remote, source: url };
      } catch {
        // Try next URL in this source group, then fallback group.
      }
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
    return type === 'global' || type === 'local' || type === 'system' ? type as ExtensionType : null;
  } catch {
    return null;
  }
}

async function updateFrontendViaApi() {
  const externalId = guessExternalId();
  const type = await discoverExtensionType(externalId);
  const payload = { extensionName: externalId, global: type === 'global' };

  if (state.backend?.ok) {
    const response = await fetch(`${API_PREFIX}/update/frontend`, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || response.statusText || String(response.status));
    }
    return { ...data, externalId, type, global: type === 'global', updater: 'cocktail-plus-backend' };
  }

  const response = await fetch('/api/extensions/update', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || response.statusText || String(response.status));
  }
  const data = await response.json().catch(() => ({}));
  return { ...data, externalId, type, global: type === 'global', updater: 'sillytavern' };
}

export async function checkForUpdates(options: { manual?: boolean; prompt?: boolean } = {}) {
  if (state.update.checking) return state.update;
  state.update.checking = true;
  state.update.error = null;

  try {
    ensureLocalSettings();
    const frontendCurrentVersion = await getCurrentVersion();
    const backendCurrentVersion = await getCurrentBackendVersion();
    const [frontendLatest, backendLatest] = await Promise.all([
      getLatestVersion('frontend'),
      getLatestVersion('backend'),
    ]);
    const frontendLatestVersion = frontendLatest?.version ?? null;
    const backendLatestVersion = backendLatest?.version ?? null;
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
      lastCheckedAt: Date.now(),
    };

    if (frontendUpdateAvailable) {
      const skipped = normalizeVersionString(state.localSettings.skippedUpdateVersion);
      if (skipped && skipped === frontendLatestVersion && !options.manual) return state.update;
      if (skipped && compareSemver(frontendLatestVersion, skipped) > 0) updateLocalString('skippedUpdateVersion', '');
      if (options.prompt) {
        if (!options.manual && promptedUpdateVersionThisSession === frontendLatestVersion) return state.update;
        promptedUpdateVersionThisSession = frontendLatestVersion;
        await promptAndMaybeUpdate(frontendCurrentVersion, frontendLatestVersion);
      }
    } else if (options.manual) {
      const frontendText = frontendCurrentVersion ? `前端扩展已是最新版本：${frontendCurrentVersion}` : '无法读取前端扩展版本';
      const backendText = backendCurrentVersion
        ? backendUpdateAvailable
          ? `后端插件发现新版本：${backendLatestVersion}（当前 ${backendCurrentVersion}，请使用脚本助手更新）`
          : `后端插件当前版本：${backendCurrentVersion}${backendLatestVersion ? '，已是最新' : ''}`
        : '未检测到后端插件版本';
      toast(backendUpdateAvailable ? 'warning' : 'info', `${frontendText}\n${backendText}`);
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
  const text = `前端当前版本：${currentVersion || '-'}\n前端最新版本：${latestVersion}\n\n是否现在更新前端扩展？\n后端扩展是全局服务，如需更新/卸载后端，请使用面板中的后端插件脚本助手。`;

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

  try {
    const expectedVersion = normalizeVersionString(state.update.frontendLatestVersion || state.update.latestVersion);
    toast('info', '开始更新前端扩展…');
    const frontendResult = await updateFrontendViaApi();
    log('frontend update result', frontendResult);

    await sleep(300);
    const currentAfterUpdate = await getCurrentVersion().catch(() => null);
    const latestAfterUpdate = await getLatestVersion('frontend').catch(() => null);
    const latestVersion = latestAfterUpdate?.version || expectedVersion || null;
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
      lastCheckedAt: Date.now(),
    };

    if (!updateAvailable) updateLocalString('skippedUpdateVersion', '');

    if (updateAvailable) {
      toast(
        'warning',
        `更新请求已完成，但本地 manifest 仍为 ${currentAfterUpdate || '-'}，远端为 ${latestVersion || '-'}。已保留“可更新”状态，请刷新后重新检查或稍后重试。`,
        '前端扩展仍有可用更新',
      );
      return;
    }

    toast('success', '前端扩展已更新。后端扩展是全局服务，如需更新请使用“后端插件脚本助手”。');

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
