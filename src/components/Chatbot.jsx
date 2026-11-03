import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import {
  fusionnerLexique, analyser, besoins, repondre, repondreAbsentsDate, messageEtat,
  masquerNoms, texteInconnu, EXEMPLES, reponseSociale,
} from '../chatbot/moteur.js'
import { analyserEcriture } from '../chatbot/ecritures.js'
import { dateFrancaise, extraireDate } from '../chatbot/dates.js'
import { tokens } from '../chatbot/texte.js'

const LIBELLE = { present: 'présent', absent: 'absent', excuse: 'excusé' }
const LIBELLE_PLURIEL = { present: 'présents', absent: 'absents', excuse: 'excusés' }
export default function Chatbot({ classe }) {
  const [ctx, setCtx] = useState(null)
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      texte: 'Bonjour ! Pose-moi une question sur cette classe (moyennes, classement, absences) ' +
        'ou demande-moi de marquer une présence : « marque Paul absent en maths ». Écris « aide » pour des exemples.',
    },
  ])
  const [saisie, setSaisie] = useState('')
  const [statut, setStatut] = useState(null)
  const [occupe, setOccupe] = useState(false)
  const [signal, setSignal] = useState(null)
  const [enAttente, setEnAttente] = useState(null)
  const [questionEnAttente, setQuestionEnAttente] = useState(null)
  const [journal, setJournal] = useState([])
  const [info, setInfo] = useState('')
  const [erreur, setErreur] = useState('')
  const boite = useRef(null)

  async function chargerJournal() {
    const { data, error } = await supabase.from('journal_actions')
      .select('id, action, details, annule, created_at')
      .eq('source', 'chatbot')
      .order('created_at', { ascending: false })
      .limit(30)
    if (!error) setJournal(data)
  }

  useEffect(() => {
    let actif = true
    async function charger() {
      const [re, rm, rl, rs] = await Promise.all([
        supabase.from('eleves').select('id, matricule, nom').eq('classe_id', classe.id),
        supabase.from('matieres').select('id, nom').eq('classe_id', classe.id),
        supabase.from('chatbot_lexique').select('intention, mot'),
        supabase.rpc('chatbot_statut'),
      ])
      if (!actif) return
      const echec = [re, rm, rl, rs].find((resultat) => resultat.error)
      if (echec) { setErreur(echec.error.message); return }
      const evaluations = rm.data.length
        ? await supabase.from('evaluations')
          .select('id, titre, note_max, matiere_id')
          .in('matiere_id', rm.data.map((matiere) => matiere.id))
        : { data: [], error: null }
      if (evaluations.error) { setErreur(evaluations.error.message); return }
      setCtx({
        eleves: re.data,
        matieres: rm.data,
        evaluations: evaluations.data,
        lexique: fusionnerLexique(rl.data),
      })
      if (!rs.error) setStatut(rs.data)
      chargerJournal()
    }
    charger()
    return () => { actif = false }
  }, [classe.id])

  useEffect(() => {
    let actif = true
    let chargementEnCours = false
    async function actualiserLexique() {
      if (chargementEnCours) return
      chargementEnCours = true
      try {
        const { data, error } = await supabase.from('chatbot_lexique').select('intention, mot')
        if (actif) {
          if (error) setErreur(error.message)
          else setCtx((courant) => courant
            ? { ...courant, lexique: fusionnerLexique(data) }
            : courant,
          )
        }
      } catch (error) {
        if (actif) setErreur(error?.message || 'Impossible d’actualiser le dictionnaire.')
      } finally {
        chargementEnCours = false
      }
    }
    const channel = supabase.channel(`chatbot-lexique-${classe.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chatbot_lexique',
      }, actualiserLexique)
      .subscribe()
    const intervalle = window.setInterval(() => {
      if (document.visibilityState === 'visible') actualiserLexique()
    }, 30_000)
    const actualiserAuRetour = () => {
      if (document.visibilityState === 'visible') actualiserLexique()
    }
    window.addEventListener('focus', actualiserAuRetour)
    document.addEventListener('visibilitychange', actualiserAuRetour)
    return () => {
      actif = false
      window.clearInterval(intervalle)
      window.removeEventListener('focus', actualiserAuRetour)
      document.removeEventListener('visibilitychange', actualiserAuRetour)
      supabase.removeChannel(channel)
    }
  }, [classe.id])

  useEffect(() => {
    if (boite.current) boite.current.scrollTop = boite.current.scrollHeight
  }, [messages, signal, enAttente])

  const ajouter = (m) => setMessages((l) => [...l, m])

  async function traiter(phrase) {
    const texte = phrase.trim().slice(0, 300)
    if (!texte || !ctx || occupe) return
    const dateSuivante = extraireDate(texte)
    const estPrecisionDate = questionEnAttente?.type === 'date_absents' &&
      dateSuivante && tokens(texte).length <= 4
    const estPrecisionEcriture = questionEnAttente?.type === 'commande_ecriture' &&
      tokens(texte).length <= 8 && !analyserEcriture(texte, ctx)
    const phraseAnalyse = estPrecisionDate || estPrecisionEcriture
      ? `${questionEnAttente.phrase} ${texte}`
      : texte
    if (questionEnAttente) setQuestionEnAttente(null)
    setSaisie('')
    setSignal(null)
    setEnAttente(null)
    setInfo('')
    setErreur('')
    ajouter({ role: 'moi', texte })
    setOccupe(true)
    try {
      const c = await supabase.rpc('chatbot_compter_message')
      if (c.error) throw c.error
      setStatut(c.data)
      if (c.data.etat !== 'ok') {
        ajouter({ role: 'bot', texte: messageEtat(c.data) })
        return
      }

      const social = reponseSociale(texte)
      if (social) {
        ajouter({ role: 'bot', texte: social })
        return
      }

      const w = analyserEcriture(phraseAnalyse, ctx)
      if (w) {
        if (w.elevesAmbigus.length > 0) {
          ajouter({
            role: 'bot',
            texte: `Plusieurs élèves correspondent : ${w.elevesAmbigus.map((x) => x.nom).join(', ')}. ` +
              'Réécris la commande avec le nom complet ou le matricule.',
          })
          return
        }
        if (!w.eleve && !w.toutLeMonde) {
          ajouter({ role: 'bot', texte: 'Je ne trouve pas cet élève. Vérifie l’orthographe ou utilise le matricule.' })
          return
        }
        const cibles = w.toutLeMonde ? ctx.eleves : [w.eleve]
        if (cibles.length === 0) {
          ajouter({ role: 'bot', texte: 'Il n’y a aucun élève dans cette classe.' })
          return
        }
        if (w.matieresAmbigues.length > 0) {
          if (w.toutLeMonde || w.type === 'note') {
            setQuestionEnAttente({ type: 'commande_ecriture', phrase: phraseAnalyse })
          }
          ajouter({
            role: 'bot',
            texte: `Plusieurs matières correspondent : ${w.matieresAmbigues.map((x) => x.nom).join(', ')}. ` +
              'Réécris la commande en précisant la matière.',
          })
          return
        }
        if (w.type === 'note' && w.valeur === null) {
          setQuestionEnAttente({ type: 'commande_ecriture', phrase: phraseAnalyse })
          ajouter({
            role: 'bot',
            texte: 'Quelle note veux-tu enregistrer ? Par exemple « 14/20 ».',
          })
          return
        }
        const matiere = w.matiere || (ctx.matieres.length === 1 ? ctx.matieres[0] : null)
        if (!matiere) {
          if (w.type === 'note' && w.evaluationsAmbigues.length > 0) {
            setQuestionEnAttente({ type: 'commande_ecriture', phrase: phraseAnalyse })
            ajouter({
              role: 'bot',
              texte: `Plusieurs évaluations correspondent : ${w.evaluationsAmbigues.map((x) => x.titre).join(', ')}. ` +
                'Réécris la commande avec le titre de l’évaluation et la matière.',
            })
            return
          }
          setQuestionEnAttente({ type: 'commande_ecriture', phrase: phraseAnalyse })
          ajouter({
            role: 'bot',
            texte: w.toutLeMonde && w.type === 'note'
              ? 'Précise la matière et le titre de l’évaluation. Par exemple : « devoir 1 en maths ».'
              : w.toutLeMonde
                ? 'Précise la matière. Par exemple : « mets tout le monde présent en maths ».'
                : 'Précise la matière. Par exemple : « mets 14/20 à Paul au devoir 1 en maths ».',
          })
          return
        }
        if (w.type === 'note') {
          if (!w.evaluation && w.evaluationsAmbigues.length > 0) {
            setQuestionEnAttente({ type: 'commande_ecriture', phrase: phraseAnalyse })
            ajouter({
              role: 'bot',
              texte: `Plusieurs évaluations correspondent : ${w.evaluationsAmbigues.map((x) => x.titre).join(', ')}. Précise laquelle.`,
            })
            return
          }
          if (!w.evaluation) {
            setQuestionEnAttente({ type: 'commande_ecriture', phrase: phraseAnalyse })
            ajouter({
              role: 'bot',
              texte: `Je ne trouve pas d’évaluation pour ${matiere.nom}. Précise son titre, par exemple « devoir 1 ».`,
            })
            return
          }
          if (w.valeur > Number(w.evaluation.note_max)) {
            ajouter({
              role: 'bot',
              texte: `La note ${w.valeur} dépasse le barème de ${w.evaluation.note_max} pour « ${w.evaluation.titre} ».`,
            })
            return
          }
          const cible = w.toutLeMonde
            ? `à toute la classe (${cibles.length} élèves)`
            : `à ${w.eleve.nom}`
          const resume = `enregistrer ${w.valeur}/${w.evaluation.note_max} ${cible} ` +
            `pour « ${w.evaluation.titre} » en ${matiere.nom}`
          setEnAttente({
            resume,
            action: {
              type: 'note',
              evaluation_id: w.evaluation.id,
              ...(w.toutLeMonde
                ? { eleve_ids: cibles.map((eleve) => eleve.id) }
                : { eleve_id: w.eleve.id }),
              valeur: w.valeur,
            },
          })
          ajouter({
            role: 'bot',
            texte: `Je vais ${resume}. Tu confirmes ?`,
            confirmation: true,
          })
          return
        }

        const cible = w.toutLeMonde
          ? `tous les élèves (${cibles.length})`
          : w.eleve.nom
        const resume = `${cible} ${w.toutLeMonde ? 'marqués' : 'marqué'} ${w.toutLeMonde ? LIBELLE_PLURIEL[w.statut] : LIBELLE[w.statut]} en ${matiere.nom}, le ${dateFrancaise(w.date)} (créneau ${w.creneau})`
        setEnAttente({
          resume,
          action: {
            type: 'presence',
            matiere_id: matiere.id,
            ...(w.toutLeMonde
              ? { eleve_ids: cibles.map((eleve) => eleve.id) }
              : { eleve_id: w.eleve.id }),
            date: w.date,
            creneau: w.creneau,
            statut: w.statut,
          },
        })
        ajouter({
          role: 'bot',
          texte: `Je vais enregistrer : ${resume}. Tu confirmes ?`,
          confirmation: true,
        })
        return
      }

      const a = analyser(phraseAnalyse, ctx)
      if (!a.intention) {
        ajouter({ role: 'bot', texte: texteInconnu(ctx), signalable: texte })
        return
      }
      if (a.intention === 'liste_absents') {
        if (!a.date) {
          setQuestionEnAttente({ type: 'date_absents', phrase: phraseAnalyse })
          ajouter({ role: 'bot', texte: repondre(a, {}, ctx) })
          return
        }
        setQuestionEnAttente(null)
        if (!ctx.matieres.length) {
          ajouter({ role: 'bot', texte: `Aucune matière n’est configurée dans cette classe.` })
          return
        }
        const { data: seances, error: erreurSeances } = await supabase.from('seances')
          .select('id, matiere_id')
          .eq('date', a.date)
          .in('matiere_id', ctx.matieres.map((matiere) => matiere.id))
        if (erreurSeances) throw erreurSeances
        let presences = []
        if (seances.length) {
          const { data, error } = await supabase.from('presences')
            .select('eleve_id, seance_id')
            .eq('statut', 'absent')
            .in('seance_id', seances.map((seance) => seance.id))
          if (error) throw error
          presences = data
        }
        ajouter({
          role: 'bot',
          texte: repondreAbsentsDate(a.date, presences, seances, ctx),
        })
        return
      }
      const b = besoins(a)
      const [rr, ra] = await Promise.all([
        b.resultats ? supabase.rpc('resultats_classe', { p_classe: classe.id }) : null,
        b.absences ? supabase.rpc('absences_classe', { p_classe: classe.id }) : null,
      ])
      if (rr?.error) throw rr.error
      if (ra?.error) throw ra.error
      ajouter({
        role: 'bot',
        texte: repondre(a, { resultats: rr?.data || [], absences: ra?.data || [] }, ctx),
      })
    } catch (err) {
      ajouter({ role: 'bot', texte: 'Une erreur est survenue : ' + (err?.message || 'réessaie.') })
    } finally {
      setOccupe(false)
    }
  }

  async function confirmer() {
    if (!enAttente || occupe) return
    const { action, resume } = enAttente
    setOccupe(true)
    try {
      const { data, error } = await supabase.rpc('chatbot_executer', { p_action: action })
      if (error) throw error
      setEnAttente(null)
      if (data.nombre > 1) {
        const detail = action.type === 'note'
          ? ` ${data.remplacements} note(s) précédente(s) remplacée(s).`
          : ''
        ajouter({
          role: 'bot',
          texte: `C’est fait : ${resume}.${detail} Tu peux annuler toute l’opération dans l’historique.`,
        })
        await chargerJournal()
        return
      }
      const avant = data.avant
        ? `ancienne valeur : ${action.type === 'note' ? data.avant : LIBELLE[data.avant]}`
        : action.type === 'note' ? 'aucune note enregistrée auparavant' : 'aucune présence enregistrée avant'
      ajouter({ role: 'bot', texte: `C’est fait : ${resume} (${avant}). Tu peux l’annuler dans l’historique.` })
      await chargerJournal()
    } catch (err) {
      ajouter({ role: 'bot', texte: 'Action refusée : ' + (err?.message || 'réessaie.') })
    } finally {
      setOccupe(false)
    }
  }

  async function annuler(id) {
    if (occupe) return
    setOccupe(true)
    setErreur('')
    setInfo('')
    try {
      const { error } = await supabase.rpc('chatbot_annuler', { p_journal: id })
      if (error) throw error
      setInfo('Action annulée.')
      await chargerJournal()
    } catch (err) {
      setErreur(err?.message || 'Impossible d’annuler cette action.')
    } finally {
      setOccupe(false)
    }
  }

  async function envoyerSignal(e) {
    e.preventDefault()
    const { error } = await supabase.rpc('signaler_phrase', { p_texte: signal.texte })
    if (error) { setErreur(error.message); return }
    setSignal(null)
    setErreur('')
    setInfo('Merci, la phrase a été transmise à l’administrateur.')
  }

  function decrire(j) {
    const d = j.details
    if (Array.isArray(d.eleves)) {
      const nombre = d.eleves.length
      if (j.action === 'note') {
        const evaluation = ctx.evaluations.find((x) => x.id === d.evaluation_id)
        const matiere = ctx.matieres.find((x) => x.id === evaluation?.matiere_id)?.nom ?? 'Matière'
        return `${nombre} élèves : note ${d.eleves[0]?.apres}/${evaluation?.note_max ?? '?'} — ${evaluation?.titre ?? 'Évaluation'} (${matiere})`
      }
      const matiere = ctx.matieres.find((x) => x.id === d.matiere_id)?.nom ?? 'Matière'
      return `${nombre} élèves : ${LIBELLE[d.eleves[0]?.apres]} — ${matiere}, ${dateFrancaise(d.date)}`
    }
    const eleve = ctx.eleves.find((x) => x.id === d.eleve_id)?.nom ?? 'Élève'
    if (j.action === 'note') {
      const evaluation = ctx.evaluations.find((x) => x.id === d.evaluation_id)
      const matiere = ctx.matieres.find((x) => x.id === evaluation?.matiere_id)?.nom ?? 'Matière'
      return `${eleve} : ${d.avant ?? 'aucune note'} → ${d.apres}, ${evaluation?.titre ?? 'Évaluation'} (${matiere})`
    }
    const matiere = ctx.matieres.find((x) => x.id === d.matiere_id)?.nom ?? 'Matière'
    return `${eleve} : ${d.avant ? LIBELLE[d.avant] : 'non renseigné'} → ${LIBELLE[d.apres]}, ${matiere}, ${dateFrancaise(d.date)}`
  }

  const recentes = ctx
    ? journal
      .filter((j) => !j.annule && (
        (j.action === 'presence' && ctx.matieres.some((m) => m.id === j.details?.matiere_id)) ||
        (j.action === 'note' && ctx.evaluations.some((e) => e.id === j.details?.evaluation_id))
      ))
      .slice(0, 5)
    : []

  const bloque = statut && ['desactive_global', 'desactive_compte', 'compte_non_valide'].includes(statut.etat)

  return (
    <section className="card">
      <div className="entete-ligne">
        <h2>Assistant</h2>
        {statut && statut.quota !== undefined && (
          <span className="muted">Messages aujourd’hui : {statut.utilises} / {statut.quota}</span>
        )}
      </div>
      <p className="muted">Il répond uniquement à partir des données de la classe « {classe.nom} ».</p>

      <div className="chat" ref={boite} role="log" aria-label="Conversation avec l’assistant"
        aria-live="polite" aria-relevant="additions">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role === 'moi' ? 'message-moi' : 'message-assistant'}`}>
            <span className="message-auteur">{m.role === 'moi' ? 'Toi' : 'Assistant'}</span>
            <div className={m.role === 'moi' ? 'bulle moi' : 'bulle bot'}>{m.texte}</div>
            {m.confirmation && enAttente && (
              <div className="message-actions">
                <button type="button" className="btn btn-primary" onClick={confirmer} disabled={occupe}>
                  {occupe ? 'Enregistrement...' : 'Confirmer'}
                </button>
                <button type="button" className="btn" disabled={occupe}
                  onClick={() => {
                    setEnAttente(null)
                    ajouter({ role: 'bot', texte: 'D’accord, rien n’a été modifié.' })
                  }}>
                  Ne pas modifier
                </button>
              </div>
            )}
            {m.signalable && (
              <div className="message-actions">
                <button type="button" className="link-btn"
                  onClick={() => setSignal({ texte: masquerNoms(m.signalable, ctx).slice(0, 200) })}>
                  Signaler cette phrase à l’administrateur
                </button>
              </div>
            )}
          </div>
        ))}
        {occupe && (
          <div className="message message-assistant" role="status">
            <span className="message-auteur">Assistant</span>
            <div className="bulle bot chat-patiente">
              {enAttente ? 'Enregistrement en cours…' : 'Je prépare ma réponse…'}
            </div>
          </div>
        )}
      </div>

      {signal && (
        <form onSubmit={envoyerSignal} className="form" style={{ maxWidth: 'none' }}>
          <p className="muted">Voici le texte qui sera transmis. Retire tout nom d’élève avant d’envoyer.</p>
          <textarea className="input" rows={2} maxLength={200} value={signal.texte}
            onChange={(e) => setSignal({ texte: e.target.value })} />
          <div className="row" style={{ marginTop: 0 }}>
            <button type="submit" className="btn btn-primary" disabled={signal.texte.trim().length < 3}>Envoyer</button>
            <button type="button" className="btn" onClick={() => setSignal(null)}>Annuler</button>
          </div>
        </form>
      )}

      {info && <p className="assistant-notice" role="status">{info}</p>}
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}

      <div className="assistant-composer">
        <p className="assistant-suggestions-titre">Suggestions</p>
        <div className="assistant-suggestions">
          {EXEMPLES.map((x) => (
            <button key={x} type="button" className="assistant-suggestion"
              disabled={!ctx || occupe || bloque} onClick={() => traiter(x)}>{x}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); traiter(saisie) }} className="assistant-form">
          <input className="input" value={saisie} maxLength={300}
            placeholder={bloque ? 'Assistant indisponible' : 'Écris ta question…'}
            aria-label="Message à envoyer à l’assistant"
            disabled={!ctx || bloque || Boolean(enAttente)} onChange={(e) => setSaisie(e.target.value)} />
          <button type="submit" className="btn btn-primary"
            disabled={!ctx || occupe || bloque || Boolean(enAttente) || !saisie.trim()}>Envoyer</button>
        </form>
      </div>

      {recentes.length > 0 && (
        <details className="assistant-historique">
          <summary>Dernières modifications ({recentes.length})</summary>
          {recentes.map((j) => (
            <div className="assistant-historique-ligne" key={j.id}>
              <span>{decrire(j)}</span>
              <button type="button" className="btn" disabled={occupe} onClick={() => annuler(j.id)}>Annuler</button>
            </div>
          ))}
        </details>
      )}
    </section>
  )
}