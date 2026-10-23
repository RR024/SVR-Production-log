/**
 * Hash router (#/history, #/log/12). Hash routing needs no server rewrites,
 * so deep links and refreshes work on any static host, including GitHub Pages
 * and sub-folder deployments.
 */
const routes = []
let current = { hash: '', route: null }
let token = 0
let guard = null // () => boolean : return false to block leaving the page
let silent = false
const leaveFns = []
let mount = null
let onRender = () => {}
let resolveAccess = () => 'ok' // (route) => 'ok' | 'login' | 'denied'

export function defineRoutes(list) {
  routes.length = 0
  for (const r of list) {
    const keys = []
    const re = new RegExp('^' + r.path.replace(/:([a-z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$')
    routes.push({ ...r, re, keys })
  }
}

export const navigate = (path) => {
  location.hash = '#' + path
}
export const replace = (path) => {
  history.replaceState(null, '', '#' + path)
  render()
}
export const setGuard = (fn) => (guard = fn)
export const clearGuard = () => (guard = null)
export const currentPath = () => current.hash

function parse(hash) {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, qs = ''] = raw.split('?')
  const query = Object.fromEntries(new URLSearchParams(qs))
  for (const r of routes) {
    const m = r.re.exec(path)
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query, path }
  }
  return { route: null, params: {}, query, path }
}

export const setMount = (el) => (mount = el)

export function startRouter({ access, rendered }) {
  resolveAccess = access
  onRender = rendered || onRender
  window.addEventListener('hashchange', () => {
    if (silent) return (silent = false)
    if (guard && !guard()) {
      silent = true
      location.hash = current.hash // put the user back
      return
    }
    clearGuard()
    render()
  })
  render()
}

export async function render() {
  const my = ++token
  const hash = location.hash || '#/'
  const { route, params, query, path } = parse(hash)
  current = { hash, route, path }

  const verdict = route ? resolveAccess(route) : 'ok'
  if (verdict === 'login') return navigateRaw('/login')
  if (verdict === 'home') return navigateRaw('/')

  leaveFns.splice(0).forEach((fn) => { try { fn() } catch (e) { console.error(e) } })
  mount.replaceChildren()
  const ctx = {
    params, query, route, root: mount, path,
    isCurrent: () => my === token,
    onLeave: (fn) => leaveFns.push(fn), // runs when the user navigates elsewhere
  }
  onRender(route, ctx)
  if (verdict === 'denied') {
    const { forbiddenView } = await import('../views/layout.js')
    return forbiddenView(ctx)
  }
  if (!route) {
    const { notFoundView } = await import('../views/layout.js')
    return notFoundView(ctx)
  }
  try {
    await route.view(ctx)
  } catch (e) {
    console.error(e)
    if (ctx.isCurrent()) {
      const { fatalView } = await import('../views/layout.js')
      fatalView(ctx, e)
    }
  }
}

function navigateRaw(path) {
  history.replaceState(null, '', '#' + path)
  return render()
}
