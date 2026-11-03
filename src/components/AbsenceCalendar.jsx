import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const STATUTS = {
  present: 'Présent',
  absent: 'Absent',
  excuse: 'Excusé',
}

function dateLocale(date) {
  const mois = String(date.getMonth() + 1).padStart(2, '0')
  const jour = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mois}-${jour}`
}

function moisDebut(date) {
  return `${date.slice(0, 7)}-01`
}

function decalerMois(date, delta) {
  const [annee, mois] = date.split('-').map(Number)
  return dateLocale(new Date(annee, mois - 1 + delta, 1))
}

function libelleDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function AbsenceCalendar({
  classe, matieres, date, refreshKey, onSelectDate, onOpenSession,
}) {
  const [mois, setMois] = useState(moisDebut(date))
  const [seances, setSeances] = useState([])
  const [eleves, setEleves] = useState({})
  const [presences, setPresences] = useState([])
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    setMois(moisDebut(date))
  }, [date])

  useEffect(() => {
    let actif = true
    async function charger() {
      if (matieres.length === 0) return
      setChargement(true)
      setErreur('')
      setSeances([])
      setPresences([])
      const [annee, moisActuel] = mois.split('-').map(Number)
      const fin = dateLocale(new Date(annee, moisActuel, 0))
      const matiereIds = matieres.map((matiere) => matiere.id)
      const [rSeances, rEleves] = await Promise.all([
        supabase.from('seances').select('id, matiere_id, date, creneau')
          .in('matiere_id', matiereIds).gte('date', mois).lte('date', fin)
          .order('date').order('creneau'),
        supabase.from('eleves').select('id, nom, matricule').eq('classe_id', classe.id).order('nom'),
      ])
      if (rSeances.error || rEleves.error) {
        if (actif) {
          setErreur((rSeances.error || rEleves.error).message)
          setChargement(false)
        }
        return
      }
      if (!actif) return
      setEleves(Object.fromEntries(rEleves.data.map((eleve) => [eleve.id, eleve])))
      setSeances(rSeances.data)
      if (rSeances.data.length === 0) {
        setPresences([])
        setChargement(false)
        return
      }
      const rPresences = await supabase.from('presences')
        .select('seance_id, eleve_id, statut')
        .in('seance_id', rSeances.data.map((seance) => seance.id))
      if (!actif) return
      if (rPresences.error) {
        setErreur(rPresences.error.message)
        setChargement(false)
        return
      }
      setPresences(rPresences.data)
      setChargement(false)
    }
    charger()
    return () => { actif = false }
  }, [classe.id, matieres, mois, refreshKey])

  const matiereParId = useMemo(
    () => Object.fromEntries(matieres.map((matiere) => [matiere.id, matiere.nom])),
    [matieres],
  )
  const seancesParDate = useMemo(() => {
    const regroupement = {}
    seances.forEach((seance) => {
      regroupement[seance.date] ||= []
      regroupement[seance.date].push(seance)
    })
    return regroupement
  }, [seances])
  const presencesParSeance = useMemo(() => {
    const regroupement = {}
    presences.forEach((presence) => {
      regroupement[presence.seance_id] ||= []
      regroupement[presence.seance_id].push(presence)
    })
    return regroupement
  }, [presences])

  const [annee, moisActuel] = mois.split('-').map(Number)
  const nombreJours = new Date(annee, moisActuel, 0).getDate()
  const decalage = (new Date(annee, moisActuel - 1, 1).getDay() + 6) % 7
  const jours = [
    ...Array.from({ length: decalage }, (_, index) => ({ id: `vide-${index}`, date: null })),
    ...Array.from({ length: nombreJours }, (_, index) => {
      const jour = String(index + 1).padStart(2, '0')
      return { id: `${annee}-${String(moisActuel).padStart(2, '0')}-${jour}`, date: `${annee}-${String(moisActuel).padStart(2, '0')}-${jour}` }
    }),
  ]
  const seancesSelectionnees = seancesParDate[date] || []
  const moisTitre = new Date(annee, moisActuel - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  function resumeJour(jour) {
    const resume = { absent: 0, excuse: 0 }
    ;(seancesParDate[jour] || []).forEach((seance) => {
      ;(presencesParSeance[seance.id] || []).forEach((presence) => {
        if (presence.statut === 'absent') resume.absent += 1
        if (presence.statut === 'excuse') resume.excuse += 1
      })
    })
    return resume
  }

  return (
    <section className="card absence-calendar">
      <header className="gestion-card-heading">
        <div>
          <p className="gestion-eyebrow">Suivi des absences</p>
          <h3>Calendrier des présences</h3>
        </div>
        <div className="calendar-month-controls">
          <button type="button" className="btn btn-small"
            aria-label="Mois précédent"
            onClick={() => {
              const next = decalerMois(mois, -1)
              setMois(moisDebut(next))
              onSelectDate(next)
            }}>←</button>
          <strong aria-live="polite">{moisTitre}</strong>
          <button type="button" className="btn btn-small"
            aria-label="Mois suivant"
            onClick={() => {
              const next = decalerMois(mois, 1)
              setMois(moisDebut(next))
              onSelectDate(next)
            }}>→</button>
        </div>
      </header>
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="muted" role="status">Chargement du calendrier…</p>}
      <div className="absence-calendar-layout">
        <div className="calendar-grid" role="group" aria-label={`Calendrier de ${moisTitre}`}>
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((jour) => (
            <span className="calendar-weekday" key={jour}>{jour}</span>
          ))}
          {jours.map(({ id, date: jour }) => {
            if (!jour) return <span className="calendar-empty" aria-hidden="true" key={id} />
            const resume = resumeJour(jour)
            const compteSeances = (seancesParDate[jour] || []).length
            return (
              <button type="button" key={jour}
                className={`calendar-day${date === jour ? ' selected' : ''}${compteSeances ? ' has-session' : ''}`}
                aria-label={`${libelleDate(jour)}${compteSeances ? `, ${compteSeances} séance(s), ${resume.absent} absence(s), ${resume.excuse} excusée(s)` : ', aucune séance'}`}
                aria-pressed={date === jour}
                onClick={() => onSelectDate(jour)}>
                <span>{Number(jour.slice(-2))}</span>
                {compteSeances > 0 && (
                  <small>
                    {compteSeances} séance{compteSeances > 1 ? 's' : ''}
                    {(resume.absent + resume.excuse) > 0 && ` · ${resume.absent + resume.excuse} abs.`}
                  </small>
                )}
              </button>
            )
          })}
        </div>
        <aside className="calendar-day-details" aria-live="polite">
          <p className="gestion-eyebrow">Journée sélectionnée</p>
          <h4>{libelleDate(date)}</h4>
          {seancesSelectionnees.length === 0 ? (
            <p className="muted">Aucune séance enregistrée ce jour.</p>
          ) : seancesSelectionnees.map((seance) => {
            const enregistrements = presencesParSeance[seance.id] || []
            const absents = enregistrements.filter((presence) =>
              presence.statut === 'absent' || presence.statut === 'excuse')
            return (
              <article className="calendar-session" key={seance.id}>
                <div className="calendar-session-heading">
                  <strong>{matiereParId[seance.matiere_id] || 'Matière'} · Créneau {seance.creneau}</strong>
                  <span>{absents.filter((presence) => presence.statut === 'absent').length} absent(s)</span>
                </div>
                {absents.length > 0 ? (
                  <ul className="calendar-absence-list">
                    {absents.map((presence) => (
                      <li key={presence.eleve_id}>
                        <span>{eleves[presence.eleve_id]?.nom || 'Élève'}</span>
                        <span className={`badge ${presence.statut === 'absent' ? 'badge-absent' : 'badge-excuse'}`}>
                          {STATUTS[presence.statut]}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">Aucune absence enregistrée.</p>}
                <button type="button" className="btn btn-small"
                  onClick={() => onOpenSession(seance.matiere_id, seance.date, seance.creneau)}>
                  Modifier les présences
                </button>
              </article>
            )
          })}
        </aside>
      </div>
      <p className="gestion-table-footnote">
        Les compteurs affichent les absences saisies. Ouvre une séance pour corriger ou compléter les présences.
      </p>
    </section>
  )
}
