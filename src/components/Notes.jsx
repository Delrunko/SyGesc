import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

function aujourdhui() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

const num = (s) => Number(String(s).trim().replace(',', '.'))

export default function Notes({ classe }) {
  const [matieres, setMatieres] = useState([])
  const [periodes, setPeriodes] = useState([])
  const [matiereId, setMatiereId] = useState('')
  const [evals, setEvals] = useState([])
  const [titre, setTitre] = useState('')
  const [coef, setCoef] = useState('1')
  const [noteMax, setNoteMax] = useState('20')
  const [date, setDate] = useState(aujourdhui())
  const [ouverte, setOuverte] = useState(null)
  const [eleves, setEleves] = useState([])
  const [saisies, setSaisies] = useState({})
  const [existantes, setExistantes] = useState({})
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    supabase.from('matieres').select('id, nom').eq('classe_id', classe.id).order('nom')
      .then(({ data, error }) => {
        if (error) setErreur(error.message)
        else { setMatieres(data); if (data[0]) setMatiereId(data[0].id) }
      })
    supabase.from('periodes').select('id, nom, date_debut, date_fin')
      .eq('classe_id', classe.id).order('date_debut')
      .then(({ data, error }) => {
        if (error) setErreur(error.message)
        else setPeriodes(data)
      })
  }, [classe.id])

  async function chargerEvals() {
    if (!matiereId) return
    const { data, error } = await supabase.from('evaluations')
      .select('id, titre, coefficient, note_max, date')
      .eq('matiere_id', matiereId).order('date', { ascending: false })
    if (error) setErreur(error.message)
    else setEvals(data)
  }

  useEffect(() => { setOuverte(null); setErreur(''); setInfo(''); chargerEvals() }, [matiereId])

  async function ajouterEval(e) {
    e.preventDefault()
    const c = num(coef)
    const max = num(noteMax)
    if (!(c > 0) || c > 99.99) { setErreur('Coefficient invalide (0,01 à 99,99).'); return }
    if (!(max > 0) || max > 999.99) { setErreur('Barème invalide (0,01 à 999,99).'); return }
    const { error } = await supabase.from('evaluations').insert({
      matiere_id: matiereId, titre: titre.trim(), coefficient: c, note_max: max, date,
    })
    if (error) { setErreur(error.message); return }
    setErreur('')
    setInfo(`L’évaluation « ${titre.trim()} » a été créée.`)
    setTitre('')
    setCoef('1')
    setNoteMax('20')
    await chargerEvals()
  }

  async function supprimerEval(id) {
    if (!window.confirm('Supprimer cette évaluation et toutes ses notes ?')) return
    const { error } = await supabase.from('evaluations').delete().eq('id', id)
    if (error) setErreur(error.message)
    else chargerEvals()
  }

  async function ouvrirEval(ev) {
    setErreur(''); setInfo('')
    const [r1, r2] = await Promise.all([
      supabase.from('eleves').select('id, matricule, nom').eq('classe_id', classe.id).order('nom'),
      supabase.from('notes').select('eleve_id, valeur').eq('evaluation_id', ev.id),
    ])
    if (r1.error || r2.error) { setErreur((r1.error || r2.error).message); return }
    setEleves(r1.data)
    setSaisies(Object.fromEntries(r2.data.map((n) => [n.eleve_id, String(n.valeur)])))
    setExistantes(Object.fromEntries(r2.data.map((n) => [n.eleve_id, true])))
    setOuverte(ev)
  }

  async function enregistrer() {
    const lignes = []
    const aSupprimer = []
    const invalides = []
    for (const el of eleves) {
      const brut = (saisies[el.id] ?? '').trim()
      if (brut === '') { if (existantes[el.id]) aSupprimer.push(el.id); continue }
      const v = num(brut)
      if (!Number.isFinite(v) || v < 0 || v > ouverte.note_max) { invalides.push(el.nom); continue }
      lignes.push({ evaluation_id: ouverte.id, eleve_id: el.id, valeur: v })
    }
    if (invalides.length > 0) {
      setInfo('')
      setErreur(`Note invalide (0 à ${ouverte.note_max}) pour : ${invalides.join(', ')}`)
      return
    }
    if (lignes.length > 0) {
      const { error } = await supabase.from('notes')
        .upsert(lignes, { onConflict: 'evaluation_id,eleve_id' })
      if (error) { setErreur(error.message); return }
    }
    if (aSupprimer.length > 0) {
      const { error } = await supabase.from('notes').delete()
        .eq('evaluation_id', ouverte.id).in('eleve_id', aSupprimer)
      if (error) { setErreur(error.message); return }
    }
    setExistantes(Object.fromEntries(lignes.map((l) => [l.eleve_id, true])))
    setErreur('')
    setInfo('Notes enregistrées.')
  }

  if (matieres.length === 0) {
    return (
      <div className="gestion-page">
        <header className="gestion-heading">
          <div><p className="gestion-eyebrow">Suivi pédagogique</p><h2>Notes & évaluations</h2></div>
        </header>
        <section className="card gestion-card">
          {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
          <p className="gestion-empty">Crée d’abord une matière dans l’onglet Matières pour commencer à saisir des notes.</p>
        </section>
      </div>
    )
  }

  if (ouverte) {
    const valeurs = eleves
      .map((el) => (saisies[el.id] ?? '').trim())
      .filter((s) => s !== '')
      .map(num)
      .filter((v) => Number.isFinite(v) && v >= 0 && v <= ouverte.note_max)
    const moyenne = valeurs.length
      ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
        .format(valeurs.reduce((a, b) => a + b, 0) / valeurs.length)
      : '-'
    return (
      <div className="gestion-page">
        {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
        {info && <p className="assistant-notice" role="status">{info}</p>}
        <header className="gestion-heading">
          <div>
            <button type="button" className="link-btn gestion-retour"
              onClick={() => { setOuverte(null); setInfo(''); setErreur('') }}>
              ← Retour aux évaluations
            </button>
            <p className="gestion-eyebrow">Saisie des résultats · {matieres.find((m) => m.id === matiereId)?.nom}</p>
            <h2>{ouverte.titre}</h2>
            <p className="muted">Barème sur {ouverte.note_max} · Coefficient {ouverte.coefficient}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={enregistrer}>
            Enregistrer les notes
          </button>
        </header>
        <div className="gestion-metrics">
          <article className="gestion-metric"><span>Notes saisies</span><strong>{valeurs.length} / {eleves.length}</strong></article>
          <article className="gestion-metric"><span>Moyenne de la classe</span><strong>{moyenne}{moyenne !== '-' ? ` / ${ouverte.note_max}` : ''}</strong></article>
          <article className="gestion-metric"><span>Sans note</span><strong>{eleves.length - valeurs.length}</strong></article>
        </div>
        <section className="card gestion-card">
          <div className="gestion-card-heading">
            <div><p className="gestion-eyebrow">Évaluation individuelle</p><h3>Notes par élève</h3></div>
            <span className="gestion-total">{eleves.length} élèves</span>
          </div>
          <div className="gestion-table-scroll">
            <table className="apercu gestion-table notes-table">
              <thead>
                <tr><th scope="col">N°</th><th scope="col">Matricule</th><th scope="col">Nom complet</th><th scope="col">Note / {ouverte.note_max}</th><th scope="col">État</th></tr>
              </thead>
              <tbody>
                {eleves.map((el, index) => {
                  const saisie = (saisies[el.id] ?? '').trim()
                  const noteValide = saisie !== '' && Number.isFinite(num(saisie)) &&
                    num(saisie) >= 0 && num(saisie) <= ouverte.note_max
                  return (
                    <tr key={el.id}>
                      <td className="gestion-row-number">{String(index + 1).padStart(2, '0')}</td>
                      <td><span className="gestion-code">{el.matricule}</span></td>
                      <th scope="row">{el.nom}</th>
                      <td>
                        <input className="input note-input" type="text" inputMode="decimal" placeholder="—"
                          aria-label={`Note de ${el.nom}`}
                          value={saisies[el.id] ?? ''}
                          onChange={(e) => setSaisies((courantes) => ({ ...courantes, [el.id]: e.target.value }))} />
                      </td>
                      <td>
                        <span className={`gestion-etat ${noteValide ? 'gestion-etat-ok' : 'gestion-etat-vide'}`}>
                          {noteValide ? 'Saisie' : 'À compléter'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="gestion-actions">
            <button type="button" className="btn btn-primary" onClick={enregistrer}>Enregistrer les notes</button>
            <button type="button" className="btn" onClick={() => { setOuverte(null); setInfo(''); setErreur('') }}>
              Retour aux évaluations
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="gestion-page">
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      {info && <p className="assistant-notice" role="status">{info}</p>}
      <header className="gestion-heading">
        <div>
          <p className="gestion-eyebrow">Suivi pédagogique · {classe.annee_scolaire}</p>
          <h2>Notes & évaluations</h2>
          <p className="muted">Crée des évaluations et saisis les résultats de chaque élève.</p>
        </div>
        <label className="gestion-subject-select">
          <span>Matière sélectionnée</span>
          <select className="input" value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </label>
      </header>

      <section className="card gestion-card">
        <div className="gestion-card-heading">
          <div><p className="gestion-eyebrow">Nouvelle évaluation</p><h3>Créer une évaluation</h3></div>
        </div>
        <form onSubmit={ajouterEval} className="gestion-form notes-create-form">
          <label>
            Titre
            <input className="input" placeholder="Ex. Devoir 1" value={titre}
              onChange={(e) => setTitre(e.target.value)} required maxLength={150} />
          </label>
          <label>
            Coefficient
            <input className="input" type="number" min="0.01" max="99.99" step="0.01"
              placeholder="1" inputMode="decimal" value={coef}
              onChange={(e) => setCoef(e.target.value)} required />
          </label>
          <label>
            Barème
            <input className="input" type="number" min="0.01" max="999.99" step="0.01"
              placeholder="20" inputMode="decimal" value={noteMax}
              onChange={(e) => setNoteMax(e.target.value)} required />
          </label>
          <label>
            Date
            <input className="input" type="date" value={date} required
              onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">Créer l’évaluation</button>
        </form>
      </section>

      <section className="card gestion-card">
        <div className="gestion-card-heading">
          <div><p className="gestion-eyebrow">Carnet de notes</p><h3>Évaluations</h3></div>
          <span className="gestion-total">{evals.length} évaluation{evals.length === 1 ? '' : 's'}</span>
        </div>
        {evals.length === 0
          ? <p className="gestion-empty">Aucune évaluation pour cette matière. Crée la première ci-dessus.</p>
          : (
            <div className="gestion-table-scroll">
              <table className="apercu gestion-table">
                <thead>
                  <tr><th scope="col">Évaluation</th><th scope="col">Date</th><th scope="col">Période</th><th scope="col">Barème</th><th scope="col">Coefficient</th><th scope="col">Actions</th></tr>
                </thead>
                <tbody>
                  {evals.map((ev) => (
                    <tr key={ev.id}>
                      <th scope="row">{ev.titre}</th>
                      <td>{new Date(`${ev.date}T12:00:00`).toLocaleDateString('fr-FR')}</td>
                      <td>{periodes.find((periode) =>
                        ev.date >= periode.date_debut && ev.date <= periode.date_fin)?.nom || 'Hors période'}</td>
                      <td><span className="gestion-code">/{ev.note_max}</span></td>
                      <td>× {ev.coefficient}</td>
                      <td>
                        <div className="gestion-actions">
                          <button type="button" className="btn btn-primary btn-small" onClick={() => ouvrirEval(ev)}>
                            Saisir les notes
                          </button>
                          <button type="button" className="btn btn-danger btn-small"
                            onClick={() => supprimerEval(ev.id)} aria-label={`Supprimer ${ev.titre}`}>
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  )
}