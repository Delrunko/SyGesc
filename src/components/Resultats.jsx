import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Bulletin from './Bulletin.jsx'
import DashboardCharts from './DashboardCharts.jsx'
import { exportToExcel, exportToPDF, printTable } from '../utils/export.js'

const fmt = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(2))

export default function Resultats({ classe, enseignantNom, roleAcces = 'enseignant' }) {
  const estResponsable = roleAcces === 'responsable'
  const [matieres, setMatieres] = useState([])
  const [lignes, setLignes] = useState([])
  const [presences, setPresences] = useState([])
  const [periodes, setPeriodes] = useState([])
  const [periodeId, setPeriodeId] = useState('')
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)
  const [bulletin, setBulletin] = useState(null)
  const [classeReferences, setClasseReferences] = useState('')
  const [nomPeriode, setNomPeriode] = useState('')
  const [debutPeriode, setDebutPeriode] = useState('')
  const [finPeriode, setFinPeriode] = useState('')
  const [enregistrementPeriode, setEnregistrementPeriode] = useState(false)

  useEffect(() => {
    let actif = true
    async function charger() {
      setClasseReferences('')
      setChargement(true)
      setBulletin(null)
      setMatieres([])
      setPeriodes([])
      setPeriodeId('')
      const [rm, rp] = await Promise.all([
        supabase.from('matieres').select('id, nom, coefficient').eq('classe_id', classe.id).order('nom'),
        supabase.from('periodes').select('id, nom, date_debut, date_fin')
          .eq('classe_id', classe.id).order('date_debut'),
      ])
      if (!actif) return
      if (rm.error || rp.error) {
        setErreur((rm.error || rp.error).message)
        setChargement(false)
        return
      }
      setMatieres(rm.data)
      setPeriodes(rp.data)
      setErreur('')
      setClasseReferences(classe.id)
    }
    charger()
    return () => { actif = false }
  }, [classe.id])

  const periodeActive = periodes.find((periode) => periode.id === periodeId) || null

  useEffect(() => {
    if (classeReferences !== classe.id) return
    let actif = true
    async function charger() {
      setChargement(true)
      setErreur('')
      setLignes([])
      setPresences([])
      const rr = estResponsable
        ? periodeActive
          ? await supabase.rpc('resultats_classe_periode', {
            p_classe: classe.id,
            p_debut: periodeActive.date_debut,
            p_fin: periodeActive.date_fin,
          })
          : await supabase.rpc('resultats_classe', { p_classe: classe.id })
        : await supabase.rpc('liste_notes_classe', {
          p_classe: classe.id,
          p_debut: periodeActive?.date_debut || null,
          p_fin: periodeActive?.date_fin || null,
        })
      if (!actif) return
      if (rr.error) {
        setErreur(rr.error.message)
        setChargement(false)
        return
      }
      if (estResponsable) {
        setLignes(rr.data.map((r) => ({
          id: r.eleve_id,
          matricule: r.matricule,
          nom: r.nom,
          general: r.moyenne_generale === null ? null : Number(r.moyenne_generale),
          rang: r.rang,
          parMatiere: Object.fromEntries(
            Object.entries(r.par_matiere || {}).map(([k, v]) => [k, Number(v)])
          ),
        })))

        const rs = await supabase.from('presences').select('statut, eleve_id')
          .in('eleve_id', rr.data.map((r) => r.eleve_id))
        if (!actif) return
        if (!rs.error) setPresences(rs.data || [])
      } else {
        setLignes(rr.data.map((r, index) => ({
          id: `${r.eleve_id}-${r.date_evaluation}-${r.evaluation}-${index}`,
          eleveId: r.eleve_id,
          matricule: r.matricule,
          nom: r.nom,
          matiere: r.matiere,
          evaluation: r.evaluation,
          date: r.date_evaluation,
          valeur: r.valeur === null ? null : Number(r.valeur),
          noteMax: Number(r.note_max),
        })))
      }

      setErreur('')
      setChargement(false)
    }
    charger()
    return () => { actif = false }
  }, [classe.id, classeReferences, estResponsable, periodeActive?.id, periodeActive?.date_debut, periodeActive?.date_fin])

  async function ajouterPeriode(e) {
    e.preventDefault()
    if (!estResponsable) return
    setErreur('')
    if (!nomPeriode.trim()) {
      setErreur('Renseigne un nom pour cette période.')
      return
    }
    if (finPeriode < debutPeriode) {
      setErreur('La date de fin doit être postérieure ou égale à la date de début.')
      return
    }
    const chevauche = periodes.some((periode) =>
      debutPeriode <= periode.date_fin && finPeriode >= periode.date_debut)
    if (chevauche) {
      setErreur('Cette période chevauche une période déjà enregistrée. Ajuste les dates.')
      return
    }
    setEnregistrementPeriode(true)
    const { data, error } = await supabase.from('periodes')
      .insert({
        classe_id: classe.id,
        nom: nomPeriode.trim(),
        date_debut: debutPeriode,
        date_fin: finPeriode,
      })
      .select('id, nom, date_debut, date_fin')
      .single()
    setEnregistrementPeriode(false)
    if (error) {
      setErreur(error.message)
      return
    }
    const prochaines = [...periodes, data].sort((a, b) => a.date_debut.localeCompare(b.date_debut))
    setPeriodes(prochaines)
    setPeriodeId(data.id)
    setNomPeriode('')
    setDebutPeriode('')
    setFinPeriode('')
  }

  async function supprimerPeriode(periode) {
    if (!estResponsable) return
    if (!window.confirm(`Supprimer la période « ${periode.nom} » ? Les notes et évaluations restent intactes.`)) return
    const { error } = await supabase.from('periodes').delete()
      .eq('id', periode.id).eq('classe_id', classe.id)
    if (error) {
      setErreur(error.message)
      return
    }
    setPeriodes((courantes) => courantes.filter((item) => item.id !== periode.id))
    if (periodeId === periode.id) setPeriodeId('')
  }

  if (bulletin && estResponsable) {
    return <Bulletin classe={classe} eleve={bulletin} matieres={matieres}
      lignes={lignes} enseignantNom={enseignantNom} periode={bulletin.periode}
      onFermer={() => setBulletin(null)} />
  }

  const columns = () => {
    if (!estResponsable) {
      return [
        { label: 'Matricule', getValue: (l) => l.matricule },
        { label: 'Nom', getValue: (l) => l.nom },
        { label: 'Matière', getValue: (l) => l.matiere },
        { label: 'Évaluation', getValue: (l) => l.evaluation },
        { label: 'Date', getValue: (l) => new Date(`${l.date}T12:00:00`).toLocaleDateString('fr-FR') },
        { label: 'Note', getValue: (l) => fmt(l.valeur) },
        { label: 'Barème', getValue: (l) => fmt(l.noteMax) },
      ]
    }
    const cols = [
      { label: 'Rang', getValue: (l) => l.rang ?? '-' },
      { label: 'Matricule', getValue: (l) => l.matricule },
      { label: 'Nom', getValue: (l) => l.nom },
      ...matieres.map((m) => ({
        label: m.nom,
        getValue: (l) => fmt(l.parMatiere[m.id]),
      })),
      { label: 'Moyenne générale', getValue: (l) => fmt(l.general) },
    ]
    return cols
  }

  const enteteDocument = {
    etablissement: classe.etab?.nom,
    adresse: [classe.etab?.adresse, classe.campusNom, classe.campusVille].filter(Boolean).join(' · '),
    telephone: classe.etab?.telephone,
    email: classe.etab?.email,
    site_web: classe.etab?.site_web,
    logoUrl: classe.etab?.logo_url,
    enseignant: enseignantNom,
    matiere: matieres.map((matiere) => matiere.nom).join(', '),
    classe: classe.nom,
    annee: classe.annee_scolaire,
  }
  const periodeLabel = periodeActive?.nom || 'Année entière'
  const titreDocument = `Résultats - ${classe.nom} - ${periodeLabel}`
  async function executerExport(action) {
    setErreur('')
    try {
      await action()
    } catch (cause) {
      setErreur(cause?.message || 'Impossible de générer le document.')
    }
  }
  const handleExcel = () => executerExport(() =>
    exportToExcel(lignes, columns(), 'resultats.xlsx', { ...enteteDocument, titre: titreDocument }))
  const handlePDF = () => executerExport(() =>
    exportToPDF(titreDocument, columns(), lignes, 'resultats.pdf', enteteDocument))
  const handlePrint = () => executerExport(async () => {
    const table = document.querySelector('.resultats-table')
    if (!table) throw new Error('Le tableau des résultats est introuvable.')
    await printTable(table, titreDocument, enteteDocument)
  })
  const classes = estResponsable ? lignes.filter((ligne) => ligne.general !== null) : []
  const moyenneClasse = classes.length
    ? classes.reduce((total, ligne) => total + ligne.general, 0) / classes.length
    : null
  const meilleur = classes[0] || null

  return (
    <div className="gestion-page">
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      {chargement && <p className="gestion-empty" role="status">Calcul des résultats en cours...</p>}
      {!chargement && (
        <section className="card gestion-card period-controls">
          <label>
            Période des résultats
            <select className="input" value={periodeId}
              onChange={(e) => { setBulletin(null); setPeriodeId(e.target.value) }}>
              <option value="">Année entière</option>
              {periodes.map((periode) => (
                <option key={periode.id} value={periode.id}>
                  {periode.nom} · {new Date(`${periode.date_debut}T12:00:00`).toLocaleDateString('fr-FR')}
                  {' – '}{new Date(`${periode.date_fin}T12:00:00`).toLocaleDateString('fr-FR')}
                </option>
              ))}
            </select>
          </label>
          {estResponsable && (
            <details className="period-manager">
              <summary>Configurer les périodes / trimestres</summary>
              <p className="gestion-table-footnote">
                Une évaluation appartient à la période qui contient sa date. Les périodes ne doivent pas se chevaucher.
              </p>
              <form className="gestion-form period-create-form" onSubmit={ajouterPeriode}>
                <label>Nom de la période
                  <input className="input" value={nomPeriode} onChange={(e) => setNomPeriode(e.target.value)}
                    placeholder="Ex. Trimestre 1" maxLength={100} required />
                </label>
                <label>Du
                  <input className="input" type="date" value={debutPeriode}
                    onChange={(e) => setDebutPeriode(e.target.value)} required />
                </label>
                <label>Au
                  <input className="input" type="date" value={finPeriode}
                    onChange={(e) => setFinPeriode(e.target.value)} required />
                </label>
                <button type="submit" className="btn btn-primary" disabled={enregistrementPeriode}>
                  {enregistrementPeriode ? 'Enregistrement...' : 'Ajouter la période'}
                </button>
              </form>
              {periodes.length > 0 ? (
                <ul className="period-list">
                  {periodes.map((periode) => (
                    <li key={periode.id}>
                      <span><strong>{periode.nom}</strong> · {periode.date_debut} – {periode.date_fin}</span>
                      <button type="button" className="btn btn-danger btn-small"
                        onClick={() => supprimerPeriode(periode)}>Supprimer</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="gestion-empty">Aucune période configurée pour cette classe.</p>}
            </details>
          )}
        </section>
      )}
      {!chargement && estResponsable && lignes.length === 0 && (
        <p className="gestion-empty">Aucun élève dans cette classe.</p>
      )}
      {!chargement && !estResponsable && lignes.length === 0 && (
        <p className="gestion-empty">Aucune évaluation pour cette période. Les notes apparaîtront ici après la saisie.</p>
      )}
      {!chargement && lignes.length > 0 && (
        <>
          <header className="gestion-heading">
            <div>
              <p className="gestion-eyebrow">{estResponsable ? 'Gestion des résultats' : 'Carnet de notes'}
                {' · '}{classe.annee_scolaire} · {periodeLabel}</p>
              <h2>{estResponsable ? 'Résultats de la classe' : 'Liste des notes'}</h2>
              <p className="muted">
                {estResponsable
                  ? 'Consulte les moyennes, classements et bulletins de la période.'
                  : 'Liste imprimable par élève et évaluation; les bulletins et moyennes générales sont réservés au secrétariat / responsable pédagogique.'}
              </p>
            </div>
            <div className="gestion-actions">
              <button type="button" className="btn" onClick={handlePrint}>Imprimer</button>
              <button type="button" className="btn" onClick={handleExcel}>Excel</button>
              <button type="button" className="btn btn-primary" onClick={handlePDF}>Exporter PDF</button>
            </div>
          </header>
          {estResponsable && <div className="gestion-metrics">
            <article className="gestion-metric"><span>Élèves inscrits</span><strong>{lignes.length}</strong></article>
            <article className="gestion-metric"><span>Moyenne de classe</span><strong>{moyenneClasse === null ? '—' : `${fmt(moyenneClasse)} / 20`}</strong></article>
            <article className="gestion-metric"><span>Résultats calculés</span><strong>{classes.length} / {lignes.length}</strong></article>
            <article className="gestion-metric"><span>Meilleur résultat</span><strong>{meilleur ? `${fmt(meilleur.general)} / 20` : '—'}</strong><small>{meilleur?.nom || 'Aucune note saisie'}</small></article>
          </div>}

          {estResponsable && <DashboardCharts matieres={matieres} lignes={lignes} presences={presences} />}

          <section className="card gestion-card">
            <div className="gestion-card-heading">
              <div>
                <p className="gestion-eyebrow">{estResponsable ? 'Vue détaillée' : 'Impression / export'}</p>
                <h3>{estResponsable ? 'Classement et moyennes' : 'Notes par élève'}</h3>
              </div>
              <span className="gestion-total">{estResponsable ? 'Moyennes sur 20' : `${lignes.length} ligne${lignes.length === 1 ? '' : 's'}`}</span>
            </div>
            {estResponsable && <p className="gestion-table-footnote">
              Seules les notes saisies sont prises en compte. Les élèves sans note n’ont pas de rang.
            </p>}
            <div className="gestion-table-scroll">
              <table className="apercu gestion-table resultats-table">
                <thead>
                  {estResponsable ? (
                    <tr>
                      <th scope="col">Rang</th>
                      <th scope="col">Matricule</th>
                      <th scope="col">Nom complet</th>
                      {matieres.map((m) => <th scope="col" key={m.id}>{m.nom}<small>Coef. {m.coefficient}</small></th>)}
                      <th scope="col">Moyenne générale</th>
                      <th scope="col">Bulletin</th>
                    </tr>
                  ) : <tr>{columns().map((column) =>
                    <th scope="col" key={column.label}>{column.label}</th>)}</tr>}
                </thead>
                <tbody>
                  {estResponsable ? lignes.map((l) => (
                    <tr key={l.id}>
                      <td><span className={l.rang ? 'resultat-rang' : 'gestion-code'}>{l.rang ?? '—'}</span></td>
                      <td><span className="gestion-code">{l.matricule}</span></td>
                      <th scope="row">{l.nom}</th>
                      {matieres.map((m) => <td key={m.id}>{fmt(l.parMatiere[m.id])}</td>)}
                      <td><strong className={l.general !== null ? 'resultat-moyenne' : ''}>{fmt(l.general)}</strong></td>
                      <td>
                        <button type="button" className="btn btn-small"
                          onClick={() => setBulletin({ ...l, periode: periodeActive })}>
                          Voir
                        </button>
                      </td>
                    </tr>
                  )) : lignes.map((ligne) => (
                    <tr key={ligne.id}>
                      <td><span className="gestion-code">{ligne.matricule}</span></td>
                      <th scope="row">{ligne.nom}</th>
                      <td>{ligne.matiere}</td>
                      <td>{ligne.evaluation}</td>
                      <td>{new Date(`${ligne.date}T12:00:00`).toLocaleDateString('fr-FR')}</td>
                      <td><strong>{fmt(ligne.valeur)}</strong></td>
                      <td>/{fmt(ligne.noteMax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}