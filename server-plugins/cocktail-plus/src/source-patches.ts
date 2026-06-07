// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { VERSION } from './constants.js';
import { getServerRoot } from './utils.js';

const CHAT_INFO_ENOENT_SENTINEL = 'Chat file no longer exists, skipping';
const CHAT_STREAM_ENOENT_SENTINEL = 'Chat file disappeared while reading, skipping';

const ORIGINAL_STAT_LINE = `        const stats = await fs.promises.stat(pathToFile);`;
const PATCHED_STAT_BLOCK = `        let stats;
        try {
            stats = await fs.promises.stat(pathToFile);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                console.debug(\`Chat file no longer exists, skipping: \${pathToFile}\`);
                res({});
                return;
            }
            console.warn('Failed to stat chat file:', pathToFile, error);
            res({});
            return;
        }`;

const ORIGINAL_STREAM_BLOCK = `        const fileStream = fs.createReadStream(pathToFile);
        const rl = readline.createInterface({`;
const PATCHED_STREAM_BLOCK = `        const fileStream = fs.createReadStream(pathToFile);
        fileStream.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                console.debug(\`Chat file disappeared while reading, skipping: \${pathToFile}\`);
            } else {
                console.warn('Failed to read chat file:', pathToFile, error);
            }
            res({});
        });
        const rl = readline.createInterface({`;

function getChatsEndpointPath() {
    return path.join(getServerRoot(), 'src', 'endpoints', 'chats.js');
}

function readChatsSource(filePath) {
    if (!fs.existsSync(filePath)) return { exists: false, text: '' };
    return { exists: true, text: fs.readFileSync(filePath, 'utf8') };
}

function writeUtf8NoBom(filePath, text) {
    fs.writeFileSync(filePath, text, { encoding: 'utf8' });
}

function replaceOnce(text, search, replacement, label) {
    if (!text.includes(search)) throw new Error(`${label} pattern not found`);
    return text.replace(search, replacement);
}

function removeStatPatch(text) {
    if (text.includes(PATCHED_STAT_BLOCK)) {
        return text.replace(PATCHED_STAT_BLOCK, ORIGINAL_STAT_LINE);
    }
    const statPatchRegex = /        let stats;\r?\n        try \{\r?\n            stats = await fs\.promises\.stat\(pathToFile\);[\s\S]*?\r?\n        \}\r?\n        const hasMatcher = \(typeof matcher === 'function'\);/;
    if (!statPatchRegex.test(text)) return text;
    return text.replace(statPatchRegex, `${ORIGINAL_STAT_LINE}\n        const hasMatcher = (typeof matcher === 'function');`);
}

function removeStreamPatch(text) {
    if (text.includes(PATCHED_STREAM_BLOCK)) {
        return text.replace(PATCHED_STREAM_BLOCK, ORIGINAL_STREAM_BLOCK);
    }
    const streamPatchRegex = /        const fileStream = fs\.createReadStream\(pathToFile\);\r?\n        fileStream\.on\('error', \(error\) => \{[\s\S]*?\r?\n        \}\);\r?\n        const rl = readline\.createInterface\(\{/;
    if (!streamPatchRegex.test(text)) return text;
    return text.replace(streamPatchRegex, ORIGINAL_STREAM_BLOCK);
}

export function getChatsEnoentPatchStatus() {
    const filePath = getChatsEndpointPath();
    let text = '';
    let exists = false;
    try {
        const source = readChatsSource(filePath);
        exists = source.exists;
        text = source.text;
    } catch (error) {
        return { ok: false, filePath, exists, installed: false, error: error instanceof Error ? error.message : String(error) };
    }
    return {
        ok: true,
        name: 'chats-enoent-guard',
        version: VERSION,
        filePath,
        exists,
        installed: !!text && text.includes(CHAT_INFO_ENOENT_SENTINEL),
        streamGuardInstalled: !!text && text.includes(CHAT_STREAM_ENOENT_SENTINEL),
        reversible: true,
        backupRequired: false,
    };
}

export function applyChatsEnoentPatch() {
    const status = getChatsEnoentPatchStatus();
    if (!status.ok) return { ...status, changed: false, action: 'apply' };
    if (!status.exists) return { ...status, ok: false, changed: false, action: 'apply', error: 'chats.js not found' };

    const filePath = status.filePath;
    let text = fs.readFileSync(filePath, 'utf8');
    const original = text;

    if (!text.includes(CHAT_INFO_ENOENT_SENTINEL)) {
        text = replaceOnce(text, ORIGINAL_STAT_LINE, PATCHED_STAT_BLOCK, 'stat');
    }

    if (!text.includes(CHAT_STREAM_ENOENT_SENTINEL)) {
        text = replaceOnce(text, ORIGINAL_STREAM_BLOCK, PATCHED_STREAM_BLOCK, 'stream');
    }

    if (text === original) {
        return { ...getChatsEnoentPatchStatus(), changed: false, action: 'apply', restartRequired: false };
    }

    writeUtf8NoBom(filePath, text);
    return { ...getChatsEnoentPatchStatus(), changed: true, action: 'apply', restartRequired: true };
}

export function revertChatsEnoentPatch() {
    const status = getChatsEnoentPatchStatus();
    if (!status.ok) return { ...status, changed: false, action: 'revert' };
    if (!status.exists) return { ...status, ok: false, changed: false, action: 'revert', error: 'chats.js not found' };

    const filePath = status.filePath;
    let text = fs.readFileSync(filePath, 'utf8');
    const original = text;

    text = removeStatPatch(text);
    text = removeStreamPatch(text);

    if (text === original) {
        return { ...getChatsEnoentPatchStatus(), changed: false, action: 'revert', restartRequired: false };
    }

    writeUtf8NoBom(filePath, text);
    return { ...getChatsEnoentPatchStatus(), changed: true, action: 'revert', restartRequired: true };
}

export function autoApplySourcePatches() {
    const results = [];
    try {
        results.push(applyChatsEnoentPatch());
    } catch (error) {
        results.push({ ok: false, name: 'chats-enoent-guard', action: 'apply', error: error instanceof Error ? error.message : String(error) });
    }
    return results;
}
