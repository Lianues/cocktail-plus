# cocktail-plus (SillyTavern Server Plugin)

`cocktail-plus` 是“cocktail-plus”的可选后端插件，用于优化 SillyTavern 原始接口的启动和交互性能。

当前优化：

```text
GET  /version
POST /api/characters/all
```

不拦截或缓存 `/api/settings/get`。

## 安装

复制整个目录到 SillyTavern：

```text
SillyTavern/plugins/cocktail-plus/
```

最终应存在：

```text
SillyTavern/plugins/cocktail-plus/index.mjs
```

在 `config.yaml` 启用：

```yaml
enableServerPlugins: true
```

然后重启酒馆。

## API

统一前缀：

```text
/api/plugins/cocktail-plus/*
```

提供：

- `POST /probe`
- `GET /sw.js`
- `POST /config/get`
- `POST /config/set`
- `POST /fast/characters-all`
- `GET /fast/version`
- `POST /warm`
- `POST /invalidate`
- `POST /status`
- `POST /cache/clear`

## 缓存说明

- `characters-all`：默认转换为 shallow character 列表并落盘。
- `/version`：默认落盘；无缓存时快速读取 `package.json` 与 `.git/HEAD` 返回近似版本，并后台刷新原始 `/version` 得到完整信息。
- 缓存目录在本后端插件目录内：

```text
SillyTavern/plugins/cocktail-plus/cache/
```

- 缓存按 SillyTavern 用户 handle + DATA_ROOT 哈希隔离。
- Service Worker 只负责改道 `/api/characters/all` 与 `/version`。

## 源码结构

```text
src/
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
  index.ts
```

新增接口时优先新增 `src/endpoints/<name>.ts`，再登记到 `endpoint-registry.ts`；通用缓存、代理、路由逻辑不应继续堆到 `index.ts`。

## 响应头

```text
x-cocktail-plus: 0.1.0
x-cocktail-plus-state: HIT / FAST-MISS / ASYNC-MISS / MISS / STALE
x-cocktail-cache: <state>
```
