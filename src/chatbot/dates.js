function isoDate(annee, mois, jour) {
  const date = new Date(Number(annee), Number(mois) - 1, Number(jour))
  if (date.getFullYear() !== Number(annee) ||
      date.getMonth() !== Number(mois) - 1 ||
      date.getDate() !== Number(jour)) return null
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

function dateLocale(decalage = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + decalage)
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function extraireDate(phrase) {
  const texte = String(phrase ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()

  if (/\b(aujourd'hui|aujourdhui|ce jour)\b/.test(texte)) return dateLocale()
  if (/\b(avant-hier|avant hier)\b/.test(texte)) return dateLocale(-2)
  if (/\b(hier|la veille)\b/.test(texte)) return dateLocale(-1)

  const iso = texte.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) return isoDate(iso[1], iso[2], iso[3])

  const numeric = texte.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/)
  if (numeric) {
    const annee = numeric[3] ? Number(numeric[3]) : new Date().getFullYear()
    return isoDate(annee < 100 ? 2000 + annee : annee, numeric[2], numeric[1])
  }

  const mois = {
    janvier: 1, janv: 1, fevrier: 2, fevr: 2, mars: 3, avril: 4, avr: 4,
    mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9,
    octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12,
  }
  const ecrite = texte.match(/\b(\d{1,2})(?:er)?\s+(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+(20\d{2}))?\b/)
  if (ecrite) {
    return isoDate(ecrite[3] || new Date().getFullYear(), mois[ecrite[2]], ecrite[1])
  }
  return null
}

export function dateFrancaise(iso) {
  if (!iso) return ''
  return String(iso).split('-').reverse().join('/')
}
