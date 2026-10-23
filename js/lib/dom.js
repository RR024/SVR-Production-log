/**
 * Tiny DOM builder. Every string child is inserted as a text node, so user
 * content (notes, names) can never inject markup.
 *
 *   h('button', { class: 'btn', onclick: fn, disabled: true }, 'Save')
 */
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'open', 'readOnly'])

export function h(tag, props, ...children) {
  const el = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'dataset') Object.assign(el.dataset, v)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (PROPS.has(k)) el[k] = v
      else el.setAttribute(k, v === true ? '' : String(v))
    }
  }
  append(el, children)
  return el
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

export function clear(el) {
  el.replaceChildren()
  return el
}

export function setChildren(el, ...children) {
  el.replaceChildren()
  return append(el, children)
}

/** Trusted static markup only (icons). Never pass user content here. */
export function trusted(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

export const nf = new Intl.NumberFormat('en-IN')
export const fmtNum = (n) => nf.format(Number(n) || 0)

export function debounce(fn, ms = 300) {
  let t
  const d = (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
  d.cancel = () => clearTimeout(t)
  return d
}
