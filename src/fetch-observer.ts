import { API_PREFIX, EXTENSION_NAME, FETCH_OBSERVER_FLAG, HEADER_PREFIX } from './constants';
import { scheduleCharactersRefreshAfterAsyncMiss } from './characters-refresh';
import { getRequestHeaders, log } from './st-context';

async function readRequestBodyText(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const body = init?.body;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof Blob) return await body.text();
    if (input instanceof Request) return await input.clone().text();
  } catch { /* ignore */ }
  return '';
}

function isCocktailPlusExtensionUpdate(body: any) {
  const name = String(body?.extensionName || '').replace(/^\//, '').trim();
  return name === EXTENSION_NAME;
}

async function maybeHandleCocktailPlusNativeUpdate(baseFetch: typeof fetch, input: RequestInfo | URL, init: RequestInit | undefined, pathname: string, method: string) {
  if (pathname !== '/api/extensions/update' || method !== 'POST') return null;
  try {
    const bodyText = await readRequestBodyText(input, init);
    const body = bodyText ? JSON.parse(bodyText) : {};
    if (!isCocktailPlusExtensionUpdate(body)) return null;
    const response = await baseFetch(`${API_PREFIX}/update/frontend`, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ extensionName: `/${EXTENSION_NAME}`, global: !!body.global }),
      cache: 'no-store',
    });
    log('native cocktail-plus extension update redirected to backend updater', { status: response.status, global: !!body.global });
    return response;
  } catch (error) {
    log('native cocktail-plus extension update redirect failed', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function endpointsToInvalidate(pathname: string) {
  const out: string[] = [];
  if (pathname.startsWith('/api/characters/') && pathname !== '/api/characters/all' && pathname !== '/api/characters/get' && pathname !== '/api/characters/chats' && pathname !== '/api/characters/export') out.push('characters-all');
  if (pathname === '/api/chats/save' || pathname === '/api/chats/group/save' || pathname === '/api/chats/delete' || pathname === '/api/chats/group/delete' || pathname === '/api/chats/import' || pathname === '/api/chats/group/import') out.push('characters-all');
  return Array.from(new Set(out));
}

async function notifyInvalidate(baseFetch: typeof fetch, endpoints: string[], reason: string) {
  if (!endpoints.length) return;
  try {
    await baseFetch(`${API_PREFIX}/invalidate`, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ endpoints, reason }),
      cache: 'no-store',
    });
  } catch (error) {
    log('invalidate failed', error instanceof Error ? error.message : String(error));
  }
}

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
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const redirectedUpdate = await maybeHandleCocktailPlusNativeUpdate(baseFetch, input, init, pathname, method);
    if (redirectedUpdate) return redirectedUpdate;
    const invalidates = method === 'POST' ? endpointsToInvalidate(pathname) : [];
    const response = await baseFetch(input as any, init as any);
    if (response.ok && invalidates.length) await notifyInvalidate(baseFetch, invalidates, pathname);
    if (watched) {
      const cacheState = response.headers.get(`${HEADER_PREFIX}-state`) || response.headers.get('x-cocktail-cache') || '';
      const settingsGetState = response.headers.get(`${HEADER_PREFIX}-settings-get-state`) || '';
      const settingsSaveState = response.headers.get(`${HEADER_PREFIX}-settings-save-state`) || '';
      const chatSaveState = response.headers.get(`${HEADER_PREFIX}-chat-save-state`) || '';
      log('window.fetch target response after extension load', { pathname, status: response.status, cacheState, settingsGetState, settingsSaveState, chatSaveState, durationMs: Math.round(performance.now() - startedAt) });
      if (pathname === '/api/characters/all' && cacheState === 'ASYNC-MISS') {
        try {
          (globalThis as any).__cocktailPlusEarlyBridge?.updateCharactersLoadProgress?.({ cache: 'ASYNC-MISS', phase: 'requesting', status: response.status });
        } catch { /* ignore */ }
        scheduleCharactersRefreshAfterAsyncMiss('window.fetch');
      } else if (pathname === '/api/characters/all' && cacheState) {
        try {
          (globalThis as any).__cocktailPlusEarlyBridge?.updateCharactersLoadProgress?.({ cache: cacheState, phase: 'downloading', status: response.status });
          (globalThis as any).__cocktailPlusEarlyBridge?.finishCharactersLoadProgress?.('downloaded', 3000);
        } catch { /* ignore */ }
      }
    }
    return response;
  };
  log('fetch observer installed');
}
