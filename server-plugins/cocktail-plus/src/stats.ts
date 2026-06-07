// @ts-nocheck
export const stats = {
    startedAt: Date.now(),
    requests: 0,
    hits: 0,
    staleHits: 0,
    misses: 0,
    refreshes: 0,
    errors: 0,
    invalidations: 0,
    lastError: null,
};

let requestSeq = 0;

export function nextRequestId(endpointKey = 'request') {
    requestSeq += 1;
    return `${endpointKey}-${Date.now().toString(36)}-${requestSeq}`;
}
