import { clearBrowserLogs, clearCache, fullProbe, installEarlyBridge, refreshBrowserLogs, refreshEarlyBridgeStatus, uninstallEarlyBridge, warm } from './api';
import { DISPLAY_NAME, DRAWER_ID, ROOT_ID } from './constants';
import { registerServiceWorker, unregisterServiceWorker } from './service-worker';
import { log } from './st-context';
import { ensureLocalSettings, updateLocalBool } from './settings';
import { state } from './state';
import { checkForUpdates, getUpdateRepoUrls, performUpdate } from './update-checker';
import type { LocalSettings } from './types';

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

const HELPER_SCRIPT_REMOTE_BASE_URLS = [
  'https://raw.githubusercontent.com/Lianues/cocktail-plus/main',
  'https://raw.giteeusercontent.com/lianues/cocktail-plus/raw/main',
];

function getHelperScriptUrls(fileName: string) {
  return HELPER_SCRIPT_REMOTE_BASE_URLS.map(baseUrl => `${baseUrl}/server-plugins/cocktail-plus/scripts/${fileName}`);
}

function getWindowsHelperCommand() {
  const urls = getHelperScriptUrls('cocktail-plus-helper.ps1').map(url => `'${quotePowerShellSingle(url)}'`).join(',');
  return `$urls=@(${urls}); $p=Join-Path $env:TEMP 'cocktail-plus-helper.ps1'; $ok=$false; foreach($u in $urls){ try { if(Test-Path $p){Remove-Item $p -Force -ErrorAction SilentlyContinue}; Invoke-WebRequest -UseBasicParsing $u -OutFile $p; if((Test-Path $p) -and ((Get-Item $p).Length -gt 0)){ $ok=$true; break } } catch {} }; if($ok){ try{ Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction SilentlyContinue }catch{}; try{ Unblock-File -LiteralPath $p -ErrorAction SilentlyContinue }catch{}; & $p } else { Write-Host '下载 cocktail-plus 后端脚本助手失败：请检查 GitHub/Gitee 网络。' -ForegroundColor Red }`;
}

function getWindowsCmdHelperCommand() {
  return `powershell -NoProfile -ExecutionPolicy Bypass -Command "${getWindowsHelperCommand()}"`;
}

function getUnixHelperCommand() {
  const urls = getHelperScriptUrls('cocktail-plus-helper.sh').map(url => `'${quoteSingle(url)}'`).join(' ');
  return `urls=(${urls}); f="\${TMPDIR:-/tmp}/cocktail-plus-helper.sh"; ok=0; for u in "\${urls[@]}"; do curl -fsSL "$u" -o "$f" && ok=1 && break; done; if [ "$ok" = 1 ]; then bash "$f"; else echo '下载 cocktail-plus 后端脚本助手失败：请检查 GitHub/Gitee 网络。'; fi`;
}

function renderHelperSection() {
  return `
    <div class="cp-section">
      <b>后端插件脚本助手</b>
      <div class="cp-muted">复制对应系统命令到运行 SillyTavern 的机器终端中执行；Windows 用户请按当前终端选择 PowerShell 或 CMD 版本。命令直接从 GitHub/Gitee 下载脚本，不经过酒馆本地网页地址，因此不受酒馆登录验证影响。脚本会定位 <code>config.yaml</code>，并可安装/删除后端插件、维护后端 <code>config.json</code>、开关 <code>enableServerPlugins</code> 或重启酒馆。</div>
      <div class="cp-command-block">
        <div class="cp-command-title">Windows PowerShell</div>
        <textarea id="cp_helper_windows_command" class="cp-command" rows="4" readonly>${escapeHtml(getWindowsHelperCommand())}</textarea>
        <button id="cp_copy_windows_helper" class="menu_button">复制 PowerShell 命令</button>
      </div>
      <div class="cp-command-block">
        <div class="cp-command-title">Windows CMD/命令提示符</div>
        <textarea id="cp_helper_windows_cmd_command" class="cp-command" rows="4" readonly>${escapeHtml(getWindowsCmdHelperCommand())}</textarea>
        <button id="cp_copy_windows_cmd_helper" class="menu_button">复制 CMD 命令</button>
      </div>
      <div class="cp-command-block">
        <div class="cp-command-title">Termux / Linux / macOS Bash</div>
        <textarea id="cp_helper_unix_command" class="cp-command" rows="4" readonly>${escapeHtml(getUnixHelperCommand())}</textarea>
        <button id="cp_copy_unix_helper" class="menu_button">复制 Linux/macOS 命令</button>
      </div>
    </div>
  `;
}

function versionLabel(value: string | null | undefined) {
  return escapeHtml(value || '-');
}

function renderVersionLine(label: string, current: string | null | undefined, latest: string | null | undefined, available: boolean, hint = '') {
  const suffix = hint ? `，${hint}` : '';
  if (available) {
    return `${label}：发现新版本 ${versionLabel(latest)}（当前 ${versionLabel(current)}${suffix}）`;
  }
  if (latest) {
    return `${label}：当前 ${versionLabel(current)}，远端 ${versionLabel(latest)}，已是最新`;
  }
  return `${label}：当前 ${versionLabel(current)}，远端未检查`;
}

function renderUpdateSection() {
  const u = state.update;
  const frontendCurrent = u.frontendCurrentVersion ?? u.currentVersion;
  const frontendLatest = u.frontendLatestVersion ?? u.latestVersion;
  const frontendUpdateAvailable = u.frontendUpdateAvailable ?? u.updateAvailable;
  const backendCurrent = u.backendCurrentVersion ?? state.backend?.version ?? null;
  const backendLatest = u.backendLatestVersion;
  const backendUpdateAvailable = u.backendUpdateAvailable;

  const status = u.checking
    ? '检查中…'
    : u.error
      ? `检查失败：${escapeHtml(u.error)}`
      : !u.checked
        ? `尚未检查远端版本；前端：${versionLabel(frontendCurrent)}；后端：${versionLabel(backendCurrent)}`
        : [
          renderVersionLine('前端扩展', frontendCurrent, frontendLatest, frontendUpdateAvailable),
          renderVersionLine('后端插件', backendCurrent, backendLatest, backendUpdateAvailable, '需用脚本助手单独更新'),
        ].join('<br>');

  return `
    <div class="cp-section">
      <b>更新检查（后端扩展和前端扩展更新是独立的，需要分别进行更新）</b>
      <div class="cp-muted">
        远端：${getUpdateRepoUrls().map((url, index) =>
          `<a href="${url}" target="_blank" rel="noopener noreferrer">${index === 0 ? 'GitHub' : 'Gitee'}</a>`
        ).join(' / ')}
        （自动检查时先 GitHub，失败后 Gitee）
      </div>
      <div class="cp-status cp-status-compact">${status}</div>
      <div class="cp-muted">上次检查：${fmtTime(u.lastCheckedAt)}；前端已跳过版本：${escapeHtml(state.localSettings.skippedUpdateVersion || '-')}</div>
      <div class="cp-actions cp-actions-top">
        <button id="cp_check_update" class="menu_button" ${u.checking ? 'disabled' : ''}>检查更新</button>
        <button id="cp_run_update" class="menu_button" ${frontendUpdateAvailable && !u.checking ? '' : 'disabled'}>更新前端</button>
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

function renderBrowserLogsSection() {
  const status = state.backend?.browserLogs;
  const logs = state.browserLogs;
  const text = logs?.text || '';
  const entries = logs?.entries || [];
  const last = status?.lastReceivedAt ? fmtTime(status.lastReceivedAt) : '-';
  return `
    <div class="cp-section">
      <b>浏览器日志接管</b>
      <div class="cp-muted">Early Bridge 会捕获浏览器 <code>console.*</code>、<code>window.onerror</code>、<code>unhandledrejection</code> 并上报到后端环形缓存。错误/警告也会在后端终端打印，方便没有浏览器控制台时复制。</div>
      <div class="cp-muted">后端缓存：${status ? `${status.total}/${status.maxEntries}` : '-'}；最近接收：${last}；当前显示：${entries.length} 条</div>
      <div class="cp-actions cp-actions-top">
        <button id="cp_browser_logs_refresh" class="menu_button" ${state.backend?.ok ? '' : 'disabled'}>刷新日志</button>
        <button id="cp_browser_logs_copy" class="menu_button" ${text ? '' : 'disabled'}>复制日志</button>
        <button id="cp_browser_logs_clear" class="menu_button" ${state.backend?.ok ? '' : 'disabled'}>清空日志</button>
      </div>
      <textarea id="cp_browser_logs_text" class="cp-command cp-browser-logs" rows="10" readonly>${escapeHtml(text || '暂无日志。点击“刷新日志”读取后端缓存。')}</textarea>
    </div>
  `;
}



export function renderPanel() {
  const root = ensurePanelShell();
  if (!root) return;
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

    ${renderBrowserLogsSection()}
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
  onClick('cp_browser_logs_refresh', async () => { await refreshBrowserLogs(300); });
  onClick('cp_browser_logs_clear', clearBrowserLogs);
  bindCopyCommand(root, 'cp_copy_windows_helper', 'cp_helper_windows_command');
  bindCopyCommand(root, 'cp_copy_windows_cmd_helper', 'cp_helper_windows_cmd_command');
  bindCopyCommand(root, 'cp_copy_unix_helper', 'cp_helper_unix_command');
  bindCopyCommand(root, 'cp_browser_logs_copy', 'cp_browser_logs_text');

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
