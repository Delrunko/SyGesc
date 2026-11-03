import { tokens } from './texte.js'
import { extraireDate } from './dates.js'
import { STOP, chercherEleve, chercherMatiere, motsDuLexique } from './moteur.js'

const VERBES_PRESENCE = [
  'marque', 'marquer', 'mets', 'met', 'mettre', 'enregistre', 'enregistrer',
  'declare', 'declarer', 'passe', 'passer', 'inscris', 'inscrire', 'ajoute',
  'ajouter',
]
const VERBES_NOTE = [
  'mets', 'met', 'mettre', 'enregistre', 'enregistrer', 'ajoute', 'ajouter',
  'saisis', 'saisir', 'attribue', 'attribuer', 'noter',
]
const VERBES_DONNER = ['donne', 'donner']
const TERMES_NOTE = ['note', 'notes', 'score', 'devoir', 'evaluation', 'epreuve', 'controle']
const VERBES = [...new Set([...VERBES_PRESENCE, ...VERBES_NOTE, ...VERBES_DONNER])]
const STATUTS = {
  present: ['present', 'presente', 'presents', 'presentes'],
  absent: ['absent', 'absente', 'absents', 'absentes'],
  excuse: ['excuse', 'excusee', 'excuses', 'excusees'],
}
const A_IGNORER = new Set([
  ...VERBES, ...Object.values(STATUTS).flat(),
  'hier', 'aujourdhui', 'jour', 'avant', 'creneau', 'seance', 'note', 'notes',
  'eleve', 'eleves', 'enfant', 'enfants', 'sur', 'sur20', 'dans', 'matiere',
  'a', 'au', 'aux',
  'pour', 'le', 'la', 'les', 'du', 'un', 'une', 'et', 'est', 'de', 'des',
])

function jourISO(decalage) {
  const d = new Date()
  d.setDate(d.getDate() - decalage)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

function extraireValeur(phrase) {
  const resultat = String(phrase).match(/(?:^|\s)(\d{1,3}(?:[.,]\d{1,2})?)(?:\s*\/\s*\d+(?:[.,]\d+)?)?(?=\s|$)/)
  return resultat ? Number(resultat[1].replace(',', '.')) : null
}

function viseToutLeMonde(toks) {
  const phrase = ` ${toks.join(' ')} `
  return [
    ' tout le monde ',
    ' tous les eleves ',
    ' toutes les eleves ',
    ' tous les apprenants ',
    ' toutes les apprenantes ',
    ' toute la classe ',
    ' chacun ',
    ' chacune ',
  ].some((formule) => phrase.includes(formule))
}

function trouverEvaluations(phrase, evaluations, ignores) {
  const termes = tokens(phrase).filter((mot) => !ignores.has(mot) && !/^\d+$/.test(mot))
  const scores = evaluations.map((evaluation) => {
    const titre = new Set(tokens(evaluation.titre))
    const avecNumeroTitre = tokens(phrase).filter((mot) =>
      /^\d+$/.test(mot) && titre.has(mot),
    )
    const score = [...termes, ...avecNumeroTitre].filter((mot) => titre.has(mot)).length
    return { evaluation, score }
  })
  const scoreMax = Math.max(0, ...scores.map((item) => item.score))
  return scoreMax === 0 ? [] : scores
    .filter((item) => item.score === scoreMax)
    .map((item) => item.evaluation)
}

function analyserNote(phrase, ctx, ignores, e, m) {
  const valeur = extraireValeur(phrase)

  const evaluations = ctx.evaluations || []
  const ignoresEvaluation = new Set([
    ...ignores,
    ...tokens(e.eleve?.nom || ''),
    ...tokens(e.eleve?.matricule || ''),
    ...tokens(m.matiere?.nom || ''),
  ])
  const candidates = m.matiere
    ? evaluations.filter((evaluation) => evaluation.matiere_id === m.matiere.id)
    : evaluations
  let evaluationMatches = trouverEvaluations(phrase, candidates, ignoresEvaluation)
  let matiere = m.matiere || (ctx.matieres.length === 1 ? ctx.matieres[0] : null)

  if (!matiere && evaluationMatches.length === 1) {
    matiere = ctx.matieres.find((item) => item.id === evaluationMatches[0].matiere_id) || null
  }
  if (matiere) {
    const evaluationsMatiere = evaluations.filter((item) => item.matiere_id === matiere.id)
    evaluationMatches = trouverEvaluations(phrase, evaluationsMatiere, ignoresEvaluation)
    if (!evaluationMatches.length && evaluationsMatiere.length === 1) {
      evaluationMatches = evaluationsMatiere
    } else if (!evaluationMatches.length && evaluationsMatiere.length > 1) {
      evaluationMatches = evaluationsMatiere
    }
  }

  return {
    type: 'note',
    valeur,
    eleve: e.eleve,
    elevesAmbigus: e.ambigus,
    matiere,
    matieresAmbigues: m.ambigus,
    evaluation: evaluationMatches.length === 1 ? evaluationMatches[0] : null,
    evaluationsAmbigues: evaluationMatches.length > 1 ? evaluationMatches : [],
  }
}

// Reconnaît les commandes de présence et de note ; toute écriture reste à confirmer.
export function analyserEcriture(phrase, ctx) {
  const toks = tokens(phrase)
  if (!toks.some((mot) => VERBES.includes(mot))) return null

  const ignores = new Set([...STOP, ...motsDuLexique(ctx.lexique), ...A_IGNORER])
  const ignoresEleve = new Set([...ignores, ...toks.filter((mot) => /^\d+$/.test(mot))])
  const e = chercherEleve(toks, ctx.eleves, ignoresEleve)
  const m = chercherMatiere(toks, ctx.matieres, new Set([...ignores, ...e.mots]))
  const toutLeMonde = viseToutLeMonde(toks)
  const statut = Object.keys(STATUTS).find((key) =>
    toks.some((mot) => STATUTS[key].includes(mot)),
  )

  if (statut && toks.some((mot) => VERBES_PRESENCE.includes(mot))) {
    const date = extraireDate(phrase)
    let decalage = 0
    if (!date && toks.includes('hier')) decalage = toks.includes('avant') ? 2 : 1
    let creneau = 1
    const index = toks.indexOf('creneau')
    if (index >= 0) {
      const n = Number(toks[index + 1])
      if (Number.isInteger(n) && n >= 1 && n <= 20) creneau = n
    }
    return {
      type: 'presence',
      statut,
      eleve: e.eleve,
      toutLeMonde,
      elevesAmbigus: e.ambigus,
      matiere: m.matiere,
      matieresAmbigues: m.ambigus,
      date: date || jourISO(decalage),
      creneau,
    }
  }

  const valeur = extraireValeur(phrase)
  const commandeNote = toks.some((mot) => VERBES_NOTE.includes(mot)) &&
    (valeur !== null || toks.some((mot) => TERMES_NOTE.includes(mot)))
  const commandeNoteAvecDonner = toks.some((mot) => VERBES_DONNER.includes(mot)) &&
    valeur !== null && toks.some((mot) => TERMES_NOTE.includes(mot))
  if (commandeNote || commandeNoteAvecDonner) {
    return { ...analyserNote(phrase, ctx, ignores, e, m), toutLeMonde }
  }
  return null
}
