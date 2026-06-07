import { FETCH_OBSERVER_FLAG, HEADER_PREFIX } from './constants';
import { scheduleCharactersRefreshAfterAsyncMiss } from './characters-refresh';
import { log } from './st-context';

export function installFetchObserver() {
  if ((globalThis as any)[FETCH_OBSERVER_FLAG]) return;
  (globalThis as any)[FETCH_OBSERVER_FLAG] = true;
  const baseFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const pathname = (() => { try { return new URL(url, location.href).pathname; } catch { return ''; } })();
    const watched = pathname === '/api/characters/all' || pathname === '/version' || pathname === '/api/settings/get' || pathname === '/api/settings/save' || pathname === '/api/chats/save' || pathname === '/api/chats/group/save';
    const startedAt = watched ? performance.now() : 0;
    if (watched) log('window.fetch target observed after extension load', { pathname, method: init?.method || (input instanceof Request ? input.method : 'GET'), controller: navigator.serviceWorker?.controller?.scriptURL || '' });
    const response = await baseFetch(input as any, init as any);
    if (watched) {
      const cacheState = response.headers.get(`${HEADER_PREFIX}-state`) || response.headers.get('x-cocktail-cache') || '';
      const settingsGetState = response.headers.get(`${HEADER_PREFIX}-settings-get-state`) || '';
      const settingsSaveState = response.headers.get(`${HEADER_PREFIX}-settings-save-state`) || '';
      const chatSaveState = response.headers.get(`${HEADER_PREFIX}-chat-save-state`) || '';
      log('window.fetch target response after extension load', { pathname, status: response.status, cacheState, settingsGetState, settingsSaveState, chatSaveState, durationMs: Math.round(performance.now() - startedAt) });
      if (pathname === '/api/characters/all' && cacheState === 'ASYNC-MISS') {
        scheduleCharactersRefreshAfterAsyncMiss('window.fetch');
      }
    }
    return response;
  };
  log('fetch observer installed');
}
