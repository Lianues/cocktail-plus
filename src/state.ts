import type { BackendProbe, LocalSettings, ServiceWorkerState, UpdateStatus } from './types';

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  autoRegisterServiceWorker: true,
  autoWarm: true,
  autoRefreshCharactersAfterAsyncMiss: true,
  autoCheckUpdates: true,
  skippedUpdateVersion: '',
};

export const DEFAULT_UPDATE_STATUS: UpdateStatus = {
  checking: false,
  checked: false,
  currentVersion: null,
  latestVersion: null,
  updateAvailable: false,
  error: null,
  lastCheckedAt: null,
  backendSync: null,
};

export const state: {
  backend: BackendProbe | null;
  update: UpdateStatus;
  sw: ServiceWorkerState;
  busy: boolean;
  localSettings: LocalSettings;
} = {
  backend: null,
  update: { ...DEFAULT_UPDATE_STATUS },
  sw: {
    supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    registered: false,
    controlled: false,
    scriptURL: '',
    scope: '',
  },
  busy: false,
  localSettings: { ...DEFAULT_LOCAL_SETTINGS },
};
