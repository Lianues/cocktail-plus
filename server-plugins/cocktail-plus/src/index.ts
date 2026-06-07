// @ts-nocheck
import { clearCacheStores } from './cache-store.js';
import { config } from './config.js';
import { info } from './constants.js';
import { autoEnsureEarlyBridge } from './early-bridge.js';
import { registerRoutes } from './routes.js';
import { autoApplySourcePatches } from './source-patches.js';

export { info };

export async function init(router) {
    if (config.autoPatchChatsEnoentGuard) {
        const patchResults = autoApplySourcePatches();
        for (const result of patchResults) {
            if (result?.changed) {
                console.warn('[cocktail-plus] ST source patch applied; restart SillyTavern to load it:', result);
            } else {
                console.log('[cocktail-plus] ST source patch status:', result);
            }
        }
    }
    const earlyResult = autoEnsureEarlyBridge();
    if (earlyResult?.ok) {
        console.log('[cocktail-plus] early bridge status:', earlyResult.status || earlyResult);
    } else {
        console.warn('[cocktail-plus] early bridge install failed:', earlyResult);
    }
    registerRoutes(router);
}

export async function exit() {
    clearCacheStores();
}
