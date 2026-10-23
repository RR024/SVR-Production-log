import { h } from '../lib/dom.js'
import { icon, logoMark } from '../lib/icons.js'
import { signIn } from '../lib/auth.js'
import { field, withBusy } from '../lib/ui.js'
import { toAppError } from '../lib/errors.js'

export default function login(ctx) {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, inputmode: 'email', placeholder: 'you@company.com' })
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true, placeholder: 'Password' })
  const eye = h('button', { type: 'button', class: 'input-btn', 'aria-label': 'Show password', 'aria-pressed': 'false' }, icon('eye', 18))
  eye.addEventListener('click', () => {
    const show = password.type === 'password'
    password.type = show ? 'text' : 'password'
    eye.setAttribute('aria-pressed', String(show))
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
    eye.replaceChildren(icon(show ? 'eyeoff' : 'eye', 18))
  })

  const error = h('div', { class: 'alert alert-error', role: 'alert', hidden: true })
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Sign in')

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault()
    error.hidden = true
    if (!email.value.trim() || !password.value) {
      error.textContent = 'Enter your email and password.'
      error.hidden = false
      return
    }
    await withBusy(submit, async () => {
      try {
        await signIn(email.value, password.value) // auth listener re-renders the app
      } catch (err) {
        error.textContent = toAppError(err).message
        error.hidden = false
        password.select()
      }
    })
  } },
    error,
    field('Email', email),
    field('Password', h('div', { class: 'input-wrap' }, password, eye)),
    submit,
  )

  ctx.root.replaceChildren(
    h('div', { class: 'card auth-card' },
      h('div', { class: 'auth-brand' }, logoMark(52),
        h('h1', null, 'SVR Production Log'),
        h('p', { class: 'muted' }, 'Sri Veera Raghava Sheet Metal Component'),
        h('p', { class: 'tag' }, 'Manufacturing production management')),
      form,
      h('p', { class: 'hint center' }, 'Accounts are created by your administrator.'),
    ),
  )
  email.focus()
}
