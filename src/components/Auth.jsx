import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import ThemeToggle from './ThemeToggle.jsx'
import {
  ConditionsUtilisation,
  MentionsLegales,
  PolitiqueConfidentialite,
  VERSION_DOCUMENTS,
} from './Legal.jsx'

export default function Auth({ recoveryMode = false, recoveryError = '', onPasswordRecovered }) {
  const [mode, setMode] = useState('connexion')
  const [documentLegal, setDocumentLegal] = useState(null)
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmationPassword, setConfirmationPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageIsInfo, setMessageIsInfo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recuperationTerminee, setRecuperationTerminee] = useState(false)
  const [accepteConfidentialite, setAccepteConfidentialite] = useState(false)
  const [accepteConditions, setAccepteConditions] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setMessage('')
    setMessageIsInfo(false)
    if (recoveryMode) {
      if (password.length < 10) {
        setMessage('Le nouveau mot de passe doit contenir au moins 10 caractères.')
        return
      }
      if (password !== confirmationPassword) {
        setMessage('Les deux mots de passe ne correspondent pas.')
        return
      }
      setLoading(true)
      try {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) setMessage(error.message)
        else {
          setPassword('')
          setConfirmationPassword('')
          setRecuperationTerminee(true)
        }
      } catch (error) {
        setMessage(error?.message || 'Impossible de modifier le mot de passe. Réessaie.')
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'inscription' && (!accepteConfidentialite || !accepteConditions)) {
      setMessage('Accepte la politique de confidentialité et les conditions pour créer ton compte.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMessage('Email ou mot de passe incorrect.')
      } else {
        const dateAcceptation = new Date().toISOString()
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nom,
              telephone,
              confidentialite_acceptee: VERSION_DOCUMENTS,
              conditions_acceptees: VERSION_DOCUMENTS,
              date_acceptation_conditions: dateAcceptation,
            },
          },
        })
        if (error) setMessage(error.message)
        else {
          setMessage('Compte créé. Confirme ton email si demandé, puis attends la validation par l’administrateur.')
          setMessageIsInfo(true)
        }
      }
    } catch (error) {
      setMessage(error?.message || 'Une erreur est survenue. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  async function envoyerLienRecuperation(e) {
    e.preventDefault()
    setMessage('')
    setMessageIsInfo(false)
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      })
      if (error) setMessage(error.message)
      else {
        setMessage('Si un compte correspond à cette adresse, un lien de réinitialisation vient de lui être envoyé. Vérifie aussi les courriers indésirables.')
        setMessageIsInfo(true)
      }
    } catch (error) {
      setMessage(error?.message || 'Impossible d’envoyer le lien. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  function changerMode() {
    setMessage('')
    setDocumentLegal(null)
    setAccepteConfidentialite(false)
    setAccepteConditions(false)
    setMode(mode === 'inscription' ? 'connexion' : 'inscription')
  }

  if (documentLegal) {
    const confidentialite = documentLegal === 'confidentialite'
    const conditions = documentLegal === 'conditions'
    return (
      <div className="legal-page">
        <header className="legal-topbar">
          <img src="/sygesc-logo.png" alt="SyGesc, application de gestion scolaire" />
          <ThemeToggle />
        </header>
        <main className="legal-main">
          <button type="button" className="btn legal-back" onClick={() => setDocumentLegal(null)}>
            ← Retour à {mode === 'connexion' ? 'la connexion' : 'la création du compte'}
          </button>
          <section className="card legal-card">
            {confidentialite
              ? <PolitiqueConfidentialite />
              : conditions
                ? <ConditionsUtilisation />
                : <MentionsLegales />}
          </section>
          <button type="button" className="btn btn-primary legal-back"
            onClick={() => setDocumentLegal(null)}>
            J’ai terminé la lecture
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="auth">
      <div className="auth-visuel">
        <img className="auth-logo" src="/sygesc-logo.png" alt="SyGesc — Application de Gestion Scolaire" />
        <p>Gérer · Suivre · Réussir</p>
        <div className="auth-benefices" aria-label="Fonctionnalités principales">
          <span>Présences</span><span>Notes & résultats</span><span>Classes organisées</span>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-theme"><ThemeToggle /></div>
        <section className="card auth-carte">
          <h2>
            {recoveryMode
              ? recuperationTerminee
                ? 'Mot de passe modifié'
                : recoveryError
                  ? 'Lien de récupération indisponible'
                  : 'Choisir un nouveau mot de passe'
              : mode === 'inscription'
                ? 'Créer un compte'
                : mode === 'mot-de-passe-oublie'
                  ? 'Récupérer mon compte'
                  : 'Connexion'}
          </h2>
          {recoveryMode && recuperationTerminee ? (
            <div className="auth-recovery-complete">
              <p className="auth-recovery-success" role="status">
                Ton mot de passe a été modifié. Tu peux maintenant continuer vers ton compte.
              </p>
              <button type="button" className="btn btn-primary" onClick={onPasswordRecovered}>
                Continuer
              </button>
            </div>
          ) : recoveryMode && recoveryError ? (
            <div className="auth-recovery-complete">
              <p className="auth-message" role="alert">{recoveryError}</p>
              <p className="muted">Le lien est peut-être expiré ou déjà utilisé. Demande un nouveau lien de récupération.</p>
              <button type="button" className="btn btn-primary" onClick={onPasswordRecovered}>
                Retour à la connexion
              </button>
            </div>
          ) : recoveryMode ? (
            <>
              <p className="muted">Choisis un nouveau mot de passe d’au moins 10 caractères.</p>
              <form onSubmit={submit} className="form">
                <label className="auth-password-field">
                  Nouveau mot de passe
                  <input className="input" type="password" autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    required minLength={10} />
                </label>
                <label className="auth-password-field">
                  Confirmer le mot de passe
                  <input className="input" type="password" autoComplete="new-password"
                    value={confirmationPassword}
                    onChange={(e) => setConfirmationPassword(e.target.value)}
                    required minLength={10} />
                </label>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Modification...' : 'Enregistrer le nouveau mot de passe'}
                </button>
              </form>
            </>
          ) : mode === 'mot-de-passe-oublie' ? (
            <>
              <p className="muted">
                Indique l’adresse email de ton compte. Si elle est reconnue, nous t’enverrons un lien sécurisé.
              </p>
              <form onSubmit={envoyerLienRecuperation} className="form">
                <label className="auth-password-field">
                  Adresse email
                  <input className="input" type="email" autoComplete="email" placeholder="Email"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Envoi...' : 'Envoyer le lien de récupération'}
                </button>
              </form>
              <p>
                <button type="button" className="link-btn"
                  onClick={() => { setMessage(''); setMode('connexion') }}>
                  ← Retour à la connexion
                </button>
              </p>
            </>
          ) : (
            <>
          {mode === 'inscription' && (
            <p className="muted">Ton compte sera activé après validation par l’administrateur.</p>
          )}
          <form onSubmit={submit} className="form">
            {mode === 'inscription' && (
              <>
                <input className="input" placeholder="Nom complet" value={nom}
                  onChange={(e) => setNom(e.target.value)} required maxLength={150} />
                <input className="input" placeholder="Téléphone (facultatif)" value={telephone}
                  onChange={(e) => setTelephone(e.target.value)} maxLength={30} />
              </>
            )}
            <input className="input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
            <input className="input" type="password" placeholder="Mot de passe" value={password}
              autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            {mode === 'inscription' && (
              <div className="legal-consentements">
                <div className="legal-consent">
                  <label>
                    <input type="checkbox" checked={accepteConfidentialite}
                      onChange={(e) => setAccepteConfidentialite(e.target.checked)} required />
                    <span>J’ai lu la politique de confidentialité.</span>
                  </label>
                  <button type="button" className="link-btn"
                    onClick={() => setDocumentLegal('confidentialite')}>
                    Lire
                  </button>
                </div>
                <div className="legal-consent">
                  <label>
                    <input type="checkbox" checked={accepteConditions}
                      onChange={(e) => setAccepteConditions(e.target.checked)} required />
                    <span>J’accepte les conditions d’utilisation.</span>
                  </label>
                  <button type="button" className="link-btn"
                    onClick={() => setDocumentLegal('conditions')}>
                    Lire
                  </button>
                </div>
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Un instant...' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>
          {mode === 'connexion' && (
            <p className="auth-forgot-link">
              <button type="button" className="link-btn"
                onClick={() => { setMessage(''); setMode('mot-de-passe-oublie') }}>
                Mot de passe oublié ?
              </button>
            </p>
          )}
          <p className="muted">
            <button type="button" className="link-btn"
              onClick={changerMode}>
              {mode === 'connexion' ? 'Pas de compte ? S’inscrire' : 'Déjà un compte ? Se connecter'}
            </button>
          </p>
          {mode === 'connexion' && (
            <nav className="auth-legal-links" aria-label="Informations légales">
              <button type="button" className="link-btn" onClick={() => setDocumentLegal('confidentialite')}>
                Confidentialité
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" className="link-btn" onClick={() => setDocumentLegal('conditions')}>
                Conditions d’utilisation
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" className="link-btn" onClick={() => setDocumentLegal('mentions')}>
                Mentions légales
              </button>
            </nav>
          )}
            </>
          )}
          {message && (
            <p className={`auth-message${messageIsInfo ? ' auth-message-info' : ''}`}
              role={messageIsInfo ? 'status' : 'alert'}>
              {message}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}