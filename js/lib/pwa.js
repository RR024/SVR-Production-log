/** Service-worker registration, update detection, install prompt, online state. */
export const pwa = {
  online: navigator.onLine,
  updateReady: false,
  installEvent: null,
  installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
}

const listeners = new Set()
export const onPwaChange = (fn) => (listeners.add(fn), () => listeners.delete(fn))
const emit = () => listeners.forEach((fn) => fn(pwa))

let waiting = null

export function initPwa() {
  window.addEventListener('online', () => ((pwa.online = true), emit()))
  window.addEventListener('offline', () => ((pwa.online = false), emit()))
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    pwa.installEvent = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    pwa.installEvent = null
    pwa.installed = true
    emit()
  })

  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js')
      const flag = (sw) => {
        waiting = sw
        pwa.updateReady = true
        emit()
      }
      if (reg.waiting && navigator.serviceWorker.controller) flag(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) flag(sw)
        })
      })
      // Look for a new version whenever the app regains focus.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    } catch (e) {
      console.warn('Service worker registration failed', e)
    }
  })

  // Reload only when a NEW worker replaces an existing one (user tapped
  // "Refresh"). On the very first install there is no previous controller, and
  // reloading then would wipe whatever the user is already typing.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    location.reload()
  })
}

export function applyUpdate() {
  waiting?.postMessage({ type: 'SKIP_WAITING' })
}

export async function promptInstall() {
  const e = pwa.installEvent
  if (!e) return
  e.prompt()
  await e.userChoice.catch(() => {})
  pwa.installEvent = null
  emit()
}
