import './style.css';

import { fullProbe, warm } from './api';
import { scheduleCharactersRefreshAfterAsyncMiss, markAppReady } from './characters-refresh';
import { EXTENSION_LOADED_FLAG, SW_MESSAGE_SOURCE } from './constants';
import { installFetchObserver } from './fetch-observer';
import { renderPanel } from './panel';
import { refreshStatus } from './api';
import { registerServiceWorker, refreshServiceWorkerState } from './service-worker';
import { ensureLocalSettings } from './settings';
import { getCtx, log } from './st-context';
import { state } from './state';
import { startAutoUpdateCheck } from './update-checker';

async function init() {
  if ((globalThis as any)[EXTENSION_LOADED_FLAG]) return;
  (globalThis as any)[EXTENSION_LOADED_FLAG] = true;

  ensureLocalSettings();
  const early = (globalThis as any).__cocktailPlusEarlyBridge;
  if (early) {
    log('early bridge detected', {
      version: early.version,
      patchedFetch: early.patchedFetch,
      swRegisterStarted: early.swRegisterStarted,
      events: Array.isArray(early.events) ? early.events.slice(-10) : [],
    });
    if (Array.isArray(early.events) && early.events.some((e: any) => e?.detail?.path === '/api/characters/all' && e?.detail?.cache === 'ASYNC-MISS')) {
      scheduleCharactersRefreshAfterAsyncMiss('early-bridge-history');
    }
  } else {
    log('early bridge not detected');
  }
  window.addEventListener('cocktail-plus:early', (event: any) => {
    const item = event?.detail;
    log(`EARLY: ${item?.type || 'event'}`, item);
    if (item?.detail?.path === '/api/characters/all' && item?.detail?.cache === 'ASYNC-MISS') scheduleCharactersRefreshAfterAsyncMiss('early-bridge-event');
  });
  installFetchObserver();
  log('extension init', {
    importUrl: import.meta.url,
    readyState: document.readyState,
    controller: navigator.serviceWorker?.controller?.scriptURL || '',
  });
  renderPanel();
  await fullProbe();
  renderPanel();

  if (state.backend?.ok && state.localSettings.autoRegisterServiceWorker) {
    await registerServiceWorker().catch(error => log('自动注册 SW 失败', error instanceof Error ? error.message : String(error)));
    renderPanel();
  }

  if (state.backend?.ok && state.localSettings.autoWarm) {
    await warm(false).catch(error => log('自动预热失败', error instanceof Error ? error.message : String(error)));
    renderPanel();
  }

  void startAutoUpdateCheck(renderPanel);

  navigator.serviceWorker?.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.source === SW_MESSAGE_SOURCE) {
      log(`SW: ${data.type || 'message'}`, data);
      if (data.path === '/api/characters/all' && data.cache === 'ASYNC-MISS') {
        scheduleCharactersRefreshAfterAsyncMiss('service-worker-message');
      }
    }
  });

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    log('SW controllerchange', { controller: navigator.serviceWorker?.controller?.scriptURL || '' });
    void refreshServiceWorkerState().then(renderPanel);
  });

  const ctx = getCtx();
  ctx?.eventSource?.on?.(ctx?.eventTypes?.APP_READY, () => {
    markAppReady();
    log('APP_READY observed');
    void refreshStatus().then(renderPanel);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); }, { once: true });
} else {
  void init();
}
