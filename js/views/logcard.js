import { h, fmtNum } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { formatLogDate, formatWeekday } from '../lib/dates.js'

/** Clickable production-log card (dashboard + history). */
export function logCard(log) {
  const notes = (log.notes || '').trim()
  return h('a', { class: 'log-card', href: `#/log/${log.id}`, 'aria-label': `Production Log #${log.id}, ${formatLogDate(log.log_date)}, ${fmtNum(log.total_quantity)} pieces` },
    h('div', { class: 'log-card-main' },
      h('div', { class: 'log-card-top' },
        h('span', { class: 'log-id' }, `Production Log #${log.id}`),
        h('span', { class: 'muted small' }, `${formatWeekday(log.log_date)}, ${formatLogDate(log.log_date)}`)),
      h('p', { class: notes ? 'log-notes' : 'log-notes muted' }, notes || 'No notes'),
      h('p', { class: 'muted small' },
        `${fmtNum(log.entry_count)} ${log.entry_count === 1 ? 'entry' : 'entries'}`,
        log.creator_name ? ` · by ${log.creator_name}` : '')),
    h('div', { class: 'log-card-total' },
      h('span', { class: 'big-num' }, fmtNum(log.total_quantity)),
      h('span', { class: 'muted small' }, 'pieces')),
    icon('right', 18, 'chev'),
  )
}
