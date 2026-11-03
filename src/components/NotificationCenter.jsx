import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'

function heureNotification(date) {
  return new Date(date).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NotificationCenter({ userId, variant = 'barre' }) {
  const [notifications, setNotifications] = useState([])
  const [ouvert, setOuvert] = useState(false)
  const [toast, setToast] = useState(null)
  const [erreur, setErreur] = useState('')
  const toastTimer = useRef(null)
  const nonLues = notifications.filter((notification) => !notification.read_at).length

  useEffect(() => {
    let actif = true
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, ({ new: notification }) => {
        if (!actif) return
        setNotifications((courantes) => [
          notification,
          ...courantes.filter((item) => item.id !== notification.id),
        ].slice(0, 20))
        setToast(notification)
        window.clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => setToast(null), 7000)
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setErreur('Les notifications en direct sont momentanément indisponibles.')
        }
      })

    supabase.from('notifications')
      .select('id, type, titre, message, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error: queryError }) => {
        if (!actif) return
        if (queryError) setErreur('Impossible de charger les notifications. Vérifie que la migration 10_notifications.sql a été appliquée.')
        else {
          setNotifications((courantes) => {
            const fusion = new Map((data || []).map((item) => [item.id, item]))
            courantes.forEach((item) => fusion.set(item.id, item))
            return [...fusion.values()]
              .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
              .slice(0, 20)
          })
          const plusRecenteNonLue = data?.find((item) => !item.read_at)
          if (plusRecenteNonLue) setToast(plusRecenteNonLue)
        }
      })

    return () => {
      actif = false
      window.clearTimeout(toastTimer.current)
      supabase.removeChannel(channel)
    }
  }, [userId])

  async function marquerLue(notification) {
    if (notification.read_at) return
    const readAt = new Date().toISOString()
    const { error: updateError } = await supabase.from('notifications')
      .update({ read_at: readAt })
      .eq('id', notification.id)
    if (updateError) {
      setErreur('Impossible de marquer cette notification comme lue.')
      return
    }
    setNotifications((courantes) => courantes.map((item) =>
      item.id === notification.id ? { ...item, read_at: readAt } : item))
    setToast((courant) => courant?.id === notification.id ? null : courant)
  }

  return (
    <div className={`notification-center notification-center-${variant}`}>
      <button type="button" className="notification-bell"
        aria-label={nonLues ? `Notifications, ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={ouvert} aria-controls={`notifications-panel-${variant}`}
        onClick={() => { setOuvert((valeur) => !valeur); setToast(null) }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
        </svg>
        {nonLues > 0 && <span className="notification-count">{nonLues > 9 ? '9+' : nonLues}</span>}
      </button>

      {toast && !ouvert && (
        <div className="notification-toast" role="status">
          <strong>{toast.titre}</strong>
          <span>{toast.message}</span>
          <button type="button" className="notification-toast-close"
            aria-label="Fermer la notification" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {ouvert && (
        <section id={`notifications-panel-${variant}`} className="notification-panel"
          role="region" aria-label="Centre de notifications">
          <header className="notification-panel-heading">
            <div>
              <strong>Notifications</strong>
              <span>{nonLues ? `${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Tout est à jour'}</span>
            </div>
            <button type="button" className="notification-panel-close"
              onClick={() => setOuvert(false)} aria-label="Fermer les notifications">×</button>
          </header>
          {erreur && <p className="notification-error" role="alert">{erreur}</p>}
          {notifications.length === 0 ? (
            <p className="notification-empty">Aucune notification pour le moment.</p>
          ) : (
            <ul className="notification-list">
              {notifications.map((notification) => (
                <li key={notification.id} className={!notification.read_at ? 'notification-item non-lue' : 'notification-item'}>
                  <button type="button" className="notification-item-button"
                    onClick={() => marquerLue(notification)}>
                    <span className="notification-item-title">{notification.titre}</span>
                    <span className="notification-item-message">{notification.message}</span>
                    <time dateTime={notification.created_at}>{heureNotification(notification.created_at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
