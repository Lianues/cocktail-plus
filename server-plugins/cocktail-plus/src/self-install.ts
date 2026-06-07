// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_DIR, PLUGIN_ID, SERVER_ROOT } from './constants.js';
import { getDataRoot } from './utils.js';

function safeStat(filePath) {
    try { return fs.statSync(filePath); } catch { return null; }
}

function isDirectoryWithIndex(filePath) {
    const stat = safeStat(filePath);
    return !!stat?.isDirectory?.() && fs.existsSync(path.join(filePath, 'index.mjs'));
}

function samePath(a, b) {
    try { return path.resolve(a) === path.resolve(b); } catch { return String(a) === String(b); }
}

function uniquePush(list, value) {
    if (!value) return;
    const full = path.resolve(value);
    if (!list.some(item => samePath(item, full))) list.push(full);
}

function getCandidateFrontendBackendPaths() {
    const candidates = [];
    uniquePush(candidates, path.join(SERVER_ROOT, 'public', 'scripts', 'extensions', 'third-party', PLUGIN_ID, 'server-plugins', PLUGIN_ID));

    const dataRoot = getDataRoot();
    uniquePush(candidates, path.join(dataRoot, 'default-user', 'extensions', PLUGIN_ID, 'server-plugins', PLUGIN_ID));

    try {
        if (fs.existsSync(dataRoot) && fs.statSync(dataRoot).isDirectory()) {
            for (const entry of fs.readdirSync(dataRoot, { withFileTypes: true })) {
                if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
                uniquePush(candidates, path.join(dataRoot, entry.name, 'extensions', PLUGIN_ID, 'server-plugins', PLUGIN_ID));
            }
        }
    } catch {
        // ignore
    }

    return candidates;
}

export function getSelfInstallStatus() {
    const candidates = getCandidateFrontendBackendPaths();
    const sourcePath = candidates.find(isDirectoryWithIndex) || null;
    return {
        ok: true,
        pluginDir: PLUGIN_DIR,
        serverRoot: SERVER_ROOT,
        dataRoot: getDataRoot(),
        sourcePath,
        candidates: candidates.map(candidate => ({
            path: candidate,
            exists: !!safeStat(candidate),
            usable: isDirectoryWithIndex(candidate),
        })),
    };
}

function copyRecursive(source, target) {
    fs.cpSync(source, target, {
        recursive: true,
        force: true,
        errorOnExist: false,
        dereference: false,
        filter: (src) => {
            const base = path.basename(src);
            // Build/deploy backups and dependencies from a frontend extension should never be copied into the server plugin.
            if (base === 'node_modules' || base === '.git' || base === '.deploy-backups') return false;
            return true;
        },
    });
}

function preserveExistingRuntimeFiles(targetDir, tempDir) {
    const preserveItems = ['config.json', 'cache'];
    for (const item of preserveItems) {
        const src = path.join(targetDir, item);
        if (!fs.existsSync(src)) continue;
        const dst = path.join(tempDir, item);
        try {
            fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
        } catch {
            // ignore preserve failures; config/cache are conveniences, not required for code update.
        }
    }
}

export function installBackendFromFrontend(options = {}) {
    const noBackup = !!options.noBackup;
    const status = getSelfInstallStatus();
    const sourcePath = status.sourcePath;
    if (!sourcePath) {
        return { ok: false, error: 'Frontend bundled backend plugin not found.', status };
    }

    if (samePath(sourcePath, PLUGIN_DIR)) {
        return { ok: true, changed: false, reason: 'source-is-current-plugin-dir', sourcePath, targetPath: PLUGIN_DIR, status };
    }

    const pluginsRoot = path.dirname(PLUGIN_DIR);
    fs.mkdirSync(pluginsRoot, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempDir = path.join(pluginsRoot, `.${PLUGIN_ID}-update-tmp-${stamp}`);
    const backupRoot = path.join(pluginsRoot, '.cocktail-plus-backups');
    const backupDir = path.join(backupRoot, `${PLUGIN_ID}-${stamp}`);

    try {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        copyRecursive(sourcePath, tempDir);
        preserveExistingRuntimeFiles(PLUGIN_DIR, tempDir);

        let backup = null;
        if (fs.existsSync(PLUGIN_DIR)) {
            if (noBackup) {
                fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
            } else {
                fs.mkdirSync(backupRoot, { recursive: true });
                fs.renameSync(PLUGIN_DIR, backupDir);
                backup = backupDir;
            }
        }

        fs.renameSync(tempDir, PLUGIN_DIR);
        return {
            ok: true,
            changed: true,
            sourcePath,
            targetPath: PLUGIN_DIR,
            backup,
            restartRequired: true,
            status: getSelfInstallStatus(),
        };
    } catch (error) {
        try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        return { ok: false, error: error instanceof Error ? error.message : String(error), sourcePath, targetPath: PLUGIN_DIR, status };
    }
}
