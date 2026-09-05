/**
 * Vérifie « Où j'en suis » — les quatre nombres par section du cockpit.
 *
 *   node --experimental-strip-types scripts/verifier-ou-jen-suis.ts
 *
 * Sans réseau, sans navigateur : `src/lib/ouJenSuis.ts` est pur exprès. Ce
 * qui se joue ici est ce qui peut être FAUX EN SILENCE — un chantier compté
 * comme « ça bouge » alors que la session qui l'avait pris s'est arrêtée il y
 * a trois jours, une question sans réponse qui n'apparaît nulle part, un
 * chantier livré cette nuit qui disparaît du compte à minuit une. Aucun de
 * ces cas ne lève d'erreur : ils se lisent, et on croit la réponse.
 *
 * Le parcours à l'écran, lui, est dans `scripts/verifier-cockpit-web.mjs`.
 */
import {
  debutFenetre,
  estFenetreBilan,
  FENETRES,
  ouJenSuis,
  type FenetreBilan,
} from "../src/lib/ouJenSuis.ts"
import type { DevItem, DevLogEntry, DevSection } from "../src/types/database.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = new Date("2026-09-05T14:00:00Z").getTime()
const iso = (msDepuisMaintenant: number) => new Date(MAINTENANT + msDepuisMaintenant).toISOString()
const H = 3600_000

let n = 0
function chantier(p: Partial<DevItem> = {}): DevItem {
  n++
  return {
    id: `c${n}`,
    user_id: "u",
    title: `Chantier ${n}`,
    notes: null,
    status: "todo",
    priority: "normal",
    theme: "Voix et écoute",
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: iso(-100 * H),
    updated_at: iso(-100 * H),
    ...p,
  }
}

function section(nom: string, position: number): DevSection {
  return {
    id: `s${position}`,
    user_id: "u",
    nom,
    description: null,
    position,
    created_at: iso(-1000 * H),
    updated_at: iso(-1000 * H),
  }
}

function message(p: Partial<DevLogEntry> = {}): DevLogEntry {
  n++
  return {
    id: `m${n}`,
    user_id: "u",
    item_id: null,
    author: "claude/une-session",
    kind: "question",
    body: "Une question",
    answered_at: null,
    created_at: iso(-2 * H),
    ...p,
  }
}

const SECTIONS = [section("Voix et écoute", 1), section("Le téléphone", 2)]
const bilanDe = (
  items: DevItem[],
  messages: DevLogEntry[] = [],
  fenetre: FenetreBilan = "aujourdhui",
) => ouJenSuis(items, SECTIONS, messages, fenetre, MAINTENANT)

// ─────────────────────────── Ce qui bouge ───────────────────────────
{
  const enCours = chantier({ claimed_by: "claude/voix", claim_expires_at: iso(45 * 60000) })
  const abandonne = chantier({ claimed_by: "claude/partie", claim_expires_at: iso(-3 * 24 * H) })
  const b = bilanDe([enCours, abandonne])
  const voix = b.sections.find((s) => s.nom === "Voix et écoute")!

  verifier("une réservation en cours compte comme « ça bouge »", voix.bouge.length === 1)
  verifier(
    "et le nom de la session est lisible, sans le « claude/ »",
    voix.bouge[0].session === "voix",
    voix.bouge[0].session,
  )
  verifier(
    "une réservation EXPIRÉE ne compte pas comme du travail en cours",
    voix.bouge.length === 1 && voix.abandonnees.length === 1,
    "un chantier que personne ne traite serait présenté comme avançant — le piège que la carte « Qui travaille » attrapait",
  )
  verifier(
    "un chantier dont la réservation a expiré n'est pas non plus compté comme endormi",
    voix.dort.length === 0,
    "il serait compté deux fois, et « libère-moi ça » ne se verrait plus",
  )
  verifier("le total des réservations abandonnées remonte", b.totaux.abandonnees === 1)
}

// ─────────────────────── Ce qui l'attend, LUI ───────────────────────
{
  const aCadrer = chantier({
    notes: "[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]\nIl faut trancher le coût.",
  })
  const pourLui = chantier({ notes: "[A FAIRE PAR RAPHAEL] Déposer la clé." })
  const avecQuestion = chantier()
  const dort = chantier({ notes: "[LIBRE] Spécifié de bout en bout." })
  const q = message({ item_id: avecQuestion.id })
  const b = bilanDe([aCadrer, pourLui, avecQuestion, dort], [q])
  const voix = b.sections.find((s) => s.nom === "Voix et écoute")!

  verifier(
    "« à cadrer » et « à faire par Raphaël » l'attendent, LUI",
    voix.attend.filter((a) => a.raison === "decision").length === 2,
    `${voix.attend.length} en attente`,
  )
  verifier(
    "une question de session sans réponse met aussi le chantier en attente de lui",
    voix.attend.some((a) => a.raison === "question" && a.item.id === avecQuestion.id),
    "c'est la seule chose qui bloque vraiment une session, et elle ne se voyait pas",
  )
  verifier(
    "et elle porte la question, pour pouvoir la lire sans chercher dans le journal",
    voix.attend.find((a) => a.raison === "question")?.question?.id === q.id,
  )
  verifier("un chantier « libre » et non réservé dort", voix.dort.length === 1)
  verifier(
    "un chantier qui l'attend n'est pas compté comme endormi",
    voix.dort.every((i) => i.id === dort.id),
    "les mêmes chantiers seraient comptés dans deux colonnes",
  )
}

{
  // Une question DÉJÀ répondue ne doit plus rien réclamer : sinon le compteur
  // « pour toi » ne redescend jamais et on cesse de le lire.
  const item = chantier()
  const b = bilanDe([item], [message({ item_id: item.id, answered_at: iso(-H) })])
  verifier(
    "une question déjà traitée ne l'attend plus",
    b.totaux.attend === 0,
    "un compteur qui ne redescend jamais n'est plus lu",
  )
  verifier("et le chantier repasse dans « ce qui dort »", b.totaux.dort === 1)
}

{
  // Deux questions sur le même chantier : c'est UN chantier qui attend, pas
  // deux. Et c'est la plus ancienne qu'on montre.
  const item = chantier()
  const vieille = message({ item_id: item.id, created_at: iso(-10 * H), body: "La première" })
  const recente = message({ item_id: item.id, created_at: iso(-1 * H), body: "La seconde" })
  const b = bilanDe([item], [recente, vieille])
  verifier("deux questions sur un chantier ne comptent qu'une attente", b.totaux.attend === 1)
  verifier(
    "et c'est la plus ancienne qui s'affiche : c'est elle qui attend depuis le plus longtemps",
    b.sections[0].attend[0].question?.body === "La première",
  )
}

{
  // Une ACTION de son côté l'attend autant qu'une question, et c'est la même
  // règle que l'écran où il répond : deux lectures différentes du même
  // message sont ce qui lui a fait répondre deux fois au même point.
  const item = chantier()
  const b = bilanDe([item], [message({ item_id: item.id, kind: "action" })])
  verifier(
    "une action qu'il doit faire compte comme « pour toi »",
    b.totaux.attend === 1,
    "elle n'apparaîtrait nulle part, alors qu'elle bloque tout ce qui en dépend",
  )

  // Une question qu'une session pose à une AUTRE session ne le concerne pas :
  // même convention que le badge du journal, « Pour la session … ».
  const entreSessions = bilanDe(
    [chantier()],
    [message({ body: "Pour la session cockpit : tu es toujours sur X ?" })],
  )
  verifier(
    "une question adressée à une autre session ne l'attend pas",
    entreSessions.totaux.attend === 0,
    "son écran se remplirait de conversations entre sessions",
  )
}

{
  // Une question du journal qui ne porte sur aucun chantier n'apparaîtrait
  // dans aucune ligne : sans le compteur à part, elle attendrait pour rien.
  const b = bilanDe([chantier()], [message({ item_id: null })])
  verifier("une question sans chantier est signalée à part", b.questionsGenerales.length === 1)
  verifier("et elle compte dans le total « pour toi »", b.totaux.attend === 1)

  const orpheline = bilanDe([chantier()], [message({ item_id: "chantier-supprime" })])
  verifier(
    "une question rattachée à un chantier disparu n'est pas perdue non plus",
    orpheline.questionsGenerales.length === 1,
    "elle ne s'afficherait nulle part : ni sur une ligne, ni dans le rappel",
  )
}

// ────────────────────── Ce qui a été livré ──────────────────────
{
  const cetteNuit = chantier({ status: "done", archived_at: iso(-15 * H) })
  const avantHier = chantier({ status: "done", archived_at: iso(-40 * H) })
  const laSemaine = chantier({ status: "done", archived_at: iso(-5 * 24 * H) })
  const vieux = chantier({ status: "done", archived_at: iso(-30 * 24 * H) })
  const items = [cetteNuit, avantHier, laSemaine, vieux]

  verifier(
    "« 24 h » compte ce qui a été livré cette nuit",
    bilanDe(items, [], "24h").totaux.livres === 1,
  )
  verifier("« 7 jours » va chercher plus loin", bilanDe(items, [], "7j").totaux.livres === 3)
  verifier(
    "un chantier archivé n'est jamais compté comme endormi, même hors fenêtre",
    bilanDe(items, [], "24h").totaux.dort === 0,
    "les archives referaient surface dans le travail restant",
  )

  // MAINTENANT est à 14 h UTC ; « aujourd'hui » se calcule sur l'heure locale
  // du téléphone, donc on ne peut pas figer le nombre attendu — mais on peut
  // exiger que la fenêtre soit plus étroite que 24 h glissantes, ce qui est
  // exactement ce que la valeur signifie.
  const minuit = debutFenetre("aujourdhui", MAINTENANT)
  verifier(
    "« aujourd'hui » part de minuit, et minuit est plus proche que 24 h en arrière",
    minuit > MAINTENANT - 24 * H && minuit <= MAINTENANT,
    `minuit calculé à ${new Date(minuit).toISOString()}`,
  )
  verifier(
    "et il s'agit bien de minuit LOCAL, pas de minuit à Greenwich",
    new Date(minuit).getHours() === 0 &&
      new Date(minuit).getMinutes() === 0 &&
      new Date(minuit).getSeconds() === 0,
    "un minuit calculé en UTC ferait basculer son compteur en plein travail",
  )
}

// ────────────────── Le rangement, et l'ordre de lecture ──────────────────
{
  const b = bilanDe([
    chantier({ theme: "Le téléphone", notes: "[LIBRE]" }),
    chantier({ theme: "Voix et écoute", notes: "[À CADRER AVEC RAPHAËL]" }),
  ])
  verifier(
    "la section où quelque chose l'attend passe devant celle qui dort",
    b.sections[0].nom === "Voix et écoute",
    b.sections.map((s) => s.nom).join(", "),
  )
  verifier(
    "et la section qui ne fait que dormir est mise à part, pas listée avec les autres",
    b.auRepos.length === 1 && b.auRepos[0].nom === "Le téléphone",
    `${b.auRepos.length} au repos`,
  )
}

{
  const b = bilanDe([chantier({ theme: null })])
  verifier(
    "un chantier sans section n'est pas perdu : il tombe dans « À classer »",
    b.auRepos.some((s) => s.nom === "À classer"),
    b.auRepos.map((s) => s.nom).join(", "),
  )
}

{
  // Une session écrit son thème directement en SQL, sans passer par l'app :
  // « L app elle-meme » et « L'app elle-même » sont le MÊME sujet.
  const b = bilanDe([
    chantier({ theme: "Voix et ecoute", notes: "[À CADRER]" }),
    chantier({ theme: "Voix et écoute", notes: "[À CADRER]" }),
  ])
  const voix = b.sections.filter((s) => /Voix et/.test(s.nom))
  verifier(
    "accents et casse ne fabriquent pas deux sections pour le même sujet",
    voix.length === 1 && voix[0].attend.length === 2,
    voix.map((s) => `${s.nom} (${s.attend.length})`).join(", "),
  )
}

{
  const b = bilanDe([])
  verifier(
    "sans le moindre chantier, le bloc n'a rien à dire et le sait",
    b.vide,
    "il afficherait un tableau de zéros à la place de la liste vide du cockpit",
  )
  const avecSectionVide = ouJenSuis(
    [chantier({ theme: "Voix et écoute", notes: "[À CADRER]" })],
    [...SECTIONS, section("Entraînement", 3)],
    [],
    "aujourdhui",
    MAINTENANT,
  )
  verifier(
    "une section déclarée mais encore vide n'est pas oubliée",
    !avecSectionVide.vide,
    "elle disparaîtrait, et on la recréerait en double",
  )
}

// ────────────────── Ce qui n'est ni endormi ni en attente ──────────────────
{
  const bloque = chantier({ notes: '[BLOQUÉ PAR : "Mémoire longue durée"]' })
  const reporte = chantier({ notes: "[REPORTÉ] Il y reviendra." })
  const doublon = chantier({ notes: "[DOUBLON — traité ailleurs]" })
  const fait = chantier({ status: "done" })
  const b = bilanDe([bloque, reporte, doublon, fait])
  verifier(
    "bloqué, reporté, doublon : ni endormi, ni en attente de lui",
    b.totaux.dort === 0 && b.totaux.attend === 0,
    `dort=${b.totaux.dort} attend=${b.totaux.attend} — « ce qui dort » doit vouloir dire « à prendre »`,
  )
  verifier(
    "un chantier terminé mais non archivé ne dort pas non plus",
    b.sections.length === 0 && b.auRepos.length === 0,
    "il n'y a plus rien à en faire",
  )
}

// ───────────────────────── Le réglage de la fenêtre ─────────────────────────
{
  verifier("les trois fenêtres proposées sont reconnues", FENETRES.every((f) => estFenetreBilan(f.valeur)))
  verifier(
    "une valeur inconnue est refusée : un réglage abîmé ne doit pas vider le compteur",
    !estFenetreBilan("un-mois") && !estFenetreBilan(null) && !estFenetreBilan(undefined),
  )
  verifier(
    "chaque fenêtre dit ce qu'elle change, pas seulement son nom",
    FENETRES.every((f) => f.aide.trim().length > 20),
    "un choix qu'on ne peut pas juger est fait au hasard",
  )
}

// ─────────────────────── Ce qui n'a pas de date lisible ───────────────────────
{
  const casse = chantier({ claimed_by: "claude/x", claim_expires_at: "pas une date" })
  const b = bilanDe([casse])
  verifier(
    "une date de réservation illisible ne fait pas passer le chantier pour pris",
    b.totaux.bouge === 0 && b.totaux.abandonnees === 0 && b.totaux.dort === 1,
    `bouge=${b.totaux.bouge} abandonnees=${b.totaux.abandonnees} dort=${b.totaux.dort}`,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
