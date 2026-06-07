// @ts-nocheck
import { clearCacheStores } from './cache-store.js';
import { info } from './constants.js';
import { autoEnsureEarlyBridge } from './early-bridge.js';
import { registerRoutes } from './routes.js';

export { info };

export async function init(router) {
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
