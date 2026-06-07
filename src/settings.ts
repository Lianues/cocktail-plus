import { EXTENSION_NAME } from './constants';
import { saveSettings, getCtx } from './st-context';
import { DEFAULT_LOCAL_SETTINGS, state } from './state';
import type { LocalSettings } from './types';

export function ensureLocalSettings(): LocalSettings {
  const ctx = getCtx();
  const root = ctx?.extensionSettings;
  if (!root) return state.localSettings;
  root[EXTENSION_NAME] = root[EXTENSION_NAME] || {};
  const s = root[EXTENSION_NAME];
  for (const [k, v] of Object.entries(DEFAULT_LOCAL_SETTINGS)) {
    if (s[k] === undefined) s[k] = v;
  }
  s.autoRegisterServiceWorker = Boolean(s.autoRegisterServiceWorker);
  s.autoWarm = Boolean(s.autoWarm);
  s.autoRefreshCharactersAfterAsyncMiss = Boolean(s.autoRefreshCharactersAfterAsyncMiss);
  s.autoCheckUpdates = Boolean(s.autoCheckUpdates);
  s.skippedUpdateVersion = String(s.skippedUpdateVersion ?? '').trim();
  state.localSettings = s;
  return s;
}

export function updateLocalBool(key: keyof LocalSettings, value: boolean) {
  const s = ensureLocalSettings() as any;
  s[key] = Boolean(value);
  state.localSettings = s;
  saveSettings();
}

export function updateLocalString(key: keyof LocalSettings, value: string) {
  const s = ensureLocalSettings() as any;
  s[key] = String(value ?? '');
  state.localSettings = s;
  saveSettings();
}
