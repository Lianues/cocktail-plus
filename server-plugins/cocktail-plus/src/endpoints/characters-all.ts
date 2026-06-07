// @ts-nocheck
import { HEADER_PREFIX } from '../constants.js';
import { getPathValue, scanDirectoryShallow, signatureFromRecords } from '../utils.js';

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
    if (!config.asyncCharactersAllOnMiss) return null;
    return {
        state: 'ASYNC-MISS',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json; charset=utf-8' },
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
    transformBodyForCache,
    makeAsyncMiss,
};
