import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export default function Logo({ etab, onChange }) {
  const [url, setUrl] = useState(null)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let actif = true
    setUrl(null)
    if (!etab.logo_path) return
    supabase.storage.from('logos').createSignedUrl(etab.logo_path, 3600)
      .then(({ data }) => { if (actif && data) setUrl(data.signedUrl) })
    return () => { actif = false }
  }, [etab.logo_path])

  async function choisir(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ext = TYPES[file.type]
    if (!ext) { setErreur('Format accepté : PNG, JPEG ou WebP (pas de SVG).'); return }
    if (file.size > 1048576) { setErreur('Image trop lourde (1 Mo maximum).'); return }
    setEnvoi(true)
    setErreur('')
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    if (!uid) { setErreur('Session expirée, reconnecte-toi.'); setEnvoi(false); return }
    const chemin = `${uid}/${etab.id}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(chemin, file, { contentType: file.type })
    if (error) { setErreur(error.message); setEnvoi(false); return }
    const { error: e2 } = await supabase.from('etablissements')
      .update({ logo_path: chemin }).eq('id', etab.id)
    if (e2) {
      await supabase.storage.from('logos').remove([chemin])
      setErreur(e2.message)
      setEnvoi(false)
      return
    }
    if (etab.logo_path) await supabase.storage.from('logos').remove([etab.logo_path])
    setEnvoi(false)
    onChange()
  }

  async function retirer() {
    if (!window.confirm('Retirer le logo ?')) return
    const { error } = await supabase.from('etablissements')
      .update({ logo_path: null }).eq('id', etab.id)
    if (error) { setErreur(error.message); return }
    await supabase.storage.from('logos').remove([etab.logo_path])
    onChange()
  }

  return (
    <div className="etab-logo-editor">
      <div className="etab-logo-preview">
        {url
          ? <img src={url} alt={`Logo de ${etab.nom}`} />
          : <span aria-hidden="true">{etab.nom.charAt(0).toLocaleUpperCase('fr')}</span>}
      </div>
      <div className="etab-logo-controls">
        <label className="etab-file-label">
          <span>{envoi ? 'Envoi du logo…' : url ? 'Remplacer le logo' : 'Choisir un logo'}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={choisir}
            disabled={envoi} aria-label="Choisir le logo de l’établissement" />
        </label>
        {etab.logo_path && (
          <button type="button" className="btn btn-ghost etab-remove-logo" onClick={retirer}>
            Retirer le logo
          </button>
        )}
        {erreur && <span className="etab-logo-error" role="alert">{erreur}</span>}
      </div>
    </div>
  )
}