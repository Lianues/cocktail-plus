import { API_PREFIX } from './constants';
import { getRequestHeaders, log } from './st-context';
import { refreshServiceWorkerState } from './service-worker';
import { state } from './state';
import type { BackendProbe, BrowserLogList } from './types';

export async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${url} failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
  }
  return await response.json();
}

export async function probeBackend() {
  try {
    state.backend = await postJson<BackendProbe>(`${API_PREFIX}/probe`, {});
    log(`后端插件可用：v${state.backend.version ?? 'unknown'}`);
  } catch (error) {
    state.backend = null;
    log('后端插件不可用', error instanceof Error ? error.message : String(error));
  }
}

export async function warm(wait = false) {
  const result = await postJson(`${API_PREFIX}/warm`, { endpoints: ['characters-all', 'version'], wait });
  log(wait ? '预热完成' : '预热已在后台开始', result);
  await refreshStatus();
}

export async function clearCache() {
  const result = await postJson(`${API_PREFIX}/cache/clear`, { endpoints: ['characters-all', 'version'] });
  log('缓存已清理', result);
  await refreshStatus();
}

export async function refreshStatus() {
  await refreshServiceWorkerState();
  if (state.backend) {
    try {
      const status = await postJson<BackendProbe>(`${API_PREFIX}/status`, {});
      state.backend = { ...state.backend, ...status };
    } catch (error) {
      log('刷新状态失败', error instanceof Error ? error.message : String(error));
    }
  }
}

export async function refreshEarlyBridgeStatus() {
  const result = await postJson<{ ok: boolean; status: any }>(`${API_PREFIX}/early/status`, {});
  if (state.backend) state.backend.earlyBridge = result.status;
  log('early bridge 状态已刷新', result.status);
}

export async function installEarlyBridge() {
  const result = await postJson(`${API_PREFIX}/early/install`, {});
  if (state.backend && (result as any).status) state.backend.earlyBridge = (result as any).status;
  log('early bridge 已安装/更新', result);
}

export async function uninstallEarlyBridge() {
  const result = await postJson(`${API_PREFIX}/early/uninstall`, {});
  if (state.backend && (result as any).status) state.backend.earlyBridge = (result as any).status;
  log('early bridge 已卸载', result);
}

export async function fullProbe() {
  log('fullProbe.start', { controller: navigator.serviceWorker?.controller?.scriptURL || '', readyState: document.readyState });
  await Promise.allSettled([probeBackend(), refreshServiceWorkerState()]);
  log('fullProbe.end', { backendOk: !!state.backend?.ok, sw: state.sw });
}


export async function refreshBrowserLogs(limit = 10_000) {
  if (!state.backend?.ok) return null;
  const result = await postJson<BrowserLogList>(`${API_PREFIX}/browser-logs/list`, { limit });
  state.browserLogs = result;
  if (state.backend) state.backend.browserLogs = { total: result.total, maxEntries: result.maxEntries, maxFieldChars: result.maxFieldChars, lastReceivedAt: result.lastReceivedAt };
  return result;
}

export async function clearBrowserLogs() {
  await postJson(`${API_PREFIX}/browser-logs/clear`, {});
  await refreshBrowserLogs(10_000);
}
