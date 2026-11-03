export async function messageErreurFonction(error, fallback) {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const response = await error.context.json()
      if (typeof response?.error === 'string') return response.error
    } catch {
      // The response may already have been consumed; use the SDK message below.
    }
  }
  return error?.message || fallback
}
