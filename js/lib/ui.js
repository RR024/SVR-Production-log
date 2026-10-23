import { h } from './dom.js'
import { icon } from './icons.js'
import { toAppError } from './errors.js'

// ------------------------------------------------------------------- toasts
export function toast(message, type = 'info') {
  const host = document.getElementById('toasts')
  const el = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
    icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'inbox', 18),
    h('span', null, message),
  )
  host.append(el)
  const ttl = type === 'error' ? 7000 : 3500
  setTimeout(() => {
    el.classList.add('out')
    setTimeout(() => el.remove(), 250)
  }, ttl)
}

// ------------------------------------------------------------ confirm dialog
export function confirmDialog({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' })
    const done = (v) => {
      dlg.close()
      dlg.remove()
      resolve(v)
    }
    dlg.append(
      h('h2', { id: 'dlg-title' }, title),
      h('div', { class: 'dialog-body' }, body),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, cancelText),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onclick: () => done(true) }, confirmText),
      ),
    )
    dlg.addEventListener('cancel', (e) => (e.preventDefault(), done(false)))
    document.body.append(dlg)
    dlg.showModal()
    dlg.querySelector('.btn').focus()
  })
}

/** Generic modal with arbitrary content; returns { close, el }. */
export function openModal(title, content) {
  const dlg = h('dialog', { class: 'dialog dialog-wide', 'aria-labelledby': 'modal-title' })
  const close = () => {
    dlg.close()
    dlg.remove()
  }
  dlg.append(
    h('div', { class: 'dialog-head' },
      h('h2', { id: 'modal-title' }, title),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x')),
    ),
    content,
  )
  dlg.addEventListener('cancel', (e) => (e.preventDefault(), close()))
  document.body.append(dlg)
  dlg.showModal()
  return { close, el: dlg }
}

// ------------------------------------------------------------------- states
export const spinner = (text = 'Loading…') =>
  h('div', { class: 'state', role: 'status' }, h('div', { class: 'spinner' }), h('p', { class: 'muted' }, text))

export function emptyState({ iconName = 'inbox', title, text, action }) {
  return h('div', { class: 'state' },
    h('div', { class: 'state-icon' }, icon(iconName, 28)),
    h('h3', null, title),
    text && h('p', { class: 'muted' }, text),
    action,
  )
}

export function errorState(err, onRetry) {
  const e = toAppError(err)
  return h('div', { class: 'state state-error', role: 'alert' },
    h('div', { class: 'state-icon' }, icon(e.kind === 'network' ? 'wifioff' : 'alert', 28)),
    h('h3', null, e.kind === 'network' ? "Can't connect" : 'Something went wrong'),
    h('p', { class: 'muted' }, e.message),
    onRetry && h('button', { class: 'btn', type: 'button', onclick: onRetry }, icon('refresh', 16), 'Try again'),
  )
}

// ---------------------------------------------------------------- components
export function pageHeader(title, subtitle, ...actions) {
  return h('header', { class: 'page-head' },
    h('div', null, h('h1', null, title), subtitle && h('p', { class: 'muted' }, subtitle)),
    actions.length ? h('div', { class: 'page-actions' }, actions) : null,
  )
}

export function statCard(label, value, hint, accent) {
  return h('div', { class: `stat ${accent ? 'stat-' + accent : ''}` },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    hint && h('p', { class: 'stat-hint' }, hint),
  )
}

let uid = 0
/** Label + control + inline error, wired for accessibility. */
export function field(label, control, { hint, error } = {}) {
  // `control` may be a wrapper (e.g. input + show/hide button); label the real input.
  const target = /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName) ? control : control.querySelector('input, select, textarea')
  const id = target.id || `f${++uid}`
  target.id = id
  const err = h('p', { class: 'field-error', id: id + '-err', hidden: !error }, error || '')
  target.setAttribute('aria-describedby', id + '-err')
  if (error) target.setAttribute('aria-invalid', 'true')
  const wrap = h('div', { class: 'field' },
    h('label', { for: id }, label),
    control,
    hint && h('p', { class: 'hint' }, hint),
    err,
  )
  wrap.setError = (msg) => {
    err.textContent = msg || ''
    err.hidden = !msg
    target.toggleAttribute('aria-invalid', Boolean(msg))
    target.classList.toggle('invalid', Boolean(msg))
  }
  return wrap
}

/** Disables a button while an async action runs (prevents double submits). */
export async function withBusy(btn, fn) {
  if (btn.dataset.busy) return
  btn.dataset.busy = '1'
  btn.disabled = true
  btn.classList.add('is-busy')
  try {
    return await fn()
  } finally {
    delete btn.dataset.busy
    btn.disabled = false
    btn.classList.remove('is-busy')
  }
}

export function select(options, value, props = {}) {
  const s = h('select', props)
  for (const o of options) s.append(h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label))
  return s
}

export function badge(text, tone = 'neutral') {
  return h('span', { class: `badge badge-${tone}` }, text)
}
