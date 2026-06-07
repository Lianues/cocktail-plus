// @ts-nocheck
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { HEADER_PREFIX, VERSION } from './constants.js';
import { config } from './config.js';
import { getServerRoot } from './utils.js';

const TARGET_PROXY_MODULE_PATHS = new Set(['/script.js', '/scripts/i18n.js', '/scripts/system-messages.js', '/scripts/extensions.js', '/scripts/welcome-screen.js']);

function getPublicRoot() {
    return path.join(getServerRoot(), 'public');
}

function normalizePublicPath(value) {
    const publicRoot = getPublicRoot();
    let raw = String(value || '').split('?')[0].split('#')[0];
    if (!raw.startsWith('/')) raw = `/${raw}`;
    raw = decodeURIComponent(raw);
    if (!raw.endsWith('.js')) throw new Error('Only JavaScript modules can be proxied');
    if (raw.includes('\0')) throw new Error('Invalid module path');
    const fullPath = path.resolve(publicRoot, `.${raw}`);
    if (!fullPath.startsWith(publicRoot + path.sep) && fullPath !== publicRoot) {
        throw new Error('Module path escapes public root');
    }
    return { publicPath: raw.replace(/\\/g, '/'), fullPath };
}

function isProxyableModulePath(normalized) {
    return TARGET_PROXY_MODULE_PATHS.has(normalized);
}

function toProxySpecifier(currentPublicPath, specifier) {
    if (!specifier || typeof specifier !== 'string') return specifier;
    if (/^(?:[a-zA-Z][a-zA-Z\d+.-]*:|#)/.test(specifier)) return specifier;
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) return specifier;

    const [withoutHash, hash = ''] = specifier.split('#');
    const [withoutQuery, query = ''] = withoutHash.split('?');
    const baseDir = path.posix.dirname(currentPublicPath);
    const resolved = specifier.startsWith('/')
        ? path.posix.normalize(withoutQuery)
        : path.posix.normalize(path.posix.join(baseDir, withoutQuery));
    const normalized = resolved.startsWith('/') ? resolved : `/${resolved}`;
    const suffix = `${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;

    // /lib.js and /lib/* are already browser-ready bundle artifacts. Proxying their source would expose bare imports.
    if (normalized === '/lib.js' || normalized.startsWith('/lib/')) {
        return `${normalized}${suffix}`;
    }

    // Only rewrite modules that we actually patch. The rest of SillyTavern's module graph stays on native
    // static URLs; import map still canonicalizes /script.js so raw modules importing it do not create duplicates.
    if (isProxyableModulePath(normalized)) {
        return `/api/plugins/cocktail-plus/module?path=${encodeURIComponent(normalized)}${suffix}`;
    }

    return `${normalized}${suffix}`;
}

function rewriteModuleSpecifiers(source, currentPublicPath) {
    const rewrite = (specifier) => toProxySpecifier(currentPublicPath, specifier);
    let out = source;

    out = out.replace(/(import\s+(?:[^'";]*?\s+from\s*)?)(['"])([^'"]+)(\2)/g, (match, prefix, quote, spec, suffix) => {
        return `${prefix}${quote}${rewrite(spec)}${suffix}`;
    });

    out = out.replace(/(export\s+[^'";]*?\s+from\s*)(['"])([^'"]+)(\2)/g, (match, prefix, quote, spec, suffix) => {
        return `${prefix}${quote}${rewrite(spec)}${suffix}`;
    });

    out = out.replace(/(import\s*\(\s*)(['"])([^'"]+)(\2\s*\))/g, (match, prefix, quote, spec, suffix) => {
        return `${prefix}${quote}${rewrite(spec)}${suffix}`;
    });

    return out;
}

function patchScriptJs(source) {
    const bootstrapRegex = /([ \t]*)await\s+getClientVersion\(\);\s*\r?\n\1await\s+initSecrets\(\);\s*\r?\n\1await\s+readSecretState\(\);\s*\r?\n\1await\s+initLocales\(\);/;
    const systemMessagesSettingsRegex = /([ \t]*)await\s+initPresetManager\(\)\s*;?\s*\r?\n\1await\s+initSystemMessages\(\)\s*;?\s*\r?\n\1await\s+getSettings\(([^)]*)\)\s*;?/;
    const coreDataRegex = /([ \t]*)await\s+getUserAvatars\(true,\s*user_avatar\);\s*\r?\n\1await\s+getCharacters\(\);\s*\r?\n\1await\s+getBackgrounds\(\);\s*\r?\n\1await\s+initTokenizers\(\);/;
    const loaderViewportRegex = /([ \t]*)await\s+((?:hideLoader|initLoaderHandle\.hide)\(\))\s*;?\s*\r?\n\1await\s+fixViewport\(\)\s*;?\s*\r?\n\1await\s+eventSource\.emit\(event_types\.APP_READY\)\s*;?/;
    const postFirstPaintRegex = /([ \t]*)initServerHistory\(\);\s*\r?\n\1initSettingsSearch\(\);\s*\r?\n\1initBulkEdit\(\);\s*\r?\n\1initReasoning\(\);\s*\r?\n\1initWelcomeScreen\(\);\s*\r?\n\1await\s+initScrapers\(\);\s*\r?\n\1initCustomSelectedSamplers\(\);\s*\r?\n\1initDataMaid\(\);\s*\r?\n\1initItemizedPrompts\(\);\s*\r?\n\1initAccessibility\(\);\s*\r?\n(?:\1initSwipePicker\(\);\s*\r?\n)?\1addDebugFunctions\(\);\s*\r?\n\1doDailyExtensionUpdatesCheck\(\);/;
    const fixViewportFunctionRegex = /(async\s+function\s+fixViewport\s*\(\s*\)\s*\{\s*\r?\n[ \t]*document\.body\.style\.position\s*=\s*['"]absolute['"]\s*;\s*\r?\n[ \t]*await\s+delay\(1\)\s*;\s*\r?\n[ \t]*document\.body\.style\.position\s*=\s*['"]['"]\s*;\s*\r?\n\})/;
    const readyCallbackStartRegex = /(jQuery\s*\(\s*async\s+function\s*\(\s*\)\s*\{\s*\r?\n)/;
    const readyFirstLoadCallRegex = /([ \t]*)\/\/ Added here to prevent execution before script\.js is loaded and get rid of quirky timeouts\s*\r?\n\1await\s+firstLoadInit\(\)\s*;?/;
    const patchFlags = {
        patchStartupInit: !!config.patchStartupInit,
        bootstrapParallel: bootstrapRegex.test(source),
        systemMessagesSettingsParallel: systemMessagesSettingsRegex.test(source),
        coreDataParallel: coreDataRegex.test(source),
        loaderViewportParallel: loaderViewportRegex.test(source),
        postFirstPaintDeferred: postFirstPaintRegex.test(source),
        fixViewportFunction: fixViewportFunctionRegex.test(source),
        readyCallbackStart: readyCallbackStartRegex.test(source),
        readyFirstLoadCall: readyFirstLoadCallRegex.test(source),
    };
    let out = source;
    if (config.patchStartupInit) out = out.replace(bootstrapRegex, (_match, indent) => [
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-version-secrets-locales');`,
        `${indent}const clientVersionPromise = getClientVersion();`,
        `${indent}await initSecrets();`,
        `${indent}const secretStatePromise = readSecretState();`,
        `${indent}const localesPromise = initLocales();`,
        `${indent}await Promise.all([clientVersionPromise, secretStatePromise, localesPromise]);`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-version-secrets-locales');`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.startExtensionPrefetch?.('after-initLocales');`,
    ].join('\n'));
    if (config.patchStartupInit) out = out.replace(systemMessagesSettingsRegex, (_match, indent, getSettingsArgs) => [
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-initPresetManager');`,
        `${indent}await initPresetManager();`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-initPresetManager');`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-systemMessages-settings-parallel');`,
        `${indent}const systemMessagesPromise = initSystemMessages().finally(() => globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-initSystemMessages'));`,
        `${indent}const settingsPromise = getSettings(${getSettingsArgs || ''}).finally(() => globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-getSettings'));`,
        `${indent}await Promise.all([systemMessagesPromise, settingsPromise]);`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-systemMessages-settings-parallel');`,
    ].join('\n'));
    if (config.patchStartupInit) out = out.replace(coreDataRegex, (_match, indent) => [
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-core-data-parallel');`,
        `${indent}const userAvatarsPromise = getUserAvatars(true, user_avatar);`,
        `${indent}const charactersPromise = getCharacters();`,
        `${indent}const backgroundsPromise = getBackgrounds();`,
        `${indent}const tokenizersPromise = initTokenizers();`,
        `${indent}await Promise.all([userAvatarsPromise, charactersPromise, backgroundsPromise, tokenizersPromise]);`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-core-data-parallel');`,
    ].join('\n'));
    if (config.patchStartupInit) out = out.replace(loaderViewportRegex, (_match, indent, hideCall) => [
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-loader-viewport-parallel');`,
        `${indent}const loaderHidePromise = ${hideCall};`,
        `${indent}await fixViewport();`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.before-app-ready');`,
        `${indent}const appReadyPromise = eventSource.emit(event_types.APP_READY);`,
        `${indent}await Promise.all([loaderHidePromise, appReadyPromise]);`,
        `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.after-loader-app-ready-parallel');`,
    ].join('\n'));
    if (config.patchStartupInit) out = out.replace(postFirstPaintRegex, (_match, indent) => [
        `${indent}initServerHistory();`,
        `${indent}initWelcomeScreen();`,
        `${indent}const cpRunPostFirstPaintInit = async () => {`,
        `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.post-first-paint-init-start');`,
        `${indent}    try {`,
        `${indent}        initSettingsSearch();`,
        `${indent}        initBulkEdit();`,
        `${indent}        initReasoning();`,
        `${indent}        await initScrapers();`,
        `${indent}        initCustomSelectedSamplers();`,
        `${indent}        initDataMaid();`,
        `${indent}        initItemizedPrompts();`,
        `${indent}        initAccessibility();`,
        `${indent}        if (typeof initSwipePicker === 'function') initSwipePicker();`,
        `${indent}        addDebugFunctions();`,
        `${indent}        doDailyExtensionUpdatesCheck();`,
        `${indent}    } finally {`,
        `${indent}        globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.post-first-paint-init-end');`,
        `${indent}    }`,
        `${indent}};`,
        `${indent}(globalThis.requestIdleCallback || function (cb) { return setTimeout(cb, 1); })(() => { void cpRunPostFirstPaintInit(); });`,
    ].join('\n'));
    if (config.patchStartupInit && fixViewportFunctionRegex.test(out) && readyFirstLoadCallRegex.test(out)) {
        out = out.replace(fixViewportFunctionRegex, (match) => `${match}

const cpFirstLoadInitPromise = (async () => {
    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('module.firstLoadInit-start');
    try {
        await firstLoadInit();
    } finally {
        globalThis.__cocktailPlusEarlyBridge?.markStartup?.('module.firstLoadInit-end');
    }
})();`);
    }
    if (config.patchStartupInit && readyCallbackStartRegex.test(out)) {
        out = out.replace(readyCallbackStartRegex, (match) => `${match}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('ready-callback.enter');
`);
    }
    if (config.patchStartupInit && out.includes('const cpFirstLoadInitPromise') && readyFirstLoadCallRegex.test(out)) {
        out = out.replace(readyFirstLoadCallRegex, (_match, indent) => [
            `${indent}// First load starts during module evaluation; wait here only to preserve following beforeunload setup order.`,
            `${indent}await cpFirstLoadInitPromise;`,
        ].join('\n'));
    }
    patchFlags.bootstrapApplied = out.includes('firstLoadInit.before-version-secrets-locales');
    patchFlags.systemMessagesSettingsApplied = out.includes('firstLoadInit.before-systemMessages-settings-parallel');
    patchFlags.coreDataApplied = out.includes('firstLoadInit.before-core-data-parallel');
    patchFlags.loaderViewportApplied = out.includes('firstLoadInit.before-loader-viewport-parallel');
    patchFlags.postFirstPaintDeferredApplied = out.includes('firstLoadInit.post-first-paint-init-start');
    patchFlags.readyFirstLoadStartedEarlyApplied = out.includes('module.firstLoadInit-start');
    const firstLoadRegex = /(async\s+function\s+firstLoadInit\s*\(\s*\)\s*\{\r?\n)/;
    patchFlags.firstLoadDiagnosticInserted = config.patchStartupInit && firstLoadRegex.test(out);
    const diagnostic = JSON.stringify({ version: VERSION, ...patchFlags });
    if (patchFlags.firstLoadDiagnosticInserted) {
        out = out.replace(firstLoadRegex, `$1    console.info('[cp:module-proxy] firstLoadInit patches active', ${diagnostic});\n    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('firstLoadInit.enter', ${diagnostic});\n`);
    }
    out += `\ntry { console.info('[cp:module-proxy] loaded /script.js', ${diagnostic}); } catch (_) {}\n`;
    return out;
}

function patchI18nJs(source) {
    if (!config.patchI18nInit) return source;
    return source.replace(
        `export async function initLocales() {\n    langs = await fetch('/locales/lang.json').then(response => response.json());\n    localeData = await getLocaleData(localeFile);`,
        `export async function initLocales() {\n    const localePromise = fetch(\`./locales/\${localeFile}.json\`)\n        .then(response => {\n            console.log(\`Loading locale data from ./locales/\${localeFile}.json\`);\n            if (!response.ok) return {};\n            return response.json();\n        })\n        .catch(() => ({}));\n    const langsPromise = fetch('/locales/lang.json').then(response => response.json());\n    langs = await langsPromise;\n    localeData = findLang(localeFile) ? await localePromise : {};`,
    );
}

function patchSystemMessagesJs(source) {
    if (!config.patchSystemMessagesInit) return source;
    if (source.includes('const [help, hotkeys, formatting, welcome, welcomePrompt, assistantNote]')) return source;

    const markerRegex = /(\s*\/\*\* @type \{Record<string, ChatMessage>\} \*\/\r?\n\s*const result = \{)/;
    const preload = `
    const [help, hotkeys, formatting, welcome, welcomePrompt, assistantNote] = await Promise.all([
        renderTemplateAsync('help'),
        renderTemplateAsync('hotkeys'),
        renderTemplateAsync('formatting'),
        renderTemplateAsync('welcome', { displayVersion }),
        renderTemplateAsync('welcomePrompt'),
        renderTemplateAsync('assistantNote'),
    ]);
`;
    let inserted = false;
    let out = source.replace(markerRegex, (match) => {
        inserted = true;
        return `${preload}${match}`;
    });

    if (!inserted) {
        console.warn('[cocktail-plus] system-messages patch skipped: marker not found');
        return source;
    }

    out = out
        .replace(`mes: await renderTemplateAsync('help'),`, `mes: help,`)
        .replace(`mes: await renderTemplateAsync('hotkeys'),`, `mes: hotkeys,`)
        .replace(`mes: await renderTemplateAsync('formatting'),`, `mes: formatting,`)
        .replace(`mes: await renderTemplateAsync('welcome', { displayVersion }),`, `mes: welcome,`)
        .replace(`mes: await renderTemplateAsync('welcomePrompt'),`, `mes: welcomePrompt,`)
        .replace(`mes: await renderTemplateAsync('assistantNote'),`, `mes: assistantNote,`);
    return out;
}

function patchExtensionsJs(source) {
    let out = source;

    if (config.patchExtensionManifests) {
        out = out.replace(
            `            fetch(\`/scripts/extensions/\${name}/manifest.json\`).then(async response => {\n                if (response.ok) {\n                    const json = await response.json();`,
            `            (globalThis.__cocktailPlusEarlyBridge?.getExtensionManifest?.(name)?.then(json => json ?? fetch(\`/scripts/extensions/\${name}/manifest.json\`).then(r => r.ok ? r.json() : Promise.reject())) ?? fetch(\`/scripts/extensions/\${name}/manifest.json\`).then(r => r.ok ? r.json() : Promise.reject())).then(async json => {\n                if (json) {`,
        );
    }

    if (config.patchExtensionManifests) {
        out = out.replace(
            `    const extensions = await discoverExtensions();\n    extensionNames = extensions.map(x => x.name);\n    extensionTypes = Object.fromEntries(extensions.map(x => [x.name, x.type]));\n    manifests = await getManifests(extensionNames);`,
            `    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.before-discover');\n    const extensions = await discoverExtensions();\n    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.after-discover', { count: extensions.length });\n    extensionNames = extensions.map(x => x.name);\n    extensionTypes = Object.fromEntries(extensions.map(x => [x.name, x.type]));\n    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.before-getManifests', { count: extensionNames.length });\n    manifests = await getManifests(extensionNames);\n    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('loadExtensionSettings.after-getManifests', { count: Object.keys(manifests || {}).length });`,
        );
    }

    if (config.patchParallelActivateExtensions) {
        out = out.replace(
            /([ \t]*)await\s+activateExtensions\(\)\s*;?\s*\r?\n\1if\s*\(extension_settings\.autoConnect\s*&&\s*extension_settings\.apiUrl\)\s*\{\s*\r?\n\1[ \t]*connectToApi\(extension_settings\.apiUrl\);\s*\r?\n\1\}/,
            (_match, indent) => [
                `${indent}const cpActivateExtensionsAfterFirstPaint = async () => {`,
                `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('extensions.activate.deferred-start');`,
                `${indent}    try {`,
                `${indent}        await activateExtensions();`,
                `${indent}        if (extension_settings.autoConnect && extension_settings.apiUrl) {`,
                `${indent}            connectToApi(extension_settings.apiUrl);`,
                `${indent}        }`,
                `${indent}    } finally {`,
                `${indent}        globalThis.__cocktailPlusEarlyBridge?.markStartup?.('extensions.activate.deferred-end');`,
                `${indent}    }`,
                `${indent}};`,
                `${indent}const cpScheduleExtensionActivation = () => {`,
                `${indent}    const run = () => setTimeout(() => {`,
                `${indent}        void cpActivateExtensionsAfterFirstPaint().catch(error => console.error('[cocktail-plus] deferred extension activation failed', error));`,
                `${indent}    }, 0);`,
                `${indent}    try {`,
                `${indent}        eventSource.once(event_types.APP_READY, run);`,
                `${indent}    } catch (_) {`,
                `${indent}        run();`,
                `${indent}    }`,
                `${indent}};`,
                `${indent}cpScheduleExtensionActivation();`,
            ].join('\n'),
        );
    }

    if (config.patchParallelActivateExtensions) {
        out = out.replace(
            `                const promise = addExtensionLocale(name, manifest).finally(() =>\n                    Promise.all([addExtensionScript(name, manifest), addExtensionStyle(name, manifest)]),\n                );\n                await promise\n                    .then(() => activeExtensions.add(name))\n                    .catch(err => {\n                        console.log('Could not activate extension', name, err);\n                        extensionLoadErrors.add(t\`Extension \"\${displayName}\" failed to load: \${err}\`);\n                    });\n                promises.push(promise);`,
            `                const promise = addExtensionLocale(name, manifest).finally(() =>\n                    Promise.all([addExtensionScript(name, manifest), addExtensionStyle(name, manifest)]),\n                )\n                    .then(() => activeExtensions.add(name))\n                    .catch(err => {\n                        console.log('Could not activate extension', name, err);\n                        extensionLoadErrors.add(t\`Extension \"\${displayName}\" failed to load: \${err}\`);\n                    });\n                promises.push(promise);`,
        );
    }

    return out;
}

function patchWelcomeScreenJs(source) {
    let out = source;
    out = out.replace(
        /([ \t]*)const\s+recentChats\s*=\s*await\s+getRecentChats\(\)\s*;\s*\r?\n\1const\s+chatAfterFetch\s*=\s*getCurrentChatId\(\)\s*;\s*\r?\n\1if\s*\(chatAfterFetch\s*!==\s*currentChatId\)\s*\{\s*\r?\n\1[ \t]*console\.debug\('Chat changed while fetching recent chats\.'\);\s*\r?\n\1[ \t]*return;\s*\r?\n\1\}\s*\r?\n\s*\r?\n\1if\s*\(chatAfterFetch\s*===\s*undefined\s*&&\s*force\)\s*\{\s*\r?\n\1[ \t]*console\.debug\('Forcing welcome screen open\.'\);\s*\r?\n\1[ \t]*chat\.splice\(0,\s*chat\.length\);\s*\r?\n\1[ \t]*\$\('#chat'\)\.empty\(\);\s*\r?\n\1\}\s*\r?\n\s*\r?\n\1await\s+sendWelcomePanel\(recentChats,\s*expand\)\s*;\s*\r?\n\1await\s+unshallowPermanentAssistant\(\)\s*;\s*\r?\n\1sendAssistantMessage\(\)\s*;\s*\r?\n\1sendWelcomePrompt\(\)\s*;/,
        (_match, indent) => [
            `${indent}const recentChatsPromise = getRecentChats();`,
            `${indent}if (currentChatId === undefined && force) {`,
            `${indent}    console.debug('Forcing welcome screen open.');`,
            `${indent}    chat.splice(0, chat.length);`,
            `${indent}    $('#chat').empty();`,
            `${indent}}`,
            `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.skeleton-before');`,
            `${indent}await sendWelcomePanel([], expand);`,
            `${indent}globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.skeleton-after');`,
            `${indent}void recentChatsPromise.then(async (recentChats) => {`,
            `${indent}    const chatAfterFetch = getCurrentChatId();`,
            `${indent}    if (chatAfterFetch !== currentChatId) {`,
            `${indent}        console.debug('Chat changed while fetching recent chats.');`,
            `${indent}        return;`,
            `${indent}    }`,
            `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.recent-before');`,
            `${indent}    await sendWelcomePanel(recentChats, expand);`,
            `${indent}    globalThis.__cocktailPlusEarlyBridge?.markStartup?.('welcome.recent-after');`,
            `${indent}}).catch(error => console.error('Welcome recent chats error:', error));`,
            `${indent}void (async () => {`,
            `${indent}    await unshallowPermanentAssistant();`,
            `${indent}    sendAssistantMessage();`,
            `${indent}    sendWelcomePrompt();`,
            `${indent}})().catch(error => console.error('Welcome assistant error:', error));`,
        ].join('\n'),
    );
    out = out.replace(
        /([ \t]*)chatElement\.append\(fragment\.firstChild\);/,
        (_match, indent) => [
            `${indent}const nextWelcomePanel = fragment.firstChild;`,
            `${indent}const existingWelcomePanel = chatElement.querySelector('.welcomePanel');`,
            `${indent}if (existingWelcomePanel) existingWelcomePanel.replaceWith(nextWelcomePanel);`,
            `${indent}else chatElement.append(nextWelcomePanel);`,
        ].join('\n'),
    );
    return out;
}

function applyTargetedPatches(source, publicPath) {
    switch (publicPath) {
        case '/script.js':
            return patchScriptJs(source);
        case '/scripts/i18n.js':
            return patchI18nJs(source);
        case '/scripts/system-messages.js':
            return patchSystemMessagesJs(source);
        case '/scripts/extensions.js':
            return patchExtensionsJs(source);
        case '/scripts/welcome-screen.js':
            return patchWelcomeScreenJs(source);
        default:
            return source;
    }
}

function makeEtag(source) {
    return `"cp-module-${VERSION}-${crypto.createHash('sha256').update(source).digest('base64url')}"`;
}

export function makeModuleProxyUrl(publicPath) {
    return `/api/plugins/cocktail-plus/module?path=${encodeURIComponent(publicPath)}`;
}

export async function handleModuleProxy(req, res) {

    try {
        const { publicPath, fullPath } = normalizePublicPath(req.query?.path || req.path || '');
        let source = await fs.promises.readFile(fullPath, 'utf8');
        source = applyTargetedPatches(source, publicPath);
        source = rewriteModuleSpecifiers(source, publicPath);
        source += `\n//# sourceURL=${publicPath}\n`;
        const etag = makeEtag(source);
        res.setHeader(HEADER_PREFIX, VERSION);
        res.setHeader(`${HEADER_PREFIX}-module-proxy`, publicPath);
        res.setHeader('etag', etag);
        res.setHeader('content-type', 'application/javascript; charset=utf-8');
        res.setHeader('cache-control', 'no-cache');
        if (req.headers?.['if-none-match'] === etag) {
            res.status(304).end();
            return;
        }
        res.send(source);
    } catch (error) {
        res.status(404).type('text/plain').send(error instanceof Error ? error.message : String(error));
    }
}
