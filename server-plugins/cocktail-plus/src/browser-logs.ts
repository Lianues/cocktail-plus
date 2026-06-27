// @ts-nocheck
import { config } from './config.js';
import { VERSION } from './constants.js';

const MAX_ENTRIES = 10_000;
const MAX_INGEST_BATCH = 500;
// Keep logs effectively complete for debugging. This is still bounded so one accidental huge console dump
// cannot grow the in-memory ring buffer without limit.
const MAX_FIELD_CHARS = 5_000_000;
const BACKEND_CAPTURE_KEY = Symbol.for('cocktail-plus.backend-log-capture');
const CONSOLE_LEVELS = ['debug', 'log', 'info', 'warn', 'error', 'trace'];

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
    if (typeof value === 'symbol') return clip(value.toString());
    if (typeof value === 'function') return clip(`[Function ${value.name || 'anonymous'}]`);
    if (value instanceof Error) return clip(`${value.name}: ${value.message}\n${value.stack || ''}`);
    try {
        const json = JSON.stringify(value);
        if (json !== undefined) return clip(json);
    } catch {
        // Fall through to object tag.
    }
    try { return clip(Object.prototype.toString.call(value)); } catch { return '[unserializable]'; }
}

function normalizeLevel(level) {
    const normalized = String(level || '').toLowerCase();
    return ['debug', 'log', 'info', 'warn', 'error', 'trace', 'unhandledrejection', 'window-error'].includes(normalized)
        ? normalized
        : 'log';
}

function normalizeOrigin(origin) {
    const normalized = String(origin || '').toLowerCase();
    return normalized === 'backend' ? 'backend' : 'frontend';
}

function normalizeEntry(raw, req) {
    const args = Array.isArray(raw?.args) ? raw.args.map(normalizeArg) : [];
    const message = raw?.message !== undefined ? clip(raw.message) : clip(args.join(' '));
    const level = normalizeLevel(raw?.level);
    const origin = normalizeOrigin(raw?.origin);
    const backendPid = Number.isFinite(Number(raw?.backendPid)) ? Number(raw.backendPid) : (origin === 'backend' ? process.pid : null);
    return {
        id: nextId++,
        receivedAt: Date.now(),
        serverVersion: VERSION,
        origin,
        clientId: clip(raw?.clientId || raw?.pageSessionId || raw?.tabId || '', 500),
        user: req?.user?.profile?.handle || '',
        ip: req?.ip || req?.socket?.remoteAddress || '',
        level,
        message,
        args,
        stack: clip(raw?.stack || ''),
        pageUrl: clip(raw?.pageUrl || raw?.url || ''),
        source: clip(raw?.source || (origin === 'backend' ? 'backend-console' : 'browser-console')),
        line: Number.isFinite(Number(raw?.line)) ? Number(raw.line) : null,
        column: Number.isFinite(Number(raw?.column)) ? Number(raw.column) : null,
        userAgent: clip(raw?.userAgent || req?.headers?.['user-agent'] || '', 2000),
        backendPid,
        backendCwd: origin === 'backend' ? clip(raw?.backendCwd || process.cwd(), 2000) : '',
        timestamp: Number.isFinite(Number(raw?.timestamp)) ? Number(raw.timestamp) : Date.now(),
    };
}

function pushEntry(entry) {
    entries.push(entry);
    while (entries.length > MAX_ENTRIES) entries.shift();
}

function pushRawEntry(raw, req = null) {
    const entry = normalizeEntry(raw, req);
    pushEntry(entry);
    return entry;
}

function getTraceStack() {
    try {
        const stack = new Error().stack || '';
        return stack.split('\n').slice(3).join('\n');
    } catch {
        return '';
    }
}

function pushBackendLog(level, argsLike, extra = {}) {
    const args = Array.from(argsLike || []);
    const normalizedArgs = args.map(normalizeArg);
    pushRawEntry({
        origin: 'backend',
        level,
        args,
        message: normalizedArgs.join(' '),
        stack: level === 'trace' ? getTraceStack() : '',
        source: 'backend-console',
        backendPid: process.pid,
        backendCwd: process.cwd(),
        timestamp: Date.now(),
        ...extra,
    });
}

export function installBackendLogCapture() {
    if (!config.browserLogCaptureEnabled) return { ok: true, skipped: true, reason: 'disabled' };
    const state = globalThis[BACKEND_CAPTURE_KEY] || (globalThis[BACKEND_CAPTURE_KEY] = { installed: false, originals: {}, wrappers: {} });
    if (state.installed) return { ok: true, installed: true, already: true };

    for (const level of CONSOLE_LEVELS) {
        const original = typeof console[level] === 'function' ? console[level].bind(console) : console.log.bind(console);
        state.originals[level] = original;
        const wrapper = function cocktailPlusBackendConsoleCapture(...args) {
            try { original(...args); } catch {}
            try { pushBackendLog(level, args); } catch {}
        };
        state.wrappers[level] = wrapper;
        try { console[level] = wrapper; } catch {}
    }

    state.installed = true;
    pushRawEntry({
        origin: 'backend',
        level: 'info',
        source: 'backend-log-capture',
        message: '[cocktail-plus] backend log capture installed',
        args: ['[cocktail-plus] backend log capture installed'],
        backendPid: process.pid,
        backendCwd: process.cwd(),
        timestamp: Date.now(),
    });
    return { ok: true, installed: true, maxEntries: MAX_ENTRIES, maxFieldChars: MAX_FIELD_CHARS };
}

export function uninstallBackendLogCapture() {
    const state = globalThis[BACKEND_CAPTURE_KEY];
    if (!state?.installed) return { ok: true, installed: false };
    for (const level of CONSOLE_LEVELS) {
        try {
            if (console[level] === state.wrappers[level]) console[level] = state.originals[level];
        } catch {}
    }
    state.installed = false;
    return { ok: true, installed: false };
}

export function ingestBrowserLogs(req) {
    const body = req.body || {};
    const rawEntries = Array.isArray(body.entries) ? body.entries : Array.isArray(body) ? body : [body];
    const batch = rawEntries.slice(0, MAX_INGEST_BATCH).map(raw => pushRawEntry({ ...raw, origin: raw?.origin || 'frontend' }, req));
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
            clientId: req.query?.clientId || '',
            source: 'beacon-query',
            timestamp: Date.now(),
        };
    }
    const entry = pushRawEntry({ ...raw, origin: raw.origin || 'frontend', source: raw.source || 'early-beacon' }, req);
    return { ok: true, accepted: 1, total: entries.length, maxEntries: MAX_ENTRIES, entryId: entry.id };
}

export function clearBrowserLogs() {
    const removed = entries.length;
    entries.splice(0, entries.length);
    return { ok: true, removed };
}

export function getBrowserLogs(limit = MAX_ENTRIES) {
    const safeLimit = Math.max(1, Math.min(MAX_ENTRIES, Number(limit) || MAX_ENTRIES));
    const list = entries.slice(-safeLimit);
    return {
        ok: true,
        version: VERSION,
        total: entries.length,
        maxEntries: MAX_ENTRIES,
        maxFieldChars: MAX_FIELD_CHARS,
        lastReceivedAt: entries.length ? entries[entries.length - 1].receivedAt : null,
        entries: list,
        text: formatBrowserLogs(list),
    };
}

export function formatBrowserLogs(list = entries) {
    return list.map(entry => {
        const time = new Date(entry.receivedAt).toISOString();
        const origin = entry.origin === 'backend' ? `backend:${entry.backendPid || 'node'}` : `frontend${entry.clientId ? `:${String(entry.clientId).slice(0, 10)}` : ''}`;
        const loc = entry.source ? ` ${entry.source}${entry.line !== null ? `:${entry.line}` : ''}${entry.column !== null ? `:${entry.column}` : ''}` : '';
        const stack = entry.stack ? `\n${entry.stack}` : '';
        return `[${time}] [${origin}] [${entry.level}]${loc} ${entry.message}${stack}`;
    }).join('\n');
}

export function getBrowserLogStatus() {
    return { total: entries.length, maxEntries: MAX_ENTRIES, maxFieldChars: MAX_FIELD_CHARS, lastReceivedAt: entries.length ? entries[entries.length - 1].receivedAt : null };
}
