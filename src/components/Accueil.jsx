import { useState } from 'react'
import { supabase } from '../supabaseClient.js'

const compte = (cl) => cl.eleves?.[0]?.count ?? 0
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un)

export default function Accueil({ nom, arbre, logos, recents, chargement, onAller, onChange }) {
  const [nouveau, setNouveau] = useState('')
  const [erreur, setErreur] = useState('')

  const classes = arbre.flatMap((e) => e.campus.flatMap((c) => c.classes))
  const nbCampus = arbre.reduce((s, e) => s + e.campus.length, 0)
  const nbEleves = classes.reduce((s, cl) => s + compte(cl), 0)

  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const reprises = recents.map((id) => {
    for (const e of arbre) {
      for (const c of e.campus) {
        const cl = c.classes.find((x) => x.id === id)
        if (cl) return { cl, etab: e }
      }
    }
    return null
  }).filter(Boolean)

  async function ajouter(e) {
    e.preventDefault()
    const { error } = await supabase.from('etablissements').insert({ nom: nouveau.trim() })
    if (error) {
      setErreur(error.code === '23505' ? 'Tu as déjà un établissement avec ce nom.' : error.message)
      return
    }
    setErreur('')
    setNouveau('')
    onChange()
  }

  return (
    <>
      <section className="hero">
        <h1>Bonjour, {nom}</h1>
        <p className="date">{date}</p>
      </section>

      <div className="stats" role="list">
        <div role="listitem"><strong>{arbre.length}</strong>{pluriel(arbre.length, 'établissement', 'établissements')}</div>
        <div role="listitem"><strong>{nbCampus}</strong>campus</div>
        <div role="listitem"><strong>{classes.length}</strong>{pluriel(classes.length, 'classe', 'classes')}</div>
        <div role="listitem"><strong>{nbEleves}</strong>{pluriel(nbEleves, 'élève', 'élèves')}</div>
      </div>

      {reprises.length > 0 && (
        <section>
          <h2>Reprendre</h2>
          <div className="row" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            {reprises.map(({ cl, etab }) => (
              <button key={cl.id} type="button" className="btn"
                onClick={() => onAller({ type: 'classe', id: cl.id })}>
                {cl.nom} ({etab.nom})
              </button>
            ))}
          </div>
        </section>
      )}

      <h2>Mes établissements</h2>
      {!chargement && arbre.length === 0 && (
        <p className="muted">
          Tu n’as pas encore d’établissement. Crée le premier pour y ajouter ses campus, ses classes et ses élèves.
        </p>
      )}

      <div className="tuiles">
        {arbre.map((e) => {
          const cls = e.campus.flatMap((c) => c.classes)
          const eleves = cls.reduce((s, cl) => s + compte(cl), 0)
          return (
            <button key={e.id} type="button" className="tuile"
              onClick={() => onAller({ type: 'etab', id: e.id })}>
              <span className="tuile-logo">
                {logos[e.logo_path]
                  ? <img src={logos[e.logo_path]} alt="" />
                  : <span className="initiale">{e.nom.trim().charAt(0).toUpperCase()}</span>}
              </span>
              <span className="tuile-corps">
                <span className="tuile-nom">{e.nom}</span>
                <span className="tuile-meta">
                  {e.campus.length} campus, {cls.length} {pluriel(cls.length, 'classe', 'classes')}, {eleves} {pluriel(eleves, 'élève', 'élèves')}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <section className="card">
        <h2>Nouvel établissement</h2>
        <form onSubmit={ajouter} className="row" style={{ marginTop: 0 }}>
          <input className="input" placeholder="Nom de l’établissement" value={nouveau}
            onChange={(e) => setNouveau(e.target.value)} required maxLength={150} />
          <button type="submit" className="btn btn-primary">Ajouter l’établissement</button>
        </form>
        {erreur && <p className="muted">{erreur}</p>}
      </section>
    </>
  )
}