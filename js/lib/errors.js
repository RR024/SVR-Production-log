/** One consistent error strategy: every failure becomes an AppError with a
 *  human message and a `kind` the UI can branch on. */
export class AppError extends Error {
  constructor(message, kind = 'unknown') {
    super(message)
    this.name = 'AppError'
    this.kind = kind // network | auth | permission | notfound | conflict | validation | unknown
  }
}

export function toAppError(err) {
  if (err instanceof AppError) return err
  const msg = String(err?.message || '')
  const code = String(err?.code || '')
  const status = Number(err?.status || 0)

  if (err instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(msg) || status === 0 && !code && /fetch/i.test(msg)) {
    return new AppError("Can't reach the server. Check your internet connection and try again.", 'network')
  }
  if (/jwt expired|invalid jwt|refresh token|not authenticated/i.test(msg) || status === 401) {
    return new AppError('Your session has expired. Please sign in again.', 'auth')
  }
  if (code === '42501' || status === 403) {
    // Our RPCs raise readable permission messages; keep them.
    return new AppError(msg && !/row-level security|permission denied/i.test(msg) ? msg : 'You do not have permission to do that.', 'permission')
  }
  if (code === 'P0002' || status === 404) return new AppError(msg || 'That record was not found.', 'notfound')
  if (code === '23505') return new AppError(msg && /already/i.test(msg) ? msg : 'That value is already in use.', 'conflict')
  if (code === '23503') return new AppError('That record is referenced by other data and cannot be changed this way.', 'conflict')
  if (code === '22023' || code === '23514') return new AppError(msg || 'Some of the values are invalid.', 'validation')
  return new AppError(msg || 'Something went wrong. Please try again.', 'unknown')
}

/** Unwraps a supabase-js `{ data, error }` result or throws an AppError. */
export function unwrap(result) {
  if (result.error) throw toAppError(result.error)
  return result.data
}

export function friendlyAuthError(err) {
  const msg = String(err?.message || '')
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.'
  if (/email not confirmed/i.test(msg)) return 'This email has not been confirmed yet. Check your inbox for the confirmation link.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.'
  if (toAppError(err).kind === 'network') return toAppError(err).message
  return msg || 'Could not sign in. Please try again.'
}
