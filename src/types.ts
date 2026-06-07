export type CacheEndpoint = 'characters-all' | 'version';

export type BackendConfig = {
  enabled: boolean;
  serviceWorkerEnabled: boolean;
  cacheCharactersAll: boolean;
  cacheVersion: boolean;
  staleWhileRevalidate: boolean;
  maxStaleMs: number;
  shallowCharactersAll: boolean;
  diskCacheCharactersAll: boolean;
  diskCacheVersion: boolean;
  fastVersionOnMiss: boolean;
  asyncCharactersAllOnMiss: boolean;
  earlyBridgeEnabled: boolean;
  autoInstallEarlyBridge: boolean;
  earlyBridgePatchFetch: boolean;
  optimizeSettingsSave: boolean;
  settingsSaveNoopEnabled: boolean;
  settingsSavePatchEnabled: boolean;
  settingsSaveMaxPatchOperations: number;
  settingsSaveMaxPatchBytesRatio: number;
  optimizeChatSave: boolean;
  chatSaveNoopEnabled: boolean;
  chatSavePatchEnabled: boolean;
  chatSaveMaxPatchOperations: number;
  chatSaveMaxPatchBytesRatio: number;
  chatSaveCacheMaxEntries: number;
  optimizeSettingsGet: boolean;
  cacheSettingsGet: boolean;
  templatePreloadEnabled: boolean;
  startupPreloadEnabled: boolean;
  serviceWorkerFastRouteFallback: boolean;
  serviceWorkerSettingsGetFallback: boolean;
  serviceWorkerSettingsSaveFallback: boolean;
  serviceWorkerChatSaveFallback: boolean;
  serviceWorkerTemplateFallback: boolean;
  moduleProxyEnabled: boolean;
  patchStartupInit: boolean;
  patchI18nInit: boolean;
  patchSystemMessagesInit: boolean;
  patchExtensionManifests: boolean;
  patchParallelActivateExtensions: boolean;
};

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

export type SelfInstallStatus = {
  ok: boolean;
  pluginDir?: string;
  serverRoot?: string;
  dataRoot?: string;
  sourcePath?: string | null;
  candidates?: Array<{ path: string; exists: boolean; usable: boolean }>;
};

export type UpdateStatus = {
  checking: boolean;
  checked: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  error: string | null;
  lastCheckedAt: number | null;
  backendSync?: { ok: boolean; error?: string | null; result?: unknown } | null;
};

export type BackendProbe = {
  ok: boolean;
  version?: string;
  config?: BackendConfig;
  stats?: Record<string, unknown>;
  status?: CacheEntrySummary[];
  settingsGet?: SettingsGetStatus;
  settingsSave?: SettingsSaveStatus;
  chatSave?: ChatSaveStatus;
  serviceWorker?: { enabled: boolean; url: string; scope: string };
  earlyBridge?: EarlyBridgeStatus;
  selfInstall?: SelfInstallStatus;
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
