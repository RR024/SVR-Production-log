import { isConfigured } from './config.js'
import { initPwa } from './lib/pwa.js'
import { auth, can, initAuth, onAuthChange } from './lib/auth.js'
import { defineRoutes, startRouter, setMount, render } from './lib/router.js'
import { mountShell, setActiveNav, setupView, noAccessView } from './views/layout.js'
import { errorState } from './lib/ui.js'
import { h } from './lib/dom.js'

initPwa()

const app = document.getElementById('app')
const lazy = (file) => (ctx) => import(`./views/${file}.js`).then((m) => m.default(ctx))

defineRoutes([
  { path: '/login', view: lazy('login'), public: true },
  { path: '/', view: lazy('dashboard') },
  { path: '/history', view: lazy('history') },
  { path: '/log/new', view: lazy('form'), perm: 'createLog' }, // must precede /log/:id
  { path: '/log/:id', view: lazy('detail') },
  { path: '/log/:id/edit', view: lazy('form'), perm: 'editLog' },
  { path: '/reports', view: lazy('reports') },
  { path: '/machines', view: lazy('catalog'), perm: 'manageCatalog', kind: 'machines' },
  { path: '/parts', view: lazy('catalog'), perm: 'manageCatalog', kind: 'parts' },
  { path: '/users', view: lazy('users'), perm: 'manageUsers' },
])

function access(route) {
  if (route.public) return auth.user ? 'home' : 'ok'
  if (!auth.user) return 'login'
  if (route.perm && !can(auth.profile?.role)[route.perm]) return 'denied'
  return 'ok'
}

// Rebuild the page chrome only when who is signed in changes.
let chrome = ''
function buildChrome() {
  const next = !auth.user ? 'out' : !auth.profile ? 'noaccess' : `in:${auth.user.id}:${auth.profile.role}`
  if (next === chrome) return false
  chrome = next
  app._cleanup?.()
  app.className = ''
  app.replaceChildren()
  if (next === 'out') setMount(app)
  else if (next === 'noaccess') {
    noAccessView(app)
    setMount(h('div'))
  } else setMount(mountShell(app))
  return true
}

async function boot() {
  if (!isConfigured) return setupView(app)
  try {
    await initAuth()
  } catch (e) {
    app.replaceChildren(errorState(e, () => location.reload()))
    return
  }
  buildChrome()
  startRouter({
    access,
    rendered: (route, ctx) => {
      if (auth.user && auth.profile) setActiveNav(ctx.path)
      if (route?.public) app.className = 'center-screen'
    },
  })
  // Re-render only when who is signed in (or their role) actually changed.
  // Redundant auth events (e.g. SIGNED_OUT after a failed login) must not wipe
  // a form the user is typing into.
  onAuthChange(() => {
    if (buildChrome()) render()
  })
}

boot()
