import { h, fmtNum, trusted } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { getReportSummary, getAllReportRows, getDashboardStats, listCatalog } from '../lib/api.js'
import { addDaysISO, formatDayMonth, formatShortDate, formatLogDate, todayISO } from '../lib/dates.js'
import { toCsv, downloadCsv } from '../lib/csv.js'
import { emptyState, errorState, field, pageHeader, select, spinner, statCard, toast, withBusy } from '../lib/ui.js'
import { toAppError } from '../lib/errors.js'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export default async function reports(ctx) {
  const today = todayISO()
  const filters = { from: addDaysISO(today, -29), to: today, machineId: '', partId: '' }

  const from = h('input', { type: 'date', value: filters.from })
  const to = h('input', { type: 'date', value: filters.to })
  const machine = select([{ value: '', label: 'All machines' }], '')
  const part = select([{ value: '', label: 'All parts' }], '')
  const rangeErr = h('p', { class: 'field-error', hidden: true })
  const exportBtn = h('button', { class: 'btn', type: 'button' }, icon('download', 16), 'Export CSV')
  const host = h('div', { class: 'stack-lg' })
  let lastReq = 0

  ctx.root.replaceChildren(
    pageHeader('Reports', 'Production analytics from your recorded logs', exportBtn),
    h('form', { class: 'filters card', onsubmit: (e) => e.preventDefault() },
      h('div', { class: 'filter-grid' }, field('From', from), field('To', to), field('Machine', machine), field('Part', part)),
      rangeErr,
      h('div', { class: 'filter-foot' },
        h('div', { class: 'chips' },
          ...[['Last 7 days', 6], ['Last 30 days', 29], ['Last 90 days', 89]].map(([label, d]) =>
            h('button', { class: 'chip', type: 'button', onclick: () => { from.value = addDaysISO(today, -d); to.value = today; apply() } }, label)
          ),
          h('button', { class: 'chip', type: 'button', onclick: () => { from.value = ''; to.value = ''; apply() } }, 'All time')))),
    host
  )

  Promise.all([listCatalog('machines'), listCatalog('parts')]).then(([ms, ps]) => {
    ms.forEach((m) => machine.append(h('option', { value: m.id }, `${m.machine_code} — ${m.machine_name}`)))
    ps.forEach((p) => part.append(h('option', { value: p.id }, `${p.part_code} — ${p.part_name}`)))
  }).catch(() => {})

  function readFilters() {
    filters.from = from.value
    filters.to = to.value
    filters.machineId = machine.value
    filters.partId = part.value
    const bad = filters.from && filters.to && filters.from > filters.to
    rangeErr.textContent = bad ? '"From" must be on or before "To".' : ''
    rangeErr.hidden = !bad
    return !bad
  }

  function rangeLabel() {
    if (!filters.from && !filters.to) return 'All time'
    return `${filters.from ? formatShortDate(filters.from) : 'Start'} – ${filters.to ? formatShortDate(filters.to) : 'today'}`
  }

  // ------------------------------------------------------------------ charts
  function dayChart(days) {
    const W = 720, H = 220, pl = 44, pr = 8, pt = 12, pb = 28
    const max = Math.max(...days.map((d) => d.quantity), 1)
    const step = Math.pow(10, Math.floor(Math.log10(max)))
    const top = Math.ceil(max / step) * step
    const bw = (W - pl - pr) / days.length
    const bar = Math.max(Math.min(bw * 0.7, 36), 2)
    const labelEvery = Math.ceil(days.length / 8)
    const grid = [0, 0.5, 1].map((t) => {
      const y = pt + (H - pt - pb) * (1 - t)
      return `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" class="axis">${fmtNum(Math.round(top * t))}</text>`
    }).join('')
    const bars = days.map((d, i) => {
      const bh = ((H - pt - pb) * d.quantity) / top
      const x = pl + bw * i + (bw - bar) / 2
      return `<rect x="${x}" y="${H - pb - bh}" width="${bar}" height="${Math.max(bh, d.quantity ? 1 : 0)}" rx="2" class="bar"><title>${esc(formatLogDate(d.date))}: ${fmtNum(d.quantity)} pieces</title></rect>` +
        (i % labelEvery === 0 ? `<text x="${x + bar / 2}" y="${H - 8}" text-anchor="middle" class="axis">${esc(formatDayMonth(d.date))}</text>` : '')
    }).join('')
    return trusted(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Production by day, ${days.length} days">${grid}${bars}</svg>`)
  }

  function aggregateTable(items, title, codeLabel, nameLabel) {
    return h('section', { class: 'card' },
      h('h2', null, title),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, codeLabel),
            h('th', { scope: 'col' }, nameLabel),
            h('th', { scope: 'col', class: 'num' }, 'Pieces'))),
          h('tbody', null,
            items.map((item) => h('tr', null,
              h('td', { class: 'code' }, item.code),
              h('td', null, item.name),
              h('td', { class: 'num' }, fmtNum(item.quantity)))),
            h('tr', { class: 'table-total' },
              h('th', { scope: 'row', colspan: 2 }, 'Total'),
              h('th', { class: 'num' }, fmtNum(items.reduce((sum, item) => sum + item.quantity, 0))))))))
  }

  async function load() {
    const my = ++lastReq
    host.replaceChildren(spinner('Crunching production numbers…'))
    try {
      const [s, todayStats] = await Promise.all([getReportSummary(filters), getDashboardStats(today)])
      if (my !== lastReq || !ctx.isCurrent()) return
      if (!s.entry_count) {
        host.replaceChildren(
          h('section', { class: 'stats' }, statCard("Today's production", fmtNum(todayStats.today_quantity), 'all machines & parts')),
          emptyState({ iconName: 'chart', title: 'No production in this selection', text: 'Try a wider date range or remove the machine/part filter.' })
        )
        return
      }
      host.replaceChildren(
        h('p', { class: 'muted small' }, `Showing ${rangeLabel()}`),
        h('section', { class: 'stats', 'aria-label': 'Summary' },
          statCard('Total production', fmtNum(s.total_quantity), 'pieces in selection', 'primary'),
          statCard('Production logs', fmtNum(s.log_count)),
          statCard('Production entries', fmtNum(s.entry_count)),
          statCard("Today's production", fmtNum(todayStats.today_quantity), 'all machines & parts')),
        h('section', { class: 'card' },
          h('div', { class: 'section-head' }, h('h2', null, 'Production by day')),
          dayChart(s.by_day),
          h('details', { class: 'tbl-details' }, h('summary', null, 'View as table'),
            h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
              h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col', class: 'num' }, 'Pieces'))),
              h('tbody', null,
                [...s.by_day].reverse().map((d) => h('tr', null, h('td', null, formatLogDate(d.date)), h('td', { class: 'num' }, fmtNum(d.quantity)))),
                h('tr', { class: 'table-total' },
                  h('th', { scope: 'row' }, 'Total'),
                  h('th', { class: 'num' }, fmtNum(s.total_quantity)))))))),
        h('div', { class: 'two-col' },
          aggregateTable(s.by_machine, 'By machine', 'Machine code', 'Machine name'),
          aggregateTable(s.by_part, 'By part', 'Part code', 'Part name')),
      )
    } catch (e) {
      if (my === lastReq && ctx.isCurrent()) { host.replaceChildren(errorState(e, load)) }
    }
  }

  function apply() { if (readFilters()) load() }
  for (const el of [from, to, machine, part]) el.addEventListener('change', apply)

  exportBtn.addEventListener('click', () => withBusy(exportBtn, async () => {
    if (!readFilters()) return
    try {
      const rows = await getAllReportRows(filters) // same filters as on screen
      if (!rows.length) return toast('Nothing to export for this selection.', 'info')
      const csv = toCsv(
        ['Log ID', 'Date', 'Machine code', 'Machine name', 'Part code', 'Part name', 'Quantity', 'Entry notes', 'Log notes'],
        rows.map((r) => [r.log_id, r.log_date, r.machine_code, r.machine_name, r.part_code, r.part_name, r.quantity, r.entry_notes, r.log_notes]))
      downloadCsv(`svr-production_${filters.from || 'start'}_to_${filters.to || 'latest'}.csv`, csv)
      toast(`Exported ${fmtNum(rows.length)} rows.`, 'success')
    } catch (e) { toast(toAppError(e).message, 'error') }
  }))

  await load()
}
