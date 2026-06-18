// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX } from '../constants.js';
import { getPathValue, scanDirectoryShallow, signatureFromRecords } from '../utils.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
// A single pathological card should not be allowed to recreate the original giant-string failure.
// Normal character-card metadata is usually KB/MB scale; very large cards are skipped and logged.
const MAX_CARD_TEXT_CHUNK_BYTES = 64 * 1024 * 1024;
// PNG metadata is read by streaming chunk headers and only materializing the tEXt payload.
// Large IDAT image data is skipped via positioned reads so a directory full of illustrated
// cards cannot OOM low-memory devices (Android/Termux), which previously left the cache empty.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CHUNK_HEADER_BYTES = 8;
// Bounded fan-out keeps scanning fast without opening every card at once (file-descriptor / RAM safety).
const DEFAULT_SCAN_CONCURRENCY = 6;

function resolveScanConcurrency(config) {
    const raw = Number(config?.charactersAllScanConcurrency);
    if (!Number.isFinite(raw)) return DEFAULT_SCAN_CONCURRENCY;
    return Math.max(1, Math.min(32, Math.trunc(raw)));
}

async function mapWithConcurrency(items, limit, iterator) {
    const size = Math.max(1, Math.min(limit, items.length));
    let cursor = 0;
    const workers = new Array(size).fill(null).map(async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) break;
            await iterator(items[index], index);
        }
    });
    await Promise.all(workers);
}

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

async function calculateChatSize(chatsRoot, avatarFileName) {
    let chatSize = 0;
    let dateLastChat = 0;
    try {
        const charDir = path.join(chatsRoot, String(avatarFileName || '').replace(/\.png$/i, ''));
        const entries = await fs.promises.readdir(charDir, { withFileTypes: true }).catch(() => null);
        if (!entries) return { chatSize, dateLastChat };
        await Promise.all(entries.map(async (entry) => {
            if (!entry.isFile()) return;
            try {
                const stat = await fs.promises.stat(path.join(charDir, entry.name));
                chatSize += stat.size;
                dateLastChat = Math.max(dateLastChat, stat.mtimeMs);
            } catch {
                // ignore individual chat stat errors
            }
        }));
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

async function readCharacterCardJson(filePath) {
    const handle = await fs.promises.open(filePath, 'r');
    try {
        const signature = Buffer.alloc(PNG_SIGNATURE.length);
        const sig = await handle.read(signature, 0, signature.length, 0);
        if (sig.bytesRead < signature.length || !signature.equals(PNG_SIGNATURE)) {
            throw new Error('Not a PNG character card');
        }

        const header = Buffer.alloc(PNG_CHUNK_HEADER_BYTES);
        let offset = PNG_SIGNATURE.length;
        let chara = null;
        let ccv3 = null;

        // Walk chunk-by-chunk. We only ever read the 8-byte chunk header plus the small
        // tEXt payloads; IDAT and other large chunks are skipped by advancing the offset.
        while (true) {
            const headerRead = await handle.read(header, 0, PNG_CHUNK_HEADER_BYTES, offset);
            if (headerRead.bytesRead < PNG_CHUNK_HEADER_BYTES) break;

            const length = header.readUInt32BE(0);
            const type = header.toString('ascii', 4, 8);
            const dataStart = offset + PNG_CHUNK_HEADER_BYTES;

            if (type === 'IEND') break;

            if (type === 'tEXt' && length > 0) {
                if (length > MAX_CARD_TEXT_CHUNK_BYTES) {
                    throw new Error(`PNG tEXt metadata is too large: ${length} bytes`);
                }
                const data = Buffer.alloc(length);
                await handle.read(data, 0, length, dataStart);
                const separator = data.indexOf(0);
                if (separator > 0) {
                    const keyword = data.toString('latin1', 0, separator).toLowerCase();
                    if (keyword === 'ccv3') ccv3 = data.toString('latin1', separator + 1);
                    else if (keyword === 'chara') chara = data.toString('latin1', separator + 1);
                }
                // ccv3 takes precedence over chara; once found we can stop early.
                if (ccv3) break;
            }

            // Advance past this chunk's data and its 4-byte CRC without reading the payload.
            offset = dataStart + length + 4;
        }

        const selected = ccv3 || chara;
        if (!selected) throw new Error('No character metadata found');
        return Buffer.from(selected, 'base64').toString('utf8');
    } finally {
        await handle.close();
    }
}

async function makeShallowCharacterFromCard(raw, avatarFileName, stat, directories) {
    const data = raw && typeof raw.data === 'object' && raw.data !== null ? raw.data : {};
    const extensions = data.extensions && typeof data.extensions === 'object' ? data.extensions : {};
    const name = String(data.name || raw?.name || path.basename(avatarFileName, path.extname(avatarFileName)) || '').trim();
    if (!name) return null;

    const tags = normalizeArray(data.tags).length ? normalizeArray(data.tags) : normalizeArray(raw?.tags);
    const fav = normalizeBoolean(raw?.fav ?? extensions.fav);
    const { chatSize, dateLastChat } = await calculateChatSize(directories.chats, avatarFileName);
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
    return { character: await makeShallowCharacterFromCard(raw, fileName, stat, directories), stat };
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

    const concurrency = resolveScanConcurrency(config);
    const characters = [];
    let processed = 0;
    let processedBytes = 0;
    let errors = 0;
    let lastEmitAt = 0;

    callProgress(onProgress, progressPatch('reading', startedAt, 0, null, { count: 0, totalCount: pngFiles.length, errors: 0 }));

    await mapWithConcurrency(pngFiles, concurrency, async (fileName) => {
        try {
            const { character, stat } = await processCharacterFileDirect(fileName, directories);
            if (character?.name) characters.push(character);
            processedBytes += stat?.size || 0;
        } catch (error) {
            errors++;
            console.warn(`[cocktail-plus] Could not build shallow character cache entry for ${fileName}:`, error instanceof Error ? error.message : error);
        } finally {
            processed++;
            const now = Date.now();
            if (now - lastEmitAt >= 100 || processed === pngFiles.length) {
                lastEmitAt = now;
                callProgress(onProgress, progressPatch('reading', startedAt, processedBytes, null, { count: processed, totalCount: pngFiles.length, errors }));
            }
        }
    });

    // Concurrency makes completion order non-deterministic; keep a stable, avatar-sorted list.
    characters.sort((a, b) => String(a?.avatar || '').localeCompare(String(b?.avatar || '')));

    callProgress(onProgress, progressPatch('transforming', startedAt, processedBytes, processedBytes, { count: characters.length, totalCount: pngFiles.length, errors, etaMs: 0 }));

    const bodyText = JSON.stringify(characters);
    const cachedBytes = Buffer.byteLength(bodyText, 'utf8');
    const durationMs = Date.now() - startedAt;

    console.info('[cocktail-plus] characters-all direct cache built', {
        total: pngFiles.length,
        count: characters.length,
        errors,
        durationMs,
        cachedBytes,
        concurrency,
    });

    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': JSON_CONTENT_TYPE },
        bodyText,
        durationMs,
        bytesReceived: processedBytes,
        totalBytes: processedBytes,
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
