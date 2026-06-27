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

export type RefreshProgress = {
  endpointKey: CacheEndpoint | string | null;
  reason: string | null;
  phase: 'starting' | 'requesting' | 'downloading' | 'transforming' | 'cached' | 'error' | string;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  ageMs: number;
  bytesReceived: number;
  totalBytes: number | null;
  speedBps: number;
  percent: number | null;
  etaMs: number | null;
  status: number | null;
  error: string | null;
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
  progress?: RefreshProgress | null;
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

export type BrowserLogEntry = {
  id: number;
  receivedAt: number;
  origin?: 'frontend' | 'backend';
  clientId?: string;
  level: string;
  message: string;
  args?: string[];
  stack?: string;
  pageUrl?: string;
  source?: string;
  line?: number | null;
  column?: number | null;
  userAgent?: string;
  user?: string;
  backendPid?: number | null;
  backendCwd?: string;
};

export type BrowserLogStatus = {
  total: number;
  maxEntries: number;
  maxFieldChars?: number;
  lastReceivedAt: number | null;
};

export type BrowserLogList = BrowserLogStatus & {
  ok: boolean;
  version: string;
  entries: BrowserLogEntry[];
  text: string;
};

export type UpdateStatus = {
  checking: boolean;
  checked: boolean;
  frontendCurrentVersion: string | null;
  frontendLatestVersion: string | null;
  frontendUpdateAvailable: boolean;
  backendCurrentVersion: string | null;
  backendLatestVersion: string | null;
  backendUpdateAvailable: boolean;
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
  browserLogs?: BrowserLogStatus;
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
