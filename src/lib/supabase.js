import { createClient } from '@supabase/supabase-js'

// The browser uses Supabase for authentication only. All data goes through Express.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = url && key ? createClient(url, key) : null
