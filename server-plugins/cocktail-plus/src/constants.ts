// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'cocktail-plus';
export const PLUGIN_NAME = 'cocktail-plus';
export const DISPLAY_NAME = 'cocktail-plus';

export const API_PREFIX = `/api/plugins/${PLUGIN_ID}`;
export const HEADER_PREFIX = 'x-cocktail-plus';
export const SW_MESSAGE_SOURCE = `${PLUGIN_ID}-sw`;

export const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.join(PLUGIN_DIR, 'config.json');
export const SERVER_ROOT = path.resolve(PLUGIN_DIR, '..', '..');

function readVersion() {
    try {
        const raw = fs.readFileSync(path.join(PLUGIN_DIR, 'version.json'), 'utf8');
        const parsed = JSON.parse(raw);
        const version = String(parsed?.version || '').trim();
        if (version) return version;
    } catch {}
    return '0.1.21';
}

export const VERSION = readVersion();

export const info = {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    version: VERSION,
    description: 'Optional SillyTavern cocktail-plus plugin for frontend/backend startup and interaction paths.',
};
