// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX, VERSION } from '../constants.js';
import { config } from '../config.js';
import { fetchOriginal } from '../original-fetch.js';
import { makeRequestContext } from '../request-context.js';
import { sha256, stableStringify } from '../utils.js';

export const CHAT_SAVE_HASH_ALGORITHM = 'cp-chat-stable-sha256-v1';

export const chatSaveEndpoint = {
    key: 'chats-save',
    aliases: ['chats-save', '/api/chats/save'],
    originalPath: '/api/chats/save',
    fastPath: '/fast/chats-save',
    configKey: 'optimizeChatSave',
    method: 'POST',
    kind: 'character',
};

export const groupChatSaveEndpoint = {
    key: 'chats-group-save',
    aliases: ['chats-group-save', '/api/chats/group/save'],
    originalPath: '/api/chats/group/save',
    fastPath: '/fast/chats-group-save',
    configKey: 'optimizeChatSave',
    method: 'POST',
    kind: 'group',
};

export const chatSaveStats = {
    requests: 0,
    noops: 0,
    patches: 0,
    fulls: 0,
    conflicts: 0,
    errors: 0,
    originalBytes: 0,
    optimizedBytes: 0,
    savedBytes: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheInvalidations: 0,
    cacheEvictions: 0,
    lastMode: null,
    lastState: null,
    lastError: null,
    lastAt: null,
};

const chatFileCache = new Map();

function nowIso() {
    return new Date().toISOString();
}

export function hashChat(value) {
    return sha256(stableStringify(Array.isArray(value) ? value : []));
}

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asString(value) {
    return String(value ?? '');
}

function sanitizeFileName(value) {
    let out = asString(value)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/[\u{0080}-\u{009F}]/gu, '')
        .trim();
    if (!out || /^\.+$/.test(out)) out = 'untitled';
    // Keep a conservative limit close to common filesystem filename limits.
    if (out.length > 240) {
        const ext = path.extname(out);
        out = out.slice(0, Math.max(1, 240 - ext.length)) + ext;
    }
    return out;
}

function isPathUnderParent(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getSafeStat(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return { exists: true, size: stat.size, mtimeMs: Math.round(stat.mtimeMs), file: stat.isFile() };
    } catch {
        return { exists: false, size: 0, mtimeMs: 0, file: false };
    }
}

function sameStat(a, b) {
    return !!a && !!b && a.exists === b.exists && a.size === b.size && a.mtimeMs === b.mtimeMs && a.file === b.file;
}

function parseJsonl(text) {
    if (!text) return [];
    const out = [];
    for (const line of String(text).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const item = JSON.parse(trimmed);
            if (item) out.push(item);
        } catch {
            // Match SillyTavern getChatData tolerance: malformed lines are ignored.
        }
    }
    return out;
}

function readChatFromFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        return parseJsonl(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return [];
    }
}

function getCacheLimit() {
    const value = Number(config.chatSaveCacheMaxEntries);
    if (!Number.isFinite(value)) return 64;
    return Math.max(0, Math.min(1024, Math.trunc(value)));
}

function setCacheEntry(key, entry) {
    const limit = getCacheLimit();
    if (limit <= 0) {
        chatFileCache.clear();
        return;
    }
    if (chatFileCache.has(key)) chatFileCache.delete(key);
    chatFileCache.set(key, entry);
    while (chatFileCache.size > limit) {
        const oldest = chatFileCache.keys().next().value;
        if (oldest === undefined) break;
        chatFileCache.delete(oldest);
        chatSaveStats.cacheEvictions++;
    }
}

function getIdentityValue(body, key) {
    if (body?.identity && body.identity[key] !== undefined) return body.identity[key];
    return body?.[key];
}

function makeDescriptor(req, endpoint, body) {
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    const kind = endpoint.kind || body?.kind || 'character';

    if (kind === 'group') {
        const id = asString(getIdentityValue(body, 'id'));
        if (!id) throw new Error('group chat id is required');
        const root = req?.user?.directories?.groupChats;
        if (!root) throw new Error('User group chats directory is unavailable');
        const filePath = path.join(root, sanitizeFileName(`${id}.jsonl`));
        if (!isPathUnderParent(root, filePath)) throw new Error('Resolved group chat path is outside user directory');
        return {
            kind,
            endpoint,
            cacheKey: `${ctx.userKey}:group:${id}`,
            filePath,
            root,
            identity: { id },
            originalBody: nextChat => ({ id, chat: nextChat, force: !!body?.force }),
        };
    }

    const avatarUrl = asString(getIdentityValue(body, 'avatar_url'));
    const fileName = asString(getIdentityValue(body, 'file_name'));
    const chName = asString(getIdentityValue(body, 'ch_name'));
    if (!avatarUrl || !fileName) throw new Error('avatar_url and file_name are required');
    const chatsRoot = req?.user?.directories?.chats;
    if (!chatsRoot) throw new Error('User chats directory is unavailable');
    const cardName = avatarUrl.replace(/\.png$/i, '');
    const directoryPath = path.join(chatsRoot, cardName);
    const filePath = path.join(directoryPath, sanitizeFileName(`${fileName}.jsonl`));
    if (!isPathUnderParent(chatsRoot, filePath)) throw new Error('Resolved chat path is outside user directory');
    return {
        kind,
        endpoint,
        cacheKey: `${ctx.userKey}:character:${avatarUrl}:${fileName}`,
        filePath,
        root: chatsRoot,
        identity: { avatar_url: avatarUrl, file_name: fileName, ch_name: chName },
        originalBody: nextChat => ({ ch_name: chName, file_name: fileName, chat: nextChat, avatar_url: avatarUrl, force: !!body?.force }),
    };
}

function getCurrentChat(descriptor) {
    const stat = getSafeStat(descriptor.filePath);
    const cached = chatFileCache.get(descriptor.cacheKey);
    if (cached && sameStat(cached.stat, stat)) {
        chatFileCache.delete(descriptor.cacheKey);
        chatFileCache.set(descriptor.cacheKey, cached);
        chatSaveStats.cacheHits++;
        return { ...cached, stat };
    }

    if (cached) chatSaveStats.cacheInvalidations++;
    chatSaveStats.cacheMisses++;
    const chat = readChatFromFile(descriptor.filePath);
    const hash = hashChat(chat);
    const entry = { chat, hash, stat, updatedAt: Date.now(), approxBytes: Buffer.byteLength(JSON.stringify(chat), 'utf8') };
    setCacheEntry(descriptor.cacheKey, entry);
    return entry;
}

function updateCurrentChatCache(descriptor, nextChat) {
    const stat = getSafeStat(descriptor.filePath);
    const entry = { chat: cloneJson(nextChat), hash: hashChat(nextChat), stat, updatedAt: Date.now(), approxBytes: Buffer.byteLength(JSON.stringify(nextChat), 'utf8') };
    setCacheEntry(descriptor.cacheKey, entry);
}

function noteTraffic(body, fallbackMode = 'unknown') {
    const originalBytes = Math.max(0, Number(body?.originalBytes) || 0);
    const optimizedBytes = Math.max(0, Number(body?.optimizedBytes) || Buffer.byteLength(JSON.stringify(body || {}), 'utf8'));
    chatSaveStats.originalBytes += originalBytes;
    chatSaveStats.optimizedBytes += optimizedBytes;
    chatSaveStats.savedBytes += Math.max(0, originalBytes - optimizedBytes);
    chatSaveStats.lastMode = body?.mode || fallbackMode;
    chatSaveStats.lastAt = nowIso();
}

function sendJson(res, status, data, state) {
    chatSaveStats.lastState = state;
    res.status(status);
    res.setHeader(HEADER_PREFIX, VERSION);
    res.setHeader(`${HEADER_PREFIX}-chat-save-state`, state);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(data));
}

function sendText(res, status, bodyText, state, contentType = 'application/json; charset=utf-8') {
    chatSaveStats.lastState = state;
    res.status(status || 200);
    res.setHeader(HEADER_PREFIX, VERSION);
    res.setHeader(`${HEADER_PREFIX}-chat-save-state`, state);
    res.setHeader('content-type', contentType);
    res.send(bodyText ?? '');
}

function conflict(res, data) {
    chatSaveStats.conflicts++;
    return sendJson(res, 409, { ok: false, fallback: true, ...data }, 'CONFLICT');
}

function toSafeInteger(value, min, max, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} is out of range`);
    return n;
}

function isSafePathSegment(segment) {
    if (typeof segment !== 'string' && typeof segment !== 'number') return false;
    const value = String(segment);
    return value !== '__proto__' && value !== 'prototype' && value !== 'constructor' && value.length > 0 && value.length < 512;
}

function normalizePatchPath(value) {
    if (!Array.isArray(value)) throw new Error('Patch path must be an array');
    if (value.length === 0) throw new Error('Patch path cannot be empty');
    if (value.length > 128) throw new Error('Patch path is too deep');
    if (!value.every(isSafePathSegment)) throw new Error('Patch path contains unsafe segments');
    return value.map(segment => typeof segment === 'number' ? segment : String(segment));
}

function ensureContainer(parent, key, nextKey) {
    if (parent[key] === null || typeof parent[key] !== 'object' || Array.isArray(parent[key])) {
        parent[key] = typeof nextKey === 'number' ? [] : {};
    }
    return parent[key];
}

function setAtPath(target, patchPath, value) {
    let parent = target;
    for (let i = 0; i < patchPath.length - 1; i++) {
        const key = patchPath[i];
        const nextKey = patchPath[i + 1];
        parent = ensureContainer(parent, key, nextKey);
    }
    parent[patchPath[patchPath.length - 1]] = cloneJson(value);
}

function deleteAtPath(target, patchPath) {
    let parent = target;
    for (let i = 0; i < patchPath.length - 1; i++) {
        const key = patchPath[i];
        if (parent === null || typeof parent !== 'object' || !(key in parent)) return;
        parent = parent[key];
    }
    if (parent && typeof parent === 'object') delete parent[patchPath[patchPath.length - 1]];
}

function applyPatch(baseChat, ops) {
    if (!Array.isArray(ops)) throw new Error('Patch ops must be an array');
    if (ops.length > config.chatSaveMaxPatchOperations) {
        throw new Error(`Too many patch operations: ${ops.length}`);
    }

    const next = cloneJson(Array.isArray(baseChat) ? baseChat : []);
    for (const op of ops) {
        const kind = String(op?.op || '').toLowerCase();
        if (kind === 'splice') {
            const index = toSafeInteger(op.index, 0, next.length, 'splice.index');
            const deleteCount = toSafeInteger(op.deleteCount ?? 0, 0, next.length - index, 'splice.deleteCount');
            const items = Array.isArray(op.items) ? cloneJson(op.items) : [];
            next.splice(index, deleteCount, ...items);
            continue;
        }
        if (kind === 'set') {
            const index = toSafeInteger(op.index, 0, Math.max(0, next.length), 'set.index');
            if (index >= next.length) throw new Error('set.index must point to an existing message');
            next[index] = cloneJson(op.value);
            continue;
        }
        if (kind === 'set-path') {
            const index = toSafeInteger(op.index, 0, Math.max(0, next.length - 1), 'set-path.index');
            const patchPath = normalizePatchPath(op.path);
            if (next[index] === null || typeof next[index] !== 'object') next[index] = {};
            setAtPath(next[index], patchPath, op.value);
            continue;
        }
        if (kind === 'delete-path') {
            const index = toSafeInteger(op.index, 0, Math.max(0, next.length - 1), 'delete-path.index');
            const patchPath = normalizePatchPath(op.path);
            deleteAtPath(next[index], patchPath);
            continue;
        }
        throw new Error(`Unsupported patch op: ${kind}`);
    }
    return next;
}

async function callOriginalChatSave(req, descriptor, nextChat) {
    const originalBody = descriptor.originalBody(nextChat);
    const ctx = makeRequestContext(req, {
        bodyOverride: originalBody,
        bodyTextOverride: JSON.stringify(originalBody),
    });
    return await fetchOriginal(ctx, descriptor.endpoint);
}

export function getChatSaveStatus() {
    return {
        endpointKey: 'chat-save',
        enabled: !!config.enabled && !!config.optimizeChatSave,
        patchEnabled: !!config.chatSavePatchEnabled,
        noopEnabled: !!config.chatSaveNoopEnabled,
        cacheEntries: chatFileCache.size,
        stats: { ...chatSaveStats },
    };
}

export async function handleChatSaveFast(req, res, endpoint = chatSaveEndpoint) {
    chatSaveStats.requests++;
    const body = req.body || {};
    chatSaveStats.lastMode = body?.mode || null;
    chatSaveStats.lastAt = nowIso();

    if (!config.enabled || !config.optimizeChatSave) {
        return sendJson(res, 503, { ok: false, fallback: true, error: 'chat-save optimization disabled' }, 'DISABLED');
    }

    try {
        const mode = String(body.mode || '').toLowerCase();
        if (body.hashAlgorithm && body.hashAlgorithm !== CHAT_SAVE_HASH_ALGORITHM) {
            return sendJson(res, 400, { ok: false, fallback: true, error: 'unsupported hash algorithm' }, 'BAD-HASH-ALGORITHM');
        }

        const descriptor = makeDescriptor(req, endpoint, body);
        const current = getCurrentChat(descriptor);
        const currentHash = current.hash;

        if (mode === 'noop') {
            if (!config.chatSaveNoopEnabled) {
                return sendJson(res, 503, { ok: false, fallback: true, error: 'chat-save noop optimization disabled' }, 'NOOP-DISABLED');
            }
            chatSaveStats.noops++;
            noteTraffic(body);
            const fresh = currentHash === body.baseHash || currentHash === body.nextHash;
            return sendJson(res, 200, {
                ok: true,
                result: 'ok',
                optimized: true,
                mode: 'noop',
                state: fresh ? 'NOOP' : 'NOOP-STALE',
                currentHash,
            }, fresh ? 'NOOP' : 'NOOP-STALE');
        }

        if (mode === 'patch') {
            if (!config.chatSavePatchEnabled) {
                return sendJson(res, 503, { ok: false, fallback: true, error: 'chat-save patch optimization disabled' }, 'PATCH-DISABLED');
            }
            if (!body.baseHash || !body.nextHash) {
                return sendJson(res, 400, { ok: false, fallback: true, error: 'baseHash and nextHash are required' }, 'BAD-PATCH');
            }
            if (currentHash !== body.baseHash) {
                return conflict(res, { error: 'base hash mismatch', currentHash, baseHash: body.baseHash });
            }

            const nextChat = applyPatch(current.chat, body.ops || []);
            const appliedHash = hashChat(nextChat);
            if (appliedHash !== body.nextHash) {
                return sendJson(res, 400, { ok: false, fallback: true, error: 'patch hash mismatch', appliedHash, nextHash: body.nextHash }, 'PATCH-HASH-MISMATCH');
            }

            const result = await callOriginalChatSave(req, descriptor, nextChat);
            if (result.ok) {
                chatSaveStats.patches++;
                noteTraffic(body);
                updateCurrentChatCache(descriptor, nextChat);
            }
            const state = result.ok ? 'PATCH' : 'PATCH-ORIGINAL-ERROR';
            return sendText(res, result.status, result.bodyText, state, result.headers?.['content-type']);
        }

        return sendJson(res, 400, { ok: false, fallback: true, error: `unsupported mode: ${mode || '(empty)'}` }, 'BAD-MODE');
    } catch (error) {
        chatSaveStats.errors++;
        chatSaveStats.lastError = error instanceof Error ? error.message : String(error);
        chatSaveStats.lastAt = nowIso();
        return sendJson(res, 500, { ok: false, fallback: true, error: chatSaveStats.lastError }, 'ERROR');
    }
}
