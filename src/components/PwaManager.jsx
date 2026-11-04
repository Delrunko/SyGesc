import { useEffect, useRef, useState } from 'react'
import { PWA_INSTALL_REQUEST, PWA_INSTALL_UNAVAILABLE } from '../utils/pwaEvents.js'

const CLE_INVITATION_FERMEE = 'sygesc-install-invitation-fermee'

function invitationFermeeEnregistree() {
  try {
    return localStorage.getItem(CLE_INVITATION_FERMEE) === 'true'
  } catch {
    return false
  }
}

export default function PwaManager() {
  const [installation, setInstallation] = useState(null)
  const [invitationFermee, setInvitationFermee] = useState(invitationFermeeEnregistree)
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine)
  const [miseAJour, setMiseAJour] = useState(false)
  const [erreur, setErreur] = useState('')
  const rechargement = useRef(false)
  const workerEnAttente = useRef(null)
  const installationRef = useRef(null)
  const installationManuelleRef = useRef(false)

  useEffect(() => {
    const installerDisponible = (event) => {
      event.preventDefault()
      installationRef.current = event
      setInstallation(event)
      installationManuelleRef.current = false
      setInvitationFermee(invitationFermeeEnregistree())
    }
    const installee = () => {
      installationRef.current = null
      setInstallation(null)
      setInvitationFermee(true)
    }
    const demanderInstallation = () => {
      if (installationRef.current) {
        installerApplication()
      } else {
        window.dispatchEvent(new CustomEvent(PWA_INSTALL_UNAVAILABLE, {
          detail: { manual: installationManuelleRef.current },
        }))
      }
    }
    const enLigne = () => setHorsLigne(false)
    const horsConnexion = () => setHorsLigne(true)
    const controleurChange = () => {
      if (rechargement.current) window.location.reload()
    }

    window.addEventListener('beforeinstallprompt', installerDisponible)
    window.addEventListener('appinstalled', installee)
    window.addEventListener(PWA_INSTALL_REQUEST, demanderInstallation)
    window.addEventListener('online', enLigne)
    window.addEventListener('offline', horsConnexion)
    navigator.serviceWorker?.addEventListener('controllerchange', controleurChange)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const dejaInstallee = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
    if (ios && !dejaInstallee) {
      installationManuelleRef.current = true
    }

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
      window.removeEventListener(PWA_INSTALL_REQUEST, demanderInstallation)
      window.removeEventListener('online', enLigne)
      window.removeEventListener('offline', horsConnexion)
      navigator.serviceWorker?.removeEventListener('controllerchange', controleurChange)
    }
  }, [])

  async function installerApplication() {
    const invitation = installationRef.current
    if (!invitation) return
    try {
      await invitation.prompt()
      await invitation.userChoice
      installationRef.current = null
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

  const afficherInvitation = installation && !invitationFermee
  if (!horsLigne && !miseAJour && !afficherInvitation && !erreur) return null

  return (
    <aside className="pwa-notice" aria-live="polite">
      {afficherInvitation && (
        <div className="pwa-install-invitation">
          <div>
            <p>Installe SyGesc pour y accéder rapidement.</p>
            <button type="button" className="btn btn-primary" onClick={installerApplication}>Installer</button>
          </div>
          <button type="button" className="pwa-notice-close" aria-label="Fermer la suggestion d’installation"
            onClick={() => {
              setInvitationFermee(true)
              try { localStorage.setItem(CLE_INVITATION_FERMEE, 'true') } catch { /* préférence conservée pour cette session */ }
            }}>×</button>
        </div>
      )}
      {horsLigne && (
        <p><strong>Mode hors connexion.</strong> Les données scolaires nécessitent une connexion Internet.</p>
      )}
      {miseAJour && (
        <div>
          <p>Une nouvelle version de SyGesc est prête.</p>
          <button type="button" className="btn btn-primary" onClick={appliquerMiseAJour}>Mettre à jour</button>
        </div>
      )}
      {erreur && <p className="pwa-error" role="status">Mode installable indisponible : {erreur}</p>}
    </aside>
  )
}
