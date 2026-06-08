// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { API_PREFIX, HEADER_PREFIX, PLUGIN_DIR, VERSION, info } from './constants.js';
import { asBoolean, config } from './config.js';
import { ENDPOINT_LIST, parseEndpointList } from './endpoint-registry.js';
import { handleFast, warmEntry } from './fast-handler.js';
import { makeRequestContext } from './request-context.js';
import { nextRequestId, stats } from './stats.js';
import { getUserStatus, invalidateForUser, summarizeEntry } from './cache-store.js';
import { makeServiceWorkerScript } from './service-worker.js';
import { getEarlyBridgeStatus, installEarlyBridge, makeEarlyBridgeScript, uninstallEarlyBridge } from './early-bridge.js';
import { chatSaveEndpoint, getChatSaveStatus, groupChatSaveEndpoint, handleChatSaveFast } from './endpoints/chat-save.js';
import { handleCharacterEditFast } from './endpoints/characters-edit.js';
import { handleCharacterGetFast } from './endpoints/characters-get.js';
import { getSettingsSaveStatus, handleSettingsSaveFast, settingsSaveEndpoint } from './endpoints/settings-save.js';
import { clearSettingsGetCache, getSettingsGetStatus, handleSettingsGetFast, settingsGetEndpoint } from './endpoints/settings-get.js';
import { handleRecentChatsFast } from './endpoints/recent-chats.js';
import { handleModuleProxy } from './module-proxy.js';
import { getDataRoot, getServerRoot } from './utils.js';
import { applyChatsEnoentPatch, getChatsEnoentPatchStatus, revertChatsEnoentPatch } from './source-patches.js';
import { handleFrontendUpdate } from './frontend-update.js';

function sendJson(res, data) {
    res.setHeader(HEADER_PREFIX, VERSION);
    res.json(data);
}

function registerFastRoutes(router) {
    for (const endpoint of ENDPOINT_LIST) {
        const method = String(endpoint.method || 'POST').toLowerCase();
        const register = router[method]?.bind(router);
        if (!register) throw new Error(`Unsupported route method: ${endpoint.method}`);
        register(endpoint.fastPath, async (req, res) => handleFast(req, res, endpoint.key));
    }
}

export function registerRoutes(router) {
    router.post('/probe', async (req, res) => {
        const ctx = makeRequestContext(req, { bodyOverride: {} });
        sendJson(res, {
            ok: true,
            plugin: info,
            version: VERSION,
            serviceWorker: { enabled: !!config.serviceWorkerEnabled, url: `${API_PREFIX}/sw.js`, scope: '/' },
            earlyBridge: getEarlyBridgeStatus(),
            paths: {
                cwd: process.cwd(),
                serverRoot: getServerRoot(),
                dataRoot: getDataRoot(),
                pluginDir: PLUGIN_DIR,
            },
            sourcePatches: {
                chatsEnoentGuard: getChatsEnoentPatchStatus(),
            },
            stats,
            status: getUserStatus(ctx),
            settingsSave: getSettingsSaveStatus(),
            chatSave: getChatSaveStatus(),
            settingsGet: getSettingsGetStatus(),
        });
    });

    router.get('/sw.js', async (_req, res) => {
        if (!config.enabled || !config.serviceWorkerEnabled) {
            res.status(503).type('text/plain').send('cocktail-plus Service Worker is disabled.');
            return;
        }
        res.setHeader('content-type', 'application/javascript; charset=utf-8');
        res.setHeader('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('service-worker-allowed', '/');
        res.send(makeServiceWorkerScript());
    });
    router.get('/early/bridge.js', async (_req, res) => {
        if (!config.earlyBridgeEnabled) {
            res.setHeader('content-type', 'application/javascript; charset=utf-8');
            res.setHeader('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.send(`console.info('[cocktail-plus:early] disabled');`);
            return;
        }
        res.setHeader('content-type', 'application/javascript; charset=utf-8');
        res.setHeader('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.send(makeEarlyBridgeScript());
    });

    router.get('/helper/:file', async (req, res) => {
        const fileName = String(req.params?.file || '');
        if (!['cocktail-plus-helper.ps1', 'cocktail-plus-helper.sh'].includes(fileName)) {
            res.status(404).type('text/plain').send('Not found');
            return;
        }
        const filePath = path.join(PLUGIN_DIR, 'scripts', fileName);
        if (!fs.existsSync(filePath)) {
            res.status(404).type('text/plain').send('Helper script not found');
            return;
        }
        res.setHeader('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.type('text/plain; charset=utf-8').send(fs.readFileSync(filePath, 'utf8'));
    });

    router.get('/module', async (req, res) => handleModuleProxy(req, res));

    router.post('/early/status', async (_req, res) => {
        sendJson(res, { ok: true, status: getEarlyBridgeStatus() });
    });

    router.post('/early/install', async (req, res) => {
        const noBackup = asBoolean(req.body?.noBackup, false);
        const result = installEarlyBridge({ noBackup });
        sendJson(res, result);
    });

    router.post('/early/uninstall', async (req, res) => {
        const noBackup = asBoolean(req.body?.noBackup, false);
        const result = uninstallEarlyBridge({ noBackup });
        sendJson(res, result);
    });

    router.post('/source-patches/status', async (_req, res) => {
        sendJson(res, { ok: true, chatsEnoentGuard: getChatsEnoentPatchStatus() });
    });

    router.post('/update/frontend', async (req, res) => handleFrontendUpdate(req, res));

    router.post('/source-patches/chats-enoent/apply', async (req, res) => {
        const result = applyChatsEnoentPatch();
        sendJson(res, result);
    });

    router.post('/source-patches/chats-enoent/revert', async (_req, res) => {
        sendJson(res, revertChatsEnoentPatch());
    });

    registerFastRoutes(router);
    router.post(settingsGetEndpoint.fastPath, async (req, res) => handleSettingsGetFast(req, res));
    router.post(settingsSaveEndpoint.fastPath, async (req, res) => handleSettingsSaveFast(req, res));
    router.post(chatSaveEndpoint.fastPath, async (req, res) => handleChatSaveFast(req, res, chatSaveEndpoint));
    router.post(groupChatSaveEndpoint.fastPath, async (req, res) => handleChatSaveFast(req, res, groupChatSaveEndpoint));
    router.post('/fast/recent-chats', async (req, res) => handleRecentChatsFast(req, res));
    router.post('/fast/characters-get', async (req, res) => handleCharacterGetFast(req, res));
    router.post('/fast/characters-edit', async (req, res) => handleCharacterEditFast(req, res));

    router.post('/warm', async (req, res) => {
        const endpointKeys = parseEndpointList(req.body?.endpoints, ['characters-all']);
        const wait = asBoolean(req.body?.wait, false);
        const force = asBoolean(req.body?.force, false);
        const tasks = endpointKeys.map(endpointKey => {
            const ctx = makeRequestContext(req, { bodyOverride: {} });
            ctx.requestId = nextRequestId(`warm-${endpointKey}`);
            return warmEntry(ctx, endpointKey, 'warm', force)
                .then(({ result, entry, cached, skipped }) => ({ endpointKey, ok: !!result?.ok, status: result?.status, cached, skipped: !!skipped, entry: summarizeEntry(entry) }))
                .catch(error => ({ endpointKey, ok: false, error: error instanceof Error ? error.message : String(error) }));
        });
        if (wait) {
            const results = await Promise.all(tasks);
            sendJson(res, { ok: true, waited: true, results });
        }
        else {
            void Promise.all(tasks).catch(() => {});
            sendJson(res, { ok: true, waited: false, endpoints: endpointKeys });
        }
    });

    router.post('/invalidate', async (req, res) => {
        const endpointKeys = parseEndpointList(req.body?.endpoints, []);
        const ctx = makeRequestContext(req, { bodyOverride: {} });
        const removed = invalidateForUser(ctx, endpointKeys);
        sendJson(res, { ok: true, endpoints: endpointKeys, removed });
    });

    router.post('/status', async (req, res) => {
        const ctx = makeRequestContext(req, { bodyOverride: {} });
        sendJson(res, { ok: true, stats, status: getUserStatus(ctx), earlyBridge: getEarlyBridgeStatus(), settingsSave: getSettingsSaveStatus(), chatSave: getChatSaveStatus(), settingsGet: getSettingsGetStatus() });
    });

    router.post('/cache/clear', async (req, res) => {
        const endpointKeys = parseEndpointList(req.body?.endpoints, ['characters-all']);
        const ctx = makeRequestContext(req, { bodyOverride: {} });
        const removed = invalidateForUser(ctx, endpointKeys);
        clearSettingsGetCache();
        sendJson(res, { ok: true, endpoints: endpointKeys, removed });
    });
}
