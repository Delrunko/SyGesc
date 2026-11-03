import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import AbsenceCalendar from './AbsenceCalendar.jsx'

const STATUTS = [
  ['present', 'Présent', 'badge-present'],
  ['absent', 'Absent', 'badge-absent'],
  ['excuse', 'Excusé', 'badge-excuse'],
]
const LIBELLES_STATUTS = Object.fromEntries(STATUTS.map(([valeur, label]) => [valeur, label]))

function aujourdhui() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

export default function Presences({ classe }) {
  const [matieres, setMatieres] = useState([])
  const [matiereId, setMatiereId] = useState('')
  const [date, setDate] = useState(aujourdhui())
  const [creneau, setCreneau] = useState(1)
  const [seance, setSeance] = useState(null)
  const [eleves, setEleves] = useState([])
  const [statuts, setStatuts] = useState({})
  const [erreur, setErreur] = useState('')
  const [revisionCalendrier, setRevisionCalendrier] = useState(0)

  useEffect(() => {
    supabase.from('matieres').select('id, nom').eq('classe_id', classe.id).order('nom')
      .then(({ data, error }) => {
        if (error) setErreur(error.message)
        else { setMatieres(data); if (data[0]) setMatiereId(data[0].id) }
      })
  }, [classe.id])

  useEffect(() => { setSeance(null) }, [matiereId, date, creneau])

  async function ouvrir(matiere = matiereId, jour = date, slot = creneau) {
    setErreur('')
    const { data: s, error } = await supabase.from('seances')
      .upsert({ matiere_id: matiere, date: jour, creneau: Number(slot) },
        { onConflict: 'matiere_id,date,creneau' })
      .select('id').single()
    if (error) { setErreur(error.message); return }
    setRevisionCalendrier((revision) => revision + 1)
    setMatiereId(matiere)
    setDate(jour)
    setCreneau(Number(slot))
    const [r1, r2] = await Promise.all([
      supabase.from('eleves').select('id, matricule, nom').eq('classe_id', classe.id).order('nom'),
      supabase.from('presences').select('eleve_id, statut').eq('seance_id', s.id),
    ])
    if (r1.error || r2.error) { setErreur((r1.error || r2.error).message); return }
    setEleves(r1.data)
    setStatuts(Object.fromEntries(r2.data.map((p) => [p.eleve_id, p.statut])))
    setSeance(s.id)
  }

  async function marquer(eleveId, statut) {
    const { error } = await supabase.from('presences')
      .upsert({ seance_id: seance, eleve_id: eleveId, statut }, { onConflict: 'seance_id,eleve_id' })
    if (error) setErreur(error.message)
    else {
      setStatuts((s) => ({ ...s, [eleveId]: statut }))
      setRevisionCalendrier((revision) => revision + 1)
    }
  }

  async function nonRenseignesPresents() {
    const lignes = eleves.filter((e) => !statuts[e.id])
      .map((e) => ({ seance_id: seance, eleve_id: e.id, statut: 'present' }))
    if (lignes.length === 0) return
    const { error } = await supabase.from('presences')
      .upsert(lignes, { onConflict: 'seance_id,eleve_id' })
    if (error) { setErreur(error.message); return }
    setStatuts((s) => ({ ...s, ...Object.fromEntries(lignes.map((l) => [l.eleve_id, 'present'])) }))
    setRevisionCalendrier((revision) => revision + 1)
  }

  const compte = (st) => eleves.filter((e) => statuts[e.id] === st).length

  if (matieres.length === 0) {
    return (
      <section className="card">
        <h2>Présences</h2>
        {erreur && <p className="muted">{erreur}</p>}
        <p className="muted">Crée d’abord une matière dans l’onglet Matières.</p>
      </section>
    )
  }

  return (
    <div className="gestion-page">
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      <AbsenceCalendar
        classe={classe}
        matieres={matieres}
        date={date}
        refreshKey={revisionCalendrier}
        onSelectDate={setDate}
        onOpenSession={ouvrir}
      />
      <section className="card">
        <h2>Présences</h2>
        <div className="row">
          <select className="input" value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
          <input className="input" type="date" value={date} required
            onChange={(e) => setDate(e.target.value)} />
          <select className="input" value={creneau} onChange={(e) => setCreneau(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>Créneau {n}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={ouvrir} disabled={!date}>
            Ouvrir la séance
          </button>
        </div>

        {seance && (
          <>
            <p className="muted">
              Présents : {compte('present')} · Absents : {compte('absent')} · Excusés : {compte('excuse')} ·
              Non renseignés : {eleves.length - compte('present') - compte('absent') - compte('excuse')}
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={nonRenseignesPresents}>
                Marquer présents les non renseignés
              </button>
            </div>
            {eleves.length === 0 && <p className="muted">Aucun élève dans cette classe.</p>}
            {eleves.length > 0 && (
              <div className="presences-table-scroll">
                <table className="apercu tableau-presences">
                  <thead>
                    <tr>
                      <th scope="col">Élève</th>
                      <th scope="col">
                        Séance — {matieres.find((matiere) => matiere.id === matiereId)?.nom},
                        {' '}{date.split('-').reverse().join('/')} · Créneau {creneau}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {eleves.map((el) => {
                      const statut = statuts[el.id]
                      return (
                        <tr className={`presence-ligne presence-${statut || 'non-renseignee'}`} key={el.id}>
                          <th scope="row">
                            <span>{el.nom}</span>
                            {el.matricule && <small>{el.matricule}</small>}
                          </th>
                          <td>
                            <div className="presence-cellule">
                              <span className={`presence-etat ${statut ? `badge-${statut}` : 'badge-non-renseigne'}`}>
                                {LIBELLES_STATUTS[statut] || 'Non renseigné'}
                              </span>
                              <div className="presence-commandes" role="group" aria-label={`Présence de ${el.nom}`}>
                                {STATUTS.map(([valeur, label, classeBadge]) => (
                                  <button
                                    key={valeur}
                                    type="button"
                                    className={`presence-choix ${statut === valeur ? `badge ${classeBadge}` : ''}`}
                                    aria-pressed={statut === valeur}
                                    onClick={() => marquer(el.id, valeur)}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}