// @ts-nocheck
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PLUGIN_ID } from './constants.js';
import { getServerRoot } from './utils.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const FRONTEND_REPOS = Object.freeze([
    'https://github.com/Lianues/cocktail-plus.git',
    'https://gitee.com/lianues/cocktail-plus.git',
]);
// Keep .git in frontend installs updated by this endpoint. SillyTavern's built-in
// extension UI uses that metadata to show branch/commit and to detect updates.
const SKIP_NAMES = new Set(['node_modules', '.deploy-backups']);

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function sendJson(res, status, data) {
    res.status(status).type(JSON_CONTENT_TYPE).send(JSON.stringify(data));
}

function getFrontendExtensionPath(req, isGlobal) {
    const base = isGlobal
        ? path.join(getServerRoot(), 'public', 'scripts', 'extensions', 'third-party')
        : req.user?.directories?.extensions;
    if (!base) throw new Error('User extensions directory is not available');
    return path.join(base, PLUGIN_ID);
}

function readVersionFromManifest(dir) {
    try {
        const raw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
        const version = String(JSON.parse(raw)?.version || '').trim();
        return version || '';
    } catch {
        return '';
    }
}

function assertFrontendSource(dir) {
    const required = [
        'manifest.json',
        path.join('dist', 'index.js'),
        path.join('server-plugins', PLUGIN_ID, 'index.mjs'),
    ];
    for (const rel of required) {
        if (!fs.existsSync(path.join(dir, rel))) throw new Error(`Downloaded repository is missing ${rel}`);
    }
}

function runGit(args, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
        childProcess.execFile('git', args, { cwd, windowsHide: true, timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
            if (error) {
                const message = String(stderr || stdout || error.message || error).trim();
                reject(new Error(message || `git ${args.join(' ')} failed`));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

async function cloneFrontendSource(tempRoot) {
    let lastError = null;
    for (const repo of FRONTEND_REPOS) {
        const cloneDir = path.join(tempRoot, 'repo');
        try {
            fs.rmSync(cloneDir, { recursive: true, force: true });
            await runGit(['clone', '--depth', '1', repo, cloneDir]);
            assertFrontendSource(cloneDir);
            return { sourceDir: cloneDir, repo };
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`Failed to download cocktail-plus from GitHub/Gitee${lastError ? `: ${lastError.message}` : ''}`);
}

function copyTree(source, destination) {
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
        fs.mkdirSync(destination, { recursive: true });
        for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
            if (SKIP_NAMES.has(entry.name)) continue;
            copyTree(path.join(source, entry.name), path.join(destination, entry.name));
        }
        return;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
}

function replaceDirectory(source, target) {
    const parent = path.dirname(target);
    fs.mkdirSync(parent, { recursive: true });
    const backupRoot = path.join(parent, '.cocktail-plus-backups');
    let backupPath = '';

    if (fs.existsSync(target)) {
        fs.mkdirSync(backupRoot, { recursive: true });
        backupPath = path.join(backupRoot, `${PLUGIN_ID}-frontend-${stamp()}`);
        fs.renameSync(target, backupPath);
    }

    try {
        copyTree(source, target);
    } catch (error) {
        fs.rmSync(target, { recursive: true, force: true });
        if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(target)) {
            fs.renameSync(backupPath, target);
        }
        throw error;
    }

    return backupPath;
}

export async function handleFrontendUpdate(req, res) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cocktail-plus-frontend-update-'));
    try {
        const isGlobal = !!req.body?.global;
        const target = getFrontendExtensionPath(req, isGlobal);
        const beforeVersion = readVersionFromManifest(target);
        const { sourceDir, repo } = await cloneFrontendSource(tempRoot);
        const remoteVersion = readVersionFromManifest(sourceDir);
        const backupPath = replaceDirectory(sourceDir, target);

        return sendJson(res, 200, {
            ok: true,
            updated: true,
            global: isGlobal,
            repo,
            extensionPath: target,
            backupPath,
            previousVersion: beforeVersion || null,
            version: remoteVersion || null,
        });
    } catch (error) {
        return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
        try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
    }
}
