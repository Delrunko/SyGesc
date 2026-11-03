import { STOP, tokens } from './texte.js'
import { extraireDate, dateFrancaise } from './dates.js'
import { DICTIONNAIRE, SALUTATIONS } from './dictionnaire.js'

export { STOP }

const ignoresCache = new WeakMap()
const indexEntitesCache = new WeakMap()
const indexLexiqueCache = new WeakMap()
const motsLexiqueCache = new WeakMap()

function variantes(mot) {
  const formes = new Set([mot])
  const racines = [mot]
  while (racines.length) {
    const racine = racines.pop()
    const candidats = []
    if (racine.length > 4 && racine.endsWith('s')) candidats.push(racine.slice(0, -1))
    if (racine.length > 4 && racine.endsWith('x')) candidats.push(racine.slice(0, -1) + 's')
    if (racine.length > 5 && racine.endsWith('e')) candidats.push(racine.slice(0, -1))
    if (racine.length > 5 && racine.endsWith('es')) candidats.push(racine.slice(0, -2))
    for (const candidat of candidats) {
      if (candidat.length > 3 && !formes.has(candidat)) {
        formes.add(candidat)
        racines.push(candidat)
      }
    }
  }
  return formes
}

function signatures(mot) {
  const resultat = new Set([mot])
  if (mot.length < 6) return resultat
  for (let i = 0; i < mot.length; i += 1) {
    resultat.add(mot.slice(0, i) + mot.slice(i + 1))
  }
  return resultat
}

export const EXEMPLES = [
  'Liste des absents aujourd’hui',
  'Qui a la meilleure moyenne ?',
  'Qui a moins de 10/20 ?',
  'Marque Paul absent en maths',
  'Mets tout le monde présent en maths',
  'Mets 14/20 à Paul au devoir 1 en maths',
  'Donne 12 à tout le monde',
  'Aide',
]

export function fusionnerLexique(lexique = []) {
  const fusion = Object.fromEntries(
    Object.entries(DICTIONNAIRE).map(([intention, mots]) => [
      intention,
      new Set(mots.flatMap((mot) => [...variantes(mot)])),
    ]),
  )
  for (const entree of lexique) {
    if (!fusion[entree.intention]) fusion[entree.intention] = new Set()
    tokens(entree.mot).forEach((mot) =>
      variantes(mot).forEach((forme) => fusion[entree.intention].add(forme)),
    )
  }
  return fusion
}

export function motsDuLexique(lexique = {}) {
  if (lexique && typeof lexique === 'object' && motsLexiqueCache.has(lexique)) {
    return motsLexiqueCache.get(lexique)
  }
  const valeurs = lexique instanceof Map ? [...lexique.values()] : Object.values(lexique)
  const mots = [...new Set(valeurs.flatMap((termes) => [...termes].flatMap(tokens)))]
  if (lexique && typeof lexique === 'object') motsLexiqueCache.set(lexique, mots)
  return mots
}

function indexLexique(lexique) {
  if (indexLexiqueCache.has(lexique)) return indexLexiqueCache.get(lexique)
  const intentionsParSignature = new Map()
  for (const [intention, mots] of Object.entries(lexique)) {
    for (const mot of mots) {
      for (const signature of signatures(mot)) {
        if (!intentionsParSignature.has(signature)) intentionsParSignature.set(signature, new Set())
        intentionsParSignature.get(signature).add(intention)
      }
    }
  }
  const index = { intentionsParSignature }
  indexLexiqueCache.set(lexique, index)
  return index
}

function intentionContient(lexique, intention, mot) {
  const formes = variantes(mot)
  const mots = lexique[intention] || new Set()
  if ([...formes].some((forme) => mots.has(forme))) return true
  if (mot.length < 6) return false
  const index = indexLexique(lexique)
  for (const signature of signatures(mot)) {
    if (index.intentionsParSignature.get(signature)?.has(intention)) return true
  }
  return false
}

function indexEntites(elements, champs, normaliser) {
  let parCle = indexEntitesCache.get(elements)
  if (!parCle) {
    parCle = new Map()
    indexEntitesCache.set(elements, parCle)
  }
  const cle = `${champs.join(',')}:${normaliser.name}`
  if (parCle.has(cle)) return parCle.get(cle)

  const postings = new Map()
  for (const element of elements) {
    const mots = new Set(champs.flatMap((champ) =>
      tokens(element[champ] ?? '').map(normaliser),
    ))
    for (const mot of mots) {
      if (!postings.has(mot)) postings.set(mot, [])
      postings.get(mot).push(element)
    }
  }
  const index = { postings }
  parCle.set(cle, index)
  return index
}

function trouverCorrespondances(phrase, elements, ignores, champs, normaliser = (mot) => mot) {
  const exclus = new Set([...STOP, ...ignores])
  const termes = [...new Set(tokens(phrase).map(normaliser).filter((mot) => !exclus.has(mot)))]
  if (!termes.length) return { element: null, ambigus: [], mots: [] }

  const index = indexEntites(elements, champs, normaliser)
  const scores = new Map()
  for (const mot of termes) {
    for (const element of index.postings.get(mot) || []) {
      scores.set(element, (scores.get(element) || 0) + 1)
    }
  }
  let meilleurScore = 0
  const meilleurs = []
  for (const [element, score] of scores) {
    if (score > meilleurScore) {
      meilleurScore = score
      meilleurs.length = 0
      meilleurs.push({ element, score })
    } else if (score === meilleurScore) {
      meilleurs.push({ element, score })
    }
  }

  if (meilleurs.length === 1) {
    const noms = new Set(champs.flatMap((champ) => tokens(meilleurs[0].element[champ] ?? '').map(normaliser)))
    return {
      element: meilleurs[0].element,
      ambigus: [],
      mots: termes.filter((mot) => noms.has(mot)),
    }
  }
  return {
    element: null,
    ambigus: meilleurs.map((candidat) => candidat.element),
    mots: termes.filter((mot) => (index.postings.get(mot) || []).some((element) =>
      meilleurs.some((candidat) => candidat.element === element),
    )),
  }
}

export function chercherEleve(phraseTokens, eleves, ignores = STOP) {
  const phrase = Array.isArray(phraseTokens) ? phraseTokens.join(' ') : phraseTokens
  const resultat = trouverCorrespondances(phrase, eleves, ignores, ['nom', 'matricule'])
  return {
    eleve: resultat.element,
    ambigus: resultat.ambigus,
    mots: resultat.mots,
  }
}

export function chercherMatiere(phraseTokens, matieres, ignores = STOP) {
  const phrase = Array.isArray(phraseTokens) ? phraseTokens.join(' ') : phraseTokens
  const normaliser = (mot) =>
    ['math', 'maths', 'mathematique', 'mathematiques'].includes(mot) ? 'maths' : mot
  const resultat = trouverCorrespondances(phrase, matieres, ignores, ['nom'], normaliser)
  return { matiere: resultat.element, ambigus: resultat.ambigus }
}

export function reponseSociale(phrase) {
  const normalisee = tokens(phrase).join(' ')
  if (!normalisee || normalisee.split(' ').length > 5) return null
  const salutation = SALUTATIONS.find(([formule]) => normalisee === tokens(formule).join(' '))
  if (/^(bonjour|bonsoir|salut|coucou) (comment ca va|ca va)$/.test(normalisee)) {
    return 'Ça va bien, merci ! Que veux-tu faire dans ta classe ?'
  }
  return salutation?.[1] || null
}

export function analyser(phrase, ctx) {
  const ts = tokens(phrase)
  const lexique = ctx.lexique || {}
  const date = extraireDate(phrase)
  const demandeAbsents = ts.some((mot) => intentionContient(lexique, 'absences', mot))
  const demandeListe = ts.some((mot) =>
    intentionContient(lexique, 'liste_absents', mot) ||
    ['liste', 'listes', 'noms', 'nom', 'qui', 'affiche', 'montre'].includes(mot),
  )
  let intention = null

  if (ts.some((mot) => intentionContient(lexique, 'aide', mot))) {
    intention = 'aide'
  } else if (demandeAbsents && (demandeListe || date)) {
    intention = 'liste_absents'
  } else {
    const priorite = ['taux_presence', 'absences', 'sous_seuil', 'classement', 'moyenne', 'effectif']
    intention = priorite.find((nom) => {
      return ts.some((mot) => intentionContient(lexique, nom, mot))
    }) || null
  }

  let ignores = ignoresCache.get(lexique)
  if (!ignores) {
    ignores = new Set([...STOP, ...motsDuLexique(lexique)])
    ignoresCache.set(lexique, ignores)
  }
  ignores = new Set(ignores)
  if (date) {
    ts.filter((mot) => /^\d+$/.test(mot)).forEach((mot) => ignores.add(mot))
  }
  const e = chercherEleve(ts, ctx.eleves, ignores)
  const m = chercherMatiere(ts, ctx.matieres, new Set([...ignores, ...e.mots]))
  const seuilMatch = phrase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(
    /\b(?:sous|inferieur(?:e|es|s)?|moins|seuil|faible(?:s)?)\s*(?:de|a)?\s*(\d{1,2}(?:[.,]\d{1,2})?)/i,
  )
  const seuil = seuilMatch ? Number(seuilMatch[1].replace(',', '.')) : null

  return {
    intention,
    eleve: e.eleve,
    elevesAmbigus: e.ambigus,
    matiere: m.matiere,
    matieresAmbigues: m.ambigus,
    seuil: Number.isFinite(seuil) ? seuil : null,
    date,
  }
}

export function besoins(analyse) {
  return {
    resultats: ['moyenne', 'classement', 'sous_seuil'].includes(analyse.intention),
    absences: ['absences', 'taux_presence'].includes(analyse.intention),
  }
}

function formaterNombre(valeur) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(valeur))
}

export function repondre(analyse, donnees, ctx) {
  const resultats = donnees.resultats || []
  const absences = donnees.absences || []

  if (analyse.intention === 'aide') {
    return `Tu peux demander le nombre d’élèves, une moyenne ou un classement, ` +
      `la liste des absents à une date (par exemple « liste des absents le 15/10/2026 »), ` +
      `le taux de présence ou les élèves sous une moyenne donnée. Tu peux aussi écrire ` +
      `« marque [nom] absent en [matière] », « mets tout le monde présent en [matière] » ` +
      `ou « mets 14/20 à [nom ou tout le monde] au devoir 1 en [matière] » ; ` +
      `je demanderai confirmation avant toute modification.`
  }
  if (analyse.intention === 'effectif') {
    return `Cette classe compte ${ctx.eleves.length} élève${ctx.eleves.length === 1 ? '' : 's'}.`
  }
  if (analyse.intention === 'moyenne') {
    if (!analyse.eleve) {
      return 'Précise le nom ou le matricule de l’élève dont tu veux connaître la moyenne.'
    }
    const resultat = resultats.find((ligne) => ligne.eleve_id === analyse.eleve.id)
    if (!resultat || resultat.moyenne_generale === null) {
      return `${analyse.eleve.nom} n’a pas encore de moyenne calculée.`
    }
    if (analyse.matiere) {
      const moyenne = resultat.par_matiere?.[analyse.matiere.id]
      return moyenne === undefined
        ? `Aucune moyenne n’est encore disponible pour ${analyse.eleve.nom} en ${analyse.matiere.nom}.`
        : `La moyenne de ${analyse.eleve.nom} en ${analyse.matiere.nom} est de ${formaterNombre(moyenne)}/20.`
    }
    return `La moyenne générale de ${analyse.eleve.nom} est de ${formaterNombre(resultat.moyenne_generale)}/20.`
  }
  if (analyse.intention === 'classement') {
    const classes = resultats.filter((ligne) => ligne.moyenne_generale !== null)
    if (!classes.length) return 'Aucune moyenne n’est encore disponible pour cette classe.'
    const classement = classes.slice(0, 5).map((ligne) =>
      `${ligne.rang}. ${ligne.nom} (${formaterNombre(ligne.moyenne_generale)}/20)`,
    )
    return `Voici les ${Math.min(5, classes.length)} premiers : ${classement.join(' ; ')}.`
  }
  if (analyse.intention === 'sous_seuil') {
    if (analyse.seuil === null || analyse.seuil < 0 || analyse.seuil > 20) {
      return 'Précise un seuil entre 0 et 20, par exemple « quels élèves ont moins de 10/20 ? ».'
    }
    const sousSeuil = resultats
      .filter((ligne) => ligne.moyenne_generale !== null && ligne.moyenne_generale < analyse.seuil)
      .sort((a, b) => a.moyenne_generale - b.moyenne_generale)
    if (!sousSeuil.length) return `Aucun élève n’a une moyenne inférieure à ${formaterNombre(analyse.seuil)}/20.`
    return `Élèves sous ${formaterNombre(analyse.seuil)}/20 (${sousSeuil.length}) : ` +
      sousSeuil.map((ligne) =>
        `${ligne.nom} (${formaterNombre(ligne.moyenne_generale)}/20)`,
      ).join(', ') + '.'
  }
  if (analyse.intention === 'absences') {
    if (!analyse.eleve && analyse.date) {
      return 'Pour obtenir les noms, demande « liste des absents le JJ/MM/AAAA ».'
    }
    if (analyse.eleve) {
      const ligne = absences.find((item) => item.eleve_id === analyse.eleve.id)
      return ligne
        ? `${analyse.eleve.nom} : ${ligne.absents} absence${ligne.absents === 1 ? '' : 's'}, ${ligne.excuses} absence${ligne.excuses === 1 ? '' : 's'} excusée${ligne.excuses === 1 ? '' : 's'}.`
        : `Aucune donnée de présence n’est disponible pour ${analyse.eleve.nom}.`
    }
    const total = absences.reduce((somme, ligne) => somme + ligne.absents, 0)
    return `La classe totalise ${total} absence${total === 1 ? '' : 's'}.`
  }
  if (analyse.intention === 'liste_absents') {
    return 'Pour quelle date veux-tu la liste des absents ? Tu peux écrire « aujourd’hui », « hier » ou une date comme « 15/10/2026 ».'
  }
  if (analyse.intention === 'taux_presence') {
    if (analyse.eleve) {
      const ligne = absences.find((item) => item.eleve_id === analyse.eleve.id)
      return ligne?.taux_presence === null || ligne?.taux_presence === undefined
        ? `Aucune présence n’est encore enregistrée pour ${analyse.eleve.nom}.`
        : `Le taux de présence de ${analyse.eleve.nom} est de ${formaterNombre(ligne.taux_presence)} %.`
    }
    const effectif = absences.filter((ligne) => ligne.taux_presence !== null).length
    return effectif
      ? 'Précise le nom d’un élève pour connaître son taux de présence.'
      : 'Aucune présence n’est encore enregistrée dans cette classe.'
  }
  return texteInconnu(ctx)
}

export function messageEtat(statut) {
  const messages = {
    desactive_global: 'L’assistant est temporairement désactivé par l’administrateur.',
    desactive_compte: 'L’assistant n’est pas activé pour ce compte.',
    compte_non_valide: 'Ton compte doit être validé avant d’utiliser l’assistant.',
    quota_atteint: 'Le quota de messages du jour est atteint. Réessaie demain.',
  }
  return messages[statut.etat] || 'L’assistant est indisponible pour le moment.'
}

export function texteInconnu(ctx) {
  return `Je ne suis pas sûr d’avoir compris. Tu peux me demander le nombre d’élèves, ` +
    `une moyenne, le classement, ou la liste des absents à une date. ` +
    `Par exemple : « Qui était absent hier ? » ou « Quelle est la moyenne de Paul ? »`
}

export function repondreAbsentsDate(date, presences, seances, ctx) {
  const dateAffichee = dateFrancaise(date)
  if (!seances.length) return `Aucune séance n’est enregistrée le ${dateAffichee}.`

  const elevesParId = new Map(ctx.eleves.map((eleve) => [eleve.id, eleve]))
  const seancesParId = new Map(seances.map((seance) => [seance.id, seance]))
  const matieresParId = new Map(ctx.matieres.map((matiere) => [matiere.id, matiere]))
  const absents = new Map()
  for (const presence of presences) {
    const eleve = elevesParId.get(presence.eleve_id)
    if (!eleve) continue
    const seance = seancesParId.get(presence.seance_id)
    if (!seance) continue
    const matiere = matieresParId.get(seance.matiere_id)
    if (!absents.has(eleve.id)) absents.set(eleve.id, { nom: eleve.nom, matieres: new Set() })
    if (matiere) absents.get(eleve.id).matieres.add(matiere.nom)
  }

  if (!absents.size) return `Aucun élève absent n’est enregistré le ${dateAffichee}.`
  const liste = [...absents.values()]
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map(({ nom, matieres }) => matieres.size
      ? `${nom} (${[...matieres].join(', ')})`
      : nom,
    )
  return `Absents le ${dateAffichee} (${liste.length}) : ${liste.join(', ')}.`
}

export function masquerNoms(phrase, ctx) {
  const identifiants = ctx.eleves
    .flatMap((eleve) => [eleve.nom, eleve.matricule])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  return identifiants.reduce((texte, identifiant) => {
    const expression = new RegExp(
      `(^|[^\\p{L}\\p{N}])${identifiant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
      'giu',
    )
    return texte.replace(expression, '$1[élève]$2')
  }, phrase)
}
