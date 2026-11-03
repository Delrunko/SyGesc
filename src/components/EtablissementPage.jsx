import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Logo from './Logo.jsx'

function Ajout({ champs, bouton, onSubmit }) {
  const [vals, setVals] = useState({})
  async function envoyer(e) {
    e.preventDefault()
    const ok = await onSubmit(vals)
    if (ok) setVals({})
  }
  return (
    <form onSubmit={envoyer} className="etab-ajout-form">
      {champs.map((c) => (
        <label className="etab-field" key={c.key}>
          <span>{c.label}</span>
          <input className="input" placeholder={c.placeholder}
            required={c.required} pattern={c.pattern} maxLength={150}
            value={vals[c.key] ?? ''}
            onChange={(e) => setVals({ ...vals, [c.key]: e.target.value })} />
        </label>
      ))}
      <button type="submit" className="btn btn-primary etab-form-action">{bouton}</button>
    </form>
  )
}

export default function EtablissementPage({ etab, onChange, onSupprime, onAller }) {
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)
  const [coordonnees, setCoordonnees] = useState({
    adresse: etab.adresse || '',
    telephone: etab.telephone || '',
    email: etab.email || '',
    site_web: etab.site_web || '',
  })

  async function agir(requete) {
    const { error } = await requete
    if (error) {
      setMessage('')
      setErreur(error.code === '23505' ? 'Ce nom existe déjà à cet endroit.' : error.message)
      return false
    }
    setErreur('')
    setMessage('')
    await onChange()
    return true
  }

  async function supprimer(table, id, texte, apres) {
    if (!window.confirm(texte)) return
    const ok = await agir(supabase.from(table).delete().eq('id', id))
    if (ok && apres) apres()
  }

  async function enregistrerCoordonnees(e) {
    e.preventDefault()
    setEnregistrement(true)
    const ok = await agir(supabase.from('etablissements').update({
      adresse: coordonnees.adresse.trim() || null,
      telephone: coordonnees.telephone.trim() || null,
      email: coordonnees.email.trim() || null,
      site_web: coordonnees.site_web.trim() || null,
    }).eq('id', etab.id))
    if (ok) setMessage('Les coordonnées de l’établissement ont été enregistrées.')
    setEnregistrement(false)
  }

  return (
    <div className="etablissement-page">
      <header className="page-titre etablissement-hero">
        <div className="etablissement-monogramme" aria-hidden="true">
          {etab.nom.trim().charAt(0).toLocaleUpperCase('fr')}
        </div>
        <div>
          <p className="etab-eyebrow">ESPACE ÉTABLISSEMENT</p>
          <h1>{etab.nom}</h1>
          <p className="muted">Gérez l’identité, les coordonnées, les campus et les classes de votre établissement.</p>
        </div>
      </header>

      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      {message && <p className="assistant-notice" role="status">{message}</p>}

      <div className="etablissement-identite-grid">
        <section className="card etab-section etab-logo-section">
          <div className="etab-section-heading">
            <div>
              <p className="etab-eyebrow">IDENTITÉ VISUELLE</p>
              <h2>Logo de l’établissement</h2>
            </div>
            <span className="etab-section-icon" aria-hidden="true">✦</span>
          </div>
          <p className="muted">Votre logo sera ajouté aux bulletins et aux documents scolaires générés.</p>
          <Logo etab={etab} onChange={onChange} />
          <p className="etab-hint">Formats acceptés : PNG, JPEG ou WebP · 1 Mo maximum</p>
        </section>

        <section className="card etab-section">
          <div className="etab-section-heading">
            <div>
              <p className="etab-eyebrow">INFORMATIONS DE CONTACT</p>
              <h2>Coordonnées</h2>
            </div>
            <span className="etab-section-icon" aria-hidden="true">⌖</span>
          </div>
          <p className="muted">Ces renseignements apparaîtront dans l’en-tête de vos documents.</p>
          <form className="etab-coordonnees-form" onSubmit={enregistrerCoordonnees}>
            <label className="etab-field etab-field-wide">
              <span>Adresse de l’établissement</span>
              <input className="input" autoComplete="street-address"
                placeholder="Rue, quartier, ville" value={coordonnees.adresse} maxLength={300}
                onChange={(e) => setCoordonnees({ ...coordonnees, adresse: e.target.value })} />
            </label>
            <label className="etab-field">
              <span>Téléphone</span>
              <input className="input" type="tel" autoComplete="tel"
                placeholder="Ex. +237 6XX XXX XXX" value={coordonnees.telephone} maxLength={30}
                onChange={(e) => setCoordonnees({ ...coordonnees, telephone: e.target.value })} />
            </label>
            <label className="etab-field">
              <span>Adresse email</span>
              <input className="input" type="email" autoComplete="email"
                placeholder="contact@etablissement.com" value={coordonnees.email} maxLength={254}
                onChange={(e) => setCoordonnees({ ...coordonnees, email: e.target.value })} />
            </label>
            <label className="etab-field etab-field-wide">
              <span>Site web</span>
              <input className="input" type="url" autoComplete="url"
                placeholder="https://www.etablissement.com" value={coordonnees.site_web} maxLength={255}
                onChange={(e) => setCoordonnees({ ...coordonnees, site_web: e.target.value })} />
            </label>
            <div className="etab-form-footer">
              <span className="etab-hint">Les champs sont facultatifs.</span>
              <button type="submit" className="btn btn-primary" disabled={enregistrement}>
                {enregistrement ? 'Enregistrement…' : 'Enregistrer les coordonnées'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="etab-campus-section" aria-labelledby="etab-campus-title">
        <header className="etab-list-heading">
          <div>
            <p className="etab-eyebrow">ORGANISATION SCOLAIRE</p>
            <h2 id="etab-campus-title">Campus et classes</h2>
          </div>
          <span className="etab-count">{etab.campus.length} campus</span>
        </header>

        {etab.campus.length === 0 && (
          <p className="card etab-empty">Aucun campus n’est encore créé. Ajoutez votre premier campus ci-dessous.</p>
        )}

        {etab.campus.map((c) => (
          <section className="card etab-campus-card" key={c.id}>
            <div className="etab-campus-heading">
              <div>
                <span className="etab-campus-label">CAMPUS</span>
                <h3>{c.nom}</h3>
                <p className="muted">{c.ville || 'Ville non renseignée'} · {c.classes.length} classe{c.classes.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" className="btn btn-danger"
                onClick={() => supprimer('campus', c.id, 'Supprimer ce campus et toutes ses classes ?')}>
                Supprimer le campus
              </button>
            </div>

            {c.classes.length > 0 ? (
              <div className="etab-classes-list">
                {c.classes.map((cl) => {
                  const n = cl.eleves?.[0]?.count ?? 0
                  return (
                    <div className="etab-classe-row" key={cl.id}>
                      <span className="etab-classe-icon" aria-hidden="true">▦</span>
                      <div className="etab-classe-name">
                        <strong>{cl.nom}</strong>
                        <span className="muted">{cl.annee_scolaire} · {n} élève{n === 1 ? '' : 's'}</span>
                      </div>
                      <button type="button" className="btn btn-primary"
                        onClick={() => onAller({ type: 'classe', id: cl.id })}>Ouvrir la classe</button>
                      <button type="button" className="btn btn-ghost etab-delete-class"
                        onClick={() => supprimer('classes', cl.id,
                          'Supprimer cette classe et tous ses élèves, présences et notes ?')}>
                        Supprimer
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : <p className="etab-empty">Aucune classe dans ce campus.</p>}

            <details className="etab-add-details">
              <summary>Ajouter une classe</summary>
              <Ajout
                champs={[
                  { key: 'nom', label: 'Nom de la classe', placeholder: 'Ex. 6e A', required: true },
                  { key: 'annee', label: 'Année scolaire', placeholder: '2026-2027', required: true, pattern: '[0-9]{4}-[0-9]{4}' },
                ]}
                bouton="Créer la classe"
                onSubmit={(v) => agir(supabase.from('classes').insert({
                  campus_id: c.id, nom: v.nom.trim(), annee_scolaire: v.annee.trim(),
                }))}
              />
            </details>
          </section>
        ))}

        <details className="card etab-add-campus">
          <summary>Ajouter un campus</summary>
          <p className="muted">Organisez vos classes par campus ou par site.</p>
          <Ajout
            champs={[
              { key: 'nom', label: 'Nom du campus', placeholder: 'Ex. Campus principal', required: true },
              { key: 'ville', label: 'Ville', placeholder: 'Ville' },
            ]}
            bouton="Ajouter le campus"
            onSubmit={(v) => agir(supabase.from('campus').insert({
              etablissement_id: etab.id, nom: v.nom.trim(), ville: v.ville?.trim() || null,
            }))}
          />
        </details>
      </section>

      <details className="card etab-danger-zone">
        <summary>Zone de suppression de l’établissement</summary>
        <p className="muted">
          La suppression est définitive et retire aussi les campus, classes, élèves, présences et notes.
        </p>
        <button type="button" className="btn btn-danger"
          onClick={() => supprimer('etablissements', etab.id,
            'Supprimer cet établissement et TOUT ce qu’il contient (campus, classes, élèves, notes) ?',
            onSupprime)}>
          Supprimer {etab.nom}
        </button>
      </details>
    </div>
  )
}