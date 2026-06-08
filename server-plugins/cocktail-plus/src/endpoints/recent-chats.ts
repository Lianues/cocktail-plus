// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { HEADER_PREFIX } from '../constants.js';
import { sha256, stableStringify } from '../utils.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const DEFAULT_DISPLAYED = 3;
const DEFAULT_MAX = 15;
const MAX_LIMIT = 100;
const SYSTEM_AVATAR = 'img/five.png';
const RECENT_PATCH_HISTORY_LIMIT = 3;

const recentChatsCache = new Map();

function formatBytes(numBytes) {
    const bytes = Math.max(0, Number(numBytes) || 0);
    if (bytes === 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }
    return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 2 : 2)}${units[index]}`;
}

function tryParseJson(text) {
    try { return JSON.parse(text); } catch { return null; }
}

function normalizeMax(value) {
    const parsed = Number.parseInt(value ?? DEFAULT_MAX, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX;
    return Math.min(MAX_LIMIT, parsed);
}

function normalizePinned(value) {
    return Array.isArray(value) ? value : [];
}


function normalizePinnedForKey(pinnedChats) {
    return normalizePinned(pinnedChats)
        .map(p => ({ avatar: p?.avatar || '', group: p?.group || '', file_name: p?.file_name || '' }))
        .sort((a, b) => `${a.group}|${a.avatar}|${a.file_name}`.localeCompare(`${b.group}|${b.avatar}|${b.file_name}`));
}

function getRecentCacheKey(req, max, pinnedChats) {
    const handle = String(req.user?.profile?.handle || req.user?.profile?.name || 'default');
    const root = String(req.user?.directories?.root || '');
    return sha256(stableStringify({ root, handle, max, pinned: normalizePinnedForKey(pinnedChats) })).slice(0, 32);
}

function getClientPatchHash(req) {
    const hash = req.body?.cpRecentPatch?.hash;
    return typeof hash === 'string' && hash ? hash : '';
}

function sameJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function buildRecentPatch(base, next) {
    if (!Array.isArray(base) || !Array.isArray(next)) return null;
    if (sameJson(base, next)) return [];
    const ops = [];
    if (base.length === next.length) {
        for (let i = 0; i < next.length; i++) {
            if (!sameJson(base[i], next[i])) ops.push({ op: 'set', index: i, value: next[i] });
        }
        return ops;
    }
    const min = Math.min(base.length, next.length);
    let prefix = 0;
    while (prefix < min && sameJson(base[prefix], next[prefix])) prefix++;
    let suffix = 0;
    while (suffix < min - prefix && sameJson(base[base.length - 1 - suffix], next[next.length - 1 - suffix])) suffix++;
    ops.push({
        op: 'splice',
        index: prefix,
        deleteCount: Math.max(0, base.length - prefix - suffix),
        items: next.slice(prefix, next.length - suffix),
    });
    return ops;
}

function rememberRecentHistory(entry, hash, data) {
    if (!entry || !hash || !Array.isArray(data)) return;
    entry.history = entry.history instanceof Map ? entry.history : new Map();
    entry.history.set(hash, data);
    while (entry.history.size > RECENT_PATCH_HISTORY_LIMIT) {
        const first = entry.history.keys().next().value;
        entry.history.delete(first);
    }
}

function sendRecentPayload(req, res, entry, meta = {}) {
    const clientHash = getClientPatchHash(req);
    let mode = 'full';
    let bodyText = entry.bodyText;

    if (clientHash && clientHash === entry.hash) {
        mode = 'noop';
        bodyText = JSON.stringify({ mode, hash: entry.hash });
    } else if (clientHash && entry.history instanceof Map && entry.history.has(clientHash)) {
        const base = entry.history.get(clientHash);
        const ops = buildRecentPatch(base, entry.data);
        if (ops && ops.length === 0) {
            mode = 'noop';
            bodyText = JSON.stringify({ mode, hash: entry.hash });
        } else if (ops) {
            const patchText = JSON.stringify({ mode: 'patch', baseHash: clientHash, nextHash: entry.hash, ops });
            if (patchText.length < entry.bodyText.length) {
                mode = 'patch';
                bodyText = patchText;
            }
        }
    }

    res.setHeader(HEADER_PREFIX, 'recent-chats-fast');
    res.setHeader(`${HEADER_PREFIX}-recent-ready`, '1');
    res.setHeader(`${HEADER_PREFIX}-recent-patch`, mode);
    res.setHeader(`${HEADER_PREFIX}-recent-hash`, entry.hash);
    res.setHeader(`${HEADER_PREFIX}-recent-candidates`, String(meta.candidates ?? ''));
    res.setHeader(`${HEADER_PREFIX}-recent-read`, String(meta.read ?? ''));
    res.setHeader(`${HEADER_PREFIX}-recent-cache`, meta.cache || '');
    res.setHeader(`${HEADER_PREFIX}-recent-ms`, String(meta.ms ?? ''));
    res.setHeader('content-type', JSON_CONTENT_TYPE);
    return res.status(200).send(bodyText);
}

async function statEntityForSignature(ctx, chatFile) {
    try {
        if (chatFile.pngFile && ctx.directories?.characters) {
            const stat = await safeStat(path.join(ctx.directories.characters, chatFile.pngFile));
            return { avatar: chatFile.pngFile, size: stat?.size || 0, mtime: Math.round(stat?.mtimeMs || 0) };
        }
        if (chatFile.groupId) {
            const group = ctx.groupInfoMap?.get(chatFile.groupId) || {};
            return { group: chatFile.groupId, name: group.name || '', chats: group.chats || [], members: group.members || [], disabled_members: group.disabled_members || [], avatar_url: group.avatar_url || '' };
        }
    } catch {
        // ignore entity signature errors
    }
    return null;
}

async function buildRecentSignature(ctx, selectedFiles, max, pinnedChats) {
    const files = [];
    for (const file of selectedFiles) {
        files.push({
            filePath: file.filePath,
            pngFile: file.pngFile || '',
            groupId: file.groupId || '',
            mtime: Math.round(file.mtime || 0),
            size: file.size || 0,
            entity: await statEntityForSignature(ctx, file),
        });
    }
    return sha256(stableStringify({ max, pinned: normalizePinnedForKey(pinnedChats), files }));
}


function isPinnedChat(chatFile, pinnedChats) {
    const base = path.basename(chatFile.filePath);
    return pinnedChats.some(p => p && p.file_name === base && (p.avatar === chatFile.pngFile || p.group === chatFile.groupId));
}

function getThumbnailUrl(type, file) {
    return `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`;
}

function formatDateShort(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try { return date.toLocaleDateString(); } catch { return date.toISOString().slice(0, 10); }
}

function formatDateLong(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try { return date.toLocaleString(); } catch { return date.toISOString(); }
}

async function safeStat(filePath) {
    try {
        const stat = await fs.promises.stat(filePath);
        return stat.isFile() ? stat : null;
    } catch {
        return null;
    }
}

async function listJsonlFiles(directory) {
    try {
        const entries = await fs.promises.readdir(directory, { withFileTypes: true });
        return entries.filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.jsonl').map(e => e.name);
    } catch {
        return [];
    }
}

async function collectCharacterChatFiles(ctx, allChatFiles) {
    const charactersDir = ctx.directories?.characters;
    const chatsRoot = ctx.directories?.chats;
    if (!charactersDir || !chatsRoot) return;

    let entries = [];
    try { entries = await fs.promises.readdir(charactersDir, { withFileTypes: true }); } catch { return; }
    const pngFiles = entries.filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.png').map(e => e.name);

    await Promise.all(pngFiles.map(async (pngFile) => {
        const chatsDirectory = pngFile.replace(/\.png$/i, '');
        const pathToChats = path.join(chatsRoot, chatsDirectory);
        let dirStat = null;
        try { dirStat = await fs.promises.stat(pathToChats); } catch { return; }
        if (!dirStat.isDirectory()) return;

        const jsonlFiles = await listJsonlFiles(pathToChats);
        await Promise.all(jsonlFiles.map(async (file) => {
            const filePath = path.join(pathToChats, file);
            const stat = await safeStat(filePath);
            if (stat) allChatFiles.push({ pngFile, filePath, mtime: stat.mtimeMs, size: stat.size });
        }));
    }));
}

async function collectGroupChatFiles(ctx, allChatFiles, groupInfoMap) {
    const groupsDir = ctx.directories?.groups;
    const groupChatsDir = ctx.directories?.groupChats;
    if (!groupsDir || !groupChatsDir) return;

    let entries = [];
    try { entries = await fs.promises.readdir(groupsDir, { withFileTypes: true }); } catch { return; }
    const groupFiles = entries.filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.json').map(e => e.name);

    await Promise.all(groupFiles.map(async (groupFile) => {
        try {
            const groupPath = path.join(groupsDir, groupFile);
            const groupData = JSON.parse(await fs.promises.readFile(groupPath, 'utf8'));
            if (!groupData?.id) return;
            groupInfoMap.set(groupData.id, {
                id: groupData.id,
                name: groupData.name || path.parse(groupFile).name,
                avatar_url: groupData.avatar_url || '',
                chats: Array.isArray(groupData.chats) ? groupData.chats.slice() : [],
                members: Array.isArray(groupData.members) ? groupData.members.slice() : [],
                disabled_members: Array.isArray(groupData.disabled_members) ? groupData.disabled_members.slice() : [],
            });
            if (!Array.isArray(groupData.chats)) return;

            await Promise.all(groupData.chats.map(async (chat) => {
                const filePath = path.join(groupChatsDir, `${chat}.jsonl`);
                const stat = await safeStat(filePath);
                if (stat) allChatFiles.push({ groupId: groupData.id, filePath, mtime: stat.mtimeMs, size: stat.size });
            }));
        } catch {
            // skip unreadable group files
        }
    }));
}

async function collectRootChatFiles(ctx, allChatFiles) {
    const chatsRoot = ctx.directories?.chats;
    if (!chatsRoot) return;
    let entries = [];
    try { entries = await fs.promises.readdir(chatsRoot, { withFileTypes: true }); } catch { return; }
    const rootJsonlFiles = entries.filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.jsonl').map(e => e.name);

    await Promise.all(rootJsonlFiles.map(async (file) => {
        const filePath = path.join(chatsRoot, file);
        const stat = await safeStat(filePath);
        if (stat) allChatFiles.push({ filePath, mtime: stat.mtimeMs, size: stat.size });
    }));
}

async function getChatInfoFast(chatFile) {
    const parsedPath = path.parse(chatFile.filePath);
    const stat = await safeStat(chatFile.filePath);
    if (!stat) return null;

    const chatData = {
        match: true,
        file_id: parsedPath.name,
        file_name: parsedPath.base,
        file_size: formatBytes(stat.size),
        chat_items: 0,
        mes: '[The chat is empty]',
        last_mes: stat.mtimeMs,
        avatar: chatFile.pngFile,
        group: chatFile.groupId,
    };

    if (stat.size === 0) return chatData;

    return await new Promise((resolve) => {
        const fileStream = fs.createReadStream(chatFile.filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        let lastLine = '';
        let itemCounter = 0;
        let resolved = false;
        const done = (value) => {
            if (resolved) return;
            resolved = true;
            try { rl.close(); } catch {}
            try { fileStream.destroy(); } catch {}
            resolve(value);
        };
        fileStream.on('error', () => done(null));
        rl.on('line', line => {
            itemCounter++;
            lastLine = line;
        });
        rl.on('close', () => {
            if (!lastLine) return done(chatData);
            const jsonData = tryParseJson(lastLine);
            if (!jsonData || !(jsonData.name || jsonData.character_name || jsonData.chat_metadata)) return done(null);
            chatData.chat_items = Math.max(0, itemCounter - 1);
            chatData.mes = jsonData.mes || '[The message is empty]';
            chatData.last_mes = jsonData.send_date || new Date(Math.round(stat.mtimeMs)).toISOString();
            done(chatData);
        });
    });
}

function extractPngTextChunks(buffer) {
    const chunks = [];
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return chunks;
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const nextOffset = dataEnd + 4;
        if (dataEnd > buffer.length || nextOffset > buffer.length) break;
        if (type === 'tEXt') {
            const separator = buffer.indexOf(0, dataStart);
            if (separator >= dataStart && separator < dataEnd) {
                const keyword = buffer.toString('latin1', dataStart, separator).toLowerCase();
                if (keyword === 'chara' || keyword === 'ccv3') {
                    chunks.push({ keyword, text: buffer.toString('latin1', separator + 1, dataEnd) });
                }
            }
        }
        if (type === 'IEND') break;
        offset = nextOffset;
    }
    return chunks;
}

async function readCharacterName(ctx, avatarFile) {
    if (!avatarFile) return '';
    try {
        const filePath = path.join(ctx.directories.characters, avatarFile);
        const buffer = await fs.promises.readFile(filePath);
        const chunks = extractPngTextChunks(buffer);
        const selected = chunks.find(c => c.keyword === 'ccv3') || chunks.find(c => c.keyword === 'chara');
        if (!selected) return path.basename(avatarFile, path.extname(avatarFile));
        const raw = JSON.parse(Buffer.from(selected.text, 'base64').toString('utf8'));
        return raw?.data?.name || raw?.name || path.basename(avatarFile, path.extname(avatarFile));
    } catch {
        return path.basename(avatarFile, path.extname(avatarFile));
    }
}

async function enrichRecentChat(ctx, chatInfo, chatFile, index, pinned) {
    const isGroup = !!chatFile.groupId;
    const groupInfo = isGroup ? (ctx.groupInfoMap?.get(chatFile.groupId) || {}) : null;
    const charName = isGroup ? (groupInfo?.name || chatFile.groupId || '') : await readCharacterName(ctx, chatFile.pngFile);
    const lastMes = chatInfo.last_mes || chatFile.mtime;
    const fileName = chatInfo.file_name || path.basename(chatFile.filePath);
    const avatar = chatInfo.avatar || chatFile.pngFile || '';
    const group = chatInfo.group || chatFile.groupId || '';

    return {
        ...chatInfo,
        file_name: fileName,
        chat_name: fileName.replace(/\.jsonl$/i, ''),
        char_name: charName,
        date_short: formatDateShort(lastMes),
        date_long: formatDateLong(lastMes),
        char_thumbnail: isGroup ? SYSTEM_AVATAR : (avatar ? getThumbnailUrl('avatar', avatar) : SYSTEM_AVATAR),
        is_group: isGroup,
        group_chats: isGroup ? (Array.isArray(groupInfo?.chats) ? groupInfo.chats : []) : undefined,
        group_members: isGroup ? (Array.isArray(groupInfo?.members) ? groupInfo.members : []) : undefined,
        group_disabled_members: isGroup ? (Array.isArray(groupInfo?.disabled_members) ? groupInfo.disabled_members : []) : undefined,
        group_avatar_url: isGroup ? (groupInfo?.avatar_url || '') : undefined,
        hidden: index >= DEFAULT_DISPLAYED,
        avatar,
        group,
        pinned,
    };
}

export async function handleRecentChatsFast(req, res) {
    const startedAt = Date.now();
    try {
        const ctx = { directories: req.user?.directories || {}, groupInfoMap: new Map() };
        const pinnedChats = normalizePinned(req.body?.pinned);
        const max = normalizeMax(req.body?.max) + pinnedChats.length;
        const cacheKey = getRecentCacheKey(req, max, pinnedChats);
        const allChatFiles = [];

        await Promise.allSettled([
            collectCharacterChatFiles(ctx, allChatFiles),
            collectGroupChatFiles(ctx, allChatFiles, ctx.groupInfoMap),
            collectRootChatFiles(ctx, allChatFiles),
        ]);

        const selectedFiles = allChatFiles
            .sort((a, b) => {
                const aPinned = isPinnedChat(a, pinnedChats);
                const bPinned = isPinnedChat(b, pinnedChats);
                if (aPinned && !bPinned) return -1;
                if (!aPinned && bPinned) return 1;
                return b.mtime - a.mtime;
            })
            .slice(0, max);

        const signature = await buildRecentSignature(ctx, selectedFiles, max, pinnedChats);
        const cached = recentChatsCache.get(cacheKey);
        if (cached && cached.signature === signature) {
            return sendRecentPayload(req, res, cached, { candidates: allChatFiles.length, read: 0, cache: 'HIT', ms: Date.now() - startedAt });
        }

        const rows = [];
        for (const chatFile of selectedFiles) {
            const chatInfo = await getChatInfoFast(chatFile);
            if (!chatInfo?.file_name) continue;
            rows.push({ chatFile, chatInfo, pinned: isPinnedChat(chatFile, pinnedChats) });
        }

        const valid = [];
        for (let index = 0; index < rows.length; index++) {
            valid.push(await enrichRecentChat(ctx, rows[index].chatInfo, rows[index].chatFile, index, rows[index].pinned));
        }

        const bodyText = JSON.stringify(valid);
        const hash = sha256(bodyText);
        const history = cached?.history instanceof Map ? cached.history : new Map();
        if (cached?.hash && Array.isArray(cached?.data)) rememberRecentHistory({ history }, cached.hash, cached.data);
        const entry = {
            signature,
            data: valid,
            bodyText,
            hash,
            history,
            createdAt: Date.now(),
        };
        recentChatsCache.set(cacheKey, entry);
        return sendRecentPayload(req, res, entry, { candidates: allChatFiles.length, read: selectedFiles.length, cache: cached ? 'MISS' : 'INIT', ms: Date.now() - startedAt });
    } catch (error) {
        res.setHeader(HEADER_PREFIX, 'recent-chats-fast');
        res.setHeader('content-type', JSON_CONTENT_TYPE);
        return res.status(500).send(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
}
