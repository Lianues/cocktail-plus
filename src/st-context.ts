export function getCtx(): any {
  try { return (globalThis as any).SillyTavern?.getContext?.() ?? null; } catch { return null; }
}

export function saveSettings() {
  try { getCtx()?.saveSettingsDebounced?.(); } catch { /* ignore */ }
}

export function getRequestHeaders(): Record<string, string> {
  const ctx = getCtx();
  const headers: Record<string, string> = {};
  if (ctx?.getRequestHeaders) Object.assign(headers, ctx.getRequestHeaders());
  headers['Content-Type'] = 'application/json';
  return headers;
}

export function log(_message: string, _extra?: unknown) {
  // Silent hook for optional local diagnostics.
}
