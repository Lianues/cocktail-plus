// @ts-nocheck
import { VERSION, HEADER_PREFIX } from './constants.js';

function pickResponseHeaders(response) {
    const headers = {};
    const contentType = response.headers.get('content-type');
    headers['content-type'] = contentType || 'application/json; charset=utf-8';
    return headers;
}

export async function fetchOriginal(ctx, endpoint) {
    const method = endpoint.method || 'POST';
    const url = `${ctx.protocol}://${ctx.host}${endpoint.originalPath}`;
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
    try {
        const fetchOptions = { method, headers, redirect: 'manual', signal: controller.signal };
        if (method !== 'GET' && method !== 'HEAD') {
            fetchOptions.body = ctx.bodyText;
        }
        const response = await fetch(url, fetchOptions);
        const bodyText = await response.text();
        const durationMs = Date.now() - startedAt;
        return { ok: response.ok, status: response.status, statusText: response.statusText, headers: pickResponseHeaders(response), bodyText, durationMs };
    } finally {
        clearTimeout(timer);
    }
}
