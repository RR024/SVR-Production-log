import { h } from '../lib/dom.js'
import { auth, ROLE_LABEL } from '../lib/auth.js'
import { listProfiles, setUserRole } from '../lib/api.js'
import { formatShortDate } from '../lib/dates.js'
import { badge, confirmDialog, emptyState, errorState, pageHeader, spinner, toast } from '../lib/ui.js'
import { toAppError } from '../lib/errors.js'
import { icon } from '../lib/icons.js'

const ROLES = ['admin', 'supervisor', 'viewer']

export default async function users(ctx) {
  const host = h('div')
  const refresh = h('button', { class: 'btn', type: 'button', onclick: () => load() }, icon('refresh', 16), 'Refresh')
  ctx.root.replaceChildren(
    pageHeader('Users', 'Assign roles. Roles are enforced by the database, not just this screen.', refresh),
    h('div', { class: 'alert alert-info' }, 'Create accounts in Supabase (Authentication → Users). New users start as Viewer (read-only) and appear here for you to promote.'),
    host,
  )

  async function changeRole(user, select) {
    const next = select.value
    if (next === user.role) return
    const ok = await confirmDialog({
      title: 'Change role?',
      body: `${user.full_name || user.email} will become ${ROLE_LABEL[next]} (currently ${ROLE_LABEL[user.role] || user.role}).`,
      confirmText: 'Change role',
    })
    if (!ok) { select.value = user.role; return }
    select.disabled = true
    try {
      await setUserRole(user.id, next)
      toast('Role updated.', 'success')
      await load()
    } catch (e) {
      select.value = user.role
      toast(toAppError(e).message, 'error')
    } finally { select.disabled = false }
  }

  async function load() {
    host.replaceChildren(spinner('Loading users…'))
    try {
      const list = await listProfiles()
      if (!ctx.isCurrent()) return
      if (!list.length) return host.replaceChildren(emptyState({ iconName: 'users', title: 'No users' }))

      const roleCell = (u) => {
        if (u.id === auth.user.id) return h('span', null, badge(ROLE_LABEL[u.role] || u.role, 'primary'), ' ', h('span', { class: 'muted small' }, '(you)'))
        const s = h('select', { 'aria-label': `Role for ${u.full_name || u.email}`, class: 'select-sm' },
          ROLES.map((r) => h('option', { value: r, selected: r === u.role }, ROLE_LABEL[r])))
        s.addEventListener('change', () => changeRole(u, s))
        return s
      }
      host.replaceChildren(
        h('div', { class: 'table-wrap desk-only' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['Name', 'Email', 'Role', 'Joined'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, list.map((u) => h('tr', null,
            h('td', { class: 'strong' }, u.full_name || '—'), h('td', { class: 'muted' }, u.email || '—'),
            h('td', null, roleCell(u)), h('td', { class: 'muted' }, formatShortDate((u.created_at || '').slice(0, 10)))))))),
        h('div', { class: 'entry-cards mobile-only' }, list.map((u) => h('div', { class: 'entry-card' },
          h('p', { class: 'strong' }, u.full_name || '—'), h('p', { class: 'muted' }, u.email || '—'), roleCell(u)))),
      )
    } catch (e) {
      if (ctx.isCurrent()) host.replaceChildren(errorState(e, load))
    }
  }
  await load()
}
