// @ts-nocheck
import { HEADER_PREFIX, VERSION, info } from './constants.js';
import { config } from './config.js';
import { ENDPOINTS } from './endpoint-registry.js';
import { fetchOriginal } from './original-fetch.js';
import { makeRequestContext } from './request-context.js';
import { nextRequestId, stats } from './stats.js';
import { getCacheKey, getCachedEntry, inflight, memoryCache, writeDiskEntry } from './cache-store.js';

export function makeEntryFromBody(ctx, endpointKey, status, statusText, headers, bodyText, signature, durationMs, transform = null) {
    const now = Date.now();
    return { endpointKey, status, statusText, headers, bodyText, createdAt: now, refreshedAt: now, signature, durationMs, transform, hitCount: 0, staleHitCount: 0, lastError: null };
}

function defaultTransformBodyForCache(bodyText) {
    return { bodyText, transformed: false, sourceBytes: Buffer.byteLength(bodyText || '', 'utf8'), cachedBytes: Buffer.byteLength(bodyText || '', 'utf8') };
}

export async function refreshEntry(ctx, endpointKey, reason = 'refresh') {
    const endpoint = ENDPOINTS[endpointKey];
    const key = getCacheKey(ctx, endpointKey);
    if (inflight.has(key)) {
        return await inflight.get(key);
    }

    const promise = (async () => {
        stats.refreshes++;
        const signature = endpoint.getSignature(ctx);
        const result = await fetchOriginal(ctx, endpoint);
        if (result.ok && result.status >= 200 && result.status < 300) {
            const now = Date.now();
            const transformed = endpoint.transformBodyForCache
                ? endpoint.transformBodyForCache(ctx, result.bodyText, config)
                : defaultTransformBodyForCache(result.bodyText);
            const entry = {
                endpointKey,
                status: result.status,
                statusText: result.statusText,
                headers: result.headers,
                bodyText: transformed.bodyText,
                createdAt: now,
                refreshedAt: now,
                signature,
                durationMs: result.durationMs,
                transform: {
                    transformed: transformed.transformed,
                    sourceBytes: transformed.sourceBytes,
                    cachedBytes: transformed.cachedBytes,
                    count: transformed.count,
                    error: transformed.error,
                },
                hitCount: 0,
                staleHitCount: 0,
                lastError: null,
            };
            memoryCache.set(key, entry);
            writeDiskEntry(ctx, endpointKey, entry);
            return { result, entry, cached: true };
        }
        return { result, entry: null, cached: false };
    })()
        .catch((error) => {
            stats.errors++;
            stats.lastError = error instanceof Error ? error.message : String(error);
            throw error;
        })
        .finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return await promise;
}

export function getFreshCacheState(ctx, endpointKey) {
    const endpoint = ENDPOINTS[endpointKey];
    const signatureStartedAt = Date.now();
    const signature = endpoint.getSignature(ctx);
    const signatureMs = Date.now() - signatureStartedAt;
    const entry = getCachedEntry(ctx, endpointKey);
    if (!entry) return { entry: null, fresh: false, signature, signatureMs, reason: 'missing' };

    const ageMs = Date.now() - Number(entry.refreshedAt || entry.createdAt || 0);
    const signatureMatches = entry.signature === signature;
    const withinMaxStale = config.maxStaleMs <= 0 || ageMs <= config.maxStaleMs;
    return { entry, fresh: signatureMatches && withinMaxStale, signature, signatureMs, ageMs, signatureMatches, withinMaxStale, reason: signatureMatches ? (withinMaxStale ? 'fresh' : 'expired') : 'signature-changed' };
}

export async function warmEntry(ctx, endpointKey, reason = 'warm', force = false) {
    if (!force) {
        const state = getFreshCacheState(ctx, endpointKey);
        if (state.fresh && state.entry) {
            return { result: { ok: true, status: state.entry.status, statusText: state.entry.statusText, durationMs: 0 }, entry: state.entry, cached: true, skipped: true };
        }
    }
    return await refreshEntry(ctx, endpointKey, reason);
}

export function setCacheHeaders(res, state, entry = null) {
    res.setHeader(HEADER_PREFIX, VERSION);
    res.setHeader(`${HEADER_PREFIX}-state`, state);
    res.setHeader('x-cocktail-cache', state);
    if (entry?.refreshedAt) res.setHeader(`${HEADER_PREFIX}-age-ms`, String(Math.max(0, Date.now() - entry.refreshedAt)));
}

function setExtraHeaders(res, extraHeaders = null) {
    if (!extraHeaders) return;
    for (const [key, value] of Object.entries(extraHeaders)) {
        if (value !== undefined && value !== null) res.setHeader(key, String(value));
    }
}

export function sendEntry(res, entry, state, extraHeaders = null) {
    setCacheHeaders(res, state, entry);
    setExtraHeaders(res, extraHeaders);
    res.status(entry.status || 200);
    res.setHeader('content-type', entry.headers?.['content-type'] || 'application/json; charset=utf-8');
    res.send(entry.bodyText);
}

export function sendFetchResult(res, result, state, entry = null, extraHeaders = null) {
    setCacheHeaders(res, state, entry);
    setExtraHeaders(res, extraHeaders);
    res.status(result.status || 200);
    res.setHeader('content-type', result.headers?.['content-type'] || 'application/json; charset=utf-8');
    res.send(result.bodyText ?? '');
}

export async function handleFast(req, res, endpointKey) {
    stats.requests++;
    const endpoint = ENDPOINTS[endpointKey];
    const ctx = makeRequestContext(req);
    ctx.requestId = nextRequestId(endpointKey);

    if (!config.enabled || !config[endpoint.configKey]) {
        const result = await fetchOriginal(ctx, endpoint);
        return sendFetchResult(res, result, 'BYPASS');
    }

    const signature = endpoint.getSignature(ctx);
    const entry = getCachedEntry(ctx, endpointKey);
    const now = Date.now();
    const cacheKey = getCacheKey(ctx, endpointKey);

    if (entry) {
        const ageMs = now - Number(entry.refreshedAt || entry.createdAt || 0);
        const signatureMatches = entry.signature === signature;
        const withinMaxStale = config.maxStaleMs <= 0 || ageMs <= config.maxStaleMs;
        if (signatureMatches && withinMaxStale) {
            stats.hits++;
            entry.hitCount = Number(entry.hitCount || 0) + 1;
            memoryCache.set(cacheKey, entry);
            return sendEntry(res, entry, 'HIT');
        }
        if (config.staleWhileRevalidate) {
            stats.staleHits++;
            entry.staleHitCount = Number(entry.staleHitCount || 0) + 1;
            memoryCache.set(cacheKey, entry);
            const state = signatureMatches ? 'STALE' : 'STALE-SIGNATURE';
            void refreshEntry(ctx, endpointKey, signatureMatches ? 'max-stale-expired' : 'signature-changed').catch(() => {});
            return sendEntry(res, entry, state);
        }
    }

    const fastMiss = endpoint.makeFastMiss?.(ctx, signature, config);
    if (fastMiss) {
        stats.misses++;
        const fastEntry = makeEntryFromBody(
            ctx,
            endpointKey,
            fastMiss.status,
            fastMiss.statusText,
            fastMiss.headers,
            fastMiss.bodyText,
            signature,
            fastMiss.durationMs || 0,
            fastMiss.transform || null,
        );
        memoryCache.set(cacheKey, fastEntry);
        writeDiskEntry(ctx, endpointKey, fastEntry);
        if (fastMiss.refreshReason) void refreshEntry(ctx, endpointKey, fastMiss.refreshReason).catch(() => {});
        return sendEntry(res, fastEntry, fastMiss.state, fastMiss.extraResponseHeaders);
    }

    const asyncMiss = endpoint.makeAsyncMiss?.(ctx, signature, config);
    if (asyncMiss) {
        stats.misses++;
        if (asyncMiss.refreshReason) void refreshEntry(ctx, endpointKey, asyncMiss.refreshReason).catch(() => {});
        return sendFetchResult(res, asyncMiss, asyncMiss.state, null, asyncMiss.extraResponseHeaders);
    }

    stats.misses++;
    try {
        const { result, entry: refreshedEntry } = await refreshEntry(ctx, endpointKey, entry ? 'blocking-refresh' : 'miss');
        if (refreshedEntry) {
            return sendEntry(res, refreshedEntry, entry ? 'REFRESH' : 'MISS');
        }
        return sendFetchResult(res, result, entry ? 'REFRESH' : 'MISS');
    } catch (error) {
        if (entry) {
            entry.lastError = error instanceof Error ? error.message : String(error);
            return sendEntry(res, entry, 'STALE-ERROR');
        }
        res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error), plugin: info });
    }
}
