import { h, $$ } from '../lib/dom.js'
import { icon, logoMark } from '../lib/icons.js'
import { auth, can, signOut, ROLE_LABEL } from '../lib/auth.js'
import { pwa, onPwaChange, applyUpdate, promptInstall } from '../lib/pwa.js'
import { toast, emptyState, errorState } from '../lib/ui.js'
import { toAppError } from '../lib/errors.js'

const COMPANY = 'Sri Veera Raghava Sheet Metal Component'

function navItems() {
  const p = can(auth.profile?.role)
  return [
    { path: '/', label: 'Dashboard', icon: 'home', match: (x) => x === '/' },
    { path: '/history', label: 'Production history', short: 'History', icon: 'history', match: (x) => x === '/history' || /^\/log\/\d+$/.test(x) },
    p.createLog && { path: '/log/new', label: 'New log', icon: 'plus', match: (x) => x === '/log/new' || /\/edit$/.test(x) },
    { path: '/reports', label: 'Reports', icon: 'chart', match: (x) => x === '/reports' },
    p.manageCatalog && { path: '/machines', label: 'Machines', icon: 'cog', match: (x) => x === '/machines' },
    p.manageCatalog && { path: '/parts', label: 'Parts', icon: 'box', match: (x) => x === '/parts' },
    p.manageUsers && { path: '/users', label: 'Users', icon: 'users', match: (x) => x === '/users' },
  ].filter(Boolean)
}

export function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark')
  try { localStorage.setItem('svr-theme', dark ? 'dark' : 'light') } catch { /* private mode */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1422' : '#1e3a5f')
  document.querySelectorAll('[data-theme-icon]').forEach((n) => n.replaceChildren(icon(dark ? 'sun' : 'moon', 18)))
}

const themeIcon = () => icon(document.documentElement.classList.contains('dark') ? 'sun' : 'moon', 18)

async function handleSignOut() {
  try { await signOut() } catch (e) { toast(toAppError(e).message, 'error') }
}

export function mountShell(app) {
  app.className = 'shell'
  const items = navItems()

  const link = (it, cls) =>
    h('a', { href: '#' + it.path, class: cls, 'data-path': it.path, onclick: closeDrawer }, icon(it.icon, 20), h('span', null, cls === 'bn-link' && it.short ? it.short : it.label))

  const installBtn = h('button', { class: 'side-btn', type: 'button', hidden: true, onclick: promptInstall }, icon('install', 18), 'Install app')

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Main navigation' },
    h('div', { class: 'brand' }, logoMark(38),
      h('div', null, h('p', { class: 'brand-name' }, 'SVR Production Log'), h('p', { class: 'brand-co' }, COMPANY))),
    h('nav', { class: 'nav' }, items.map((it) => link(it, 'nav-link'))),
    h('div', { class: 'side-foot' },
      h('div', { class: 'user' },
        h('div', { class: 'avatar', 'aria-hidden': 'true' }, (auth.profile.full_name || auth.profile.email || '?').trim()[0].toUpperCase()),
        h('div', { class: 'user-meta' },
          h('p', { class: 'user-name' }, auth.profile.full_name || auth.profile.email || 'User'),
          h('p', { class: 'user-role' }, ROLE_LABEL[auth.profile.role] || auth.profile.role))),
      installBtn,
      h('button', { class: 'side-btn', type: 'button', onclick: toggleTheme }, h('span', { 'data-theme-icon': '' }, themeIcon()), 'Light / dark'),
      h('button', { class: 'side-btn', type: 'button', onclick: handleSignOut }, icon('logout', 18), 'Sign out')),
  )

  const scrim = h('div', { class: 'scrim', onclick: closeDrawer })
  function closeDrawer() { app.classList.remove('drawer-open') }

  const offline = h('div', { class: 'banner banner-warn', role: 'status', hidden: true },
    icon('wifioff', 18), h('span', null, "You're offline. You can browse the app, but production logs can't be saved until you reconnect."))
  const update = h('div', { class: 'banner banner-info', role: 'status', hidden: true },
    icon('refresh', 18), h('span', null, 'A new version of SVR Production Log is ready.'),
    h('button', { class: 'btn btn-sm', type: 'button', onclick: applyUpdate }, 'Refresh'))

  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' })

  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Open menu', onclick: () => app.classList.add('drawer-open') }, icon('menu', 22)),
    h('div', { class: 'topbar-brand' }, logoMark(26), h('span', null, 'SVR Production Log')),
    h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Toggle dark mode', onclick: toggleTheme }, h('span', { 'data-theme-icon': '' }, themeIcon())))

  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Quick navigation' },
    items.filter((i) => ['/', '/history', '/log/new', '/reports'].includes(i.path)).map((it) => link(it, 'bn-link')))

  app.replaceChildren(sidebar, scrim, h('div', { class: 'content' }, topbar, offline, update, main, bottom))

  const sync = () => {
    offline.hidden = pwa.online
    update.hidden = !pwa.updateReady
    installBtn.hidden = !pwa.installEvent
  }
  sync()
  const off = onPwaChange(sync)
  app._cleanup = off
  return main
}

export function setActiveNav(path) {
  const items = navItems()
  const active = items.find((i) => i.match(path))?.path
  $$('[data-path]').forEach((a) => {
    const on = a.dataset.path === active
    a.classList.toggle('active', on)
    if (on) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
  window.scrollTo(0, 0)
}

// --------------------------------------------------------- standalone screens
export function setupView(app) {
  app.className = 'center-screen'
  app.replaceChildren(
    h('div', { class: 'card auth-card' },
      logoMark(48),
      h('h1', null, 'Connect Supabase'),
      h('p', { class: 'muted' }, 'Open js/config.js and paste your project URL and publishable key (Supabase → Project Settings → API), then reload. See the README for the full setup.')),
  )
}

export function noAccessView(app) {
  app.className = 'center-screen'
  app.replaceChildren(
    h('div', { class: 'card auth-card' },
      logoMark(48),
      h('h1', null, 'No access yet'),
      h('p', { class: 'muted' }, `You're signed in as ${auth.user?.email || 'this account'}, but no role has been assigned to it. Ask an administrator to give you a role, then sign in again.`),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: handleSignOut }, icon('logout', 16), 'Sign out')),
  )
}

export function notFoundView(ctx) {
  ctx.root.replaceChildren(
    emptyState({ iconName: 'search', title: 'Page not found', text: "That address doesn't exist in this app.",
      action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Go to dashboard') }),
  )
}

export function forbiddenView(ctx) {
  ctx.root.replaceChildren(
    emptyState({ iconName: 'alert', title: 'Not allowed', text: "Your role doesn't have access to this page.",
      action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Go to dashboard') }),
  )
}

export function fatalView(ctx, err) {
  ctx.root.replaceChildren(errorState(err, () => location.reload()))
}
