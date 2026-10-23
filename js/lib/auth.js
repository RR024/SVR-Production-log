import { sb } from './supabase.js'
import { AppError, friendlyAuthError, toAppError } from './errors.js'

export const ROLE_LABEL = { admin: 'Administrator', supervisor: 'Supervisor', viewer: 'Viewer' }

/** UI mirror of the rules enforced in the database (RLS + RPCs). These only
 *  decide what to SHOW; the server is the real authority. */
export function can(role) {
  const admin = role === 'admin'
  const sup = role === 'supervisor'
  return {
    createLog: admin || sup,
    editLog: admin || sup,
    deleteLog: admin, // supervisors cannot delete (policy)
    manageCatalog: admin || sup,
    manageUsers: admin,
  }
}

export const auth = {
  user: null,
  profile: null, // { id, full_name, email, role } | null (signed in but no role)
  ready: false,
}

const listeners = new Set()
export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn))
const emit = () => listeners.forEach((fn) => fn(auth))

async function loadProfile(user) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw toAppError(error)
  return data
}

async function applySession(session) {
  if (!session?.user) {
    auth.user = null
    auth.profile = null
    return
  }
  auth.user = session.user
  try {
    auth.profile = await loadProfile(session.user)
  } catch (e) {
    auth.profile = null
    auth.profileError = e
  }
}

export async function initAuth() {
  const { data } = await sb.auth.getSession() // restores the persisted session
  await applySession(data.session)
  auth.ready = true

  sb.auth.onAuthStateChange((event, session) => {
    // Never await supabase calls inside this callback (it can deadlock the
    // client) — defer to the next tick.
    if (event === 'INITIAL_SESSION') return
    setTimeout(async () => {
      const wasId = auth.user?.id
      if (event === 'TOKEN_REFRESHED' && wasId && session?.user?.id === wasId) return
      await applySession(session)
      emit()
    }, 0)
  })
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new AppError(friendlyAuthError(error), 'auth')
  await applySession(data.session)
  emit()
}

export async function signOut() {
  await sb.auth.signOut()
  await applySession(null)
  emit()
}
