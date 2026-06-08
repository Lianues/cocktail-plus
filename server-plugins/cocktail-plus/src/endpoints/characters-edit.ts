// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX } from '../constants.js';
import { fetchOriginal } from '../original-fetch.js';
import { makeRequestContext } from '../request-context.js';
import { sha256 } from '../utils.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

export const characterEditEndpoint = {
    key: 'character-edit',
    aliases: ['character-edit', '/api/characters/edit'],
    originalPath: '/api/characters/edit',
    fastPath: '/fast/characters-edit',
    configKey: 'cacheCharactersAll',
    method: 'POST',
};

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
                if (keyword === 'chara' || keyword === 'ccv3') chunks.push({ keyword, text: buffer.toString('latin1', separator + 1, dataEnd) });
            }
        }
        if (type === 'IEND') break;
        offset = nextOffset;
    }
    return chunks;
}

async function readCharacterRawJson(directories, avatar) {
    const filePath = path.join(directories.characters, path.basename(avatar));
    const buffer = await fs.promises.readFile(filePath);
    const chunks = extractPngTextChunks(buffer);
    const selected = chunks.find(c => c.keyword === 'ccv3') || chunks.find(c => c.keyword === 'chara');
    if (!selected) throw new Error('No character metadata found');
    return Buffer.from(selected.text, 'base64').toString('utf8');
}

function asTagsString(value) {
    if (Array.isArray(value)) return value.join(', ');
    return typeof value === 'string' ? value : '';
}

function deriveEditFields(raw, meta = {}) {
    const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
    const extensions = data.extensions && typeof data.extensions === 'object' ? data.extensions : {};
    const depth = extensions.depth_prompt && typeof extensions.depth_prompt === 'object' ? extensions.depth_prompt : {};
    return {
        avatar_url: meta.avatar_url || raw?.avatar || '',
        ch_name: data.name ?? raw?.name ?? '',
        description: data.description ?? raw?.description ?? '',
        personality: data.personality ?? raw?.personality ?? '',
        scenario: data.scenario ?? raw?.scenario ?? '',
        first_mes: data.first_mes ?? raw?.first_mes ?? '',
        mes_example: data.mes_example ?? raw?.mes_example ?? '',
        creator_notes: data.creator_notes ?? raw?.creatorcomment ?? '',
        system_prompt: data.system_prompt ?? '',
        post_history_instructions: data.post_history_instructions ?? '',
        tags: asTagsString(data.tags ?? raw?.tags),
        creator: data.creator ?? raw?.creator ?? '',
        character_version: data.character_version ?? raw?.character_version ?? '',
        alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.slice() : [],
        talkativeness: String(extensions.talkativeness ?? raw?.talkativeness ?? 0.5),
        fav: String(Boolean(extensions.fav ?? raw?.fav)),
        world: extensions.world ?? '',
        depth_prompt_prompt: depth.prompt ?? raw?.depth_prompt_prompt ?? '',
        depth_prompt_depth: String(depth.depth ?? raw?.depth_prompt_depth ?? 4),
        depth_prompt_role: depth.role ?? raw?.depth_prompt_role ?? 'system',
        chat: meta.chat ?? raw?.chat ?? '',
        create_date: meta.create_date ?? raw?.create_date ?? '',
        extensions: meta.extensions ?? '',
    };
}

function applyStringPatch(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    if (patch.type === 'set') return String(patch.value ?? '');
    if (patch.type === 'splice') {
        const start = Math.max(0, Number(patch.start) || 0);
        const deleteCount = Math.max(0, Number(patch.deleteCount) || 0);
        const insert = String(patch.insert ?? '');
        const source = String(base ?? '');
        return source.slice(0, start) + insert + source.slice(start + deleteCount);
    }
    return base;
}

function applyPayload(baseFields, payload) {
    const out = { ...baseFields };
    const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
    for (const [key, value] of Object.entries(fields)) out[key] = value;
    const patches = payload.patches && typeof payload.patches === 'object' ? payload.patches : {};
    for (const [key, patch] of Object.entries(patches)) out[key] = applyStringPatch(out[key], patch);
    return out;
}

export async function handleCharacterEditFast(req, res) {
    try {
        const body = req.body || {};
        const avatar = String(body.avatar_url || '').trim();
        if (!avatar) return res.sendStatus(400);

        const rawJson = await readCharacterRawJson(req.user?.directories || {}, avatar);
        const currentHash = sha256(rawJson);
        if (body.baseHash && body.baseHash !== currentHash) {
            res.setHeader(HEADER_PREFIX, 'characters-edit-fast');
            return res.status(409).type(JSON_CONTENT_TYPE).send(JSON.stringify({ ok: false, stale: true }));
        }

        const raw = JSON.parse(rawJson || '{}');
        const baseFields = deriveEditFields(raw, body.meta || { avatar_url: avatar });
        const nextBody = applyPayload(baseFields, body);
        nextBody.avatar_url = avatar;
        nextBody.json_data = rawJson;

        const ctx = makeRequestContext(req, { bodyOverride: nextBody });
        const result = await fetchOriginal(ctx, characterEditEndpoint);
        res.setHeader(HEADER_PREFIX, 'characters-edit-fast');
        res.setHeader(`${HEADER_PREFIX}-characters-edit-mode`, 'patch');
        res.setHeader('content-type', result.headers?.['content-type'] || 'text/plain; charset=utf-8');
        return res.status(result.status || 200).send(result.bodyText ?? '');
    } catch (error) {
        res.setHeader(HEADER_PREFIX, 'characters-edit-fast');
        res.setHeader('content-type', JSON_CONTENT_TYPE);
        return res.status(500).send(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
}
