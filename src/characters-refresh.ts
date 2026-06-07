import { API_PREFIX } from './constants';
import { postJson } from './api';
import { getCtx, log } from './st-context';
import { state } from './state';
import type { BackendProbe } from './types';

let appReady = false;
let charactersRefreshScheduled = false;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function markAppReady() {
  appReady = true;
}

async function waitForAppReady() {
  if (appReady) return;
  const ctx = getCtx();
  await new Promise<void>((resolve) => {
    const done = () => { appReady = true; resolve(); };
    try {
      ctx?.eventSource?.once?.(ctx?.eventTypes?.APP_READY, done);
      ctx?.eventSource?.on?.(ctx?.eventTypes?.APP_READY, done);
    } catch { /* ignore */ }
    setTimeout(done, 15_000);
  });
}

async function waitForCharactersCacheReady(maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const status = await postJson<BackendProbe>(`${API_PREFIX}/status`, {});
      state.backend = { ...(state.backend || { ok: true }), ...status } as BackendProbe;
      const row = status.status?.find(x => x.endpointKey === 'characters-all');
      if (row?.entry && !row.refreshing) {
        log('characters cache ready for async refresh', row.entry);
        return true;
      }
      log('characters cache not ready yet', { refreshing: row?.refreshing, hasEntry: !!row?.entry });
    } catch (error) {
      log('poll characters cache failed', error instanceof Error ? error.message : String(error));
    }
    await delay(700);
  }
  return false;
}

async function reloadCharactersFromCore() {
  const scriptModuleUrl = '/script.js';
  const mod: any = await import(/* @vite-ignore */ scriptModuleUrl);
  if (typeof mod?.getCharacters !== 'function') throw new Error('/script.js getCharacters export not found');
  await mod.getCharacters();
}

export function scheduleCharactersRefreshAfterAsyncMiss(source: string) {
  if (!state.localSettings.autoRefreshCharactersAfterAsyncMiss) {
    log('characters async refresh skipped by local setting', { source });
    return;
  }
  if (charactersRefreshScheduled) return;
  charactersRefreshScheduled = true;
  log('characters async refresh scheduled', { source });
  void (async () => {
    await waitForAppReady();
    const ready = await waitForCharactersCacheReady();
    if (!ready) {
      log('characters async refresh timeout');
      charactersRefreshScheduled = false;
      return;
    }
    log('characters async refresh calling getCharacters');
    await reloadCharactersFromCore();
    log('characters async refresh done');
    charactersRefreshScheduled = false;
  })().catch(error => {
    charactersRefreshScheduled = false;
    log('characters async refresh failed', error instanceof Error ? error.message : String(error));
  });
}
