import { h, fmtNum, debounce } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { auth, can } from '../lib/auth.js'
import { listLogs, listCatalog, PAGE_SIZE } from '../lib/api.js'
import { formatLogDate, formatWeekday } from '../lib/dates.js'
import { emptyState, errorState, field, pageHeader, select, spinner, withBusy } from '../lib/ui.js'
import { logCard } from './logcard.js'

export default async function history(ctx) {
  const perms = can(auth.profile.role)
  const filters = { search: '', date: '', from: '', to: '', machineId: '', partId: '' }
  let rows = []
  let total = 0
  let page = 0
  let reqId = 0
  const collapsed = new Set()

  const search = h('input', { type: 'search', placeholder: 'Log number or notes', 'aria-label': 'Search' })
  const date = h('input', { type: 'date' })
  const from = h('input', { type: 'date' })
  const to = h('input', { type: 'date' })
  const machine = select([{ value: '', label: 'All machines' }], '')
  const part = select([{ value: '', label: 'All parts' }], '')
  const rangeNote = h('p', { class: 'field-error', hidden: true })
  const clearBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('x', 14), 'Clear filters')
  const refresh = h('button', { class: 'btn', type: 'button' }, icon('refresh', 16), 'Refresh')
  const results = h('div', { class: 'stack-lg' })
  const summary = h('p', { class: 'muted small', 'aria-live': 'polite' })

  const toolbar = h('form', { class: 'filters card', onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'filter-grid' },
      field('Search', search),
      field('Exact date', date),
      field('From', from),
      field('To', to),
      field('Machine', machine),
      field('Part', part)),
    rangeNote,
    h('div', { class: 'filter-foot' }, summary, clearBtn))

  ctx.root.replaceChildren(
    pageHeader('Production history', 'Logs grouped by production date, newest first', refresh,
      perms.createLog && h('a', { class: 'btn btn-primary', href: '#/log/new' }, icon('plus', 16), 'Add log')),
    toolbar,
    results,
  )

  // Machine / part filter options (all, so history of retired ones stays filterable).
  listCatalog('machines').then((ms) => {
    for (const m of ms) machine.append(h('option', { value: m.id }, `${m.machine_code} — ${m.machine_name}${m.is_active ? '' : ' (inactive)'}`))
  }).catch(() => {})
  listCatalog('parts').then((ps) => {
    for (const p of ps) part.append(h('option', { value: p.id }, `${p.part_code} — ${p.part_name}${p.is_active ? '' : ' (inactive)'}`))
  }).catch(() => {})

  const hasFilters = () => Object.values(filters).some(Boolean)

  function renderResults({ loadingMore = false, moreError = null } = {}) {
    summary.textContent = total ? `Showing ${fmtNum(rows.length)} of ${fmtNum(total)} log${total === 1 ? '' : 's'}` : ''
    clearBtn.hidden = !hasFilters()
    if (!rows.length) {
      results.replaceChildren(emptyState({
        iconName: 'search',
        title: hasFilters() ? 'No logs match these filters' : 'No production logs yet',
        text: hasFilters() ? 'Try widening the date range or clearing a filter.' : 'Logs will appear here once production is recorded.',
        action: hasFilters() ? h('button', { class: 'btn', type: 'button', onclick: clearAll }, 'Clear filters') : null,
      }))
      return
    }
    // Group by the database's log_date (NOT created_at). Rows arrive sorted
    // log_date desc, id desc, so insertion order is already correct.
    const groups = new Map()
    for (const r of rows) (groups.get(r.log_date) || groups.set(r.log_date, []).get(r.log_date)).push(r)

    const nodes = [...groups].map(([d, logs]) => {
      const isOpen = !collapsed.has(d)
      const dayTotal = logs.reduce((s, l) => s + l.total_quantity, 0)
      const head = h('button', { class: 'group-head', type: 'button', 'aria-expanded': String(isOpen) },
        icon(isOpen ? 'down' : 'right', 18),
        h('span', { class: 'group-date' }, formatLogDate(d)),
        h('span', { class: 'muted small group-day' }, formatWeekday(d)),
        h('span', { class: 'group-total' }, `${fmtNum(dayTotal)} pcs`))
      const list = h('div', { class: 'list', hidden: !isOpen }, logs.map(logCard))
      head.addEventListener('click', () => {
        const open = head.getAttribute('aria-expanded') !== 'true'
        head.setAttribute('aria-expanded', String(open))
        head.firstChild.replaceWith(icon(open ? 'down' : 'right', 18))
        list.hidden = !open
        open ? collapsed.delete(d) : collapsed.add(d)
      })
      return h('section', { class: 'group', 'aria-label': formatLogDate(d) }, head, list)
    })

    const more = rows.length < total && h('div', { class: 'center' },
      moreError && h('p', { class: 'field-error' }, moreError),
      h('button', { class: 'btn', type: 'button', disabled: loadingMore, onclick: (e) => withBusy(e.currentTarget, () => load(false)) },
        loadingMore ? 'Loading…' : `Load ${Math.min(PAGE_SIZE, total - rows.length)} more`))
    results.replaceChildren(...nodes, more || '')
  }

  async function load(reset = true) {
    const my = ++reqId // ignore responses that arrive out of order
    if (reset) {
      page = 0
      results.replaceChildren(spinner('Loading history…'))
    }
    try {
      const res = await listLogs(filters, reset ? 0 : page + 1)
      if (my !== reqId || !ctx.isCurrent()) return
      if (reset) rows = res.rows
      else { rows = rows.concat(res.rows); page += 1 }
      total = res.total
      renderResults()
    } catch (e) {
      if (my !== reqId || !ctx.isCurrent()) return
      if (reset) results.replaceChildren(errorState(e, () => load(true)))
      else renderResults({ moreError: e.message })
    }
  }

  function validateRange() {
    const bad = filters.from && filters.to && filters.from > filters.to
    rangeNote.textContent = bad ? '"From" must be on or before "To".' : ''
    rangeNote.hidden = !bad
    return !bad
  }

  function apply() {
    // An exact date and a date range are mutually exclusive.
    from.disabled = to.disabled = Boolean(filters.date)
    date.disabled = Boolean(filters.from || filters.to)
    if (validateRange()) load(true)
  }

  function clearAll() {
    Object.keys(filters).forEach((k) => (filters[k] = ''))
    for (const el of [search, date, from, to]) el.value = ''
    machine.value = part.value = ''
    apply()
  }

  const debounced = debounce(() => { filters.search = search.value; apply() }, 350)
  search.addEventListener('input', debounced)
  date.addEventListener('change', () => { filters.date = date.value; apply() })
  from.addEventListener('change', () => { filters.from = from.value; apply() })
  to.addEventListener('change', () => { filters.to = to.value; apply() })
  machine.addEventListener('change', () => { filters.machineId = machine.value; apply() })
  part.addEventListener('change', () => { filters.partId = part.value; apply() })
  clearBtn.addEventListener('click', clearAll)
  refresh.addEventListener('click', () => withBusy(refresh, () => load(true)))

  await load(true)
}
