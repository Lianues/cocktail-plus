# cocktail-plus

这是一个 **独立 SillyTavern 前端扩展 + 可选后端 Server Plugin**，用于对 SillyTavern 的前端交互和后端接口进行非侵入式性能优化。

当前已实现优化：

```text
GET  /version
POST /api/characters/all
```

`/api/settings/get` 的拦截和缓存逻辑已经移除，settings 暂时保持 SillyTavern 原样。

## 当前优化策略

### `/api/characters/all`

- Service Worker 拦截原始 `/api/characters/all`。
- 转发到 `/api/plugins/cocktail-plus/fast/characters-all`。
- 后端把完整角色列表转换为 SillyTavern 原生 shallow character 列表。
- 默认写入磁盘缓存，后端重启后也可直接命中。
- 首次无缓存时可返回 `[]` + `ASYNC-MISS`，后台构建缓存，前端缓存就绪后自动刷新角色列表。

### `/version`

SillyTavern 原版 `/version` 会调用 `src/util.js` 中的 `getVersion()`，内部执行多次 git 命令：

```text
git rev-parse --short HEAD
git rev-parse --abbrev-ref HEAD
git show -s --format=%ci
git rev-parse @{u}
git rev-parse HEAD
git rev-parse <trackingBranch>
```

这些 git 调用会造成启动阶段约数百毫秒等待。

当前插件做法：

- Service Worker 拦截 `GET /version`。
- 转发到 `/api/plugins/cocktail-plus/fast/version`。
- 如果已有缓存，直接返回缓存。
- 如果无缓存，快速读取 `package.json` 与 `.git/HEAD` / ref 文件，返回一个快速版本对象。
- 同时后台请求原始 `/version`，得到完整准确版本信息后写入缓存。
- 默认写入磁盘缓存，后端重启后可直接命中。

### Early Bridge（首次前端加载前接管）

标准 SillyTavern 前端扩展要等 `/api/settings/get` 完成、扩展系统开始加载后才会执行，无法影响更早的启动阶段。

本插件现在由后端 Server Plugin 在启动时自动给：

```text
SillyTavern/public/index.html
```

插入一个极小的桥接脚本：

```html
<script id="cocktail-plus-early-bridge" src="/api/plugins/cocktail-plus/early/bridge.js"></script>
```

它会被插在 `<head>` 后面，早于 `script.js` 执行。桥接脚本只做通用入口，后续功能由后端 `/early/bridge.js` 输出更新，不需要每次修改 HTML。

当前 Early Bridge 做两件事：

- 尽早注册 `/api/plugins/cocktail-plus/sw.js`。
- 在 `script.js` 前 patch `window.fetch`，把 `/version`、`/api/characters/all` 改道到后端 fast endpoints。这样即使 Service Worker 当前页面还没接管，首次页面加载也能生效。

## 缓存目录

磁盘缓存放在后端插件目录内，方便用户确认这些文件属于本扩展：

```text
SillyTavern/plugins/cocktail-plus/cache/
```

例如本地默认路径：

```text
E:\酒馆\SillyTavern\plugins\cocktail-plus\cache\
```

## 目录结构

```text
cocktail-plus/
  manifest.json
  src/                                      # 前端 TypeScript 源码
    constants.ts
    types.ts
    state.ts
    st-context.ts
    api.ts
    settings.ts
    service-worker.ts
    panel.ts
    characters-refresh.ts
    fetch-observer.ts
    index.ts                               # 前端入口，只做初始化编排
  dist/                                    # 前端构建产物，SillyTavern 实际加载
  server-plugins/
    cocktail-plus/
      src/                                 # 后端 TypeScript 源码
        constants.ts
        config.ts
        stats.ts
        utils.ts
        request-context.ts
        endpoint-registry.ts
        cache-store.ts
        original-fetch.ts
        fast-handler.ts
        service-worker.ts
        routes.ts
        endpoints/
          characters-all.ts
          version.ts
        index.ts                           # 后端入口，只注册路由/导出生命周期
      index.mjs                            # 后端运行产物，SillyTavern 实际加载
```

## 构建

```bash
cd cocktail-plus
npm install
npm run build
```

## 一键构建并部署到本地酒馆

默认目标：

```text
E:\酒馆\SillyTavern
```

执行：

```powershell
.\deploy-to-sillytavern.bat
```

或：

```powershell
npm run deploy
```

脚本会自动：

1. 如缺少 `node_modules`，先执行 `npm install`。
2. 执行 `npm run build`。
3. 覆盖前端扩展到 `E:\酒馆\SillyTavern\public\scripts\extensions\third-party\cocktail-plus\`。
4. 覆盖后端插件到 `E:\酒馆\SillyTavern\plugins\cocktail-plus\`，并保留目标端的 `config.json` 与 `cache/`。
5. 自动备份旧版本到 `.deploy-backups/`。

## 安装后端插件

复制：

```text
cocktail-plus/server-plugins/cocktail-plus/
```

到：

```text
SillyTavern/plugins/cocktail-plus/
```

并在 `config.yaml` 启用：

```yaml
enableServerPlugins: true
```

然后重启酒馆。

## 调试

### Early Bridge 状态

后端 API：

```text
POST /api/plugins/cocktail-plus/early/status
POST /api/plugins/cocktail-plus/early/install
POST /api/plugins/cocktail-plus/early/uninstall
GET  /api/plugins/cocktail-plus/early/bridge.js
```

前端面板中可以查看 Early Bridge 是否已注入，也可以手动安装/更新/卸载。

后端会在首次修改 `index.html` 前备份到：

```text
SillyTavern/plugins/cocktail-plus/backups/
```

打开 Network 查看：

```text
/version
/api/characters/all
```

响应头应出现：

```text
x-cocktail-plus: 0.1.0
x-cocktail-plus-state: HIT / FAST-MISS / ASYNC-MISS / MISS / STALE
```

同时仍保留兼容头：

```text
x-cocktail-cache: <state>
```

## 从旧 `st-startup-cache` 硬迁移

本次是纯硬改名，不做自动兼容和自动清理旧 Service Worker。

如果旧版本已经部署过，建议手动清理：

1. 在旧扩展面板点击“注销 SW”，或在浏览器 DevTools → Application → Service Workers 中删除旧 `/api/plugins/st-startup-cache/sw.js`。
2. 删除旧前端目录：

```text
SillyTavern/public/scripts/extensions/third-party/st-startup-cache/
```

3. 删除旧后端目录并重启酒馆：

```text
SillyTavern/plugins/st-startup-cache/
```

旧缓存不会迁移，新插件会重新生成：

```text
SillyTavern/plugins/cocktail-plus/cache/
```

## 回退

在面板点击：

```text
注销 SW
```

然后刷新页面即可恢复原接口行为。

如需完全移除后端插件，删除：

```text
SillyTavern/plugins/cocktail-plus/
```

并重启酒馆。
