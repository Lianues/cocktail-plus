// @ts-nocheck
import { getDataRoot, sha256, stableStringify } from './utils.js';

export function getUserHandleFromRequest(req) {
    return String(req?.user?.profile?.handle || req?.user?.profile?.name || 'default');
}

export function getUserKeyFromHandle(handle) {
    return sha256(`${getDataRoot()}\n${handle}`).slice(0, 32);
}

export function makeRequestContext(req, options = {}) {
    const handle = getUserHandleFromRequest(req);
    const userKey = getUserKeyFromHandle(handle);
    const body = options.bodyOverride !== undefined ? options.bodyOverride : (req.body ?? {});
    const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get?.('host') || req.headers?.host || '127.0.0.1';

    return {
        requestId: options.requestId || null,
        handle,
        userKey,
        directories: req.user?.directories || {},
        body,
        bodyText: options.bodyTextOverride !== undefined ? String(options.bodyTextOverride) : stableStringify(body),
        protocol,
        host,
        headers: {
            authorization: req.headers?.authorization,
            cookie: req.headers?.cookie,
            'x-csrf-token': req.headers?.['x-csrf-token'],
            'content-type': req.headers?.['content-type'] || 'application/json',
            accept: req.headers?.accept,
            'user-agent': req.headers?.['user-agent'],
        },
    };
}
