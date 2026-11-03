import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const INTENTIONS = [
  ['effectif', 'Effectif / nombre d’élèves'],
  ['moyenne', 'Moyenne'],
  ['classement', 'Classement'],
  ['absences', 'Absences'],
  ['liste_absents', 'Liste des absents'],
  ['taux_presence', 'Taux de présence'],
  ['sous_seuil', 'Sous un seuil'],
  ['aide', 'Aide'],
]

// Entier de 0 à 1000, chiffres uniquement (refuse "", "1e2", "0x10", "-5", "3.5")
function quotaValide(texte) {
  return /^\d{1,4}$/.test(texte) && Number(texte) <= 1000
}

export default function AdminChatbot({ onChange }) {
  const [actif, setActif] = useState(true)
  const [ecriture, setEcriture] = useState(true)
  // Vide tant que les réglages ne sont pas chargés : l'enregistrement est alors refusé
  const [quotaDefaut, setQuotaDefaut] = useState('')
  const [comptes, setComptes] = useState([])
  const [noms, setNoms] = useState({})
  const [lexique, setLexique] = useState([])
  const [signalements, setSignalements] = useState([])
  const [intention, setIntention] = useState('moyenne')
  const [mot, setMot] = useState('')
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')

  async function charger() {
    const [rg, ru, re, rl, rs] = await Promise.all([
      supabase.from('chatbot_reglages').select('actif, quota_defaut, ecriture').limit(1).maybeSingle(),
      supabase.rpc('admin_chatbot_usage', { p_jours: 7 }),
      supabase.from('enseignants').select('id, nom, statut, chatbot_actif, chatbot_quota'),
      supabase.from('chatbot_lexique').select('id, intention, mot').order('intention').order('mot'),
      supabase.from('chatbot_signalements')
        .select('id, enseignant_id, texte, cree_le')
        .order('cree_le', { ascending: false }).limit(100),
    ])
    const echec = [rg, ru, re, rl, rs].find((r) => r.error)
    if (echec) { setErreur(echec.error.message); return }

    if (rg.data) {
      setActif(rg.data.actif)
      setQuotaDefaut(String(rg.data.quota_defaut))
      setEcriture(rg.data.ecriture)
    }
    const usage = Object.fromEntries(ru.data.map((u) => [u.enseignant_id, u]))
    setNoms(Object.fromEntries(re.data.map((e) => [e.id, e.nom])))
    setComptes(
      re.data
        .filter((e) => e.statut === 'valide')
        .map((e) => ({
          id: e.id,
          nom: e.nom,
          actif: e.chatbot_actif,
          quota: e.chatbot_quota === null ? '' : String(e.chatbot_quota),
          semaine: Number(usage[e.id]?.messages ?? 0),
          aujourdhui: usage[e.id]?.aujourdhui ?? 0,
          modifie: false,
        }))
        .sort((a, b) => b.semaine - a.semaine || a.nom.localeCompare(b.nom))
    )
    setLexique(rl.data)
    setSignalements(rs.data)
    setErreur('')
  }

  useEffect(() => { charger() }, [])

  async function agir(requete, message) {
    const { error } = await requete
    if (error) { setErreur(error.message); setInfo(''); return false }
    setErreur('')
    setInfo(message || '')
    await charger()
    await onChange()
    return true
  }

  function enregistrerReglages(e) {
    e.preventDefault()
    const brut = quotaDefaut.trim()
    if (!quotaValide(brut)) {
      setErreur('Quota invalide (entier de 0 à 1000).')
      return
    }
    agir(supabase.rpc('admin_chatbot_reglages_maj', { p_actif: actif, p_quota_defaut: Number(brut) }),
      'Réglages enregistrés.')
  }

  function modifier(id, champ, valeur) {
    setComptes((l) => l.map((c) => (c.id === id ? { ...c, [champ]: valeur, modifie: true } : c)))
  }

  function enregistrerCompte(c) {
    const brut = c.quota.trim()
    if (brut !== '' && !quotaValide(brut)) {
      setErreur('Quota invalide (entier de 0 à 1000, ou vide pour la valeur par défaut).')
      return
    }
    const q = brut === '' ? null : Number(brut)
    agir(supabase.rpc('admin_chatbot_compte_maj', { p_id: c.id, p_actif: c.actif, p_quota: q }),
      `Compte de ${c.nom} mis à jour.`)
  }

  function ajouterMot(e) {
    e.preventDefault()
    const m = mot.trim()
    if (m.length < 2 || m.length > 60) { setErreur('Le mot doit faire entre 2 et 60 caractères.'); return }
    agir(supabase.rpc('admin_lexique_ajouter', { p_intention: intention, p_mot: m }), 'Mot ajouté au lexique.')
      .then((ok) => { if (ok) setMot('') })
  }

  return (
    <>
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      {info && <p className="assistant-notice" role="status">{info}</p>}

      <section className="card admin-card">
        <div className="admin-card-heading">
          <div>
            <p className="admin-eyebrow">Disponibilité & sécurité</p>
            <h3>Réglages généraux</h3>
          </div>
        </div>
        <form onSubmit={enregistrerReglages} className="row" style={{ marginTop: 0 }}>
          <label>
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
            {' '}Assistant activé pour tous
          </label>
          <label>
            Quota par défaut (messages par jour) :{' '}
            <input className="input" style={{ width: 90 }} inputMode="numeric" value={quotaDefaut}
              onChange={(e) => setQuotaDefaut(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">Enregistrer</button>
        </form>
        <label style={{ display: 'block', marginTop: '1rem' }}>
          <input type="checkbox" checked={ecriture}
            onChange={(e) => agir(
              supabase.rpc('admin_chatbot_ecriture_maj', { p_ecriture: e.target.checked }),
              e.target.checked ? 'Modifications autorisées.' : 'Modifications désactivées.'
            )} />
          {' '}Autoriser l’assistant à modifier des données (présences et notes), avec confirmation
        </label>
      </section>

      <section className="card admin-card">
        <div className="admin-card-heading">
          <div>
            <p className="admin-eyebrow">Activité</p>
            <h3>Utilisation par enseignant</h3>
          </div>
          <span className="admin-count">{comptes.length} actif{comptes.length === 1 ? '' : 's'}</span>
        </div>
        <p className="muted">
          Usage sur 7 jours : nombre de messages seulement, le contenu n’est jamais visible.
          Quota vide = valeur par défaut.
        </p>
        {comptes.length === 0 && <p className="muted">Aucun enseignant validé.</p>}
        {comptes.length > 0 && (
          <div className="admin-table-scroll">
            <table className="apercu admin-table">
              <thead>
                <tr>
                  <th scope="col">Enseignant</th><th scope="col">7 jours</th><th scope="col">Aujourd’hui</th>
                  <th scope="col">Actif</th><th scope="col">Quota / jour</th><th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {comptes.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{c.nom}</th>
                    <td>{c.semaine}</td>
                    <td>{c.aujourdhui}</td>
                    <td>
                      <input type="checkbox" checked={c.actif}
                        onChange={(e) => modifier(c.id, 'actif', e.target.checked)}
                        aria-label={`Assistant actif pour ${c.nom}`} />
                    </td>
                    <td>
                      <input className="input" style={{ width: 80 }} inputMode="numeric"
                        placeholder="défaut" value={c.quota}
                        onChange={(e) => modifier(c.id, 'quota', e.target.value)}
                        aria-label={`Quota de ${c.nom}`} />
                    </td>
                    <td>
                      <button type="button" className="btn btn-primary" disabled={!c.modifie}
                        onClick={() => enregistrerCompte(c)}>Enregistrer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card admin-card">
        <div className="admin-card-heading">
          <div>
            <p className="admin-eyebrow">Compréhension</p>
            <h3>Lexique de synonymes</h3>
          </div>
          <span className="admin-count">{lexique.length} terme{lexique.length === 1 ? '' : 's'}</span>
        </div>
        <p className="muted">
          Ajoute un mot ou une expression ; l’assistant comprend aussi les accents, certaines variantes
          singulier/pluriel et les petites fautes de frappe. Le lexique est actualisé pendant l’utilisation.
        </p>
        <form onSubmit={ajouterMot} className="row" style={{ marginTop: 0 }}>
          <select className="input" value={intention} onChange={(e) => setIntention(e.target.value)}>
            {INTENTIONS.map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
          </select>
          <input className="input" placeholder="Mot ou expression" value={mot} maxLength={60}
            onChange={(e) => setMot(e.target.value)} required />
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </form>
        {INTENTIONS.map(([id, libelle]) => {
          const mots = lexique.filter((l) => l.intention === id)
          if (mots.length === 0) return null
          return (
            <div key={id}>
              <h3>{libelle}</h3>
              <div className="row" style={{ marginTop: 0 }}>
                {mots.map((l) => (
                  <span key={l.id} className="badge badge-excuse">
                    {l.mot}{' '}
                    <button type="button" className="link-btn" style={{ color: '#fff' }}
                      aria-label={`Supprimer ${l.mot}`}
                      onClick={() => agir(supabase.rpc('admin_lexique_supprimer', { p_id: l.id }))}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      <section className="card admin-card">
        <div className="admin-card-heading">
          <div>
            <p className="admin-eyebrow">Retours des enseignants</p>
            <h3>Phrases signalées</h3>
          </div>
          <span className="admin-count">{signalements.length}{signalements.length === 100 ? '+' : ''}</span>
        </div>
        <p className="muted">
          Phrases que l’assistant n’a pas comprises et que des enseignants ont choisi de te transmettre.
          Ajoute les bons mots au lexique, puis supprime la phrase.
        </p>
        {signalements.length === 0 && <p className="muted">Aucune phrase signalée.</p>}
        {signalements.map((s) => (
          <div className="ligne-classe" key={s.id}>
            <span className="nom">{s.texte}</span>
            <span className="muted">
              {noms[s.enseignant_id] ?? 'Enseignant'}, {new Date(s.cree_le).toLocaleDateString('fr-FR')}
            </span>
            <button type="button" className="btn btn-danger"
              onClick={() => agir(supabase.rpc('admin_signalement_supprimer', { p_id: s.id }))}>
              Supprimer
            </button>
          </div>
        ))}
      </section>
    </>
  )
}