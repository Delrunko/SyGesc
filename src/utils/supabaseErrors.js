export async function messageErreurFonction(error, fallback) {
  const nomErreur = error?.name || error?.constructor?.name
  if (error?.context?.status === 404) {
    return 'La fonction admin-password-reset n’est pas déployée sur ce projet Supabase. Depuis la racine du projet, lie le bon projet puis exécute : npx supabase functions deploy admin-password-reset.'
  }
  if (nomErreur === 'FunctionsFetchError') {
    return 'Impossible de joindre la fonction Supabase. Vérifie ta connexion et que admin-password-reset a bien été déployée sur le projet indiqué par VITE_SUPABASE_URL.'
  }
  if (nomErreur === 'FunctionsRelayError') {
    return 'Supabase ne trouve pas la fonction admin-password-reset. Déploie-la sur le projet Supabase utilisé par cette application.'
  }
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const response = await error.context.json()
      if (typeof response?.error === 'string') return response.error
      if (typeof response?.message === 'string') return response.message
    } catch {
      // The response may already have been consumed; use the SDK message below.
    }
  }
  return error?.message || fallback
}
