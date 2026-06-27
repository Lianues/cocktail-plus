// @ts-nocheck
import http from 'node:http';
import https from 'node:https';

import { VERSION, HEADER_PREFIX } from './constants.js';
import { config } from './config.js';

function pickResponseHeaders(response) {
    const headers = {};
    const contentType = response.headers.get('content-type');
    headers['content-type'] = contentType || 'application/json; charset=utf-8';
    return headers;
}

function callProgress(onProgress, patch) {
    try {
        if (typeof onProgress === 'function') onProgress(patch);
    } catch {
        // progress callbacks must never break the proxied request
    }
}

function parseContentLengthValue(raw) {
    const value = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function parseContentLength(response) {
    return parseContentLengthValue(response.headers.get('content-length'));
}

function pickNodeResponseHeaders(response) {
    const headers = {};
    const contentType = Array.isArray(response.headers?.['content-type'])
        ? response.headers['content-type'][0]
        : response.headers?.['content-type'];
    headers['content-type'] = contentType || 'application/json; charset=utf-8';
    return headers;
}

function progressPatch(phase, startedAt, bytesReceived, totalBytes, extra = {}) {
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    const speedBps = bytesReceived > 0 ? bytesReceived / (elapsedMs / 1000) : 0;
    const hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;
    const percent = hasTotal ? Math.max(0, Math.min(100, (bytesReceived / totalBytes) * 100)) : null;
    const etaMs = hasTotal && speedBps > 0 ? Math.max(0, ((totalBytes - bytesReceived) / speedBps) * 1000) : null;
    return {
        phase,
        bytesReceived,
        totalBytes: hasTotal ? totalBytes : null,
        speedBps,
        percent,
        etaMs,
        ...extra,
    };
}

async function readBodyWithProgress(response, onProgress, startedAt) {
    const totalBytes = parseContentLength(response);
    let bytesReceived = 0;
    let lastEmitAt = 0;

    callProgress(onProgress, progressPatch('downloading', startedAt, 0, totalBytes, { status: response.status }));

    if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            const buffer = Buffer.from(value);
            chunks.push(buffer);
            bytesReceived += buffer.byteLength;
            const now = Date.now();
            if (now - lastEmitAt >= 100) {
                lastEmitAt = now;
                callProgress(onProgress, progressPatch('downloading', startedAt, bytesReceived, totalBytes, { status: response.status }));
            }
        }
        callProgress(onProgress, progressPatch('downloading', startedAt, bytesReceived, totalBytes, { status: response.status, etaMs: 0, percent: totalBytes ? 100 : null }));
        return { bodyText: Buffer.concat(chunks).toString('utf8'), bytesReceived, totalBytes };
    }

    const bodyText = await response.text();
    bytesReceived = Buffer.byteLength(bodyText || '', 'utf8');
    callProgress(onProgress, progressPatch('downloading', startedAt, bytesReceived, totalBytes || bytesReceived, { status: response.status, etaMs: 0, percent: 100 }));
    return { bodyText, bytesReceived, totalBytes: totalBytes || bytesReceived };
}

function isLoopbackHostname(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost'
        || host === '::1'
        || host === '0:0:0:0:0:0:0:1'
        || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function shouldSkipTlsVerifyForInternalFetch(url) {
    return !!config.internalFetchSkipTlsVerify
        && url?.protocol === 'https:'
        && isLoopbackHostname(url.hostname);
}

function nodeRequestWithProgress(url, method, headers, bodyText, onProgress, startedAt, { skipTlsVerify = false } = {}) {
    return new Promise((resolve, reject) => {
        const client = url.protocol === 'https:' ? https : http;
        const requestOptions = {
            method,
            headers,
        };
        if (url.protocol === 'https:' && skipTlsVerify) {
            requestOptions.rejectUnauthorized = false;
        }

        callProgress(onProgress, { phase: 'requesting', startedAt, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null });

        const request = client.request(url, requestOptions, (response) => {
            const status = Number(response.statusCode) || 0;
            const totalBytes = parseContentLengthValue(response.headers?.['content-length']);
            const chunks = [];
            let bytesReceived = 0;
            let lastEmitAt = 0;

            callProgress(onProgress, progressPatch('downloading', startedAt, 0, totalBytes, { status }));

            response.on('data', (chunk) => {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                chunks.push(buffer);
                bytesReceived += buffer.byteLength;
                const now = Date.now();
                if (now - lastEmitAt >= 100) {
                    lastEmitAt = now;
                    callProgress(onProgress, progressPatch('downloading', startedAt, bytesReceived, totalBytes, { status }));
                }
            });

            response.on('end', () => {
                callProgress(onProgress, progressPatch('downloading', startedAt, bytesReceived, totalBytes || bytesReceived, { status, etaMs: 0, percent: totalBytes ? 100 : null }));
                const durationMs = Date.now() - startedAt;
                resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    statusText: response.statusMessage || '',
                    headers: pickNodeResponseHeaders(response),
                    bodyText: Buffer.concat(chunks).toString('utf8'),
                    durationMs,
                    bytesReceived,
                    totalBytes: totalBytes || bytesReceived,
                });
            });

            response.on('error', reject);
        });

        request.on('error', reject);
        request.setTimeout(5 * 60 * 1000, () => request.destroy(new Error('Internal fetch timed out')));

        if (method !== 'GET' && method !== 'HEAD' && bodyText !== undefined) {
            request.write(bodyText);
        }
        request.end();
    });
}

export async function fetchOriginal(ctx, endpoint, options = {}) {
    const method = endpoint.method || 'POST';
    const url = new URL(`${ctx.protocol}://${ctx.host}${endpoint.originalPath}`);
    const headers = {};
    for (const [key, value] of Object.entries(ctx.headers || {})) {
        if (typeof value === 'string' && value.length > 0) headers[key] = value;
    }
    if (method !== 'GET') {
        headers['content-type'] = headers['content-type'] || 'application/json';
    }
    headers[HEADER_PREFIX] = VERSION;

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    const onProgress = options?.onProgress;
    try {
        if (shouldSkipTlsVerifyForInternalFetch(url)) {
            return await nodeRequestWithProgress(url, method, headers, ctx.bodyText, onProgress, startedAt, { skipTlsVerify: true });
        }

        const fetchOptions = { method, headers, redirect: 'manual', signal: controller.signal };
        if (method !== 'GET' && method !== 'HEAD') {
            fetchOptions.body = ctx.bodyText;
        }
        callProgress(onProgress, { phase: 'requesting', startedAt, bytesReceived: 0, totalBytes: null, speedBps: 0, percent: null, etaMs: null, status: null, error: null });
        const response = await fetch(url.href, fetchOptions);
        callProgress(onProgress, { phase: 'downloading', status: response.status, totalBytes: parseContentLength(response), bytesReceived: 0, speedBps: 0, percent: null, etaMs: null });
        const { bodyText, bytesReceived, totalBytes } = await readBodyWithProgress(response, onProgress, startedAt);
        const durationMs = Date.now() - startedAt;
        return { ok: response.ok, status: response.status, statusText: response.statusText, headers: pickResponseHeaders(response), bodyText, durationMs, bytesReceived, totalBytes };
    } finally {
        clearTimeout(timer);
    }
}
