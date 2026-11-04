import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const TAILLE_IMPORT_MAX = 5 * 1024 * 1024
const LIGNES_IMPORT_MAX = 500

function aujourdhui() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

const num = (s) => Number(String(s).trim().replace(',', '.'))
const normaliserEntete = (value) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const normaliserMatricule = (value) => String(value ?? '').trim().toLocaleUpperCase('fr')

async function lireExcel(file) {
  const { readSheet } = await import('read-excel-file/browser')
  const rows = await readSheet(file)
  return rows.map((row) => row.map((cell) => String(cell ?? '').trim()))
}

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
  const [lignesImport, setLignesImport] = useState([])
  const [colonneMatriculeImport, setColonneMatriculeImport] = useState(0)
  const [colonneNoteImport, setColonneNoteImport] = useState(1)
  const [enteteImport, setEnteteImport] = useState(true)
  const [lectureImport, setLectureImport] = useState(false)
  const [importEnCours, setImportEnCours] = useState(false)

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
    setLignesImport([])
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

  async function choisirFichierNotes(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setErreur('')
    setInfo('')
    setLignesImport([])
    if (!file.name.toLocaleLowerCase('fr').endsWith('.xlsx')) {
      setErreur('Choisis un fichier Excel .xlsx contenant une colonne matricule et une colonne note.')
      return
    }
    if (file.size > TAILLE_IMPORT_MAX) {
      setErreur('Le fichier dépasse la limite de 5 Mo.')
      return
    }
    setLectureImport(true)
    try {
      const rows = await lireExcel(file)
      const propres = rows.filter((row) => row.some((cell) => cell !== ''))
      if (propres.length === 0) {
        setErreur('Le fichier Excel ne contient aucune ligne.')
        return
      }
      if (propres.length > LIGNES_IMPORT_MAX + 1) {
        setErreur(`Le fichier dépasse la limite de ${LIGNES_IMPORT_MAX} élèves.`)
        return
      }
      const entetes = propres[0].map(normaliserEntete)
      const indexMatricule = entetes.findIndex((value) =>
        ['matricule', 'numero_matricule', 'code_eleve', 'id_eleve', 'mat'].includes(value))
      const indexNote = entetes.findIndex((value) =>
        ['note', 'valeur', 'score', 'resultat'].includes(value) || value.startsWith('note_'))
      setColonneMatriculeImport(indexMatricule >= 0 ? indexMatricule : 0)
      setColonneNoteImport(indexNote >= 0 ? indexNote : Math.min(1, Math.max(0, propres[0].length - 1)))
      setEnteteImport(true)
      setLignesImport(propres)
    } catch (cause) {
      setErreur(`Lecture impossible : ${cause?.message || 'fichier invalide.'}`)
    } finally {
      setLectureImport(false)
    }
  }

  const colonnesImport = Math.max(2, ...lignesImport.slice(0, 20).map((row) => row.length))
  const donneesImport = lignesImport.slice(enteteImport ? 1 : 0).slice(0, LIGNES_IMPORT_MAX)
  const elevesParMatricule = new Map(eleves.map((eleve) => [
    normaliserMatricule(eleve.matricule),
    eleve,
  ]))
  const compteursImport = new Map()
  donneesImport.forEach((row) => {
    const matricule = normaliserMatricule(row[colonneMatriculeImport])
    if (matricule) compteursImport.set(matricule, (compteursImport.get(matricule) || 0) + 1)
  })
  const lignesPreparees = donneesImport.map((row, index) => {
    const matricule = normaliserMatricule(row[colonneMatriculeImport])
    const brutNote = String(row[colonneNoteImport] ?? '').trim()
    const eleve = elevesParMatricule.get(matricule)
    const note = brutNote ? num(brutNote) : Number.NaN
    let raison = ''
    if (!matricule) raison = 'Matricule manquant'
    else if ((compteursImport.get(matricule) || 0) > 1) raison = 'Matricule répété dans le fichier'
    else if (!eleve) raison = 'Élève absent de cette classe'
    else if (!brutNote || !Number.isFinite(note)) raison = 'Note non numérique'
    else if (note < 0 || note > ouverte.note_max) raison = `Note hors barème (0 à ${ouverte.note_max})`
    return {
      ligne: index + (enteteImport ? 2 : 1),
      matricule,
      note,
      eleve,
      raison,
      vide: !matricule && !brutNote,
    }
  }).filter((row) => !row.vide)
  const notesImportables = lignesPreparees.filter((row) => !row.raison)

  async function importerNotes() {
    if (notesImportables.length === 0) {
      setErreur('Aucune ligne importable. Vérifie le mappage des colonnes et les matricules.')
      return
    }
    setImportEnCours(true)
    setErreur('')
    setInfo('')
    try {
      const notes = notesImportables.map((row) => ({
        evaluation_id: ouverte.id,
        eleve_id: row.eleve.id,
        valeur: row.note,
      }))
      const { error: importError } = await supabase.from('notes')
        .upsert(notes, { onConflict: 'evaluation_id,eleve_id' })
      if (importError) {
        setErreur(`Import impossible : ${importError.message}`)
        return
      }
      setSaisies((courantes) => ({
        ...courantes,
        ...Object.fromEntries(notes.map((note) => [note.eleve_id, String(note.valeur)])),
      }))
      setExistantes((courantes) => ({
        ...courantes,
        ...Object.fromEntries(notes.map((note) => [note.eleve_id, true])),
      }))
      setInfo(`${notes.length} note(s) importée(s) pour « ${ouverte.titre} ». Les autres lignes non importées sont indiquées dans le récapitulatif.`)
      setLignesImport([])
    } catch (cause) {
      setErreur(`Import impossible : ${cause?.message || 'erreur inattendue.'}`)
    } finally {
      setImportEnCours(false)
    }
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
          <details className="notes-import">
            <summary>
              <span><strong>Importer les notes depuis Excel</strong><small>Associer les notes existantes aux élèves par matricule</small></span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="notes-import-content">
              <p className="muted">
                Utilise un fichier .xlsx avec une ligne par élève et des colonnes matricule et note.
                Les élèves doivent déjà être inscrits dans cette classe. Garde les matricules au format texte pour préserver les zéros initiaux. Les notes importées sont enregistrées pour cette évaluation et remplacent les notes précédentes correspondantes.
              </p>
              <label className="import-file">
                <span>Choisir un fichier Excel (.xlsx)</span>
                <input type="file" accept=".xlsx" onChange={choisirFichierNotes} disabled={lectureImport || importEnCours} />
              </label>
              {lectureImport && <p className="muted" role="status">Lecture du fichier…</p>}
              {lignesImport.length > 0 && (
                <>
                  <div className="gestion-form gestion-form-compact notes-import-mapping">
                    <label>Colonne matricule
                      <select className="input" value={colonneMatriculeImport}
                        onChange={(event) => setColonneMatriculeImport(Number(event.target.value))}>
                        {Array.from({ length: colonnesImport }, (_, index) =>
                          <option key={index} value={index}>Colonne {index + 1}</option>)}
                      </select>
                    </label>
                    <label>Colonne note
                      <select className="input" value={colonneNoteImport}
                        onChange={(event) => setColonneNoteImport(Number(event.target.value))}>
                        {Array.from({ length: colonnesImport }, (_, index) =>
                          <option key={index} value={index}>Colonne {index + 1}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="gestion-checkbox">
                    <input type="checkbox" checked={enteteImport}
                      onChange={(event) => setEnteteImport(event.target.checked)} />
                    La première ligne contient les en-têtes
                  </label>
                  <p className="notes-import-summary" role="status">
                    {notesImportables.length} ligne(s) prête(s) · {lignesPreparees.length - notesImportables.length} ligne(s) à vérifier
                  </p>
                  {lignesPreparees.some((row) => row.raison) && (
                    <ul className="notes-import-errors">
                      {lignesPreparees.filter((row) => row.raison).slice(0, 8).map((row) => (
                        <li key={`${row.ligne}-${row.matricule || 'vide'}`}>
                          Ligne {row.ligne} {row.matricule ? `(${row.matricule})` : ''} : {row.raison}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="gestion-table-scroll">
                    <table className="apercu gestion-table">
                      <thead><tr><th scope="col">Ligne</th><th scope="col">Matricule</th><th scope="col">Élève reconnu</th><th scope="col">Note / {ouverte.note_max}</th><th scope="col">État</th></tr></thead>
                      <tbody>
                        {lignesPreparees.slice(0, 8).map((row) => (
                          <tr key={`preview-${row.ligne}`}>
                            <td>{row.ligne}</td>
                            <td>{row.matricule || '—'}</td>
                            <td>{row.eleve?.nom || '—'}</td>
                            <td>{Number.isFinite(row.note) ? row.note : '—'}</td>
                            <td>{row.raison || 'Prête'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="btn btn-primary"
                    onClick={importerNotes}
                    disabled={importEnCours || notesImportables.length === 0}>
                    {importEnCours ? 'Import en cours…' : `Importer ${notesImportables.length} note(s)`}
                  </button>
                </>
              )}
            </div>
          </details>
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