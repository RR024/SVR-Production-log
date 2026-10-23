import { h, fmtNum } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { auth, can } from '../lib/auth.js'
import { getLog, deleteLog } from '../lib/api.js'
import { formatLogDate, formatWeekday, formatTimestamp } from '../lib/dates.js'
import { badge, confirmDialog, errorState, pageHeader, spinner, statCard, toast, withBusy } from '../lib/ui.js'
import { toAppError } from '../lib/errors.js'
import { navigate } from '../lib/router.js'

export default async function detail(ctx) {
  const id = Number(ctx.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    ctx.root.replaceChildren(errorState(new Error('That is not a valid log number.')))
    return
  }
  const perms = can(auth.profile.role)
  const body = h('div', { class: 'stack-lg' })
  ctx.root.replaceChildren(body)

  async function load() {
    body.replaceChildren(spinner('Loading production log…'))
    try {
      const log = await getLog(id)
      if (!ctx.isCurrent()) return
      body.replaceChildren(...view(log))
    } catch (e) {
      if (ctx.isCurrent()) body.replaceChildren(backLink(), errorState(e, toAppError(e).kind === 'notfound' ? null : load))
    }
  }

  const backLink = () => h('a', { class: 'link back no-print', href: '#/history' }, icon('left', 16), 'Back to history')

  function view(log) {
    const refresh = h('button', { class: 'btn', type: 'button', onclick: (e) => withBusy(e.currentTarget, load) }, icon('refresh', 16), 'Refresh')
    const print = h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, icon('print', 16), 'Print')
    const edit = perms.editLog && h('a', { class: 'btn', href: `#/log/${log.id}/edit` }, icon('edit', 16), 'Edit')
    const del = perms.deleteLog && h('button', { class: 'btn btn-danger-outline', type: 'button', onclick: (e) => onDelete(log, e.currentTarget) }, icon('trash', 16), 'Delete')

    const actions = h('div', { class: 'page-actions no-print' }, refresh, print, edit, del)
    const head = h('header', { class: 'page-head' },
      h('div', null,
        h('h1', null, `Production Log #${log.id}`),
        h('p', { class: 'muted' }, `${formatWeekday(log.log_date)}, ${formatLogDate(log.log_date)}`)),
      actions)

    const stats = h('section', { class: 'stats stats-3', 'aria-label': 'Totals' },
      statCard('Total quantity', fmtNum(log.total_quantity), 'pieces (sum of entries)', 'primary'),
      statCard('Production entries', fmtNum(log.entries.length)),
      statCard('Production date', formatLogDate(log.log_date)))

    const meta = h('dl', { class: 'meta card' },
      h('div', null, h('dt', null, 'Notes'), h('dd', { class: 'prewrap' }, log.notes?.trim() || '—')),
      h('div', null, h('dt', null, 'Created by'), h('dd', null, log.creator_name || '—')),
      h('div', null, h('dt', null, 'Created'), h('dd', null, formatTimestamp(log.created_at))),
      h('div', null, h('dt', null, 'Last updated'), h('dd', null, formatTimestamp(log.updated_at))))

    const nameCell = (code, name, active) =>
      h('div', null, h('span', { class: 'strong' }, name), ' ', h('span', { class: 'code' }, code), !active && [' ', badge('Inactive', 'muted')])

    const table = h('div', { class: 'table-wrap desk-only' },
      h('table', { class: 'table' },
        h('caption', { class: 'sr-only' }, `Entries for production log ${log.id}`),
        h('thead', null, h('tr', null,
          ['Machine', 'Machine code', 'Part', 'Part code'].map((t) => h('th', { scope: 'col' }, t)),
          h('th', { scope: 'col', class: 'num' }, 'Quantity'),
          h('th', { scope: 'col' }, 'Notes'))),
        h('tbody', null, log.entries.map((e) =>
          h('tr', null,
            h('td', null, e.machine.machine_name, !e.machine.is_active && [' ', badge('Inactive', 'muted')]),
            h('td', { class: 'code' }, e.machine.machine_code),
            h('td', null, e.part.part_name, !e.part.is_active && [' ', badge('Inactive', 'muted')]),
            h('td', { class: 'code' }, e.part.part_code),
            h('td', { class: 'num strong' }, fmtNum(e.quantity)),
            h('td', { class: 'muted' }, e.notes || '—')))),
        h('tfoot', null, h('tr', null,
          h('th', { scope: 'row', colspan: 4 }, 'Total'),
          h('td', { class: 'num strong' }, fmtNum(log.total_quantity)),
          h('td')))))

    const cards = h('div', { class: 'entry-cards mobile-only' }, log.entries.map((e) =>
      h('div', { class: 'entry-card' },
        h('div', { class: 'entry-qty' }, fmtNum(e.quantity), h('span', { class: 'muted small' }, ' pcs')),
        h('p', { class: 'muted small label' }, 'Machine'),
        nameCell(e.machine.machine_code, e.machine.machine_name, e.machine.is_active),
        h('p', { class: 'muted small label' }, 'Part'),
        nameCell(e.part.part_code, e.part.part_name, e.part.is_active),
        e.notes && [h('p', { class: 'muted small label' }, 'Notes'), h('p', null, e.notes)])))

    return [
      backLink(), head, stats, meta,
      h('section', null, h('div', { class: 'section-head' }, h('h2', null, 'Production entries')), table, cards),
    ]
  }

  async function onDelete(log, btn) {
    const ok = await confirmDialog({
      title: `Delete Production Log #${log.id}?`,
      body: h('div', { class: 'stack' },
        h('p', null, `This permanently deletes the log for ${formatLogDate(log.log_date)} and all ${log.entries.length} of its production entries (${fmtNum(log.total_quantity)} pieces).`),
        h('p', { class: 'strong' }, 'This cannot be undone.')),
      confirmText: 'Delete log',
      danger: true,
    })
    if (!ok) return
    await withBusy(btn, async () => {
      try {
        await deleteLog(log.id)
        toast(`Production Log #${log.id} deleted.`, 'success')
        navigate('/history')
      } catch (e) {
        toast(toAppError(e).message, 'error')
      }
    })
  }

  await load()
}
