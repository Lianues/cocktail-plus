// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX } from '../constants.js';
import { fetchOriginal } from '../original-fetch.js';
import { makeRequestContext } from '../request-context.js';
import { sha256, stableStringify } from '../utils.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const HISTORY_LIMIT = 3;

export const characterGetEndpoint = {
    key: 'character-get',
    aliases: ['character-get', '/api/characters/get'],
    originalPath: '/api/characters/get',
    fastPath: '/fast/characters-get',
    configKey: 'cacheCharactersAll',
    method: 'POST',
};

const characterGetCache = new Map();

function getAvatar(req) {
    return String(req.body?.avatar_url || '').trim();
}

function getCacheKey(ctx, avatar) {
    return `${ctx.userKey}:${avatar}`;
}

function getClientHash(req) {
    const hash = req.body?.cpCharacterGetPatch?.hash;
    return typeof hash === 'string' && hash ? hash : '';
}

function getCharacterSignature(req, avatar) {
    try {
        const filePath = path.join(req.user?.directories?.characters || '', path.basename(avatar));
        const stat = fs.statSync(filePath);
        return sha256(stableStringify({ avatar, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) }));
    } catch {
        return '';
    }
}

function rememberHistory(entry, hash, data) {
    if (!entry || !hash || data === undefined) return;
    entry.history = entry.history instanceof Map ? entry.history : new Map();
    entry.history.set(hash, data);
    while (entry.history.size > HISTORY_LIMIT) {
        const first = entry.history.keys().next().value;
        entry.history.delete(first);
    }
}

function sameJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function buildPatchOps(base, next, patchPath = [], ops = []) {
    if (ops.length > 2000) return ops;
    if (sameJson(base, next)) return ops;
    const baseIsObj = base && typeof base === 'object';
    const nextIsObj = next && typeof next === 'object';
    if (baseIsObj && nextIsObj && !Array.isArray(base) && !Array.isArray(next)) {
        const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(next, key)) {
                ops.push({ op: 'delete', path: patchPath.concat([key]) });
            } else if (!Object.prototype.hasOwnProperty.call(base, key)) {
                ops.push({ op: 'set', path: patchPath.concat([key]), value: cloneJson(next[key]) });
            } else {
                buildPatchOps(base[key], next[key], patchPath.concat([key]), ops);
            }
            if (ops.length > 2000) break;
        }
        return ops;
    }
    if (Array.isArray(base) && Array.isArray(next)) {
        if (base.length === next.length) {
            for (let i = 0; i < next.length; i++) buildPatchOps(base[i], next[i], patchPath.concat([i]), ops);
            return ops;
        }
        ops.push({ op: 'set', path: patchPath, value: cloneJson(next) });
        return ops;
    }
    ops.push({ op: 'set', path: patchPath, value: cloneJson(next) });
    return ops;
}

function makeFullEntry(signature, result) {
    const data = JSON.parse(result.bodyText || '{}');
    const hash = sha256(result.bodyText || '{}');
    return {
        signature,
        hash,
        data,
        bodyText: result.bodyText || '{}',
        status: result.status || 200,
        statusText: result.statusText || 'OK',
        headers: result.headers || { 'content-type': JSON_CONTENT_TYPE },
        createdAt: Date.now(),
        history: new Map(),
    };
}

function buildDedupBodyText(entry) {
    const full = entry?.data;
    const jsonData = typeof full?.json_data === 'string' ? full.json_data : '';
    if (!jsonData) return null;
    try {
        const base = JSON.parse(jsonData);
        if (!base || typeof base !== 'object') return null;
        const baseClean = cloneJson(base);
        const target = cloneJson(full);
        delete baseClean.json_data;
        delete target.json_data;
        const ops = buildPatchOps(baseClean, target);
        if (ops.length > 2000) return null;
        const bodyText = JSON.stringify({ mode: 'dedup', hash: entry.hash, json_data: jsonData, ops });
        return bodyText.length < entry.bodyText.length ? bodyText : null;
    } catch {
        return null;
    }
}

function sendCharacterGet(res, entry, req, meta = {}) {
    const clientHash = getClientHash(req);
    let mode = 'full';
    let bodyText = entry.bodyText;

    if (clientHash && clientHash === entry.hash) {
        mode = 'noop';
        bodyText = JSON.stringify({ mode, hash: entry.hash });
    } else if (clientHash && entry.history instanceof Map && entry.history.has(clientHash)) {
        const base = entry.history.get(clientHash);
        const ops = buildPatchOps(base, entry.data);
        if (ops.length === 0) {
            mode = 'noop';
            bodyText = JSON.stringify({ mode, hash: entry.hash });
        } else if (ops.length <= 2000) {
            const patchText = JSON.stringify({ mode: 'patch', baseHash: clientHash, nextHash: entry.hash, ops });
            if (patchText.length < entry.bodyText.length) {
                mode = 'patch';
                bodyText = patchText;
            }
        }
    }

    if (mode === 'full') {
        const dedupText = buildDedupBodyText(entry);
        if (dedupText) {
            mode = 'dedup';
            bodyText = dedupText;
        }
    }

    res.setHeader(HEADER_PREFIX, 'characters-get-fast');
    res.setHeader(`${HEADER_PREFIX}-character-get-ready`, '1');
    res.setHeader(`${HEADER_PREFIX}-character-get-patch`, mode);
    res.setHeader(`${HEADER_PREFIX}-character-get-hash`, entry.hash);
    res.setHeader(`${HEADER_PREFIX}-character-get-cache`, meta.cache || '');
    res.setHeader('content-type', JSON_CONTENT_TYPE);
    return res.status(entry.status || 200).send(bodyText);
}

export async function handleCharacterGetFast(req, res) {
    try {
        const avatar = getAvatar(req);
        if (!avatar) return res.sendStatus(400);
        const ctx = makeRequestContext(req);
        const cacheKey = getCacheKey(ctx, avatar);
        const signature = getCharacterSignature(req, avatar);
        const cached = characterGetCache.get(cacheKey);

        if (cached && cached.signature === signature) {
            return sendCharacterGet(res, cached, req, { cache: 'HIT' });
        }

        const result = await fetchOriginal(ctx, characterGetEndpoint);
        if (!result.ok) {
            res.setHeader(HEADER_PREFIX, 'characters-get-fast');
            res.setHeader('content-type', result.headers?.['content-type'] || JSON_CONTENT_TYPE);
            return res.status(result.status || 500).send(result.bodyText || '{}');
        }

        const entry = makeFullEntry(signature, result);
        if (cached?.hash && cached?.data) rememberHistory(entry, cached.hash, cached.data);
        characterGetCache.set(cacheKey, entry);
        return sendCharacterGet(res, entry, req, { cache: cached ? 'MISS' : 'INIT' });
    } catch (error) {
        res.setHeader(HEADER_PREFIX, 'characters-get-fast');
        res.setHeader('content-type', JSON_CONTENT_TYPE);
        return res.status(500).send(JSON.stringify({ error: true, message: error instanceof Error ? error.message : String(error) }));
    }
}
