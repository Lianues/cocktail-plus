import { API_PREFIX } from './constants';
import { log } from './st-context';
import { state } from './state';

function getServiceWorkerScriptURL(reg: ServiceWorkerRegistration) {
  return reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
}

function isOurRegistration(reg: ServiceWorkerRegistration) {
  const scriptURL = getServiceWorkerScriptURL(reg);
  return scriptURL.includes(`${API_PREFIX}/sw.js`);
}

export async function refreshServiceWorkerState() {
  state.sw.supported = 'serviceWorker' in navigator;
  state.sw.registered = false;
  state.sw.controlled = Boolean(navigator.serviceWorker?.controller);
  state.sw.scriptURL = '';
  state.sw.scope = '';

  if (!state.sw.supported) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  const reg = regs.find(isOurRegistration);
  if (reg) {
    state.sw.registered = true;
    state.sw.scriptURL = getServiceWorkerScriptURL(reg);
    state.sw.scope = reg.scope;
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('当前浏览器不支持 Service Worker');
  const reg = await navigator.serviceWorker.register(`${API_PREFIX}/sw.js`, { scope: '/' });
  await navigator.serviceWorker.ready.catch(() => undefined);
  await refreshServiceWorkerState();
  log(navigator.serviceWorker.controller ? 'Service Worker 已注册并控制当前页面' : 'Service Worker 已注册；通常需要刷新一次页面才会接管当前页面', {
    scope: reg.scope,
  });
}

export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  let count = 0;
  for (const reg of regs) {
    if (isOurRegistration(reg)) {
      if (await reg.unregister()) count++;
    }
  }
  await refreshServiceWorkerState();
  log(`已注销 ${count} 个性能优化器 Service Worker；刷新页面后完全恢复原接口`);
}
