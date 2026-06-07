export type CacheEndpoint = 'characters-all' | 'version';

export type EarlyBridgeStatus = {
  ok: boolean;
  enabled: boolean;
  autoInstall: boolean;
  installed: boolean;
  upToDate: boolean;
  indexPath: string;
  bridgeSrc: string;
  markerStartCount: number;
  markerEndCount: number;
  scriptIdCount: number;
  backupDir: string;
};

export type CacheEntrySummary = {
  endpointKey: CacheEndpoint;
  entry: null | {
    endpointKey: CacheEndpoint;
    status: number;
    bytes: number;
    transform?: unknown;
    createdAt: number;
    refreshedAt: number;
    ageMs: number;
    durationMs: number;
    hitCount: number;
    staleHitCount: number;
    lastError: string | null;
  };
  refreshing?: boolean;
};

export type SettingsSaveStatus = {
  endpointKey: 'settings-save';
  enabled: boolean;
  patchEnabled: boolean;
  noopEnabled: boolean;
  stats: {
    requests: number;
    noops: number;
    patches: number;
    fulls: number;
    conflicts: number;
    errors: number;
    originalBytes: number;
    optimizedBytes: number;
    savedBytes: number;
    lastMode: string | null;
    lastState: string | null;
    lastError: string | null;
    lastAt: string | null;
  };
};

export type ChatSaveStatus = {
  endpointKey: 'chat-save';
  enabled: boolean;
  patchEnabled: boolean;
  noopEnabled: boolean;
  cacheEntries: number;
  stats: {
    requests: number;
    noops: number;
    patches: number;
    fulls: number;
    conflicts: number;
    errors: number;
    originalBytes: number;
    optimizedBytes: number;
    savedBytes: number;
    cacheHits: number;
    cacheMisses: number;
    cacheInvalidations: number;
    cacheEvictions: number;
    lastMode: string | null;
    lastState: string | null;
    lastError: string | null;
    lastAt: string | null;
  };
};

export type SettingsGetStatus = {
  endpointKey: 'settings-get';
  enabled: boolean;
  cacheEnabled: boolean;
  stats: {
    requests: number;
    hits: number;
    misses: number;
    bypasses: number;
    errors: number;
    responseBytes: number;
    lastState: string | null;
    lastError: string | null;
    lastAt: string | null;
    lastBuildMs: number;
  };
};

export type UpdateStatus = {
  checking: boolean;
  checked: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  error: string | null;
  lastCheckedAt: number | null;
};

export type BackendProbe = {
  ok: boolean;
  version?: string;
  paths?: {
    cwd?: string;
    serverRoot?: string;
    dataRoot?: string;
    pluginDir?: string;
  };
  stats?: Record<string, unknown>;
  status?: CacheEntrySummary[];
  settingsGet?: SettingsGetStatus;
  settingsSave?: SettingsSaveStatus;
  chatSave?: ChatSaveStatus;
  serviceWorker?: { enabled: boolean; url: string; scope: string };
  earlyBridge?: EarlyBridgeStatus;
};

export type LocalSettings = {
  autoRegisterServiceWorker: boolean;
  autoWarm: boolean;
  autoRefreshCharactersAfterAsyncMiss: boolean;
  autoCheckUpdates: boolean;
  skippedUpdateVersion: string;
};

export type ServiceWorkerState = {
  supported: boolean;
  registered: boolean;
  controlled: boolean;
  scriptURL: string;
  scope: string;
};
