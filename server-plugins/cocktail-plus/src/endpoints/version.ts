// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { getServerRoot, readTextIfExists, safeStatRecord, signatureFromRecords } from '../utils.js';

function getGitHeadInfo(serverRoot = getServerRoot()) {
    const gitDir = path.join(serverRoot, '.git');
    const headPath = path.join(gitDir, 'HEAD');
    const head = readTextIfExists(headPath);
    let branch = null;
    let revision = null;
    let refPath = null;
    if (head.startsWith('ref:')) {
        const ref = head.slice(4).trim();
        branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : path.basename(ref);
        refPath = path.join(gitDir, ...ref.split('/'));
        revision = readTextIfExists(refPath) || null;
        if (!revision) {
            const packedRefs = readTextIfExists(path.join(gitDir, 'packed-refs'));
            const line = packedRefs.split(/\r?\n/g).find(x => x && !x.startsWith('#') && x.endsWith(` ${ref}`));
            revision = line ? line.split(' ')[0] : null;
        }
    } else if (/^[0-9a-f]{40}$/i.test(head)) {
        revision = head;
    }
    return { gitDir, headPath, head, branch, revision, refPath };
}

function getVersionSignature(ctx) {
    const serverRoot = getServerRoot();
    const git = getGitHeadInfo(serverRoot);
    const records = [safeStatRecord(path.join(serverRoot, 'package.json'), 'package.json'), safeStatRecord(git.headPath, '.git/HEAD')];
    if (git.refPath) records.push(safeStatRecord(git.refPath, `.git/refs/heads/${git.branch}`));
    records.push(safeStatRecord(path.join(git.gitDir, 'packed-refs'), '.git/packed-refs'));
    records.push({ label: 'head', value: git.head });
    records.push({ label: 'revision', value: git.revision || '' });
    return signatureFromRecords(records);
}

function buildFastVersionObject(ctx) {
    const serverRoot = getServerRoot();
    let pkgVersion = 'UNKNOWN';
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
        pkgVersion = String(pkg.version || 'UNKNOWN');
    } catch {
        // ignore
    }

    const git = getGitHeadInfo(serverRoot);
    const gitRevision = git.revision ? git.revision.slice(0, 9) : null;
    const gitBranch = git.branch || null;
    return {
        agent: `SillyTavern:${pkgVersion}:Cohee#1207`,
        pkgVersion,
        gitRevision,
        gitBranch,
        // Fast path deliberately avoids expensive git show. Background refresh will replace this with exact data.
        commitDate: null,
        isLatest: true,
    };
}

function makeFastMiss(ctx, signature, config) {
    if (!config.fastVersionOnMiss) return null;
    return {
        state: 'FAST-MISS',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        bodyText: JSON.stringify(buildFastVersionObject(ctx)),
        durationMs: 0,
        transform: { fastVersion: true },
        refreshReason: 'fast-version-refresh',
    };
}

export const versionEndpoint = {
    key: 'version',
    aliases: ['version', '/version'],
    originalPath: '/version',
    fastPath: '/fast/version',
    configKey: 'cacheVersion',
    diskCacheConfigKey: 'diskCacheVersion',
    method: 'GET',
    getSignature: getVersionSignature,
    makeFastMiss,
};
