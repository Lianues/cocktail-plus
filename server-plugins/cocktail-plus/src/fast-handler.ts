// @ts-nocheck
import { HEADER_PREFIX, VERSION, info } from './constants.js';
import { config } from './config.js';
import { ENDPOINTS } from './endpoint-registry.js';
import { fetchOriginal } from './original-fetch.js';
import { makeRequestContext } from './request-context.js';
import { nextRequestId, stats } from './stats.js';
import { getCacheKey, getCachedEntry, inflight, memoryCache, scheduleClearRefreshProgress, setRefreshProgress, writeDiskEntry } from './cache-store.js';

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
    const startedAt = Date.now();
    const updateProgress = (patch = {}) => setRefreshProgress(key, endpointKey, patch);
    if (inflight.has(key)) {
        return await inflight.get(key);
    }

    const promise = (async () => {
        stats.refreshes++;
        updateProgress({ phase: 'starting', reason, startedAt, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null });
        const signature = endpoint.getSignature(ctx);
        let result = null;
        if (typeof endpoint.fetchForCache === 'function') {
            result = await endpoint.fetchForCache(ctx, config, { onProgress: updateProgress, startedAt, reason });
        }
        if (!result) result = await fetchOriginal(ctx, endpoint, { onProgress: updateProgress });
        if (result.ok && result.status >= 200 && result.status < 300) {
            const now = Date.now();
            updateProgress({ phase: 'transforming', status: result.status, bytesReceived: result.bytesReceived ?? Buffer.byteLength(result.bodyText || '', 'utf8'), totalBytes: result.totalBytes ?? null, etaMs: 0 });
            const transformed = result.transform
                ? { bodyText: result.bodyText, ...result.transform }
                : endpoint.transformBodyForCache
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
                    direct: transformed.direct,
                    errors: transformed.errors,
                },
                hitCount: 0,
                staleHitCount: 0,
                lastError: null,
            };
            memoryCache.set(key, entry);
            writeDiskEntry(ctx, endpointKey, entry);
            updateProgress({ phase: 'cached', status: result.status, bytesReceived: result.bytesReceived ?? Buffer.byteLength(result.bodyText || '', 'utf8'), totalBytes: result.totalBytes ?? null, percent: result.totalBytes ? 100 : null, etaMs: 0, error: null });
            scheduleClearRefreshProgress(key);
            return { result, entry, cached: true };
        }
        updateProgress({ phase: 'error', status: result.status, bytesReceived: result.bytesReceived ?? Buffer.byteLength(result.bodyText || '', 'utf8'), totalBytes: result.totalBytes ?? null, error: `HTTP ${result.status || 0}` });
        scheduleClearRefreshProgress(key);
        return { result, entry: null, cached: false };
    })()
        .catch((error) => {
            stats.errors++;
            stats.lastError = error instanceof Error ? error.message : String(error);
            updateProgress({ phase: 'error', error: stats.lastError, status: null });
            scheduleClearRefreshProgress(key);
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

function logFastDecision(endpointKey, decision, detail = {}) {
    if (endpointKey !== 'characters-all') return;
    try {
        console.info('[cocktail-plus:fast-diag]', decision, {
            endpointKey,
            at: new Date().toISOString(),
            ...detail,
        });
    } catch {
        // diagnostics must never affect the request path
    }
}

export async function handleFast(req, res, endpointKey) {
    const startedAt = Date.now();
    stats.requests++;
    const endpoint = ENDPOINTS[endpointKey];
    const ctx = makeRequestContext(req);
    ctx.requestId = nextRequestId(endpointKey);

    logFastDecision(endpointKey, 'request-enter', {
        requestId: ctx.requestId,
        method: req.method,
        cacheEnabled: !!config.enabled && !!config[endpoint.configKey],
        asyncCharactersAllOnMiss: !!config.asyncCharactersAllOnMiss,
        allowEmptyCharactersAllOnMiss: !!config.allowEmptyCharactersAllOnMiss,
        blockCharactersAllOnMiss: !!config.blockCharactersAllOnMiss,
    });

    if (!config.enabled || !config[endpoint.configKey]) {
        const result = await fetchOriginal(ctx, endpoint);
        logFastDecision(endpointKey, 'bypass-original-return', { requestId: ctx.requestId, status: result.status, durationMs: Date.now() - startedAt });
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
            logFastDecision(endpointKey, 'hit-return', { requestId: ctx.requestId, status: entry.status, ageMs, signatureMatches, durationMs: Date.now() - startedAt, bodyBytes: Buffer.byteLength(entry.bodyText || '', 'utf8') });
            return sendEntry(res, entry, 'HIT');
        }
        if (config.staleWhileRevalidate && (signatureMatches || endpoint.staleOnSignatureChange)) {
            stats.staleHits++;
            entry.staleHitCount = Number(entry.staleHitCount || 0) + 1;
            memoryCache.set(cacheKey, entry);
            const state = signatureMatches ? 'STALE' : 'STALE-SIGNATURE';
            const reason = signatureMatches ? 'max-stale-expired' : 'signature-changed';
            void refreshEntry(ctx, endpointKey, reason).catch(() => {});
            logFastDecision(endpointKey, 'stale-return', { requestId: ctx.requestId, state, reason, ageMs, signatureMatches, durationMs: Date.now() - startedAt, bodyBytes: Buffer.byteLength(entry.bodyText || '', 'utf8') });
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
        logFastDecision(endpointKey, 'fast-miss-return', { requestId: ctx.requestId, state: fastMiss.state, refreshReason: fastMiss.refreshReason, durationMs: Date.now() - startedAt, bodyBytes: Buffer.byteLength(fastMiss.bodyText || '', 'utf8') });
        return sendEntry(res, fastEntry, fastMiss.state, fastMiss.extraResponseHeaders);
    }

    const asyncMiss = !entry ? endpoint.makeAsyncMiss?.(ctx, signature, config) : null;
    if (asyncMiss) {
        stats.misses++;
        if (asyncMiss.refreshReason) void refreshEntry(ctx, endpointKey, asyncMiss.refreshReason).catch(() => {});
        logFastDecision(endpointKey, 'async-miss-return', { requestId: ctx.requestId, state: asyncMiss.state, refreshReason: asyncMiss.refreshReason, durationMs: Date.now() - startedAt, bodyBytes: Buffer.byteLength(asyncMiss.bodyText || '', 'utf8') });
        return sendFetchResult(res, asyncMiss, asyncMiss.state, null, asyncMiss.extraResponseHeaders);
    }

    stats.misses++;
    try {
        logFastDecision(endpointKey, 'blocking-refresh-start', { requestId: ctx.requestId, hasEntry: !!entry, durationMs: Date.now() - startedAt });
        const { result, entry: refreshedEntry } = await refreshEntry(ctx, endpointKey, entry ? 'blocking-refresh' : 'miss');
        if (refreshedEntry) {
            logFastDecision(endpointKey, 'blocking-refresh-entry-return', { requestId: ctx.requestId, status: refreshedEntry.status, durationMs: Date.now() - startedAt, bodyBytes: Buffer.byteLength(refreshedEntry.bodyText || '', 'utf8') });
            return sendEntry(res, refreshedEntry, entry ? 'REFRESH' : 'MISS');
        }
        logFastDecision(endpointKey, 'blocking-refresh-result-return', { requestId: ctx.requestId, status: result?.status, durationMs: Date.now() - startedAt, bodyBytes: Buffer.byteLength(result?.bodyText || '', 'utf8') });
        return sendFetchResult(res, result, entry ? 'REFRESH' : 'MISS');
    } catch (error) {
        if (entry) {
            entry.lastError = error instanceof Error ? error.message : String(error);
            logFastDecision(endpointKey, 'stale-error-return', { requestId: ctx.requestId, error: entry.lastError, durationMs: Date.now() - startedAt });
            return sendEntry(res, entry, 'STALE-ERROR');
        }
        res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error), plugin: info });
    }
}
