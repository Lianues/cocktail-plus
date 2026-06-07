// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_DIR } from './constants.js';
import { config } from './config.js';
import { ENDPOINTS } from './endpoint-registry.js';
import { sha256 } from './utils.js';
import { stats } from './stats.js';

/** @type {Map<string, any>} */
export const memoryCache = new Map();
/** @type {Map<string, Promise<any>>} */
export const inflight = new Map();

export function getDiskRoot() {
    // Keep cache inside this server plugin folder so users can clearly see
    // the files belong to cocktail-plus and can remove them with the plugin.
    return path.join(PLUGIN_DIR, 'cache');
}

export function getCacheKey(ctx, endpointKey) {
    return `${ctx.userKey}:${endpointKey}:${sha256(ctx.bodyText).slice(0, 32)}`;
}

export function getDiskCachePath(ctx, endpointKey) {
    const bodyHash = sha256(ctx.bodyText).slice(0, 32);
    return path.join(getDiskRoot(), ctx.userKey, `${endpointKey}-${bodyHash}.json`);
}

function shouldUseDiskCache(endpointKey) {
    const endpoint = ENDPOINTS[endpointKey];
    if (!endpoint?.diskCacheConfigKey) return false;
    return !!config[endpoint.diskCacheConfigKey];
}

export function readDiskEntry(ctx, endpointKey) {
    if (!shouldUseDiskCache(endpointKey)) return null;
    try {
        const file = getDiskCachePath(ctx, endpointKey);
        if (!fs.existsSync(file)) return null;
        const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!entry || typeof entry.bodyText !== 'string') return null;
        return entry;
    } catch {
        return null;
    }
}

export function writeDiskEntry(ctx, endpointKey, entry) {
    if (!shouldUseDiskCache(endpointKey)) return;
    try {
        const file = getDiskCachePath(ctx, endpointKey);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(entry), 'utf8');
    } catch {
        // ignore disk cache errors; memory cache still works
    }
}

export function listDiskEntriesForUser(ctx) {
    const dir = path.join(getDiskRoot(), ctx.userKey);
    try {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => path.join(dir, name));
    } catch {
        return [];
    }
}

export function getCachedEntry(ctx, endpointKey) {
    const key = getCacheKey(ctx, endpointKey);
    let entry = memoryCache.get(key);
    if (entry) return entry;
    entry = readDiskEntry(ctx, endpointKey);
    if (entry) memoryCache.set(key, entry);
    return entry || null;
}

export function summarizeEntry(entry) {
    if (!entry) return null;
    return {
        endpointKey: entry.endpointKey,
        status: entry.status,
        bytes: typeof entry.bodyText === 'string' ? Buffer.byteLength(entry.bodyText, 'utf8') : 0,
        transform: entry.transform || null,
        createdAt: entry.createdAt,
        refreshedAt: entry.refreshedAt,
        ageMs: entry.refreshedAt ? Date.now() - entry.refreshedAt : null,
        durationMs: entry.durationMs,
        hitCount: entry.hitCount || 0,
        staleHitCount: entry.staleHitCount || 0,
        lastError: entry.lastError || null,
    };
}

export function getUserStatus(ctx) {
    const baseCtx = { ...ctx, body: {}, bodyText: '{}' };
    return Object.keys(ENDPOINTS).map(endpointKey => ({
        endpointKey,
        entry: summarizeEntry(getCachedEntry(baseCtx, endpointKey)),
        refreshing: inflight.has(getCacheKey(baseCtx, endpointKey)),
    }));
}

export function invalidateForUser(ctx, endpointKeys) {
    let removed = 0;
    for (const endpointKey of endpointKeys) {
        const prefix = `${ctx.userKey}:${endpointKey}:`;
        for (const key of Array.from(memoryCache.keys())) {
            if (key.startsWith(prefix)) {
                memoryCache.delete(key);
                removed++;
            }
        }
    }
    for (const file of listDiskEntriesForUser(ctx)) {
        const base = path.basename(file);
        if (endpointKeys.some(endpointKey => base.startsWith(`${endpointKey}-`))) {
            try { fs.rmSync(file, { force: true }); removed++; } catch { /* ignore */ }
        }
    }
    stats.invalidations++;
    return removed;
}

export function clearCacheStores() {
    memoryCache.clear();
    inflight.clear();
}
