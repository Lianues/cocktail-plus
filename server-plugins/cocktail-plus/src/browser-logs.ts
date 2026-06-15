// @ts-nocheck
import { VERSION } from './constants.js';

const MAX_ENTRIES = 1000;
const MAX_INGEST_BATCH = 200;
const MAX_FIELD_CHARS = 4000;

let nextId = 1;
const entries = [];

function clip(value, max = MAX_FIELD_CHARS) {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max)}…<truncated ${text.length - max}>` : text;
}

function normalizeArg(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return clip(value);
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (value instanceof Error) return clip(`${value.name}: ${value.message}\n${value.stack || ''}`);
    try {
        return clip(JSON.stringify(value));
    } catch {
        try { return clip(Object.prototype.toString.call(value)); } catch { return '[unserializable]'; }
    }
}

function normalizeEntry(raw, req) {
    const args = Array.isArray(raw?.args) ? raw.args.map(normalizeArg) : [];
    const message = raw?.message !== undefined ? clip(raw.message) : clip(args.join(' '));
    const level = ['debug', 'log', 'info', 'warn', 'error', 'trace', 'unhandledrejection', 'window-error'].includes(String(raw?.level || ''))
        ? String(raw.level)
        : 'log';
    return {
        id: nextId++,
        receivedAt: Date.now(),
        serverVersion: VERSION,
        user: req?.user?.profile?.handle || '',
        ip: req?.ip || req?.socket?.remoteAddress || '',
        level,
        message,
        args,
        stack: clip(raw?.stack || ''),
        pageUrl: clip(raw?.pageUrl || raw?.url || ''),
        source: clip(raw?.source || ''),
        line: Number.isFinite(Number(raw?.line)) ? Number(raw.line) : null,
        column: Number.isFinite(Number(raw?.column)) ? Number(raw.column) : null,
        userAgent: clip(raw?.userAgent || req?.headers?.['user-agent'] || '', 1000),
        timestamp: Number.isFinite(Number(raw?.timestamp)) ? Number(raw.timestamp) : Date.now(),
    };
}

function pushEntry(entry) {
    entries.push(entry);
    while (entries.length > MAX_ENTRIES) entries.shift();
    if (['error', 'warn', 'unhandledrejection', 'window-error'].includes(entry.level)) {
        const text = entry.message || entry.args?.join(' ') || '';
        const printer = entry.level === 'warn' ? console.warn : console.error;
        printer(`[cocktail-plus:browser-${entry.level}]`, text, entry.stack ? `\n${entry.stack}` : '');
    }
}

export function ingestBrowserLogs(req) {
    const body = req.body || {};
    const rawEntries = Array.isArray(body.entries) ? body.entries : Array.isArray(body) ? body : [body];
    const batch = rawEntries.slice(0, MAX_INGEST_BATCH).map(raw => normalizeEntry(raw, req));
    for (const entry of batch) pushEntry(entry);
    return { ok: true, accepted: batch.length, total: entries.length, maxEntries: MAX_ENTRIES };
}

export function ingestBrowserLogBeacon(req) {
    let raw = null;
    try {
        if (req.query?.d) raw = JSON.parse(String(req.query.d));
    } catch {
        raw = null;
    }
    if (!raw) {
        raw = {
            level: req.query?.level || 'log',
            message: req.query?.message || '',
            pageUrl: req.query?.pageUrl || '',
            source: 'beacon-query',
            timestamp: Date.now(),
        };
    }
    const entry = normalizeEntry({ ...raw, source: raw.source || 'early-beacon' }, req);
    pushEntry(entry);
    return { ok: true, accepted: 1, total: entries.length, maxEntries: MAX_ENTRIES };
}

export function clearBrowserLogs() {
    const removed = entries.length;
    entries.splice(0, entries.length);
    return { ok: true, removed };
}

export function getBrowserLogs(limit = 200) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const list = entries.slice(-safeLimit);
    return {
        ok: true,
        version: VERSION,
        total: entries.length,
        maxEntries: MAX_ENTRIES,
        entries: list,
        text: formatBrowserLogs(list),
    };
}

export function formatBrowserLogs(list = entries) {
    return list.map(entry => {
        const time = new Date(entry.receivedAt).toISOString();
        const loc = entry.source ? ` ${entry.source}${entry.line !== null ? `:${entry.line}` : ''}${entry.column !== null ? `:${entry.column}` : ''}` : '';
        const stack = entry.stack ? `\n${entry.stack}` : '';
        return `[${time}] [${entry.level}]${loc} ${entry.message}${stack}`;
    }).join('\n');
}

export function getBrowserLogStatus() {
    return { total: entries.length, maxEntries: MAX_ENTRIES, lastReceivedAt: entries.length ? entries[entries.length - 1].receivedAt : null };
}
