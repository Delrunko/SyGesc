import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import ThemeToggle from './ThemeToggle.jsx'

function Initiale({ nom }) {
  return <span className="initiale">{(nom || '?').trim().charAt(0).toUpperCase()}</span>
}

export default function Sidebar({ arbre, logos, vue, etabActif, ouvert, nom, onAller, onFermer }) {
  const [fermes, setFermes] = useState({})
  const basculer = (id) => setFermes({ ...fermes, [id]: !fermes[id] })

  return (
    <aside className={ouvert ? 'sidebar ouvert' : 'sidebar'} aria-label="Navigation principale">
      <div className="sb-marque">
        <strong>Gestion scolaire</strong>
        <button type="button" className="sb-fermer" onClick={onFermer} aria-label="Fermer le menu">×</button>
      </div>

      {etabActif && (
        <div className="sb-actif">
          {logos[etabActif.logo_path]
            ? <img className="sb-actif-logo" src={logos[etabActif.logo_path]} alt="" />
            : <Initiale nom={etabActif.nom} />}
          <span className="sb-actif-nom">{etabActif.nom}</span>
        </div>
      )}

      <nav className="sb-nav">
        <button type="button" className={vue.type === 'accueil' ? 'sb-lien actif' : 'sb-lien'}
          onClick={() => onAller({ type: 'accueil' })}>Accueil</button>

        <p className="sb-titre">Mes établissements</p>
        {arbre.length === 0 && <p className="sb-vide">Aucun établissement. Crée le premier depuis l’accueil.</p>}

        {arbre.map((e) => (
          <div key={e.id}>
            <div className="sb-ligne">
              <button type="button" className="sb-plie" onClick={() => basculer(e.id)}
                aria-expanded={!fermes[e.id]} aria-label={`Afficher ou masquer ${e.nom}`}>
                {fermes[e.id] ? '▸' : '▾'}
              </button>
              <button type="button"
                className={vue.type === 'etab' && vue.id === e.id ? 'sb-lien actif' : 'sb-lien'}
                onClick={() => onAller({ type: 'etab', id: e.id })}>
                {logos[e.logo_path]
                  ? <img className="sb-logo" src={logos[e.logo_path]} alt="" />
                  : <Initiale nom={e.nom} />}
                <span>{e.nom}</span>
              </button>
            </div>

            {!fermes[e.id] && e.campus.map((c) => (
              <div key={c.id} className="sb-campus">
                <p className="sb-campus-nom">{c.nom}{c.ville ? ` (${c.ville})` : ''}</p>
                {c.classes.map((cl) => (
                  <button key={cl.id} type="button"
                    className={vue.type === 'classe' && vue.id === cl.id ? 'sb-classe actif' : 'sb-classe'}
                    onClick={() => onAller({ type: 'classe', id: cl.id })}>
                    <span>{cl.nom}</span>
                    <small>{cl.annee_scolaire}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="sb-pied">
        <div className="sb-profil"><Initiale nom={nom} /><span>{nom}</span></div>
        <div className="sb-actions">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </div>
    </aside>
  )
}