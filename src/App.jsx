import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import ThemeToggle from './components/ThemeToggle.jsx'
import Auth from './components/Auth.jsx'
import Dashboard from './components/Dashboard.jsx'
import AdminChatbot from './components/AdminChatbot.jsx'
import { messageErreurFonction } from './utils/supabaseErrors.js'

const LIBELLES = {
  en_attente: ['En attente', 'badge badge-excuse'],
  valide: ['Validé', 'badge badge-present'],
  refuse: ['Refusé', 'badge badge-absent'],
}
const LIBELLES_ROLE = {
  enseignant: 'Enseignant · liste de notes',
  responsable: 'Secrétaire / Responsable · bulletins',
}

function Barre({ connecte }) {
  return (
    <header className="topbar">
      <strong className="brand">Gestion scolaire</strong>
      <div className="row" style={{ marginTop: 0 }}>
        {connecte && <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>Déconnexion</button>}
        <ThemeToggle />
      </div>
    </header>
  )
}

function ListeComptes({ onChange }) {
  const [comptes, setComptes] = useState([])
  const [erreur, setErreur] = useState('')
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const [resetEnCours, setResetEnCours] = useState(null)
  const [motDePasseProvisoire, setMotDePasseProvisoire] = useState(null)

  async function charger() {
    const { data, error } = await supabase
      .from('enseignants')
      .select('id, nom, telephone, statut, role_acces, created_at')
      .order('created_at', { ascending: false })
    if (error) setErreur(error.message)
    else setComptes(data)
  }

  useEffect(() => { charger() }, [])

  async function changer(id, statut) {
    const { error } = await supabase.rpc('changer_statut_enseignant', { p_id: id, p_statut: statut })
    if (error) setErreur(error.message)
    else {
      setErreur('')
      await charger()
      await onChange()
    }
  }

  async function changerRole(id, role) {
    setErreur('')
    const { error } = await supabase.rpc('changer_role_enseignant', { p_id: id, p_role: role })
    if (error) setErreur(error.message)
    else {
      await charger()
      await onChange()
    }
  }

  async function reinitialiserMotDePasse(compte) {
    if (!window.confirm(`Générer un mot de passe provisoire pour ${compte.nom} ? Son mot de passe actuel cessera de fonctionner.`)) return
    setErreur('')
    setMotDePasseProvisoire(null)
    setResetEnCours(compte.id)
    try {
      const { data, error } = await supabase.functions.invoke('admin-password-reset', {
        body: { action: 'admin-reset', teacherId: compte.id },
      })
      if (error) {
        throw new Error(await messageErreurFonction(error, 'Impossible de réinitialiser ce mot de passe.'))
      }
      if (!data?.temporaryPassword) {
        throw new Error('Le serveur n’a pas renvoyé le mot de passe provisoire.')
      }
      setMotDePasseProvisoire({ nom: compte.nom, value: data.temporaryPassword })
    } catch (error) {
      setErreur(error?.message || 'Impossible de réinitialiser ce mot de passe.')
    } finally {
      setResetEnCours(null)
    }
  }

  const visibles = comptes.filter((compte) => {
    const correspondAuFiltre = filtre === 'tous' || compte.statut === filtre
    const correspondALaRecherche = `${compte.nom} ${compte.telephone || ''}`
      .toLocaleLowerCase('fr').includes(recherche.trim().toLocaleLowerCase('fr'))
    return correspondAuFiltre && correspondALaRecherche
  })

  return (
    <>
      <header className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Gestion des accès</p>
          <h2>Comptes enseignants</h2>
          <p className="muted">Valide les comptes et attribue l’accès enseignant ou secrétariat / responsable pédagogique.</p>
        </div>
        <span className="admin-count">{comptes.length} compte{comptes.length === 1 ? '' : 's'}</span>
      </header>
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      <section className="card admin-card">
        {motDePasseProvisoire && (
          <div className="admin-reset-password" role="status">
            <div>
              <strong>Mot de passe provisoire pour {motDePasseProvisoire.nom}</strong>
              <p className="muted">Transmets-le directement à l’enseignant par un canal sûr. Il ne sera plus affiché après fermeture.</p>
              <code>{motDePasseProvisoire.value}</code>
            </div>
            <button type="button" className="btn"
              onClick={() => setMotDePasseProvisoire(null)}>Fermer</button>
          </div>
        )}
        <div className="admin-filtres">
          <input
            className="input"
            type="search"
            placeholder="Rechercher un enseignant"
            aria-label="Rechercher un enseignant"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <select className="input" value={filtre} onChange={(e) => setFiltre(e.target.value)}
            aria-label="Filtrer les comptes par statut">
            <option value="tous">Tous les statuts</option>
            <option value="en_attente">En attente</option>
            <option value="valide">Validés</option>
            <option value="refuse">Refusés</option>
          </select>
        </div>
        {visibles.length === 0
          ? <p className="muted">{comptes.length ? 'Aucun compte ne correspond à ces filtres.' : 'Aucun compte enseignant.'}</p>
          : (
            <div className="admin-table-scroll">
              <table className="apercu admin-table">
                <thead>
                  <tr>
                    <th scope="col">Enseignant</th>
                    <th scope="col">Inscription</th>
                    <th scope="col">Statut du compte</th>
                    <th scope="col">Rôle d’accès</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((compte) => {
                    const [libelle, classeBadge] = LIBELLES[compte.statut] || [compte.statut, 'badge badge-excuse']
                    return (
                      <tr key={compte.id}>
                        <td>
                          <strong>{compte.nom}</strong>
                          {compte.telephone && <small>{compte.telephone}</small>}
                        </td>
                        <td>{new Date(compte.created_at).toLocaleDateString('fr-FR')}</td>
                        <td><span className={classeBadge}>{libelle}</span></td>
                        <td>
                          <label className="admin-role-select">
                            <span className="sr-only">Rôle d’accès de {compte.nom}</span>
                            <select className="input" value={compte.role_acces || 'enseignant'}
                              onChange={(e) => changerRole(compte.id, e.target.value)}>
                              <option value="enseignant">{LIBELLES_ROLE.enseignant}</option>
                              <option value="responsable">{LIBELLES_ROLE.responsable}</option>
                            </select>
                          </label>
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button type="button" className="btn"
                              disabled={Boolean(resetEnCours) || Boolean(motDePasseProvisoire)}
                              onClick={() => reinitialiserMotDePasse(compte)}>
                              {resetEnCours === compte.id ? 'Génération…' : 'Réinitialiser le mot de passe'}
                            </button>
                            {compte.statut !== 'valide' && (
                              <button type="button" className="btn btn-primary"
                                onClick={() => changer(compte.id, 'valide')}>Valider</button>
                            )}
                            {compte.statut !== 'refuse' && (
                              <button type="button" className="btn btn-danger"
                                onClick={() => changer(compte.id, 'refuse')}>Refuser</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </>
  )
}

function Admin() {
  const [onglet, setOnglet] = useState('dashboard')
  const [resume, setResume] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const onglets = [
    ['dashboard', 'Vue d’ensemble'],
    ['comptes', 'Comptes enseignants'],
    ['assistant', 'Assistant'],
  ]

  async function chargerResume() {
    setChargement(true)
    const [enseignants, usage, reglages, signalements] = await Promise.all([
      supabase.from('enseignants').select('id, statut, chatbot_actif'),
      supabase.rpc('admin_chatbot_usage', { p_jours: 7 }),
      supabase.from('chatbot_reglages').select('actif').limit(1).maybeSingle(),
      supabase.from('chatbot_signalements').select('id', { count: 'exact', head: true }),
    ])
    const echec = [enseignants, usage, reglages, signalements].find((resultat) => resultat.error)
    if (echec) {
      setErreur(echec.error.message)
      setChargement(false)
      return
    }
    const comptes = enseignants.data
    const valides = comptes.filter((compte) => compte.statut === 'valide')
    setResume({
      enseignants: comptes.length,
      attente: comptes.filter((compte) => compte.statut === 'en_attente').length,
      actifs: valides.filter((compte) => compte.chatbot_actif).length,
      messagesJour: usage.data.reduce((total, ligne) => total + Number(ligne.aujourdhui || 0), 0),
      messagesSemaine: usage.data.reduce((total, ligne) => total + Number(ligne.messages || 0), 0),
      signalements: signalements.count || 0,
      assistantActif: reglages.data?.actif ?? false,
    })
    setErreur('')
    setChargement(false)
  }

  useEffect(() => { chargerResume() }, [])

  return (
    <>
      <Barre connecte />
      <main className="container admin-container">
        <header className="admin-hero">
          <div>
            <p className="admin-eyebrow">Espace sécurisé</p>
            <h1>Administration</h1>
            <p className="muted">Pilote les comptes, l’assistant et les demandes de la plateforme.</p>
          </div>
          <span className={`admin-system-status ${resume ? (resume.assistantActif ? 'is-on' : 'is-off') : 'is-loading'}`}>
            <span aria-hidden="true" />
            Assistant {resume ? (resume.assistantActif ? 'actif' : 'désactivé') : 'en vérification'}
          </span>
        </header>
        <nav className="admin-nav" aria-label="Navigation administration">
          {onglets.map(([id, libelle]) => (
            <button key={id} type="button" className={onglet === id ? 'admin-nav-item actif' : 'admin-nav-item'}
              aria-current={onglet === id ? 'page' : undefined}
              onClick={() => setOnglet(id)}>{libelle}</button>
          ))}
        </nav>
        {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
        {onglet === 'dashboard' && (
          <section aria-labelledby="admin-dashboard-title">
            <div className="admin-section-heading">
              <div>
                <p className="admin-eyebrow">Vue d’ensemble</p>
                <h2 id="admin-dashboard-title">Tableau de bord</h2>
                <p className="muted">Un aperçu rapide de l’activité et des actions à traiter.</p>
              </div>
              <button type="button" className="btn" onClick={chargerResume} disabled={chargement}>
                {chargement ? 'Actualisation…' : 'Actualiser'}
              </button>
            </div>
            <div className="admin-stats" aria-live="polite">
              <article className="admin-stat-card admin-stat-attente">
                <span className="admin-stat-label">À valider</span>
                <strong>{resume?.attente ?? '—'}</strong>
                <span className="muted">Demandes de compte</span>
              </article>
              <article className="admin-stat-card admin-stat-comptes">
                <span className="admin-stat-label">Enseignants</span>
                <strong>{resume?.enseignants ?? '—'}</strong>
                <span className="muted">{resume?.actifs ?? '—'} avec assistant actif</span>
              </article>
              <article className="admin-stat-card admin-stat-usage">
                <span className="admin-stat-label">Messages aujourd’hui</span>
                <strong>{resume?.messagesJour ?? '—'}</strong>
                <span className="muted">{resume?.messagesSemaine ?? '—'} sur les 7 derniers jours</span>
              </article>
              <article className="admin-stat-card admin-stat-signalements">
                <span className="admin-stat-label">Phrases signalées</span>
                <strong>{resume?.signalements ?? '—'}</strong>
                <span className="muted">À examiner dans le tableau Assistant</span>
              </article>
            </div>
            <div className="admin-shortcuts">
              <button type="button" className="admin-shortcut" onClick={() => setOnglet('comptes')}>
                <span className="admin-shortcut-icon" aria-hidden="true">✓</span>
                <span><strong>Gérer les comptes</strong><small>Valider ou refuser les accès enseignants</small></span>
                <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="admin-shortcut" onClick={() => setOnglet('assistant')}>
                <span className="admin-shortcut-icon" aria-hidden="true">✦</span>
                <span><strong>Configurer l’assistant</strong><small>Réglages, quotas, lexique et signalements</small></span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}
        {onglet === 'comptes' && <ListeComptes onChange={chargerResume} />}
        {onglet === 'assistant' && (
          <div className="admin-assistant-page">
            <header className="admin-section-heading">
              <div>
                <p className="admin-eyebrow">Configuration</p>
                <h2>Assistant scolaire</h2>
                <p className="muted">Gère les accès, les quotas, le dictionnaire et les phrases transmises par les enseignants.</p>
              </div>
            </header>
            <AdminChatbot onChange={chargerResume} />
          </div>
        )}
      </main>
    </>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [profil, setProfil] = useState(null)
  const [estAdmin, setEstAdmin] = useState(false)
  const [recuperationMotDePasse, setRecuperationMotDePasse] = useState(false)
  const [erreurRecuperation, setErreurRecuperation] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    hashParams.forEach((value, key) => params.set(key, value))
    if (params.get('type') === 'recovery') {
      setRecuperationMotDePasse(true)
      setErreurRecuperation(params.get('error_description') || '')
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChargement(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        setRecuperationMotDePasse(true)
        setErreurRecuperation('')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfil(null); setEstAdmin(false); return }
    const uid = session.user.id
    supabase.from('admins').select('id').eq('id', uid).maybeSingle()
      .then(({ data }) => setEstAdmin(!!data))
    supabase.from('enseignants').select('nom, statut, role_acces').eq('id', uid).maybeSingle()
      .then(({ data }) => setProfil(data))
  }, [session])

  if (chargement) return <p className="muted" style={{ padding: '1rem' }}>Chargement...</p>
  if (recuperationMotDePasse) {
    return (
      <Auth
        recoveryMode
        recoveryError={erreurRecuperation}
        onPasswordRecovered={() => setRecuperationMotDePasse(false)}
      />
    )
  }
  if (!session) return <Auth />

  if (estAdmin) return <Admin />
  if (session.user.app_metadata?.must_change_password) {
    return (
      <Auth
        temporaryPasswordMode
        onTemporaryPasswordChanged={async () => {
          const { error } = await supabase.auth.refreshSession()
          if (error) throw error
        }}
      />
    )
  }

  if (!profil) return <p className="muted" style={{ padding: '1rem' }}>Chargement...</p>

  if (profil.statut === 'en_attente') {
    return (
      <>
        <Barre connecte />
        <main className="container">
          <section className="card">
            <h1>Compte en attente</h1>
            <p className="muted">Ton compte doit être validé par l’administrateur.</p>
          </section>
        </main>
      </>
    )
  }

  if (profil.statut === 'refuse') {
    return (
      <>
        <Barre connecte />
        <main className="container">
          <section className="card">
            <h1>Compte refusé</h1>
            <p className="muted">Contacte l’administrateur.</p>
          </section>
        </main>
      </>
    )
  }

  return <Dashboard nom={profil.nom} userId={session.user.id}
    roleAcces={profil.role_acces || 'enseignant'} />
}