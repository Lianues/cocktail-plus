// @ts-nocheck
import { charactersAllEndpoint, charactersEndpointsToInvalidate } from './endpoints/characters-all.js';
import { chatSaveEndpoint, groupChatSaveEndpoint } from './endpoints/chat-save.js';
import { settingsGetEndpoint } from './endpoints/settings-get.js';
import { settingsSaveEndpoint } from './endpoints/settings-save.js';
import { versionEndpoint } from './endpoints/version.js';

export const ENDPOINT_LIST = Object.freeze([
    charactersAllEndpoint,
    versionEndpoint,
]);

export const MUTATION_ENDPOINT_LIST = Object.freeze([
    settingsSaveEndpoint,
    chatSaveEndpoint,
    groupChatSaveEndpoint,
]);
export const DIRECT_ENDPOINT_LIST = Object.freeze([
    settingsGetEndpoint,
]);
export const ALL_ENDPOINT_LIST = Object.freeze([...ENDPOINT_LIST, ...DIRECT_ENDPOINT_LIST, ...MUTATION_ENDPOINT_LIST]);

export const ENDPOINTS = Object.freeze(Object.fromEntries(ENDPOINT_LIST.map(endpoint => [endpoint.key, endpoint])));

export function normalizeEndpointName(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    for (const def of ENDPOINT_LIST) {
        if (def.aliases.includes(raw)) return def.key;
    }
    return null;
}

export function parseEndpointList(value, fallback = ['characters-all']) {
    if (!value) return fallback;
    const arr = Array.isArray(value) ? value : [value];
    const out = [];
    for (const item of arr) {
        const key = normalizeEndpointName(item);
        if (key && !out.includes(key)) out.push(key);
    }
    return out;
}

export function endpointsToInvalidate(pathname) {
    const out = [];
    out.push(...charactersEndpointsToInvalidate(pathname));
    return Array.from(new Set(out));
}
