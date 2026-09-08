/**
 * La relecture vocale AVANT l'ouverture de WhatsApp — chantier ed32cbcc.
 *
 * D'OÙ ÇA VIENT. Raphaël a changé sa propre décision le 5 sept. 2026 vers
 * 21h20 UTC : « il faut que ce soit réglable en option : une fois qu'il y a
 * le message, que je le relise, et que si je dis oui c'est bon envoie, ça
 * l'envoie ». Il a accepté le coût — le service d'accessibilité peut cliquer
 * partout — en connaissance de cause.
 *
 * CE QUE ÇA REMPLACE, ET CE QUE ÇA NE REMPLACE PAS. Sans le réglage actif
 * (décoché par défaut), rien ne change : le message se prépare, s'affiche
 * dans WhatsApp, et Jarvis attend un « envoie » — géré par
 * confirmationEnvoi.ts, APRÈS ouverture. Ici, la relecture a lieu AVANT :
 * Jarvis dit le destinataire ET le texte, sans jamais ouvrir WhatsApp tant
 * qu'il n'a pas entendu une confirmation.
 *
 * Pur : aucun appel à Android, au serveur ni à React — vérifiable sans
 * téléphone (scripts/verifier-envoi-auto.ts).
 */

export const CLE_ENVOI_AUTO = "jarvis_envoi_auto_messages"

/** Décoché par défaut : on n'active pas tout seul un envoi qui saute la
 * relecture à l'écran. Seul "1" l'active — une valeur absente ou invalide
 * garde l'ancien comportement. */
export function envoiAutoVoulu(brut: string | null): boolean {
  return brut === "1"
}

export function envoiAutoActif(): boolean {
  try {
    return envoiAutoVoulu(localStorage.getItem(CLE_ENVOI_AUTO))
  } catch {
    return false
  }
}

/** Le temps laissé à WhatsApp pour s'ouvrir et afficher son écran de
 * rédaction avant qu'on tente le clic sur Envoyer. Pas vérifiable sans
 * appareil — une valeur trop courte ferait échouer le clic (écran pas encore
 * affiché), une valeur trop longue se sentirait juste comme une lenteur. */
export const DELAI_OUVERTURE_MS = 1200

/**
 * Ce que Jarvis dit AVANT d'ouvrir l'application — le destinataire ET le
 * texte, mot pour mot : c'est la relecture elle-même, celle qui remplace le
 * coup d'œil à l'écran qu'il ne fera plus.
 */
export function phraseRelecture(cible: string | null, texte: string): string {
  const pour = cible ? ` à ${cible}` : ""
  return `Je m'apprête à envoyer${pour} sur WhatsApp : « ${texte} ». Je l'envoie ?`
}

/** Un ensemble volontairement petit : un faux négatif redemande simplement
 * (traité comme une correction), un faux positif appuierait sur Envoyer à sa
 * place. Préfixé, comme confirmationEnvoi.ts : « oui, vas-y » doit marcher. */
const MOTIFS_OUI = [/^oui\b/i, /^vas-?\s*y\b/i, /^envoie(-le)?\b/i, /^c'est bon\b/i, /^confirme\b/i]

/** Ici EXACT, pas préfixé — à la différence de OUI. Un « non » suivi d'une
 * vraie correction (« non, écris plutôt que... ») ne doit PAS être avalé par
 * la négation : il doit rester lisible comme une correction, sans perdre ce
 * qu'il vient de dire. Seul un « non » qui s'arrête là est une annulation. */
const REPONSES_NON = new Set(["non", "annule", "annules", "stop", "laisse tomber", "arrete", "arrête"])

export function estReponseOui(reponse: string): boolean {
  const texte = reponse.trim()
  return texte.length > 0 && MOTIFS_OUI.some((re) => re.test(texte))
}

export function estReponseNon(reponse: string): boolean {
  const texte = reponse
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "")
  return texte.length === 0 || REPONSES_NON.has(texte)
}
