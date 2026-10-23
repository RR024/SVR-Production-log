import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isConfigured } from '../config.js'

// `supabase` is the global from js/vendor/supabase.js (official supabase-js,
// self-hosted so the app shell works offline and has no CDN dependency).
export const sb = isConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null
