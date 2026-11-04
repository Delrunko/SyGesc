import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const TAILLE_MAX = 5 * 1024 * 1024
const LIGNES_MAX = 500
const TYPES_CHAMPS = [
  ['text', 'Texte'],
  ['number', 'Nombre'],
  ['date', 'Date'],
  ['select', 'Liste de choix'],
]

function normaliserChamps(champs) {
  if (!Array.isArray(champs)) return []
  return champs.flatMap((champ, index) => {
    const source = typeof champ === 'string' ? { label: champ } : champ
    if (!source || typeof source.label !== 'string') return []
    const label = source.label.trim().slice(0, 60)
    if (!label) return []
    const key = typeof source.key === 'string' && source.key
      ? source.key
      : `champ_${index + 1}`
    const type = TYPES_CHAMPS.some(([id]) => id === source.type) ? source.type : 'text'
    const options = Array.isArray(source.options)
      ? source.options.filter((option) => typeof option === 'string').slice(0, 20)
      : []
    return [{ key, label, type, options }]
  })
}

function cleChamp(label) {
  const racine = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
  return racine || 'champ'
}

function valeurInfo(infos, key) {
  const value = infos?.[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function validerValeurChamp(champ, valeur) {
  if (!valeur) return null
  if (valeur.length > 200) return `${champ.label} ne peut pas dépasser 200 caractères.`
  if (champ.type === 'number' && !Number.isFinite(Number(valeur))) {
    return `${champ.label} doit contenir un nombre valide.`
  }
  if (champ.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return `${champ.label} doit contenir une date valide.`
  }
  if (champ.type === 'select' && !champ.options.includes(valeur)) {
    return `Choisis une valeur proposée pour ${champ.label}.`
  }
  return null
}

async function lireExcel(file) {
  const { readSheet } = await import('read-excel-file/browser')
  const rows = await readSheet(file)
  return rows.map((r) => r.map((c) => String(c ?? '').trim()))
}

async function lirePdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const lignes = []
  for (let p = 1; p <= Math.min(pdf.numPages, 30); p++) {
    const page = await pdf.getPage(p)
    const contenu = await page.getTextContent()
    const items = contenu.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ t: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width }))
      .sort((a, b) => b.y - a.y || a.x - b.x)
    let ligne = []
    let yRef = null
    const pousser = () => {
      if (!ligne.length) return
      const cellules = []
      for (const it of ligne.sort((a, b) => a.x - b.x)) {
        const dernier = cellules[cellules.length - 1]
        if (dernier && it.x - (dernier.x + dernier.w) < 6) {
          dernier.t += ' ' + it.t
          dernier.w = it.x + it.w - dernier.x
        } else cellules.push({ ...it })
      }
      lignes.push(cellules.map((c) => c.t))
      ligne = []
    }
    for (const it of items) {
      if (yRef === null || Math.abs(it.y - yRef) > 3) { pousser(); yRef = it.y }
      ligne.push(it)
    }
    pousser()
  }
  return lignes
}

export default function Eleves({ classe }) {
  const [eleves, setEleves] = useState([])
  const [matricule, setMatricule] = useState('')
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')
  const [lignes, setLignes] = useState([])
  const [colMat, setColMat] = useState(0)
  const [colNom, setColNom] = useState(1)
  const [enTete, setEnTete] = useState(true)
  const [lecture, setLecture] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [champs, setChamps] = useState([])
  const [nouveauChamp, setNouveauChamp] = useState('')
  const [typeChamp, setTypeChamp] = useState('text')
  const [optionsChamp, setOptionsChamp] = useState('')
  const [valeursInfos, setValeursInfos] = useState({})
  const [editionId, setEditionId] = useState(null)
  const [infosEditees, setInfosEditees] = useState({})
  const [colInfos, setColInfos] = useState({})

  async function charger() {
    const [resultatEleves, resultatClasse] = await Promise.all([
      supabase.from('eleves').select('id, matricule, nom, infos')
        .eq('classe_id', classe.id).order('nom'),
      supabase.from('classes').select('colonnes').eq('id', classe.id).single(),
    ])
    if (resultatEleves.error || resultatClasse.error) {
      setErreur((resultatEleves.error || resultatClasse.error).message)
      return false
    }
    setEleves(resultatEleves.data)
    setChamps(normaliserChamps(resultatClasse.data.colonnes))
    setErreur('')
    return true
  }

  useEffect(() => { charger() }, [classe.id])

  async function ajouter(e) {
    e.preventDefault()
    const infos = {}
    for (const champ of champs) {
      const valeur = String(valeursInfos[champ.key] ?? '').trim()
      const erreurChamp = validerValeurChamp(champ, valeur)
      if (erreurChamp) { setErreur(erreurChamp); return }
      if (valeur) infos[champ.key] = valeur
    }
    const { error } = await supabase.from('eleves').insert({
      classe_id: classe.id, matricule: matricule.trim(), nom: nom.trim(),
      infos,
    })
    if (error) {
      setErreur(error.code === '23505' ? 'Ce matricule existe déjà dans cette classe.' : error.message)
    } else {
      setErreur(''); setInfo(''); setMatricule(''); setNom('')
      setValeursInfos({})
      await charger()
    }
  }

  async function ajouterChamp(e) {
    e.preventDefault()
    const label = nouveauChamp.trim().replace(/\s+/g, ' ')
    if (label.length < 2 || label.length > 60) {
      setErreur('Le nom du champ doit contenir entre 2 et 60 caractères.')
      return
    }
    if (champs.length >= 20) {
      setErreur('Une classe peut avoir au maximum 20 champs personnalisés.')
      return
    }
    if (champs.some((champ) => champ.label.toLocaleLowerCase('fr') === label.toLocaleLowerCase('fr'))) {
      setErreur('Ce champ existe déjà dans cette classe.')
      return
    }
    const options = typeChamp === 'select'
      ? [...new Set(optionsChamp.split(',').map((option) => option.trim()).filter(Boolean))]
      : []
    if (typeChamp === 'select' && (options.length < 2 || options.length > 20)) {
      setErreur('Ajoute entre 2 et 20 choix séparés par des virgules.')
      return
    }
    if (options.some((option) => option.length > 60)) {
      setErreur('Chaque choix doit contenir au maximum 60 caractères.')
      return
    }
    const racine = cleChamp(label)
    let key = racine
    let suffixe = 2
    while (champs.some((champ) => champ.key === key)) {
      key = `${racine}_${suffixe}`
      suffixe += 1
    }
    const nouveauxChamps = [...champs, { key, label, type: typeChamp, options }]
    if (new TextEncoder().encode(JSON.stringify(nouveauxChamps)).length > 3500) {
      setErreur('La configuration des champs est trop volumineuse. Réduis le nombre ou la longueur des choix.')
      return
    }
    const { error } = await supabase.from('classes')
      .update({ colonnes: nouveauxChamps }).eq('id', classe.id)
    if (error) { setErreur(error.message); return }
    setChamps(nouveauxChamps)
    setNouveauChamp('')
    setTypeChamp('text')
    setOptionsChamp('')
    setErreur('')
    setInfo(`Le champ « ${label} » est disponible pour tous les élèves de cette classe.`)
  }

  async function supprimerChamp(champ) {
    if (!window.confirm(
      `Retirer le champ « ${champ.label} » de cette classe ? Les valeurs déjà saisies resteront conservées dans les fiches élèves.`,
    )) return
    const nouveauxChamps = champs.filter((item) => item.key !== champ.key)
    const { error } = await supabase.from('classes')
      .update({ colonnes: nouveauxChamps }).eq('id', classe.id)
    if (error) { setErreur(error.message); return }
    setChamps(nouveauxChamps)
    setValeursInfos((values) => {
      const { [champ.key]: _, ...reste } = values
      return reste
    })
    if (editionId) {
      setInfosEditees((values) => {
        const { [champ.key]: _, ...reste } = values
        return reste
      })
    }
    setErreur('')
    setInfo(`Le champ « ${champ.label} » a été retiré de l’affichage.`)
  }

  function commencerEdition(eleve) {
    setEditionId(eleve.id)
    setInfosEditees(Object.fromEntries(champs.map((champ) => [
      champ.key,
      valeurInfo(eleve.infos, champ.key),
    ])))
  }

  async function enregistrerInfos(eleve) {
    const infos = { ...(eleve.infos || {}) }
    for (const champ of champs) {
      const valeur = String(infosEditees[champ.key] ?? '').trim()
      const erreurChamp = validerValeurChamp(champ, valeur)
      if (erreurChamp) { setErreur(erreurChamp); return }
      if (valeur) infos[champ.key] = valeur
      else delete infos[champ.key]
    }
    const { error } = await supabase.from('eleves').update({ infos }).eq('id', eleve.id)
    if (error) { setErreur(error.message); return }
    setEleves((courants) => courants.map((item) => item.id === eleve.id ? { ...item, infos } : item))
    setEditionId(null)
    setErreur('')
    setInfo(`Les informations de ${eleve.nom} ont été enregistrées.`)
  }

  function champInput(champ, value, onChange, idPrefix = '') {
    const id = `${idPrefix}${champ.key}`
    if (champ.type === 'select') {
      return (
        <select id={id} className="input" value={value}
          onChange={(e) => onChange(e.target.value)}>
          <option value="">Sélectionner…</option>
          {champ.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )
    }
    return (
      <input id={id} className="input" type={champ.type === 'date' ? 'date' : champ.type === 'number' ? 'number' : 'text'}
        maxLength={champ.type === 'text' ? 200 : undefined}
        value={value} onChange={(e) => onChange(e.target.value)} />
    )
  }

  async function choisirFichier(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErreur(''); setInfo(''); setLignes([])
    const nomFichier = file.name.toLowerCase()
    const estExcel = nomFichier.endsWith('.xlsx')
    const estPdf = nomFichier.endsWith('.pdf')
    if (!estExcel && !estPdf) { setErreur('Format accepté : .xlsx ou .pdf.'); return }
    if (file.size > TAILLE_MAX) { setErreur('Fichier trop lourd (5 Mo maximum).'); return }
    setLecture(true)
    try {
      const lus = estExcel ? await lireExcel(file) : await lirePdf(file)
      const propres = lus.filter((r) => r.some((c) => c !== ''))
      if (propres.length === 0) {
        setErreur(estPdf
          ? 'Aucun texte trouvé. Un PDF scanné (image) ne peut pas être lu : utilise un fichier Excel.'
          : 'Fichier vide.')
      } else {
        setLignes(propres)
        setColMat(0); setColNom(1); setEnTete(true)
        const entetes = propres[0].map((cellule) => cleChamp(cellule))
        setColInfos(Object.fromEntries(champs.map((champ) => {
          const index = entetes.indexOf(cleChamp(champ.label))
          return [champ.key, index >= 0 ? index : '']
        })))
      }
    } catch (err) {
      setErreur('Lecture impossible : ' + (err?.message || 'fichier invalide.'))
    }
    setLecture(false)
  }

  const nbCols = Math.max(2, ...lignes.slice(0, 20).map((r) => r.length))
  const donnees = lignes.slice(enTete ? 1 : 0).slice(0, LIGNES_MAX)
  const valides = donnees
    .map((r) => ({
      classe_id: classe.id,
      matricule: (r[colMat] || '').trim(),
      nom: (r[colNom] || '').trim(),
      infos: Object.fromEntries(champs.map((champ) => [
        champ.key,
        colInfos[champ.key] === '' || colInfos[champ.key] === undefined
          ? ''
          : String(r[colInfos[champ.key]] || '').trim(),
      ]).filter(([, value]) => value !== '')),
    }))
    .filter((x) => x.matricule && x.nom && x.matricule.length <= 50 && x.nom.length <= 150)
    .filter((eleve) => champs.every((champ) => !eleve.infos[champ.key] || !validerValeurChamp(champ, eleve.infos[champ.key])))
  const elevesFiltres = eleves.filter((eleve) =>
    `${eleve.nom} ${eleve.matricule}`.toLocaleLowerCase('fr')
      .includes(recherche.trim().toLocaleLowerCase('fr')),
  )

  async function importer() {
    if (valides.length === 0) { setErreur('Aucune ligne valide avec ces colonnes.'); return }
    const nombreLignes = donnees.filter((ligne) =>
      (ligne[colMat] || '').trim() && (ligne[colNom] || '').trim(),
    ).length
    if (valides.length < nombreLignes) {
      setErreur('Certaines lignes contiennent des données incomplètes ou incompatibles avec les champs choisis. Corrige le fichier ou le mappage avant l’import.')
      return
    }
    const matricules = new Set()
    const doublons = []
    valides.forEach((eleve) => {
      const cle = eleve.matricule.trim().toLocaleUpperCase('fr')
      if (matricules.has(cle)) doublons.push(eleve.matricule)
      matricules.add(cle)
    })
    if (doublons.length > 0) {
      setErreur(`Import annulé : matricule(s) répété(s) dans le fichier : ${[...new Set(doublons)].slice(0, 8).join(', ')}.`)
      return
    }
    const { data, error } = await supabase.from('eleves')
      .upsert(valides, { onConflict: 'classe_id,matricule', ignoreDuplicates: true })
      .select('id')
    if (error) { setErreur(error.message); return }
    setLignes([])
    setErreur('')
    const listeActualisee = await charger()
    if (!listeActualisee) {
      setInfo('Import enregistré, mais la liste n’a pas pu être rechargée. Actualise la page pour voir les élèves.')
      return
    }
    const ajoutes = data?.length ?? 0
    const dejaPresents = valides.length - ajoutes
    setInfo(ajoutes > 0
      ? `${ajoutes} élève(s) ajouté(s) à la liste.${dejaPresents ? ` ${dejaPresents} matricule(s) existaient déjà et n’ont pas été modifiés.` : ''}`
      : `Aucun nouvel élève ajouté : les ${valides.length} matricule(s) du fichier existent déjà dans cette classe.`)
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer cet élève, ses présences et ses notes ?')) return
    const { error } = await supabase.from('eleves').delete().eq('id', id)
    if (error) setErreur(error.message)
    else charger()
  }

  const options = Array.from({ length: nbCols }, (_, i) => (
    <option key={i} value={i}>Colonne {i + 1}</option>
  ))

  return (
    <div className="gestion-page">
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      {info && <p className="assistant-notice" role="status">{info}</p>}

      <header className="gestion-heading">
        <div>
          <p className="gestion-eyebrow">Gestion de la classe</p>
          <h2>Élèves</h2>
          <p className="muted">Gère les inscriptions et consulte la liste des élèves de la classe.</p>
        </div>
        <span className="gestion-total"><strong>{eleves.length}</strong> élève{eleves.length === 1 ? '' : 's'}</span>
      </header>

      <section className="card gestion-card">
        <div className="gestion-card-heading">
          <div>
            <p className="gestion-eyebrow">Inscription</p>
            <h3>Ajouter un élève</h3>
          </div>
        </div>
        <form onSubmit={ajouter} className="gestion-form">
          <label>
            Matricule
            <input className="input" placeholder="Ex. A003" value={matricule}
              onChange={(e) => setMatricule(e.target.value)} required maxLength={50} />
          </label>
          <label>
            Nom complet
            <input className="input" placeholder="Ex. Jean Fotso" value={nom}
              onChange={(e) => setNom(e.target.value)} required maxLength={150} />
          </label>
          {champs.map((champ) => (
            <label key={champ.key}>
              {champ.label}
              {champInput(champ, valeursInfos[champ.key] ?? '',
                (value) => setValeursInfos((courants) => ({ ...courants, [champ.key]: value })))}
            </label>
          ))}
          <button type="submit" className="btn btn-primary">Ajouter l’élève</button>
        </form>
      </section>

      <section className="card gestion-card">
        <details className="import-details">
          <summary>
            <span>
              <span className="gestion-eyebrow">Fiche élève personnalisée</span>
              <strong>Gérer les champs de la classe ({champs.length}/20)</strong>
            </span>
            <span className="import-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="import-content">
            <p className="muted">
              Ajoute les critères utiles à ton établissement : sexe, date de naissance, adresse,
              nom du parent ou tout autre renseignement. Les champs sont propres à cette classe.
            </p>
            <form onSubmit={ajouterChamp} className="gestion-form champs-form">
              <label>
                Nom du champ
                <input className="input" placeholder="Ex. Sexe, Date de naissance…" value={nouveauChamp}
                  onChange={(e) => setNouveauChamp(e.target.value)} required maxLength={60} />
              </label>
              <label>
                Type de donnée
                <select className="input" value={typeChamp} onChange={(e) => setTypeChamp(e.target.value)}>
                  {TYPES_CHAMPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {typeChamp === 'select' && (
                <label className="champs-options">
                  Choix possibles (séparés par des virgules)
                  <input className="input" placeholder="Féminin, Masculin, Autre" value={optionsChamp}
                    onChange={(e) => setOptionsChamp(e.target.value)} required maxLength={500} />
                </label>
              )}
              <button type="submit" className="btn btn-primary" disabled={champs.length >= 20}>
                Ajouter le champ
              </button>
            </form>
            {champs.length > 0 ? (
              <div className="champs-personnalises" aria-label="Champs personnalisés actifs">
                {champs.map((champ) => (
                  <span className="champ-personnalise" key={champ.key}>
                    <span><strong>{champ.label}</strong><small>{TYPES_CHAMPS.find(([id]) => id === champ.type)?.[1]}</small></span>
                    <button type="button" className="link-btn" aria-label={`Retirer le champ ${champ.label}`}
                      onClick={() => supprimerChamp(champ)}>×</button>
                  </span>
                ))}
              </div>
            ) : <p className="gestion-empty">Aucun champ personnalisé. Le formulaire de base contient le matricule et le nom.</p>}
          </div>
        </details>
      </section>

      <section className="card gestion-card">
        <details className="import-details">
          <summary>
            <span>
              <span className="gestion-eyebrow">Import en masse</span>
              <strong>Importer une liste depuis un fichier</strong>
            </span>
            <span className="import-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="import-content">
            <p className="muted">
              Excel (.xlsx) ou PDF texte (non scanné), 5 Mo et {LIGNES_MAX} lignes maximum.
              Le fichier doit contenir une colonne matricule et une colonne nom.
            </p>
            <label className="import-file">
              <span>Choisir un fichier Excel ou PDF</span>
              <input type="file" accept=".xlsx,.pdf" onChange={choisirFichier} />
            </label>
            {lecture && <p className="muted" role="status">Lecture du fichier...</p>}

            {lignes.length > 0 && (
              <>
                <p className="muted">
                  {lignes.length} ligne(s) lue(s). Vérifie l’aperçu et choisis les colonnes.
                  {lignes.length - (enTete ? 1 : 0) > LIGNES_MAX && ` Seules les ${LIGNES_MAX} premières seront importées.`}
                </p>
                <div className="gestion-form gestion-form-compact">
                  <label>Matricule : <select className="input" value={colMat}
                    onChange={(e) => setColMat(Number(e.target.value))}>{options}</select></label>
                  <label>Nom : <select className="input" value={colNom}
                    onChange={(e) => setColNom(Number(e.target.value))}>{options}</select></label>
                  {champs.map((champ) => (
                    <label key={champ.key}>
                      {champ.label} :
                      <select className="input" value={colInfos[champ.key] ?? ''}
                        onChange={(e) => setColInfos((courants) => ({
                          ...courants,
                          [champ.key]: e.target.value === '' ? '' : Number(e.target.value),
                        }))}>
                        <option value="">Ne pas importer</option>
                        {Array.from({ length: nbCols }, (_, index) => (
                          <option key={index} value={index}>Colonne {index + 1}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="gestion-checkbox">
                  <input type="checkbox" checked={enTete} onChange={(e) => setEnTete(e.target.checked)} />
                  La première ligne est un en-tête
                </label>
                <div className="gestion-table-scroll">
                  <table className="apercu gestion-table">
                    <tbody>
                      {lignes.slice(0, 6).map((r, i) => (
                        <tr key={i}>{Array.from({ length: nbCols }, (_, j) => <td key={j}>{r[j] || ''}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="gestion-actions">
                  <button type="button" className="btn btn-primary" onClick={importer}>
                    Importer {valides.length} élève(s)
                  </button>
                  <button type="button" className="btn" onClick={() => setLignes([])}>Annuler</button>
                </div>
              </>
            )}
          </div>
        </details>
      </section>

      <section className="card gestion-card">
        <div className="gestion-card-heading">
          <div>
            <p className="gestion-eyebrow">Année scolaire {classe.annee_scolaire}</p>
            <h3>Annuaire des élèves</h3>
          </div>
          <label className="gestion-search">
            <span className="sr-only">Rechercher un élève</span>
            <input className="input" type="search" placeholder="Rechercher un élève"
              value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
        </div>
        {elevesFiltres.length === 0
          ? <p className="gestion-empty">{eleves.length ? 'Aucun élève ne correspond à la recherche.' : 'Aucun élève inscrit dans cette classe.'}</p>
          : (
            <div className="gestion-table-scroll">
              <table className="apercu gestion-table">
                <thead>
                  <tr>
                    <th scope="col">N°</th>
                    <th scope="col">Matricule</th>
                    <th scope="col">Nom complet</th>
                    {champs.map((champ) => <th scope="col" key={champ.key}>{champ.label}</th>)}
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {elevesFiltres.map((el, index) => (
                    <Fragment key={el.id}>
                      <tr>
                        <td className="gestion-row-number">{String(index + 1).padStart(2, '0')}</td>
                        <td><span className="gestion-code">{el.matricule}</span></td>
                        <th scope="row">{el.nom}</th>
                        {champs.map((champ) => (
                          <td key={champ.key}>{valeurInfo(el.infos, champ.key) || <span className="muted">—</span>}</td>
                        ))}
                        <td>
                          <div className="gestion-actions">
                            {champs.length > 0 && (
                              <button type="button" className="btn btn-small"
                                onClick={() => editionId === el.id ? setEditionId(null) : commencerEdition(el)}>
                                {editionId === el.id ? 'Fermer' : 'Modifier'}
                              </button>
                            )}
                            <button type="button" className="btn btn-danger btn-small"
                              onClick={() => supprimer(el.id)} aria-label={`Supprimer ${el.nom}`}>
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editionId === el.id && (
                        <tr key={`${el.id}-edition`}>
                          <td colSpan={4 + champs.length}>
                            <div className="infos-edition">
                              <strong>Informations complémentaires — {el.nom}</strong>
                              <div className="gestion-form champs-edition-form">
                                {champs.map((champ) => (
                                  <label key={champ.key}>
                                    {champ.label}
                                    {champInput(champ, infosEditees[champ.key] ?? '',
                                      (value) => setInfosEditees((courantes) => ({ ...courantes, [champ.key]: value })),
                                      `edition-${el.id}-`)}
                                  </label>
                                ))}
                              </div>
                              <div className="gestion-actions">
                                <button type="button" className="btn btn-primary btn-small"
                                  onClick={() => enregistrerInfos(el)}>Enregistrer</button>
                                <button type="button" className="btn btn-small"
                                  onClick={() => setEditionId(null)}>Annuler</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <p className="gestion-table-footnote">
          {recherche ? `${elevesFiltres.length} résultat(s) sur ${eleves.length}` : `${eleves.length} élève(s) inscrit(s)`}
        </p>
      </section>
    </div>
  )
}