import { clearCache, fullProbe, installEarlyBridge, refreshEarlyBridgeStatus, uninstallEarlyBridge, updateBackendConfig, warm } from './api';
import { DISPLAY_NAME, DRAWER_ID, ROOT_ID } from './constants';
import { registerServiceWorker, unregisterServiceWorker } from './service-worker';
import { log } from './st-context';
import { ensureLocalSettings, updateLocalBool } from './settings';
import { state } from './state';
import { checkForUpdates, getUpdateRepoUrls, performUpdate } from './update-checker';
import type { BackendConfig, LocalSettings } from './types';

function fmtAge(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}min`;
}

function fmtBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '-';
  const n = Math.max(0, Number(bytes));
  if (n < 1024) return `${Math.round(n)}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function fmtTime(ts: number | null | undefined) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleString(); } catch { return '-'; }
}


function statusText() {
  const backend = state.backend?.ok ? '后端：可用' : '后端：未安装/未启用';
  const sw = state.sw.supported
    ? `SW：${state.sw.registered ? '已注册' : '未注册'} / ${state.sw.controlled ? '已接管' : '未接管当前页'}`
    : 'SW：浏览器不支持';
  return `${backend}；${sw}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function quoteSingle(value: string) {
  return String(value).replace(/'/g, "'\\''");
}

function quotePowerShellSingle(value: string) {
  return String(value).replace(/'/g, "''");
}

function getHelperScriptUrl(fileName: string) {
  try {
    const url = new URL(import.meta.url);
    url.pathname = url.pathname.replace(/\/dist\/index\.js$/, `/scripts/${fileName}`);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return `${location.origin}/scripts/extensions/third-party/cocktail-plus/scripts/${fileName}`;
  }
}

function getWindowsHelperCommand() {
  const url = quotePowerShellSingle(getHelperScriptUrl('cocktail-plus-helper.ps1'));
  return `$u='${url}'; $p=Join-Path $env:TEMP 'cocktail-plus-helper.ps1'; Invoke-WebRequest -UseBasicParsing $u -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p`;
}

function getUnixHelperCommand() {
  const url = quoteSingle(getHelperScriptUrl('cocktail-plus-helper.sh'));
  return `u='${url}'; f="\${TMPDIR:-/tmp}/cocktail-plus-helper.sh"; curl -fsSL "$u" -o "$f" && bash "$f"`;
}

function renderHelperSection() {
  return `
    <div class="cp-section">
      <b>后端插件脚本助手</b>
      <div class="cp-muted">复制对应系统命令到运行 SillyTavern 的机器终端中执行；脚本会优先从进程定位 SillyTavern，失败后扫描/手动选择 <code>config.yaml</code>，并可安装/删除后端插件或开关 <code>enableServerPlugins</code>。</div>
      <div class="cp-command-block">
        <div class="cp-command-title">Windows PowerShell</div>
        <textarea id="cp_helper_windows_command" class="cp-command" rows="4" readonly>${escapeHtml(getWindowsHelperCommand())}</textarea>
        <button id="cp_copy_windows_helper" class="menu_button">复制 Windows 命令</button>
      </div>
      <div class="cp-command-block">
        <div class="cp-command-title">Linux / macOS Bash</div>
        <textarea id="cp_helper_unix_command" class="cp-command" rows="4" readonly>${escapeHtml(getUnixHelperCommand())}</textarea>
        <button id="cp_copy_unix_helper" class="menu_button">复制 Linux/macOS 命令</button>
      </div>
    </div>
  `;
}

function renderUpdateSection() {
  const u = state.update;
  const status = u.checking
    ? '检查中…'
    : u.error
      ? `检查失败：${escapeHtml(u.error)}`
      : !u.checked
        ? '尚未检查'
        : u.updateAvailable
          ? `发现新版本：${escapeHtml(u.latestVersion)}（当前 ${escapeHtml(u.currentVersion)}）`
          : `当前已是最新版本：${escapeHtml(u.currentVersion ?? '-')}`;

  const backendSync = u.backendSync
    ? `<div class="cp-muted">后端同步：${u.backendSync.ok ? '成功/已跳过' : `失败：${escapeHtml(u.backendSync.error ?? '')}`}</div>`
    : '';

  return `
    <div class="cp-section">
      <b>更新检查</b>
      <div class="cp-muted">
        远端：${getUpdateRepoUrls().map((url, index) =>
          `<a href="${url}" target="_blank" rel="noopener noreferrer">${index === 0 ? 'GitHub' : 'Gitee'}</a>`
        ).join(' / ')}
        （自动检查时先 GitHub，失败后 Gitee）
      </div>
      <div class="cp-status cp-status-compact">${status}</div>
      <div class="cp-muted">上次检查：${fmtTime(u.lastCheckedAt)}；已跳过版本：${escapeHtml(state.localSettings.skippedUpdateVersion || '-')}</div>
      ${backendSync}
      <div class="cp-actions cp-actions-top">
        <button id="cp_check_update" class="menu_button" ${u.checking ? 'disabled' : ''}>检查更新</button>
        <button id="cp_run_update" class="menu_button" ${u.updateAvailable && !u.checking ? '' : 'disabled'}>更新前端${state.backend?.ok ? '并同步后端' : ''}</button>
      </div>
    </div>
  `;
}


function getHost() {
  return document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
}

function ensurePanelShell() {
  const host = getHost();
  if (!host) return null;

  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  const drawer = document.createElement('div');
  drawer.id = DRAWER_ID;
  drawer.className = 'inline-drawer';
  drawer.innerHTML = `
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>${DISPLAY_NAME}</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div id="${ROOT_ID}" class="cp-panel"></div>
    </div>
  `;
  host.appendChild(drawer);
  root = document.getElementById(ROOT_ID);
  return root;
}

function checkbox(id: string, label: string, checked: boolean, disabled = false) {
  return `<label class="cp-check"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${label}</label>`;
}

function renderCacheTable() {
  const rows = state.backend?.status ?? [];
  if (!rows.length) return '<div class="cp-muted">暂无缓存状态。</div>';
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>状态</th><th>大小</th><th>年龄</th><th>耗时</th><th>命中</th><th>stale</th></tr></thead>
      <tbody>
        ${rows.map(row => {
          const e = row.entry;
          return `<tr>
            <td><code>${row.endpointKey}</code></td>
            <td>${row.refreshing ? '刷新中' : e ? e.status : '-'}</td>
            <td>${e ? `${Math.round(e.bytes / 1024)}KB` : '-'}</td>
            <td>${e ? fmtAge(e.ageMs) : '-'}</td>
            <td>${e ? fmtAge(e.durationMs) : '-'}</td>
            <td>${e?.hitCount ?? 0}</td>
            <td>${e?.staleHitCount ?? 0}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderSettingsGetStats() {
  const status = state.backend?.settingsGet;
  if (!status) return '<div class="cp-muted">暂无 settings/get 优化状态。</div>';
  const s = status.stats;
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>启用</th><th>缓存</th><th>请求</th><th>HIT</th><th>MISS</th><th>错误</th><th>返回大小</th><th>最后状态</th><th>构建</th></tr></thead>
      <tbody>
        <tr>
          <td><code>${status.endpointKey}</code></td>
          <td>${status.enabled ? '是' : '否'}</td>
          <td>${status.cacheEnabled ? '是' : '否'}</td>
          <td>${s.requests}</td>
          <td>${s.hits}</td>
          <td>${s.misses}</td>
          <td>${s.errors}</td>
          <td>${fmtBytes(s.responseBytes)}</td>
          <td>${s.lastState ?? '-'}</td>
          <td>${fmtAge(s.lastBuildMs)}</td>
        </tr>
      </tbody>
    </table>
    <div class="cp-muted">
      fast settings/get 保持原始响应结构，返回真实 Kobold/NovelAI/TextGen/OpenAI 预设、themes、instruct/context/sysprompt/reasoning 等字段；优化点是并行读取目录与内存缓存，不再做大字段过滤。
    </div>
  `;
}

function renderSettingsSaveStats() {
  const status = state.backend?.settingsSave;
  if (!status) return '<div class="cp-muted">暂无 settings/save 优化状态。</div>';
  const s = status.stats;
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>启用</th><th>请求</th><th>patch</th><th>no-op</th><th>冲突</th><th>错误</th><th>节省上传</th><th>最后状态</th></tr></thead>
      <tbody>
        <tr>
          <td><code>${status.endpointKey}</code></td>
          <td>${status.enabled ? '是' : '否'}</td>
          <td>${s.requests}</td>
          <td>${s.patches}</td>
          <td>${s.noops}</td>
          <td>${s.conflicts}</td>
          <td>${s.errors}</td>
          <td>${fmtBytes(s.savedBytes)} / ${fmtBytes(s.originalBytes)} → ${fmtBytes(s.optimizedBytes)}</td>
          <td>${s.lastState ?? '-'}</td>
        </tr>
      </tbody>
    </table>
    <div class="cp-muted">
      工作方式：Early Bridge / Service Worker 捕获 <code>/api/settings/get</code> 作为基线，保存时将 <code>/api/settings/save</code> 改为 no-op hash 或深层 JSON patch；冲突/失败自动回退原始完整保存。
    </div>
  `;
}

function renderChatSaveStats() {
  const status = state.backend?.chatSave;
  if (!status) return '<div class="cp-muted">暂无 chat/save 优化状态。</div>';
  const s = status.stats;
  return `
    <table class="cp-table">
      <thead><tr><th>接口</th><th>启用</th><th>请求</th><th>patch</th><th>no-op</th><th>冲突</th><th>错误</th><th>缓存</th><th>节省上传</th><th>最后状态</th></tr></thead>
      <tbody>
        <tr>
          <td><code>${status.endpointKey}</code></td>
          <td>${status.enabled ? '是' : '否'}</td>
          <td>${s.requests}</td>
          <td>${s.patches}</td>
          <td>${s.noops}</td>
          <td>${s.conflicts}</td>
          <td>${s.errors}</td>
          <td>${status.cacheEntries} 项 / hit ${s.cacheHits} / miss ${s.cacheMisses} / 失效 ${s.cacheInvalidations}</td>
          <td>${fmtBytes(s.savedBytes)} / ${fmtBytes(s.originalBytes)} → ${fmtBytes(s.optimizedBytes)}</td>
          <td>${s.lastState ?? '-'}</td>
        </tr>
      </tbody>
    </table>
    <div class="cp-muted">
      工作方式：Early Bridge 捕获 <code>/api/chats/get</code> / <code>/api/chats/group/get</code> 作为基线，保存时将完整聊天上传改为 no-op hash 或聊天数组 patch；后端以内存缓存和文件 stat 校验当前 JSONL，冲突/失败自动回退原始保存。
    </div>
  `;
}


export function renderPanel() {
  const root = ensurePanelShell();
  if (!root) return;
  const cfg = state.backend?.config;
  const s = ensureLocalSettings();

  root.innerHTML = `
    <div class="cp-status">${statusText()}</div>
    <div class="cp-status">Early Bridge：${state.backend?.earlyBridge?.installed ? (state.backend.earlyBridge.upToDate ? '已安装（最新）' : '已安装（需更新）') : '未安装'}；注入位置：<code>${state.backend?.earlyBridge?.bridgeSrc ?? '-'}</code></div>
    <div class="cp-help">
      通过 Service Worker + Early Bridge + 后端 Server Plugin 优化 SillyTavern 原始接口；当前优化 <code>/api/characters/all</code>、<code>/version</code>、<code>/api/settings/save</code> 与 <code>/api/chats/save</code>。
    </div>

    <div class="cp-actions">
      <button id="cp_refresh" class="menu_button">刷新状态</button>
      <button id="cp_register_sw" class="menu_button" ${state.backend?.ok && state.sw.supported ? '' : 'disabled'}>注册/更新 SW</button>
      <button id="cp_unregister_sw" class="menu_button" ${state.sw.registered ? '' : 'disabled'}>注销 SW</button>
      <button id="cp_warm" class="menu_button" ${state.backend?.ok ? '' : 'disabled'}>后台预热</button>
      <button id="cp_warm_wait" class="menu_button" ${state.backend?.ok ? '' : 'disabled'}>预热并等待</button>
      <button id="cp_clear" class="menu_button" ${state.backend?.ok ? '' : 'disabled'}>清空缓存</button>
      <button id="cp_early_status" class="menu_button" ${state.backend?.ok ? '' : 'disabled'}>刷新 Early 状态</button>
      <button id="cp_early_install" class="menu_button" ${state.backend?.ok ? '' : 'disabled'}>安装/更新 Early Bridge</button>
      <button id="cp_early_uninstall" class="menu_button" ${state.backend?.earlyBridge?.installed ? '' : 'disabled'}>卸载 Early Bridge</button>
    </div>

    ${renderUpdateSection()}

    ${renderHelperSection()}

    <div class="cp-section">
      <b>前端本地选项</b>
      <div class="cp-grid">
        ${checkbox('cp_auto_sw', '后端可用时自动注册 SW', s.autoRegisterServiceWorker)}
        ${checkbox('cp_auto_warm', '后端可用时自动预热', s.autoWarm)}
        ${checkbox('cp_auto_refresh_chars', 'ASYNC-MISS 后缓存就绪自动刷新角色列表', s.autoRefreshCharactersAfterAsyncMiss)}
        ${checkbox('cp_auto_check_updates', '启动后自动异步检查 GitHub 更新', s.autoCheckUpdates)}
      </div>
    </div>

    <div class="cp-section">
      <b>后端配置</b>
      ${cfg ? `
        <div class="cp-grid">
          ${checkbox('cp_cfg_enabled', '启用后端加速', cfg.enabled)}
          ${checkbox('cp_cfg_sw', '允许提供 Service Worker', cfg.serviceWorkerEnabled)}
          ${checkbox('cp_cfg_characters', '缓存 characters/all', cfg.cacheCharactersAll)}
          ${checkbox('cp_cfg_version', '缓存 /version', cfg.cacheVersion)}
          ${checkbox('cp_cfg_stale', '允许 stale-while-revalidate', cfg.staleWhileRevalidate)}
          ${checkbox('cp_cfg_shallow_chars', 'characters/all 返回浅层角色列表', cfg.shallowCharactersAll)}
          ${checkbox('cp_cfg_disk_characters', 'characters/all 浅层磁盘缓存（推荐）', cfg.diskCacheCharactersAll)}
          ${checkbox('cp_cfg_disk_version', '/version 磁盘缓存', cfg.diskCacheVersion)}
          ${checkbox('cp_cfg_fast_version', '/version 无缓存时快速文件响应并后台刷新', cfg.fastVersionOnMiss)}
          ${checkbox('cp_cfg_async_chars', '无 characters 缓存时先返回空列表并后台构建', cfg.asyncCharactersAllOnMiss)}
          ${checkbox('cp_cfg_early_enabled', '启用 Early Bridge 脚本', cfg.earlyBridgeEnabled)}
          ${checkbox('cp_cfg_early_auto_install', '后端启动时自动注入 Early Bridge', cfg.autoInstallEarlyBridge)}
          ${checkbox('cp_cfg_early_patch_fetch', 'Early Bridge 在 script.js 前 patch fetch', cfg.earlyBridgePatchFetch)}
          ${checkbox('cp_cfg_settings_get', '优化 /api/settings/get 下载', cfg.optimizeSettingsGet)}
          ${checkbox('cp_cfg_settings_get_cache', '缓存 settings/get 轻量响应', cfg.cacheSettingsGet)}
          ${checkbox('cp_cfg_startup_preload', '提前预取 /version 响应', cfg.startupPreloadEnabled)}
          ${checkbox('cp_cfg_template_preload', '并行预取 scripts/templates 模板', cfg.templatePreloadEnabled)}
          ${checkbox('cp_cfg_sw_fast_route_fallback', 'SW 兜底 /version 与 characters/all（默认关）', cfg.serviceWorkerFastRouteFallback)}
          ${checkbox('cp_cfg_sw_settings_get_fallback', 'SW 兜底 settings/get（默认关）', cfg.serviceWorkerSettingsGetFallback)}
          ${checkbox('cp_cfg_sw_settings_save_fallback', 'SW 兜底 settings/save（默认关）', cfg.serviceWorkerSettingsSaveFallback)}
          ${checkbox('cp_cfg_sw_chat_save_fallback', 'SW 兜底 chat/save（默认关）', cfg.serviceWorkerChatSaveFallback)}
          ${checkbox('cp_cfg_sw_template_fallback', 'SW 兜底模板缓存（默认关）', cfg.serviceWorkerTemplateFallback)}
          ${checkbox('cp_cfg_module_proxy', '模块代理替换酒馆串行代码', cfg.moduleProxyEnabled)}
          ${checkbox('cp_cfg_patch_startup_init', '替换 firstLoadInit 串行等待', cfg.patchStartupInit)}
          ${checkbox('cp_cfg_patch_i18n_init', '替换 initLocales 串行等待', cfg.patchI18nInit)}
          ${checkbox('cp_cfg_patch_system_messages', '替换 initSystemMessages 模板串行', cfg.patchSystemMessagesInit)}
          ${checkbox('cp_cfg_patch_extension_manifests', '替换 getManifests 使用预取结果', cfg.patchExtensionManifests)}
          ${checkbox('cp_cfg_patch_parallel_extensions', '并行激活扩展（实验）', cfg.patchParallelActivateExtensions)}
          ${checkbox('cp_cfg_settings_save', '优化 /api/settings/save 大上传', cfg.optimizeSettingsSave)}
          ${checkbox('cp_cfg_settings_save_noop', 'settings/save 启用 no-op hash', cfg.settingsSaveNoopEnabled)}
          ${checkbox('cp_cfg_settings_save_patch', 'settings/save 启用深层 JSON patch', cfg.settingsSavePatchEnabled)}
          ${checkbox('cp_cfg_chat_save', '优化 /api/chats/save 大上传', cfg.optimizeChatSave)}
          ${checkbox('cp_cfg_chat_save_noop', 'chat/save 启用 no-op hash', cfg.chatSaveNoopEnabled)}
          ${checkbox('cp_cfg_chat_save_patch', 'chat/save 启用聊天 patch', cfg.chatSavePatchEnabled)}
          <label class="cp-field">最大 stale 时间(ms)<input id="cp_cfg_max_stale" type="number" min="0" max="86400000" step="1000" value="${cfg.maxStaleMs}"></label>
          <label class="cp-field">settings patch 最大操作数<input id="cp_cfg_settings_save_max_ops" type="number" min="1" max="100000" step="100" value="${cfg.settingsSaveMaxPatchOperations}"></label>
          <label class="cp-field">settings patch/full 比例阈值<input id="cp_cfg_settings_save_ratio" type="number" min="0.05" max="2" step="0.05" value="${cfg.settingsSaveMaxPatchBytesRatio}"></label>
          <label class="cp-field">chat patch 最大操作数<input id="cp_cfg_chat_save_max_ops" type="number" min="1" max="100000" step="100" value="${cfg.chatSaveMaxPatchOperations}"></label>
          <label class="cp-field">chat patch/full 比例阈值<input id="cp_cfg_chat_save_ratio" type="number" min="0.05" max="2" step="0.05" value="${cfg.chatSaveMaxPatchBytesRatio}"></label>
          <label class="cp-field">chat 后端缓存条目<input id="cp_cfg_chat_save_cache_entries" type="number" min="0" max="1024" step="1" value="${cfg.chatSaveCacheMaxEntries}"></label>
        </div>
      ` : '<div class="cp-muted">后端不可用，无法显示配置。</div>'}
    </div>

    <div class="cp-section">
      <b>缓存状态</b>
      ${renderCacheTable()}
    </div>

    <div class="cp-section">
      <b>settings/get 优化状态</b>
      ${renderSettingsGetStats()}
    </div>

    <div class="cp-section">
      <b>settings/save 优化状态</b>
      ${renderSettingsSaveStats()}
    </div>

    <div class="cp-section">
      <b>chat/save 优化状态</b>
      ${renderChatSaveStats()}
    </div>
  `;

  bindPanelEvents(root);
}

function bindPanelEvents(root: HTMLElement) {
  const onClick = (id: string, fn: () => Promise<void> | void) => {
    root.querySelector(`#${id}`)?.addEventListener('click', () => runBusy(fn));
  };
  onClick('cp_refresh', fullProbe);
  onClick('cp_register_sw', registerServiceWorker);
  onClick('cp_unregister_sw', unregisterServiceWorker);
  onClick('cp_warm', async () => warm(false));
  onClick('cp_warm_wait', async () => warm(true));
  onClick('cp_clear', clearCache);
  onClick('cp_early_status', refreshEarlyBridgeStatus);
  onClick('cp_early_install', installEarlyBridge);
  onClick('cp_early_uninstall', uninstallEarlyBridge);
  onClick('cp_check_update', async () => { await checkForUpdates({ manual: true, prompt: true }); });
  onClick('cp_run_update', performUpdate);
  bindCopyCommand(root, 'cp_copy_windows_helper', 'cp_helper_windows_command');
  bindCopyCommand(root, 'cp_copy_unix_helper', 'cp_helper_unix_command');

  const onLocalBool = (id: string, key: keyof LocalSettings) => {
    const el = root.querySelector<HTMLInputElement>(`#${id}`);
    el?.addEventListener('change', () => {
      updateLocalBool(key, Boolean(el.checked));
      renderPanel();
    });
  };
  onLocalBool('cp_auto_sw', 'autoRegisterServiceWorker');
  onLocalBool('cp_auto_warm', 'autoWarm');
  onLocalBool('cp_auto_refresh_chars', 'autoRefreshCharactersAfterAsyncMiss');
  onLocalBool('cp_auto_check_updates', 'autoCheckUpdates');

  const onCfgBool = (id: string, key: keyof BackendConfig) => {
    const el = root.querySelector<HTMLInputElement>(`#${id}`);
    el?.addEventListener('change', () => runBusy(() => updateBackendConfig({ [key]: Boolean(el.checked) } as Partial<BackendConfig>)));
  };
  onCfgBool('cp_cfg_enabled', 'enabled');
  onCfgBool('cp_cfg_sw', 'serviceWorkerEnabled');
  onCfgBool('cp_cfg_characters', 'cacheCharactersAll');
  onCfgBool('cp_cfg_version', 'cacheVersion');
  onCfgBool('cp_cfg_stale', 'staleWhileRevalidate');
  onCfgBool('cp_cfg_shallow_chars', 'shallowCharactersAll');
  onCfgBool('cp_cfg_disk_characters', 'diskCacheCharactersAll');
  onCfgBool('cp_cfg_disk_version', 'diskCacheVersion');
  onCfgBool('cp_cfg_fast_version', 'fastVersionOnMiss');
  onCfgBool('cp_cfg_async_chars', 'asyncCharactersAllOnMiss');
  onCfgBool('cp_cfg_early_enabled', 'earlyBridgeEnabled');
  onCfgBool('cp_cfg_early_auto_install', 'autoInstallEarlyBridge');
  onCfgBool('cp_cfg_early_patch_fetch', 'earlyBridgePatchFetch');
  onCfgBool('cp_cfg_settings_get', 'optimizeSettingsGet');
  onCfgBool('cp_cfg_settings_get_cache', 'cacheSettingsGet');
  onCfgBool('cp_cfg_startup_preload', 'startupPreloadEnabled');
  onCfgBool('cp_cfg_template_preload', 'templatePreloadEnabled');
  onCfgBool('cp_cfg_sw_fast_route_fallback', 'serviceWorkerFastRouteFallback');
  onCfgBool('cp_cfg_sw_settings_get_fallback', 'serviceWorkerSettingsGetFallback');
  onCfgBool('cp_cfg_sw_settings_save_fallback', 'serviceWorkerSettingsSaveFallback');
  onCfgBool('cp_cfg_sw_chat_save_fallback', 'serviceWorkerChatSaveFallback');
  onCfgBool('cp_cfg_sw_template_fallback', 'serviceWorkerTemplateFallback');
  onCfgBool('cp_cfg_module_proxy', 'moduleProxyEnabled');
  onCfgBool('cp_cfg_patch_startup_init', 'patchStartupInit');
  onCfgBool('cp_cfg_patch_i18n_init', 'patchI18nInit');
  onCfgBool('cp_cfg_patch_system_messages', 'patchSystemMessagesInit');
  onCfgBool('cp_cfg_patch_extension_manifests', 'patchExtensionManifests');
  onCfgBool('cp_cfg_patch_parallel_extensions', 'patchParallelActivateExtensions');
  onCfgBool('cp_cfg_settings_save', 'optimizeSettingsSave');
  onCfgBool('cp_cfg_settings_save_noop', 'settingsSaveNoopEnabled');
  onCfgBool('cp_cfg_settings_save_patch', 'settingsSavePatchEnabled');
  onCfgBool('cp_cfg_chat_save', 'optimizeChatSave');
  onCfgBool('cp_cfg_chat_save_noop', 'chatSaveNoopEnabled');
  onCfgBool('cp_cfg_chat_save_patch', 'chatSavePatchEnabled');

  const staleEl = root.querySelector<HTMLInputElement>('#cp_cfg_max_stale');
  staleEl?.addEventListener('change', () => {
    const value = Math.max(0, Math.min(86_400_000, Math.trunc(Number(staleEl.value) || 0)));
    runBusy(() => updateBackendConfig({ maxStaleMs: value }));
  });

  const settingsSaveMaxOpsEl = root.querySelector<HTMLInputElement>('#cp_cfg_settings_save_max_ops');
  settingsSaveMaxOpsEl?.addEventListener('change', () => {
    const value = Math.max(1, Math.min(100_000, Math.trunc(Number(settingsSaveMaxOpsEl.value) || 2000)));
    runBusy(() => updateBackendConfig({ settingsSaveMaxPatchOperations: value }));
  });

  const settingsSaveRatioEl = root.querySelector<HTMLInputElement>('#cp_cfg_settings_save_ratio');
  settingsSaveRatioEl?.addEventListener('change', () => {
    const value = Math.max(0.05, Math.min(2, Number(settingsSaveRatioEl.value) || 0.85));
    runBusy(() => updateBackendConfig({ settingsSaveMaxPatchBytesRatio: value }));
  });

  const chatSaveMaxOpsEl = root.querySelector<HTMLInputElement>('#cp_cfg_chat_save_max_ops');
  chatSaveMaxOpsEl?.addEventListener('change', () => {
    const value = Math.max(1, Math.min(100_000, Math.trunc(Number(chatSaveMaxOpsEl.value) || 5000)));
    runBusy(() => updateBackendConfig({ chatSaveMaxPatchOperations: value }));
  });

  const chatSaveRatioEl = root.querySelector<HTMLInputElement>('#cp_cfg_chat_save_ratio');
  chatSaveRatioEl?.addEventListener('change', () => {
    const value = Math.max(0.05, Math.min(2, Number(chatSaveRatioEl.value) || 0.85));
    runBusy(() => updateBackendConfig({ chatSaveMaxPatchBytesRatio: value }));
  });

  const chatSaveCacheEntriesEl = root.querySelector<HTMLInputElement>('#cp_cfg_chat_save_cache_entries');
  chatSaveCacheEntriesEl?.addEventListener('change', () => {
    const value = Math.max(0, Math.min(1024, Math.trunc(Number(chatSaveCacheEntriesEl.value) || 64)));
    runBusy(() => updateBackendConfig({ chatSaveCacheMaxEntries: value }));
  });
}

async function runBusy(fn: () => Promise<void> | void) {
  if (state.busy) return;
  state.busy = true;
  try { await fn(); }
  catch (error) { log('操作失败', error instanceof Error ? error.message : String(error)); }
  finally { state.busy = false; renderPanel(); }
}

function bindCopyCommand(root: HTMLElement, buttonId: string, textareaId: string) {
  const button = root.querySelector<HTMLButtonElement>(`#${buttonId}`);
  const textarea = root.querySelector<HTMLTextAreaElement>(`#${textareaId}`);
  if (!button || !textarea) return;
  button.addEventListener('click', async () => {
    const text = textarea.value;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
      }
      const oldText = button.textContent || '复制';
      button.textContent = '已复制';
      setTimeout(() => { button.textContent = oldText; }, 1500);
    } catch (error) {
      log('复制命令失败，请手动选中文本复制', error instanceof Error ? error.message : String(error));
    }
  });
}
