import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquantes (voir .env.example).'
  )
}

// La clé "anon" est publique par conception : la protection repose sur les règles RLS.
// Ne JAMAIS mettre la clé "service_role" dans le code front.
export const supabase = createClient(url, anonKey)
