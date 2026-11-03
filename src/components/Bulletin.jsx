import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const fmt = (v) => (v === null || v === undefined ? '-' : v.toFixed(2))
const moyenne = (liste) => {
  const v = liste.filter((x) => x !== null && x !== undefined)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export default function Bulletin({ classe, eleve, matieres, lignes, enseignantNom, periode, onFermer }) {
  const [entete, setEntete] = useState({
    etablissement: '', adresse: '', telephone: '', email: '', siteWeb: '', campus: '', ville: '',
  })
  const [logoUrl, setLogoUrl] = useState(null)
  const [abs, setAbs] = useState({ absent: 0, excuse: 0, taux: null })
  const [appreciation, setAppreciation] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    async function charger() {
      const { data, error } = await supabase.from('classes')
        .select('nom, annee_scolaire, campus(nom, ville, etablissements(nom, adresse, telephone, email, site_web, logo_path))')
        .eq('id', classe.id).single()
      if (error) { setErreur(error.message); return }
      const etab = data.campus?.etablissements
      setEntete({
        etablissement: etab?.nom || '',
        adresse: etab?.adresse || '',
        telephone: etab?.telephone || '',
        email: etab?.email || '',
        siteWeb: etab?.site_web || '',
        campus: data.campus?.nom || '',
        ville: data.campus?.ville || '',
      })
      if (etab?.logo_path) {
        const r = await supabase.storage.from('logos').createSignedUrl(etab.logo_path, 3600)
        if (r.error) setErreur(r.error.message)
        else if (r.data?.signedUrl) setLogoUrl(r.data.signedUrl)
        else setErreur('Impossible de récupérer le lien du logo de l’établissement.')
      }
      if (periode && matieres.length > 0) {
        const seances = await supabase.from('seances').select('id')
          .in('matiere_id', matieres.map((matiere) => matiere.id))
          .gte('date', periode.date_debut).lte('date', periode.date_fin)
        if (seances.error) { setErreur(seances.error.message); return }
        const presences = seances.data.length
          ? await supabase.from('presences').select('statut').eq('eleve_id', eleve.id)
            .in('seance_id', seances.data.map((seance) => seance.id))
          : { data: [], error: null }
        if (presences.error) { setErreur(presences.error.message); return }
        const presents = presences.data.filter((presence) => presence.statut === 'present').length
        const absents = presences.data.filter((presence) => presence.statut === 'absent').length
        const excuses = presences.data.filter((presence) => presence.statut === 'excuse').length
        const total = presents + absents + excuses
        setAbs({
          absent: absents,
          excuse: excuses,
          taux: total ? Math.round((presents / total) * 1000) / 10 : null,
        })
      } else {
        const p = await supabase.rpc('absences_classe', { p_classe: classe.id })
        if (p.error) { setErreur(p.error.message); return }
        const a = p.data.find((x) => x.eleve_id === eleve.id)
        setAbs({ absent: a?.absents ?? 0, excuse: a?.excuses ?? 0, taux: a?.taux_presence ?? null })
      }
    }
    charger()
  }, [classe.id, eleve.id, matieres, periode?.id, periode?.date_debut, periode?.date_fin])

  const effectif = lignes.filter((l) => l.general !== null).length

  return (
    <section className="card bulletin">
      <div className="row no-print">
        <button type="button" className="btn" onClick={onFermer}>← Retour aux résultats</button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimer / Enregistrer en PDF
        </button>
      </div>
      {erreur && <p className="muted">{erreur}</p>}

      <header className="document-entete">
        {logoUrl && <img src={logoUrl} alt={`Logo de ${entete.etablissement}`} />}
        <div className="document-entete-texte">
          <h2 style={{ margin: 0 }}>{entete.etablissement}</h2>
          <p>{[entete.adresse, entete.campus, entete.ville].filter(Boolean).join(' · ')}</p>
          <p>{[entete.telephone, entete.email, entete.siteWeb].filter(Boolean).join(' · ')}</p>
          <p><strong>Enseignant :</strong> {enseignantNom || '—'}</p>
          <p><strong>Matières :</strong> {matieres.map((matiere) => matiere.nom).join(', ') || '—'}</p>
          <p><strong>Classe :</strong> {classe.nom} · <strong>Année :</strong> {classe.annee_scolaire}</p>
        </div>
      </header>

      <h1>Bulletin de notes{periode ? ` — ${periode.nom}` : ''}</h1>
      <p>
        <strong>{eleve.nom}</strong> (matricule {eleve.matricule})<br />
        Classe : {classe.nom} · Année scolaire : {classe.annee_scolaire}
        {periode && <><br />Période : {periode.nom} · Du {new Date(`${periode.date_debut}T12:00:00`).toLocaleDateString('fr-FR')}
          au {new Date(`${periode.date_fin}T12:00:00`).toLocaleDateString('fr-FR')}</>}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="apercu">
          <thead>
            <tr>
              <td>Matière</td>
              <td>Coef.</td>
              <td>Moyenne élève</td>
              <td>Moyenne classe</td>
            </tr>
          </thead>
          <tbody>
            {matieres.map((m) => (
              <tr key={m.id}>
                <td>{m.nom}</td>
                <td>{m.coefficient}</td>
                <td>{fmt(eleve.parMatiere[m.id])}</td>
                <td>{fmt(moyenne(lignes.map((l) => l.parMatiere[m.id])))}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}><strong>Moyenne générale</strong></td>
              <td><strong>{fmt(eleve.general)}</strong></td>
              <td>{fmt(moyenne(lignes.map((l) => l.general)))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Rang : {eleve.rang ? `${eleve.rang} / ${effectif}` : '-'}<br />
        Absences : {abs.absent} · Absences excusées : {abs.excuse}
        {abs.taux !== null && ` · Taux de présence : ${Number(abs.taux)} %`}
      </p>

      <p><strong>Appréciation :</strong></p>
      <textarea className="input" rows={3} style={{ width: '100%' }} value={appreciation}
        onChange={(e) => setAppreciation(e.target.value)} maxLength={500}
        placeholder="Tape l’appréciation ici (non enregistrée, uniquement pour l’impression)" />
    </section>
  )
}