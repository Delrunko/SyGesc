import { useEffect, useRef, useState } from 'react'

export default function PwaManager() {
  const [installation, setInstallation] = useState(null)
  const [installationManuelle, setInstallationManuelle] = useState(false)
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine)
  const [miseAJour, setMiseAJour] = useState(false)
  const [erreur, setErreur] = useState('')
  const rechargement = useRef(false)
  const workerEnAttente = useRef(null)

  useEffect(() => {
    const installerDisponible = (event) => {
      event.preventDefault()
      setInstallation(event)
      setInstallationManuelle(false)
    }
    const installee = () => setInstallation(null)
    const enLigne = () => setHorsLigne(false)
    const horsConnexion = () => setHorsLigne(true)
    const controleurChange = () => {
      if (rechargement.current) window.location.reload()
    }

    window.addEventListener('beforeinstallprompt', installerDisponible)
    window.addEventListener('appinstalled', installee)
    window.addEventListener('online', enLigne)
    window.addEventListener('offline', horsConnexion)
    navigator.serviceWorker?.addEventListener('controllerchange', controleurChange)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const dejaInstallee = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
    if (ios && !dejaInstallee) setInstallationManuelle(true)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((registration) => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            workerEnAttente.current = registration.waiting
            setMiseAJour(true)
          }
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                workerEnAttente.current = worker
                setMiseAJour(true)
              }
            })
          })
        })
        .catch((cause) => setErreur(cause?.message || 'Installation PWA indisponible.'))
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', installerDisponible)
      window.removeEventListener('appinstalled', installee)
      window.removeEventListener('online', enLigne)
      window.removeEventListener('offline', horsConnexion)
      navigator.serviceWorker?.removeEventListener('controllerchange', controleurChange)
    }
  }, [])

  async function installerApplication() {
    if (!installation) return
    try {
      await installation.prompt()
      await installation.userChoice
      setInstallation(null)
    } catch (cause) {
      setErreur(cause?.message || 'La demande d’installation a échoué.')
    }
  }

  function appliquerMiseAJour() {
    const worker = workerEnAttente.current
    if (!worker) {
      setErreur('La mise à jour est prête, mais aucun service worker actif ne la contrôle.')
      return
    }
    rechargement.current = true
    worker.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!horsLigne && !miseAJour && !installation && !installationManuelle && !erreur) return null

  return (
    <aside className="pwa-notice" aria-live="polite">
      {horsLigne && (
        <p><strong>Mode hors connexion.</strong> Les données scolaires nécessitent une connexion Internet.</p>
      )}
      {miseAJour && (
        <div>
          <p>Une nouvelle version de SyGesc est prête.</p>
          <button type="button" className="btn btn-primary" onClick={appliquerMiseAJour}>Mettre à jour</button>
        </div>
      )}
      {installation && (
        <div>
          <p>Installe SyGesc sur cet appareil pour un accès rapide.</p>
          <button type="button" className="btn btn-primary" onClick={installerApplication}>Installer l’application</button>
        </div>
      )}
      {!installation && installationManuelle && (
        <p>Pour installer SyGesc : touche <strong>Partager</strong>, puis <strong>Sur l’écran d’accueil</strong>.</p>
      )}
      {erreur && <p className="pwa-error" role="status">Mode installable indisponible : {erreur}</p>}
    </aside>
  )
}
