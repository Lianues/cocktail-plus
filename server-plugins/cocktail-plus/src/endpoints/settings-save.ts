// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX, VERSION } from '../constants.js';
import { config } from '../config.js';
import { fetchOriginal } from '../original-fetch.js';
import { makeRequestContext } from '../request-context.js';
import { sha256, stableStringify } from '../utils.js';

const SETTINGS_FILE = 'settings.json';
export const SETTINGS_HASH_ALGORITHM = 'cp-stable-sha256-v1';

export const settingsSaveEndpoint = {
    key: 'settings-save',
    aliases: ['settings-save', '/api/settings/save'],
    originalPath: '/api/settings/save',
    fastPath: '/fast/settings-save',
    configKey: 'optimizeSettingsSave',
    method: 'POST',
};

export const settingsSaveStats = {
    requests: 0,
    noops: 0,
    patches: 0,
    fulls: 0,
    conflicts: 0,
    errors: 0,
    originalBytes: 0,
    optimizedBytes: 0,
    savedBytes: 0,
    lastMode: null,
    lastState: null,
    lastError: null,
    lastAt: null,
};

function nowIso() {
    return new Date().toISOString();
}

export function hashSettings(value) {
    return sha256(stableStringify(value));
}

function settingsPathFromRequest(req) {
    const root = req?.user?.directories?.root;
    if (!root) throw new Error('User settings root directory is unavailable');
    return path.join(root, SETTINGS_FILE);
}

function readCurrentSettings(req) {
    const settingsPath = settingsPathFromRequest(req);
    const text = fs.readFileSync(settingsPath, 'utf8');
    return { settingsPath, text, settings: JSON.parse(text) };
}

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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
    if (parent && typeof parent === 'object') {
        delete parent[patchPath[patchPath.length - 1]];
    }
}

function applyPatch(base, ops) {
    if (!Array.isArray(ops)) throw new Error('Patch ops must be an array');
    if (ops.length > config.settingsSaveMaxPatchOperations) {
        throw new Error(`Too many patch operations: ${ops.length}`);
    }

    const next = cloneJson(base) || {};
    for (const op of ops) {
        const kind = String(op?.op || '').toLowerCase();
        const patchPath = normalizePatchPath(op?.path);
        if (kind === 'set') {
            setAtPath(next, patchPath, op.value);
        } else if (kind === 'delete') {
            deleteAtPath(next, patchPath);
        } else {
            throw new Error(`Unsupported patch op: ${kind}`);
        }
    }
    return next;
}

function noteTraffic(body, fallbackMode = 'unknown') {
    const originalBytes = Math.max(0, Number(body?.originalBytes) || 0);
    const optimizedBytes = Math.max(0, Number(body?.optimizedBytes) || Buffer.byteLength(JSON.stringify(body || {}), 'utf8'));
    settingsSaveStats.originalBytes += originalBytes;
    settingsSaveStats.optimizedBytes += optimizedBytes;
    settingsSaveStats.savedBytes += Math.max(0, originalBytes - optimizedBytes);
    settingsSaveStats.lastMode = body?.mode || fallbackMode;
    settingsSaveStats.lastAt = nowIso();
}

function sendJson(res, status, data, state) {
    settingsSaveStats.lastState = state;
    res.status(status);
    res.setHeader(HEADER_PREFIX, VERSION);
    res.setHeader(`${HEADER_PREFIX}-settings-save-state`, state);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(data));
}

function sendText(res, status, bodyText, state, contentType = 'application/json; charset=utf-8') {
    settingsSaveStats.lastState = state;
    res.status(status || 200);
    res.setHeader(HEADER_PREFIX, VERSION);
    res.setHeader(`${HEADER_PREFIX}-settings-save-state`, state);
    res.setHeader('content-type', contentType);
    res.send(bodyText ?? '');
}

function conflict(res, data) {
    settingsSaveStats.conflicts++;
    return sendJson(res, 409, { ok: false, fallback: true, ...data }, 'CONFLICT');
}

async function callOriginalSettingsSave(req, nextSettings) {
    const ctx = makeRequestContext(req, { bodyOverride: nextSettings });
    return await fetchOriginal(ctx, settingsSaveEndpoint);
}

export function getSettingsSaveStatus() {
    return {
        endpointKey: settingsSaveEndpoint.key,
        enabled: !!config.enabled && !!config.optimizeSettingsSave,
        patchEnabled: !!config.settingsSavePatchEnabled,
        noopEnabled: !!config.settingsSaveNoopEnabled,
        stats: { ...settingsSaveStats },
    };
}

export async function handleSettingsSaveFast(req, res) {
    settingsSaveStats.requests++;
    const body = req.body || {};
    settingsSaveStats.lastMode = body?.mode || null;
    settingsSaveStats.lastAt = nowIso();

    if (!config.enabled || !config.optimizeSettingsSave) {
        return sendJson(res, 503, { ok: false, fallback: true, error: 'settings-save optimization disabled' }, 'DISABLED');
    }

    try {
        const mode = String(body.mode || '').toLowerCase();
        const { settings: currentSettings } = readCurrentSettings(req);
        const currentHash = hashSettings(currentSettings);

        if (body.hashAlgorithm && body.hashAlgorithm !== SETTINGS_HASH_ALGORITHM) {
            return sendJson(res, 400, { ok: false, fallback: true, error: 'unsupported hash algorithm' }, 'BAD-HASH-ALGORITHM');
        }

        if (mode === 'noop') {
            if (!config.settingsSaveNoopEnabled) {
                return sendJson(res, 503, { ok: false, fallback: true, error: 'settings-save noop optimization disabled' }, 'NOOP-DISABLED');
            }
            settingsSaveStats.noops++;
            noteTraffic(body);
            // Do not write. If another tab has newer settings, overwriting them with an unchanged old payload would be worse.
            return sendJson(res, 200, {
                ok: true,
                result: 'ok',
                optimized: true,
                mode: 'noop',
                state: currentHash === body.baseHash || currentHash === body.nextHash ? 'NOOP' : 'NOOP-STALE',
                currentHash,
            }, currentHash === body.baseHash || currentHash === body.nextHash ? 'NOOP' : 'NOOP-STALE');
        }

        if (mode === 'patch') {
            if (!config.settingsSavePatchEnabled) {
                return sendJson(res, 503, { ok: false, fallback: true, error: 'settings-save patch optimization disabled' }, 'PATCH-DISABLED');
            }
            if (!body.baseHash || !body.nextHash) {
                return sendJson(res, 400, { ok: false, fallback: true, error: 'baseHash and nextHash are required' }, 'BAD-PATCH');
            }
            if (currentHash !== body.baseHash) {
                return conflict(res, { error: 'base hash mismatch', currentHash, baseHash: body.baseHash });
            }

            const nextSettings = applyPatch(currentSettings, body.ops || []);
            const appliedHash = hashSettings(nextSettings);
            if (appliedHash !== body.nextHash) {
                return sendJson(res, 400, { ok: false, fallback: true, error: 'patch hash mismatch', appliedHash, nextHash: body.nextHash }, 'PATCH-HASH-MISMATCH');
            }

            const result = await callOriginalSettingsSave(req, nextSettings);
            if (result.ok) {
                settingsSaveStats.patches++;
                noteTraffic(body);
            }
            const state = result.ok ? 'PATCH' : 'PATCH-ORIGINAL-ERROR';
            return sendText(res, result.status, result.bodyText, state, result.headers?.['content-type']);
        }

        if (mode === 'full') {
            const nextSettings = body.settings;
            if (!nextSettings || typeof nextSettings !== 'object' || Array.isArray(nextSettings)) {
                return sendJson(res, 400, { ok: false, fallback: true, error: 'settings object is required for full mode' }, 'BAD-FULL');
            }
            if (body.nextHash && hashSettings(nextSettings) !== body.nextHash) {
                return sendJson(res, 400, { ok: false, fallback: true, error: 'full settings hash mismatch' }, 'FULL-HASH-MISMATCH');
            }
            const result = await callOriginalSettingsSave(req, nextSettings);
            if (result.ok) {
                settingsSaveStats.fulls++;
                noteTraffic(body, 'full');
            }
            const state = result.ok ? 'FULL' : 'FULL-ORIGINAL-ERROR';
            return sendText(res, result.status, result.bodyText, state, result.headers?.['content-type']);
        }

        return sendJson(res, 400, { ok: false, fallback: true, error: `unsupported mode: ${mode || '(empty)'}` }, 'BAD-MODE');
    } catch (error) {
        settingsSaveStats.errors++;
        settingsSaveStats.lastError = error instanceof Error ? error.message : String(error);
        settingsSaveStats.lastAt = nowIso();
        return sendJson(res, 500, { ok: false, fallback: true, error: settingsSaveStats.lastError }, 'ERROR');
    }
}
