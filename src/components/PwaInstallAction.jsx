import { useEffect, useState } from 'react'
import { PWA_INSTALL_REQUEST, PWA_INSTALL_UNAVAILABLE } from '../utils/pwaEvents.js'

export default function PwaInstallAction({ sidebar = false }) {
  const [aide, setAide] = useState('')

  useEffect(() => {
    const installationIndisponible = (event) => {
      setAide(event.detail?.manual
        ? 'Touche Partager, puis « Sur l’écran d’accueil ».'
        : 'Ouvre le menu du navigateur et choisis « Installer SyGesc » ou « Installer cette application ».')
    }
    window.addEventListener(PWA_INSTALL_UNAVAILABLE, installationIndisponible)
    return () => window.removeEventListener(PWA_INSTALL_UNAVAILABLE, installationIndisponible)
  }, [])

  return (
    <div className={sidebar ? 'pwa-install-action-sidebar' : 'pwa-install-action-topbar'}>
      <button type="button" className={sidebar ? 'sb-lien sb-install-action' : 'btn'}
        onClick={() => {
          setAide('')
          window.dispatchEvent(new Event(PWA_INSTALL_REQUEST))
        }}>
        <span aria-hidden="true">↓</span>
        <span>Installer l’application</span>
      </button>
      {aide && <p className={sidebar ? 'sb-install-help' : 'pwa-install-help-topbar'} role="status">{aide}</p>}
    </div>
  )
}
