import { h, debounce } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { CATALOGS, listCatalog, saveCatalogItem, setCatalogActive } from '../lib/api.js'
import { formatShortDate } from '../lib/dates.js'
import { badge, confirmDialog, emptyState, errorState, field, openModal, pageHeader, spinner, toast, withBusy } from '../lib/ui.js'
import { toAppError } from '../lib/errors.js'

/** One screen serving both /machines and /parts (same shape, different columns). */
export default async function catalog(ctx) {
  const kind = ctx.route.kind
  const c = CATALOGS[kind]
  const plural = kind === 'machines' ? 'machines' : 'parts'
  let items = []
  let query = ''

  const search = h('input', { type: 'search', placeholder: `Search ${plural} by name or code`, 'aria-label': `Search ${plural}` })
  const refresh = h('button', { class: 'btn', type: 'button' }, icon('refresh', 16), 'Refresh')
  const addBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openForm(null) }, icon('plus', 16), `Add ${c.label.toLowerCase()}`)
  const host = h('div')

  ctx.root.replaceChildren(
    pageHeader(kind === 'machines' ? 'Machines' : 'Parts', `Manage the ${plural} available when recording production`, refresh, addBtn),
    h('div', { class: 'toolbar' }, h('div', { class: 'input-wrap grow' }, h('span', { class: 'input-icon' }, icon('search', 18)), search)),
    host,
  )

  function renderList() {
    const q = query.trim().toLowerCase()
    const shown = items.filter((i) => !q || i[c.code].toLowerCase().includes(q) || i[c.name].toLowerCase().includes(q))
    if (!items.length) {
      host.replaceChildren(emptyState({ iconName: kind === 'machines' ? 'cog' : 'box', title: `No ${plural} yet`, text: `Add your first ${c.label.toLowerCase()} so it can be selected in production logs.`, action: addBtn.cloneNode(true) }))
      host.querySelector('button')?.addEventListener('click', () => openForm(null))
      return
    }
    if (!shown.length) return host.replaceChildren(emptyState({ iconName: 'search', title: 'No matches', text: `No ${plural} match "${query}".` }))

    const actions = (i) => h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openForm(i) }, icon('edit', 14), 'Edit'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => toggle(i, e.currentTarget) }, i.is_active ? 'Deactivate' : 'Activate'))

    host.replaceChildren(
      h('div', { class: 'table-wrap desk-only' },
        h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['ID', 'Code', 'Name', 'Description', 'Status', 'Created'].map((t) => h('th', { scope: 'col' }, t)), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions')))),
          h('tbody', null, shown.map((i) => h('tr', { class: i.is_active ? '' : 'is-inactive' },
            h('td', { class: 'code' }, i.id), h('td', { class: 'code strong' }, i[c.code]), h('td', null, i[c.name]),
            h('td', { class: 'muted' }, i.description || '—'),
            h('td', null, badge(i.is_active ? 'Active' : 'Inactive', i.is_active ? 'success' : 'muted')),
            h('td', { class: 'muted' }, formatShortDate(i.created_at.slice(0, 10))),
            h('td', null, actions(i))))))),
      h('div', { class: 'entry-cards mobile-only' }, shown.map((i) => h('div', { class: 'entry-card' },
        h('div', { class: 'between' }, h('span', { class: 'code strong' }, i[c.code]), badge(i.is_active ? 'Active' : 'Inactive', i.is_active ? 'success' : 'muted')),
        h('p', { class: 'strong' }, i[c.name]),
        i.description && h('p', { class: 'muted' }, i.description),
        actions(i)))),
    )
  }

  async function load() {
    host.replaceChildren(spinner(`Loading ${plural}…`))
    try {
      items = await listCatalog(kind)
      if (ctx.isCurrent()) renderList()
    } catch (e) {
      if (ctx.isCurrent()) host.replaceChildren(errorState(e, load))
    }
  }

  async function toggle(item, btn) {
    const next = !item.is_active
    if (!next) {
      const ok = await confirmDialog({
        title: `Deactivate ${item[c.code]}?`,
        body: `It will no longer be selectable for new production entries. Existing logs that used it are unchanged and keep showing it.`,
        confirmText: 'Deactivate',
      })
      if (!ok) return
    }
    await withBusy(btn, async () => {
      try {
        await setCatalogActive(kind, item.id, next)
        toast(`${item[c.code]} ${next ? 'activated' : 'deactivated'}.`, 'success')
        await load()
      } catch (e) { toast(toAppError(e).message, 'error') }
    })
  }

  function openForm(item) {
    const code = h('input', { type: 'text', maxlength: 40, required: true, placeholder: kind === 'machines' ? 'e.g. CNC-01' : 'e.g. P-1042' })
    const name = h('input', { type: 'text', maxlength: 120, required: true })
    const desc = h('textarea', { rows: 3, maxlength: 500 })
    code.value = item?.[c.code] || ''
    name.value = item?.[c.name] || ''
    desc.value = item?.description || ''
    const fc = field(`${c.label} code`, code, { hint: 'Must be unique.' })
    const fn = field(`${c.label} name`, name)
    const fd = field('Description', desc)
    const err = h('div', { class: 'alert alert-error', role: 'alert', hidden: true })
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, item ? 'Save changes' : `Add ${c.label.toLowerCase()}`)
    let modal

    const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault()
      err.hidden = true
      fc.setError(code.value.trim() ? '' : 'Code is required.')
      fn.setError(name.value.trim() ? '' : 'Name is required.')
      if (!code.value.trim() || !name.value.trim()) return
      await withBusy(save, async () => {
        try {
          await saveCatalogItem(kind, item?.id, { code: code.value, name: name.value, description: desc.value })
          modal.close()
          toast(`${c.label} ${item ? 'updated' : 'added'}.`, 'success')
          await load()
        } catch (ex) {
          const m = toAppError(ex)
          if (m.kind === 'conflict') fc.setError(m.message)
          else { err.textContent = m.message; err.hidden = false }
        }
      })
    } }, err, fc, fn, fd,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => modal.close() }, 'Cancel'), save))

    modal = openModal(item ? `Edit ${c.label.toLowerCase()}` : `Add ${c.label.toLowerCase()}`, form)
    code.focus()
  }

  search.addEventListener('input', debounce(() => { query = search.value; if (items.length) renderList() }, 150))
  refresh.addEventListener('click', () => withBusy(refresh, load))
  await load()
}
