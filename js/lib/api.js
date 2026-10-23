import { sb } from './supabase.js'
import { AppError, unwrap } from './errors.js'

export const PAGE_SIZE = 20
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

// ---------------------------------------------------------------- production
const normSummary = (r) => ({ ...r, total_quantity: Number(r.total_quantity), entry_count: Number(r.entry_count) })

/** filters: { search, date, from, to, machineId, partId } */
export async function listLogs(filters, page = 0) {
  const rows =
    unwrap(
      await sb.rpc('list_production_logs', {
        p_search: filters.search?.trim() || null,
        p_date: filters.date || null,
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_machine_id: num(filters.machineId),
        p_part_id: num(filters.partId),
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      }),
    ) || []
  return { rows: rows.map(normSummary), total: rows.length ? Number(rows[0].total_count) : 0 }
}

export async function recentLogs(limit = 5) {
  const rows = unwrap(await sb.rpc('list_production_logs', { p_limit: limit, p_offset: 0 })) || []
  return rows.map(normSummary)
}

export async function getLog(id) {
  const header = unwrap(
    await sb.from('production_logs').select('id, log_date, notes, created_by, created_at, updated_at').eq('id', id).maybeSingle(),
  )
  if (!header) throw new AppError(`Production log #${id} was not found. It may have been deleted.`, 'notfound')

  const entries = unwrap(
    await sb
      .from('production_entries')
      .select(
        'id, quantity, notes, machine_id, part_id, machine:machines(id, machine_code, machine_name, is_active), part:parts(id, part_code, part_name, is_active)',
      )
      .eq('log_id', id)
      .order('id'),
  )

  let creatorName = null
  if (header.created_by) {
    const { data } = await sb.from('profiles').select('full_name').eq('id', header.created_by).maybeSingle()
    creatorName = data?.full_name || null
  }
  return {
    ...header,
    creator_name: creatorName,
    entries,
    // Always derived from the entries — never a stored or editable number.
    total_quantity: entries.reduce((s, e) => s + e.quantity, 0),
  }
}

const rpcEntries = (input) =>
  input.entries.map((e) => ({
    machine_id: Number(e.machineId),
    part_id: Number(e.partId),
    quantity: Number(e.quantity),
    notes: e.notes?.trim() || null,
  }))

export async function createLog(input) {
  return Number(
    unwrap(
      await sb.rpc('create_production_log', {
        p_log_date: input.logDate,
        p_notes: input.notes?.trim() || null,
        p_entries: rpcEntries(input),
      }),
    ),
  )
}

export async function updateLog(id, input) {
  return Number(
    unwrap(
      await sb.rpc('update_production_log', {
        p_log_id: id,
        p_log_date: input.logDate,
        p_notes: input.notes?.trim() || null,
        p_entries: rpcEntries(input),
      }),
    ),
  )
}

export async function deleteLog(id) {
  unwrap(await sb.rpc('delete_production_log', { p_log_id: id }))
}

/** Existing log for a date (used to point the user at it instead of failing). */
export async function findLogByDate(date) {
  const row = unwrap(await sb.from('production_logs').select('id').eq('log_date', date).maybeSingle())
  return row?.id ?? null
}

export async function getDashboardStats(today) {
  const s = unwrap(await sb.rpc('dashboard_stats', { p_today: today }))
  return {
    active_machines: Number(s.active_machines),
    active_parts: Number(s.active_parts),
    total_logs: Number(s.total_logs),
    today_quantity: Number(s.today_quantity),
  }
}

// ------------------------------------------------------------------- reports
const reportArgs = (f) => ({
  p_from: f.from || null,
  p_to: f.to || null,
  p_machine_id: num(f.machineId),
  p_part_id: num(f.partId),
})

export async function getReportSummary(f) {
  const s = unwrap(await sb.rpc('report_summary', reportArgs(f)))
  return {
    total_quantity: Number(s.total_quantity),
    log_count: Number(s.log_count),
    entry_count: Number(s.entry_count),
    by_day: s.by_day.map((d) => ({ date: d.date, quantity: Number(d.quantity) })),
    by_machine: s.by_machine.map((m) => ({ ...m, quantity: Number(m.quantity) })),
    by_part: s.by_part.map((p) => ({ ...p, quantity: Number(p.quantity) })),
  }
}

/** Every row matching the filters, paged under the hood, for CSV export. */
export async function getAllReportRows(f) {
  const PAGE = 1000
  const MAX_PAGES = 50
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const chunk = unwrap(await sb.rpc('report_rows', { ...reportArgs(f), p_limit: PAGE, p_offset: page * PAGE }))
    all.push(...chunk)
    if (chunk.length < PAGE) return all
  }
  throw new AppError('Too many rows to export at once. Narrow the date range and try again.', 'validation')
}

// ------------------------------------------------- machines & parts (catalog)
export const CATALOGS = {
  machines: { table: 'machines', code: 'machine_code', name: 'machine_name', label: 'Machine' },
  parts: { table: 'parts', code: 'part_code', name: 'part_name', label: 'Part' },
}

export async function listCatalog(kind, { activeOnly = false } = {}) {
  const c = CATALOGS[kind]
  let q = sb.from(c.table).select(`id, ${c.code}, ${c.name}, description, is_active, created_at`).order(c.code)
  if (activeOnly) q = q.eq('is_active', true)
  return unwrap(await q)
}

export async function saveCatalogItem(kind, id, values) {
  const c = CATALOGS[kind]
  const row = {
    [c.code]: values.code.trim(),
    [c.name]: values.name.trim(),
    description: values.description?.trim() || null,
  }
  try {
    if (id) unwrap(await sb.from(c.table).update(row).eq('id', id))
    else unwrap(await sb.from(c.table).insert({ ...row, is_active: true }))
  } catch (e) {
    if (e.kind === 'conflict') throw new AppError(`The ${c.label.toLowerCase()} code "${row[c.code]}" is already in use.`, 'conflict')
    throw e
  }
}

export async function setCatalogActive(kind, id, isActive) {
  unwrap(await sb.from(CATALOGS[kind].table).update({ is_active: isActive }).eq('id', id))
}

// --------------------------------------------------------------------- users
export async function listProfiles() {
  return unwrap(await sb.from('profiles').select('id, full_name, email, role, created_at').order('created_at'))
}

export async function setUserRole(userId, role) {
  unwrap(await sb.rpc('set_user_role', { p_user_id: userId, p_role: role }))
}
