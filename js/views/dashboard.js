import { h, fmtNum } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { auth, can } from '../lib/auth.js'
import { getDashboardStats, recentLogs } from '../lib/api.js'
import { todayISO, formatLogDate } from '../lib/dates.js'
import { emptyState, errorState, pageHeader, spinner, statCard, withBusy } from '../lib/ui.js'
import { logCard } from './logcard.js'

export default async function dashboard(ctx) {
  const perms = can(auth.profile.role)
  const body = h('div', { class: 'stack-lg' })
  const refresh = h('button', { class: 'btn', type: 'button' }, icon('refresh', 16), 'Refresh')
  const first = (auth.profile.full_name || '').split(' ')[0]

  ctx.root.replaceChildren(
    pageHeader(first ? `Welcome, ${first}` : 'Dashboard', `Today is ${formatLogDate(todayISO())}`,
      refresh,
      perms.createLog && h('a', { class: 'btn btn-primary', href: '#/log/new' }, icon('plus', 16), 'Add production log')),
    body,
  )

  async function load() {
    body.replaceChildren(spinner('Loading dashboard…'))
    try {
      // Real data only: stats and recent logs come straight from Supabase.
      const [stats, recent] = await Promise.all([getDashboardStats(todayISO()), recentLogs(5)])
      if (!ctx.isCurrent()) return
      body.replaceChildren(
        h('section', { class: 'stats', 'aria-label': 'Summary' },
          statCard("Today's production", fmtNum(stats.today_quantity), 'pieces logged today', 'primary'),
          statCard('Total production logs', fmtNum(stats.total_logs), 'daily logs recorded'),
          statCard('Active machines', fmtNum(stats.active_machines)),
          statCard('Active parts', fmtNum(stats.active_parts))),
        h('section', null,
          h('div', { class: 'section-head' },
            h('h2', null, 'Recent production logs'),
            h('a', { class: 'link', href: '#/history' }, 'View all history')),
          recent.length
            ? h('div', { class: 'list' }, recent.map(logCard))
            : emptyState({ iconName: 'inbox', title: 'No production logs yet',
                text: perms.createLog ? 'Record the first day of production to see it here.' : 'Logs will appear here once a supervisor records them.',
                action: perms.createLog && h('a', { class: 'btn btn-primary', href: '#/log/new' }, icon('plus', 16), 'Add production log') })),
      )
    } catch (e) {
      if (ctx.isCurrent()) body.replaceChildren(errorState(e, load))
    }
  }

  refresh.addEventListener('click', () => withBusy(refresh, load))
  await load()
}
