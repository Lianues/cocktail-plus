// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX } from '../constants.js';
import { getPathValue, scanDirectoryShallow, signatureFromRecords } from '../utils.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
// A single pathological card should not be allowed to recreate the original giant-string failure.
// Normal character-card metadata is usually KB/MB scale; very large cards are skipped and logged.
const MAX_CARD_TEXT_CHUNK_BYTES = 64 * 1024 * 1024;

function callProgress(onProgress, patch) {
    try {
        if (typeof onProgress === 'function') onProgress(patch);
    } catch {
        // progress callbacks must never break cache construction
    }
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

function toShallowCharacter(character) {
    return {
        shallow: true,
        name: character?.name,
        avatar: character?.avatar,
        chat: character?.chat,
        fav: character?.fav,
        date_added: character?.date_added,
        create_date: character?.create_date,
        date_last_chat: character?.date_last_chat,
        chat_size: character?.chat_size,
        data_size: character?.data_size,
        tags: character?.tags,
        data: {
            name: getPathValue(character, 'data.name', ''),
            character_version: getPathValue(character, 'data.character_version', ''),
            creator: getPathValue(character, 'data.creator', ''),
            creator_notes: getPathValue(character, 'data.creator_notes', ''),
            tags: getPathValue(character, 'data.tags', []),
            extensions: {
                fav: getPathValue(character, 'data.extensions.fav', false),
            },
        },
    };
}

function normalizeBoolean(value) {
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    return false;
}

function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
}

function calculateChatSize(chatsRoot, avatarFileName) {
    let chatSize = 0;
    let dateLastChat = 0;
    try {
        const charDir = path.join(chatsRoot, String(avatarFileName || '').replace(/\.png$/i, ''));
        if (!fs.existsSync(charDir)) return { chatSize, dateLastChat };
        const chats = fs.readdirSync(charDir);
        for (const chat of chats) {
            try {
                const stat = fs.statSync(path.join(charDir, chat));
                if (!stat.isFile()) continue;
                chatSize += stat.size;
                dateLastChat = Math.max(dateLastChat, stat.mtimeMs);
            } catch {
                // ignore individual chat stat errors
            }
        }
    } catch {
        // ignore chat directory errors
    }
    return { chatSize, dateLastChat };
}

function calculateDataSize(data) {
    try {
        return data && typeof data === 'object'
            ? Object.values(data).reduce((acc, val) => acc + String(val).length, 0)
            : 0;
    } catch {
        return 0;
    }
}

function extractPngTextChunks(buffer) {
    const chunks = [];
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return chunks;

    // PNG signature is 8 bytes. If signature does not match, just fall through and fail gracefully.
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const typeStart = offset + 4;
        const typeEnd = offset + 8;
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const nextOffset = dataEnd + 4;

        if (length < 0 || dataEnd > buffer.length || nextOffset > buffer.length) break;

        const type = buffer.toString('ascii', typeStart, typeEnd);
        if (type === 'tEXt') {
            const separator = buffer.indexOf(0, dataStart);
            if (separator >= dataStart && separator < dataEnd) {
                const keyword = buffer.toString('latin1', dataStart, separator).toLowerCase();
                if (keyword === 'chara' || keyword === 'ccv3') {
                    const textLength = dataEnd - separator - 1;
                    if (textLength > MAX_CARD_TEXT_CHUNK_BYTES) {
                        throw new Error(`PNG ${keyword} metadata is too large: ${textLength} bytes`);
                    }
                    const text = buffer.toString('latin1', separator + 1, dataEnd);
                    chunks.push({ keyword, text });
                }
            }
        }

        if (type === 'IEND') break;
        offset = nextOffset;
    }
    return chunks;
}

async function readCharacterCardJson(filePath) {
    const buffer = await fs.promises.readFile(filePath);
    const textChunks = extractPngTextChunks(buffer);
    const selected = textChunks.find(chunk => chunk.keyword === 'ccv3') || textChunks.find(chunk => chunk.keyword === 'chara');
    if (!selected) throw new Error('No character metadata found');
    return Buffer.from(selected.text, 'base64').toString('utf8');
}

function makeShallowCharacterFromCard(raw, avatarFileName, stat, directories) {
    const data = raw && typeof raw.data === 'object' && raw.data !== null ? raw.data : {};
    const extensions = data.extensions && typeof data.extensions === 'object' ? data.extensions : {};
    const name = String(data.name || raw?.name || path.basename(avatarFileName, path.extname(avatarFileName)) || '').trim();
    if (!name) return null;

    const tags = normalizeArray(data.tags).length ? normalizeArray(data.tags) : normalizeArray(raw?.tags);
    const fav = normalizeBoolean(raw?.fav ?? extensions.fav);
    const { chatSize, dateLastChat } = calculateChatSize(directories.chats, avatarFileName);
    const createDate = raw?.create_date || data.create_date || new Date(Math.round(stat?.ctimeMs || Date.now())).toISOString();

    return toShallowCharacter({
        name,
        avatar: avatarFileName,
        chat: raw?.chat || data.chat || '',
        fav,
        date_added: stat?.ctimeMs || 0,
        create_date: createDate,
        date_last_chat: dateLastChat,
        chat_size: chatSize,
        data_size: calculateDataSize(data),
        tags,
        data: {
            name,
            character_version: data.character_version || raw?.character_version || '',
            creator: data.creator || raw?.creator || '',
            creator_notes: data.creator_notes || raw?.creator_notes || raw?.creatorcomment || '',
            tags,
            extensions: {
                fav,
            },
        },
    });
}

async function processCharacterFileDirect(fileName, directories) {
    const filePath = path.join(directories.characters, fileName);
    const stat = await fs.promises.stat(filePath);
    const jsonText = await readCharacterCardJson(filePath);
    const raw = JSON.parse(jsonText);
    return { character: makeShallowCharacterFromCard(raw, fileName, stat, directories), stat };
}

async function fetchCharactersAllDirect(ctx, config, options = {}) {
    if (!config.shallowCharactersAll) return null;

    const startedAt = Date.now();
    const onProgress = options?.onProgress;
    const directories = ctx.directories || {};
    const charactersDir = directories.characters;
    if (!charactersDir) throw new Error('Characters directory is not available');

    callProgress(onProgress, progressPatch('scanning', startedAt, 0, null, { status: null, error: null }));

    const dirents = await fs.promises.readdir(charactersDir, { withFileTypes: true });
    const pngFiles = dirents
        .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png')
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));

    const fileStats = new Map();
    let totalBytes = 0;
    for (const fileName of pngFiles) {
        try {
            const stat = await fs.promises.stat(path.join(charactersDir, fileName));
            fileStats.set(fileName, stat);
            totalBytes += stat.size;
        } catch {
            // file may have disappeared; process step will skip/log it
        }
    }

    const characters = [];
    let processedBytes = 0;
    let errors = 0;
    let lastEmitAt = 0;

    callProgress(onProgress, progressPatch('reading', startedAt, 0, totalBytes, { count: 0, totalCount: pngFiles.length }));

    for (let index = 0; index < pngFiles.length; index++) {
        const fileName = pngFiles[index];
        const stat = fileStats.get(fileName);
        try {
            const { character } = await processCharacterFileDirect(fileName, directories);
            if (character?.name) characters.push(character);
        } catch (error) {
            errors++;
            console.warn(`[cocktail-plus] Could not build shallow character cache entry for ${fileName}:`, error instanceof Error ? error.message : error);
        } finally {
            processedBytes += stat?.size || 0;
            const now = Date.now();
            if (now - lastEmitAt >= 100 || index === pngFiles.length - 1) {
                lastEmitAt = now;
                callProgress(onProgress, progressPatch('reading', startedAt, processedBytes, totalBytes, { count: index + 1, totalCount: pngFiles.length, errors }));
            }
        }
    }

    callProgress(onProgress, progressPatch('transforming', startedAt, processedBytes, totalBytes, { count: characters.length, totalCount: pngFiles.length, errors, etaMs: 0 }));

    const bodyText = JSON.stringify(characters);
    const cachedBytes = Buffer.byteLength(bodyText, 'utf8');
    const durationMs = Date.now() - startedAt;

    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': JSON_CONTENT_TYPE },
        bodyText,
        durationMs,
        bytesReceived: processedBytes,
        totalBytes,
        transform: {
            transformed: true,
            direct: true,
            sourceBytes: processedBytes,
            cachedBytes,
            count: characters.length,
            errors,
        },
    };
}

function getCharactersSignature(ctx) {
    return signatureFromRecords(scanDirectoryShallow(ctx.directories?.characters, { label: 'characters', extensions: ['.png'] }));
}

function transformBodyForCache(ctx, bodyText, config) {
    if (!config.shallowCharactersAll) {
        return { bodyText, transformed: false, sourceBytes: Buffer.byteLength(bodyText || '', 'utf8'), cachedBytes: Buffer.byteLength(bodyText || '', 'utf8') };
    }

    const sourceBytes = Buffer.byteLength(bodyText || '', 'utf8');
    try {
        const parsed = JSON.parse(bodyText);
        if (!Array.isArray(parsed)) throw new Error('characters/all response is not an array');
        const shallow = parsed.map(toShallowCharacter).filter(c => c && c.name);
        const transformedBodyText = JSON.stringify(shallow);
        const cachedBytes = Buffer.byteLength(transformedBodyText, 'utf8');
        return { bodyText: transformedBodyText, transformed: true, sourceBytes, cachedBytes, count: shallow.length };
    } catch (error) {
        return { bodyText, transformed: false, sourceBytes, cachedBytes: sourceBytes, error: error instanceof Error ? error.message : String(error) };
    }
}

function makeAsyncMiss(ctx, signature, config) {
    if (!config.asyncCharactersAllOnMiss || !config.allowEmptyCharactersAllOnMiss) return null;
    return {
        state: 'ASYNC-MISS',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': JSON_CONTENT_TYPE },
        extraResponseHeaders: {
            [`${HEADER_PREFIX}-async`]: '1',
            [`${HEADER_PREFIX}-retry-after-ms`]: '1000',
        },
        bodyText: '[]',
        durationMs: 0,
        refreshReason: 'async-miss',
    };
}

export function charactersEndpointsToInvalidate(pathname) {
    const out = [];
    if (pathname.startsWith('/api/characters/') && pathname !== '/api/characters/all' && pathname !== '/api/characters/get' && pathname !== '/api/characters/chats') out.push('characters-all');
    if (pathname === '/api/chats/save' || pathname === '/api/chats/group/save' || pathname === '/api/chats/delete' || pathname === '/api/chats/group/delete' || pathname === '/api/chats/import' || pathname === '/api/chats/group/import') out.push('characters-all');
    return out;
}

export const charactersAllEndpoint = {
    key: 'characters-all',
    aliases: ['characters', 'characters-all', '/api/characters/all'],
    originalPath: '/api/characters/all',
    fastPath: '/fast/characters-all',
    configKey: 'cacheCharactersAll',
    diskCacheConfigKey: 'diskCacheCharactersAll',
    method: 'POST',
    getSignature: getCharactersSignature,
    fetchForCache: fetchCharactersAllDirect,
    staleOnSignatureChange: true,
    transformBodyForCache,
    makeAsyncMiss,
};
