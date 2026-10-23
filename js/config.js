// Fill these two values from Supabase → Project Settings → API.
// Both are safe to ship to the browser (the publishable/anon key is public by
// design; Row Level Security is what protects the data).
// NEVER paste the service_role / secret key here.
export const SUPABASE_URL = 'https://hwpdxhmvmsjimxxhcnaf.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2xLv49a_1UJmGB5BZ_rcvw_Hnz8jGPh'

export const isConfigured =
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR-')
