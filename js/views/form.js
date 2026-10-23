import { h, fmtNum } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createLog, updateLog, getLog, listCatalog, findLogByDate } from '../lib/api.js'
import { isValidIsoDate, todayISO, formatLogDate } from '../lib/dates.js'
import { errorState, field, spinner, toast, withBusy, pageHeader } from '../lib/ui.js'
import { toAppError } from '../lib/errors.js'
import { navigate, setGuard, clearGuard } from '../lib/router.js'
import { pwa } from '../lib/pwa.js'

let keySeq = 0
const newRow = (r = {}) => ({ key: ++keySeq, machineId: '', partId: '', quantity: '', notes: '', ...r })

export default async function logForm(ctx) {
  const editingId = ctx.params.id ? Number(ctx.params.id) : null
  const isEdit = editingId !== null
  ctx.root.replaceChildren(spinner(isEdit ? 'Loading log…' : 'Preparing form…'))

  let machines, parts, existing
  try {
    ;[machines, parts, existing] = await Promise.all([
      listCatalog('machines'),
      listCatalog('parts'),
      isEdit ? getLog(editingId) : null,
    ])
  } catch (e) {
    if (ctx.isCurrent()) ctx.root.replaceChildren(errorState(e, () => logForm(ctx)))
    return
  }
  if (!ctx.isCurrent()) return

  // Only ACTIVE records are selectable — except ones this log already uses, so
  // an old log stays editable after a machine/part is deactivated.
  const usedMachines = new Set(existing?.entries.map((e) => e.machine_id))
  const usedParts = new Set(existing?.entries.map((e) => e.part_id))
  const machineOpts = machines.filter((m) => m.is_active || usedMachines.has(m.id))
  const partOpts = parts.filter((p) => p.is_active || usedParts.has(p.id))

  const state = {
    logDate: existing?.log_date || todayISO(),
    notes: existing?.notes || '',
    rows: existing
      ? existing.entries.map((e) => newRow({ machineId: String(e.machine_id), partId: String(e.part_id), quantity: String(e.quantity), notes: e.notes || '' }))
      : [],
  }
  for (const machine of machineOpts) {
    if (!state.rows.some((row) => row.machineId === String(machine.id))) {
      state.rows.push(newRow({ machineId: String(machine.id) }))
    }
  }
  const initial = JSON.stringify([state.logDate, state.notes, state.rows.map((r) => [r.machineId, r.partId, r.quantity, r.notes])])
  const snapshot = () => JSON.stringify([state.logDate, state.notes, state.rows.map((r) => [r.machineId, r.partId, r.quantity, r.notes])])
  let saved = false
  const dirty = () => !saved && snapshot() !== initial

  setGuard(() => !dirty() || confirm('You have unsaved changes. Leave this page and lose them?'))
  const beforeUnload = (e) => { if (dirty()) { e.preventDefault(); e.returnValue = '' } }
  window.addEventListener('beforeunload', beforeUnload)
  ctx.onLeave(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    clearGuard()
  })

  // ------------------------------------------------------------- header form
  const dateInput = h('input', { type: 'date', required: true, value: state.logDate })
  const dateField = field('Production date', dateInput)
  const notesInput = h('textarea', { rows: 3, maxlength: 1000, placeholder: 'Shift remarks, downtime, anything worth recording (optional)' })
  notesInput.value = state.notes
  const notesField = field('Daily notes', notesInput)

  dateInput.addEventListener('input', () => { state.logDate = dateInput.value; dateField.setError('') })
  notesInput.addEventListener('input', () => (state.notes = notesInput.value))

  // ----------------------------------------------------------------- entries
  const rowsHost = h('div', { class: 'entry-rows' })
  const totalEl = h('strong', { class: 'big-num' }, '0')
  const countEl = h('span', { class: 'muted' })
  const formError = h('div', { class: 'alert alert-error', role: 'alert', hidden: true })
  let rowErrors = {} // key -> { machine, part, quantity }

  const total = () => state.rows.reduce((s, r) => s + (r.partId && /^\d+$/.test(r.quantity) ? Number(r.quantity) : 0), 0)
  const updateTotal = () => {
    totalEl.textContent = fmtNum(total())
    const count = state.rows.filter((r) => r.partId || r.quantity !== '').length
    countEl.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`
  }

  const opt = (value, label) => h('option', { value }, label)

  function renderRows(focusLast = false) {
    rowsHost.replaceChildren(...machineOpts.map((machineDef) => {
      const machineRows = state.rows.filter((row) => row.machineId === String(machineDef.id))
      const cardRows = machineRows.length ? machineRows : [newRow({ machineId: String(machineDef.id) })]
      const list = h('div', { class: 'machine-entry-list' })
      cardRows.forEach((row, rowIndex) => {
        const errs = rowErrors[row.key] || {}
        const part = h('select', { 'aria-label': `${machineDef.machine_name} entry ${rowIndex + 1} part` },
          opt('', 'Select part'),
          partOpts.map((p) => opt(p.id, `${p.part_code} — ${p.part_name}${p.is_active ? '' : ' (inactive)'}`)))
        part.value = row.partId
        const qty = h('input', { type: 'number', inputmode: 'numeric', min: 0, step: 1, placeholder: '0', 'aria-label': `${machineDef.machine_name} entry ${rowIndex + 1} quantity` })
        qty.value = row.quantity
        const notes = h('input', { type: 'text', maxlength: 300, placeholder: 'Entry note (optional)', 'aria-label': `${machineDef.machine_name} entry ${rowIndex + 1} note` })
        notes.value = row.notes
        const f = {
          part: field('Part', part, { error: errs.part }),
          quantity: field('Quantity', qty, { error: errs.quantity }),
        }
        const clearErr = (k) => { f[k].setError(''); if (rowErrors[row.key]) delete rowErrors[row.key][k] }
        part.addEventListener('change', () => { row.partId = part.value; clearErr('part'); updateTotal() })
        qty.addEventListener('input', () => { row.quantity = qty.value; clearErr('quantity'); updateTotal() })
        notes.addEventListener('input', () => (row.notes = notes.value))
        for (const [k, el] of Object.entries({ part, quantity: qty })) if (errs[k]) el.classList.add('invalid')
        const remove = h('button', { class: 'btn btn-ghost btn-icon remove', type: 'button', 'aria-label': `Remove ${machineDef.machine_name} entry ${rowIndex + 1}`,
          disabled: cardRows.length === 1,
          onclick: () => {
            state.rows = state.rows.filter((r) => r.key !== row.key)
            delete rowErrors[row.key]
            renderRows(); updateTotal()
          } }, icon('trash', 18))
        list.append(h('div', { class: 'machine-entry-line' }, f.part, f.quantity,
          h('div', { class: 'field entry-note' }, h('label', null, 'Note'), notes), remove))
      })
      const addMachineEntry = h('button', { class: 'btn btn-sm machine-add-entry', type: 'button',
        onclick: () => {
          const populatedCount = state.rows.filter((r) => r.partId || r.quantity !== '').length
          if (populatedCount >= 200) return toast('A log can contain at most 200 entries.', 'error')
          state.rows.push(newRow({ machineId: String(machineDef.id) }))
          renderRows(true)
        } }, icon('plus', 16), `Add entry for ${machineDef.machine_name}`)
      return h('div', { class: 'machine-entry-card card' },
        h('div', { class: 'entry-row-head' },
          h('div', null, h('span', { class: 'strong' }, `${machineDef.machine_code} — ${machineDef.machine_name}`),
            h('div', { class: 'muted small machine-entry-count' }, `${machineRows.filter((r) => r.partId || r.quantity !== '').length} ${machineRows.filter((r) => r.partId || r.quantity !== '').length === 1 ? 'entry' : 'entries'}`))),
        list, addMachineEntry)
    }))
    if (focusLast) {
      const selects = rowsHost.querySelectorAll('select')
      selects[selects.length - 1]?.focus()
    }
    updateTotal()
  }

  // -------------------------------------------------------------- validation
  function validate() {
    let ok = true
    rowErrors = {}
    formError.hidden = true
    if (!isValidIsoDate(state.logDate)) { dateField.setError('Choose a valid production date.'); ok = false } else dateField.setError('')
    for (const row of state.rows) {
      const e = {}
      if (!row.partId && row.quantity === '') continue
      if (!row.partId) e.part = 'Select a part.'
      if (row.quantity === '') e.quantity = 'Enter a quantity.'
      else if (!/^\d+$/.test(row.quantity) || Number(row.quantity) > 2147483647) e.quantity = 'Use a whole number, 0 or more.'
      if (Object.keys(e).length) { rowErrors[row.key] = e; ok = false }
    }
    if (!state.rows.some((r) => r.partId && /^\d+$/.test(r.quantity))) { showFormError('Add at least one production entry.'); ok = false }
    renderRows()
    if (!ok) {
      if (formError.hidden) showFormError('Please fix the highlighted fields.')
      ;(document.querySelector('.invalid') || dateInput).focus()
    }
    return ok
  }

  function showFormError(msg, node) {
    formError.replaceChildren(msg, node || '')
    formError.hidden = false
  }

  // -------------------------------------------------------------------- save
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('check', 16), h('span', { class: 'lbl-long' }, isEdit ? 'Save changes' : 'Save production log'), h('span', { class: 'lbl-short' }, 'Save'))

  async function onSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    if (!pwa.online) return showFormError("You're offline. Nothing was saved — reconnect and try again. Your entries are still here.")
    await withBusy(saveBtn, async () => {
      const input = { logDate: state.logDate, notes: state.notes, entries: state.rows.filter((r) => r.partId || r.quantity !== '') }
      try {
        const id = isEdit ? await updateLog(editingId, input) : await createLog(input)
        saved = true
        clearGuard()
        toast(isEdit ? `Production Log #${id} updated.` : `Production Log #${id} saved.`, 'success')
        navigate(`/log/${id}`) // detail re-reads from Supabase, so it shows server-confirmed data
      } catch (e) {
        const err = toAppError(e)
        // Form state is untouched, so nothing the user typed is lost.
        if (err.kind === 'conflict' && /already exists/i.test(err.message)) {
          let link = null
          try {
            const otherId = await findLogByDate(state.logDate)
            if (otherId && otherId !== editingId) link = h('a', { class: 'link', href: `#/log/${otherId}` }, ` Open Log #${otherId}`)
          } catch { /* the message alone is enough */ }
          dateField.setError(`A log for ${formatLogDate(state.logDate)} already exists.`)
          showFormError(err.message, link)
        } else if (err.kind === 'auth') {
          showFormError('Your session expired. Sign in again in another tab, then press Save once more — your entries are still here.')
        } else showFormError(err.message)
        formError.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }

  const cancel = h('a', { class: 'btn', href: isEdit ? `#/log/${editingId}` : '#/history' }, 'Cancel')

  const form = h('form', { class: 'stack-lg', novalidate: true, onsubmit: onSubmit },
    formError,
    h('section', { class: 'card stack' }, h('h2', null, 'Details'), h('div', { class: 'two-col' }, dateField, notesField)),
    h('section', { class: 'stack' },
      h('div', { class: 'section-head' }, h('h2', null, 'Production entries'), countEl),
      rowsHost,
    ),
    h('div', { class: 'savebar' },
      h('div', { class: 'savebar-total' }, h('span', { class: 'muted small' }, 'Total production'), totalEl, h('span', { class: 'muted small' }, 'pieces')),
      h('div', { class: 'savebar-actions' }, cancel, saveBtn)),
  )

  ctx.root.replaceChildren(
    pageHeader(isEdit ? `Edit Production Log #${editingId}` : 'New production log',
      isEdit ? 'Changes are saved to the same log.' : 'Record the day’s production across machines and parts.'),
    form,
  )
  renderRows()
}
