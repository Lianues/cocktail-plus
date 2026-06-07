// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SERVER_ROOT } from './constants.js';

export function sha256(input) {
    return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function getDataRoot() {
    return globalThis.DATA_ROOT || process.cwd();
}

export function safeStatRecord(filePath, label = filePath) {
    try {
        const stat = fs.statSync(filePath);
        return { label, exists: true, file: stat.isFile(), directory: stat.isDirectory(), size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
    } catch {
        return { label, exists: false };
    }
}

export function scanDirectoryShallow(dirPath, options = {}) {
    const out = [];
    if (!dirPath) return out;
    const exts = Array.isArray(options.extensions) ? options.extensions.map(x => String(x).toLowerCase()) : null;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (entry.isFile() && exts && !exts.includes(ext)) continue;
            out.push(safeStatRecord(path.join(dirPath, entry.name), `${options.label || dirPath}/${entry.name}`));
        }
    } catch {
        out.push({ label: options.label || dirPath, exists: false });
    }
    return out;
}

export function signatureFromRecords(records) {
    return sha256(stableStringify(records));
}

export function readTextIfExists(filePath) {
    try {
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf8').trim();
    } catch {
        return '';
    }
}

export function getServerRoot() {
    return fs.existsSync(path.join(SERVER_ROOT, 'server.js')) ? SERVER_ROOT : process.cwd();
}

export function getPathValue(obj, pathValue, fallback = undefined) {
    try {
        const parts = String(pathValue).split('.');
        let cur = obj;
        for (const part of parts) {
            if (cur === null || cur === undefined) return fallback;
            cur = cur[part];
        }
        return cur === undefined ? fallback : cur;
    } catch {
        return fallback;
    }
}
