// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX, VERSION } from '../constants.js';
import { config } from '../config.js';
import { makeRequestContext } from '../request-context.js';
import { sha256, stableStringify } from '../utils.js';

const SETTINGS_FILE = 'settings.json';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

export const settingsGetEndpoint = {
    key: 'settings-get',
    aliases: ['settings-get', '/api/settings/get'],
    originalPath: '/api/settings/get',
    fastPath: '/fast/settings-get',
    configKey: 'optimizeSettingsGet',
    method: 'POST',
};

export const settingsGetStats = {
    requests: 0,
    hits: 0,
    misses: 0,
    bypasses: 0,
    errors: 0,
    responseBytes: 0,
    lastState: null,
    lastError: null,
    lastAt: null,
    lastBuildMs: 0,
};

const settingsGetCache = new Map();

function nowIso() {
    return new Date().toISOString();
}

function settingsPathFromRequest(req) {
    const root = req?.user?.directories?.root;
    if (!root) throw new Error('User settings root directory is unavailable');
    return path.join(root, SETTINGS_FILE);
}

async function listFiles(directoryPath, fileExtension = '.json') {
    try {
        const files = await fs.promises.readdir(directoryPath);
        return files
            .filter(name => path.extname(name).toLowerCase() === fileExtension)
            .sort((a, b) => a.localeCompare(b));
    } catch {
        return [];
    }
}

async function safeStatRecordAsync(filePath, label = filePath) {
    try {
        const stat = await fs.promises.stat(filePath);
        return { label, exists: true, file: stat.isFile(), directory: stat.isDirectory(), size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
    } catch {
        return { label, exists: false };
    }
}

async function safeDirectoryRecords(dirPath, label, extensions = null) {
    try {
        const names = (await fs.promises.readdir(dirPath)).sort((a, b) => a.localeCompare(b));
        const filtered = names.filter((name) => {
            if (name.startsWith('.')) return false;
            const ext = path.extname(name).toLowerCase();
            return !extensions || extensions.includes(ext);
        });
        return await Promise.all(filtered.map(name => safeStatRecordAsync(path.join(dirPath, name), `${label}/${name}`)));
    } catch {
        return [{ label, exists: false }];
    }
}

async function getSettingsGetSignature(req) {
    const directories = req.user?.directories || {};
    const groups = await Promise.all([
        safeStatRecordAsync(settingsPathFromRequest(req), 'settings.json').then(record => [record]),
        safeDirectoryRecords(directories.koboldAI_Settings, 'koboldai-settings', ['.json']),
        safeDirectoryRecords(directories.novelAI_Settings, 'novelai-settings', ['.json']),
        safeDirectoryRecords(directories.openAI_Settings, 'openai-settings', ['.json']),
        safeDirectoryRecords(directories.textGen_Settings, 'textgen-settings', ['.json']),
        safeDirectoryRecords(directories.worlds, 'worlds', ['.json']),
        safeDirectoryRecords(directories.themes, 'themes', ['.json']),
        safeDirectoryRecords(directories.movingUI, 'moving-ui', ['.json']),
        safeDirectoryRecords(directories.quickreplies, 'quick-replies', ['.json']),
        safeDirectoryRecords(directories.instruct, 'instruct', ['.json']),
        safeDirectoryRecords(directories.context, 'context', ['.json']),
        safeDirectoryRecords(directories.sysprompt, 'sysprompt', ['.json']),
        safeDirectoryRecords(directories.reasoning, 'reasoning', ['.json']),
    ]);
    const records = groups.flat();
    return sha256(stableStringify(records));
}

async function readPresetsFromDirectory(directoryPath, options = {}) {
    const {
        removeFileExtension = false,
        fileExtension = '.json',
    } = options;

    const files = await listFiles(directoryPath, fileExtension);
    const rows = await Promise.all(files.map(async (fileName) => {
        try {
            const filePath = path.join(directoryPath, fileName);
            const text = await fs.promises.readFile(filePath, 'utf8');
            if (fileExtension === '.json') JSON.parse(text);
            return {
                name: removeFileExtension ? fileName.replace(/\.[^/.]+$/, '') : fileName,
                text,
            };
        } catch (error) {
            console.warn(`[cocktail-plus] settings/get preset skipped: ${fileName}`, error?.message || error);
            return null;
        }
    }));

    const valid = rows.filter(Boolean);
    return {
        fileContents: valid.map(row => row.text),
        fileNames: valid.map(row => row.name),
    };
}

async function readAndParseFromDirectory(directoryPath, fileExtension = '.json') {
    const files = await listFiles(directoryPath, fileExtension);
    const rows = await Promise.all(files.map(async (fileName) => {
        try {
            const filePath = path.join(directoryPath, fileName);
            const text = await fs.promises.readFile(filePath, 'utf8');
            return fileExtension === '.json' ? JSON.parse(text) : text;
        } catch {
            return null;
        }
    }));
    return rows.filter(value => value !== null);
}

async function readWorldNames(directoryPath) {
    const files = await listFiles(directoryPath, '.json');
    return files.map(item => path.parse(item).name);
}

async function buildSettingsGetPayload(req) {
    const directories = req.user?.directories || {};
    const startedAt = Date.now();

    const [
        settings,
        kobold,
        novelai,
        openai,
        textgen,
        world_names,
        themes,
        movingUIPresets,
        quickReplyPresets,
        instruct,
        context,
        sysprompt,
        reasoning,
    ] = await Promise.all([
        fs.promises.readFile(settingsPathFromRequest(req), 'utf8'),
        readPresetsFromDirectory(directories.koboldAI_Settings, { removeFileExtension: true }),
        readPresetsFromDirectory(directories.novelAI_Settings, { removeFileExtension: true }),
        readPresetsFromDirectory(directories.openAI_Settings, { removeFileExtension: true }),
        readPresetsFromDirectory(directories.textGen_Settings, { removeFileExtension: true }),
        readWorldNames(directories.worlds),
        readAndParseFromDirectory(directories.themes),
        readAndParseFromDirectory(directories.movingUI),
        readAndParseFromDirectory(directories.quickreplies),
        readAndParseFromDirectory(directories.instruct),
        readAndParseFromDirectory(directories.context),
        readAndParseFromDirectory(directories.sysprompt),
        readAndParseFromDirectory(directories.reasoning),
    ]);

    const payload = {
        settings,
        koboldai_settings: kobold.fileContents,
        koboldai_setting_names: kobold.fileNames,
        world_names,
        novelai_settings: novelai.fileContents,
        novelai_setting_names: novelai.fileNames,
        openai_settings: openai.fileContents,
        openai_setting_names: openai.fileNames,
        textgenerationwebui_presets: textgen.fileContents,
        textgenerationwebui_preset_names: textgen.fileNames,
        themes,
        movingUIPresets,
        quickReplyPresets,
        instruct,
        context,
        sysprompt,
        reasoning,
        enable_extensions: true,
        enable_extensions_auto_update: true,
        enable_accounts: false,
        request_compression: {
            enabled: false,
            minPayloadSize: 262144,
            maxPayloadSize: 8388608,
            timeout: 4000,
        },
    };

    const bodyText = JSON.stringify(payload);
    const responseBytes = Buffer.byteLength(bodyText, 'utf8');
    return {
        bodyText,
        responseBytes,
        buildMs: Date.now() - startedAt,
    };
}

function getCacheKey(req) {
    const ctx = makeRequestContext(req, { bodyOverride: {} });
    return ctx.userKey;
}

function noteTraffic(result) {
    settingsGetStats.responseBytes += result.responseBytes || 0;
    settingsGetStats.lastBuildMs = result.buildMs || 0;
    settingsGetStats.lastAt = nowIso();
}

function sendBody(res, status, bodyText, state, result = null) {
    settingsGetStats.lastState = state;
    res.status(status || 200);
    res.setHeader(HEADER_PREFIX, VERSION);
    res.setHeader(`${HEADER_PREFIX}-settings-get-state`, state);
    if (result) {
        res.setHeader(`${HEADER_PREFIX}-settings-get-build-ms`, String(result.buildMs || 0));
        res.setHeader(`${HEADER_PREFIX}-settings-get-bytes`, String(result.responseBytes || 0));
    }
    res.setHeader('content-type', JSON_CONTENT_TYPE);
    res.send(bodyText ?? '{}');
}

export function getSettingsGetStatus() {
    return {
        endpointKey: settingsGetEndpoint.key,
        enabled: !!config.enabled && !!config.optimizeSettingsGet,
        cacheEnabled: !!config.cacheSettingsGet,
        stats: { ...settingsGetStats },
    };
}

export function clearSettingsGetCache() {
    settingsGetCache.clear();
}

export async function handleSettingsGetFast(req, res) {
    settingsGetStats.requests++;
    settingsGetStats.lastAt = nowIso();

    if (!config.enabled || !config.optimizeSettingsGet) {
        settingsGetStats.bypasses++;
        return sendBody(res, 503, JSON.stringify({ ok: false, fallback: true, error: 'settings-get optimization disabled' }), 'DISABLED');
    }

    try {
        const cacheKey = getCacheKey(req);
        const cached = settingsGetCache.get(cacheKey);
        if (config.cacheSettingsGet && cached) {
            const signature = await getSettingsGetSignature(req);
            if (cached.signature === signature) {
                settingsGetStats.hits++;
                cached.hitCount = Number(cached.hitCount || 0) + 1;
                cached.lastHitAt = Date.now();
                return sendBody(res, 200, cached.bodyText, 'HIT', cached);
            }

            settingsGetStats.misses++;
            const result = await buildSettingsGetPayload(req);
            result.signature = signature;
            result.createdAt = Date.now();
            result.hitCount = 0;
            settingsGetCache.set(cacheKey, result);
            noteTraffic(result);
            return sendBody(res, 200, result.bodyText, 'MISS', result);
        }

        settingsGetStats.misses++;
        const [signature, result] = await Promise.all([
            getSettingsGetSignature(req),
            buildSettingsGetPayload(req),
        ]);
        result.signature = signature;
        result.createdAt = Date.now();
        result.hitCount = 0;
        if (config.cacheSettingsGet) settingsGetCache.set(cacheKey, result);
        noteTraffic(result);
        return sendBody(res, 200, result.bodyText, 'MISS', result);
    } catch (error) {
        settingsGetStats.errors++;
        settingsGetStats.lastError = error instanceof Error ? error.message : String(error);
        settingsGetStats.lastAt = nowIso();
        return sendBody(res, 500, JSON.stringify({ ok: false, fallback: true, error: settingsGetStats.lastError }), 'ERROR');
    }
}
