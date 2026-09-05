// Import relatif avec extension : ce module doit rester chargeable par
// `node --experimental-strip-types` pour sa vérification hors réseau.
import { enAttenteDeRaphael } from "./journalDestinataire.ts"
import type { DevLogEntry, EtatAction, OptionDecision } from "@/types/database"

export { enAttenteDeRaphael }

/**
 * « Ce qui attend ta décision » — les questions que les sessions posent, et où
 * Raphaël y répond.
 *
 * POURQUOI ÇA EXISTE. Jusqu'au 5 sept. 2026, une session qui avait besoin
 * d'un arbitrage publiait un ARTEFACT : une page hors du dépôt, hors de la
 * base, dont l'URL devait être recopiée dans le CLAUDE.md sous peine d'être
 * perdue pour la session suivante. Ses mots ce soir-là : « les artefacts ont
 * trop de durée de vie limitée et je te colle des réponses détaillées quand
 * c'était nécessaire. » Deux fiches lui ont posé LA MÊME question le même
 * soir, et il a répondu deux choses différentes.
 *
 * Sa règle générale le disait déjà : « la mémoire du projet vit en base, pas
 * dans la conversation ». Une question vit donc dans `dev_log`, où elle est
 * déjà lue par le hook de démarrage et affichée sur le chantier qu'elle
 * concerne. Ce module ne fait que trier et mettre en forme — aucun réseau,
 * aucun React. Vérifié par `scripts/verifier-decisions.ts`.
 *
 * DEUX FAMILLES, ET IL NE FAUT PAS LES CONFONDRE (sa demande, répétée depuis
 * la première fiche) :
 *   — une DÉCISION (`kind = 'question'`) : il choisit. On lui propose des
 *     options, on marque celle qu'on recommande, il peut écrire à côté.
 *   — une ACTION (`kind = 'action'`) : il fait quelque chose de son côté
 *     (créer une clé, la déposer, installer l'APK). Il ne choisit rien : il
 *     dit où il en est — fait, pas encore, ça bloque. « Ça bloque » est le
 *     seul des trois qui apprenne quelque chose, et c'est celui qui manquait.
 */

export const ETATS_ACTION: { valeur: EtatAction; libelle: string }[] = [
  { valeur: "fait", libelle: "Fait" },
  { valeur: "pas_encore", libelle: "Pas encore" },
  { valeur: "bloque", libelle: "Ça bloque" },
]

export function estEtatAction(valeur: unknown): valeur is EtatAction {
  return ETATS_ACTION.some((e) => e.valeur === valeur)
}

/**
 * Les options d'une question, lues défensivement.
 *
 * `options` est du jsonb écrit par une session, souvent en SQL à la main :
 * une clé manquante, un tableau à la place d'un objet, un `null` au milieu.
 * Rendre une liste vide plutôt que lever — une question sans options reste
 * une question à laquelle il peut répondre en écrivant, et c'est mieux qu'un
 * écran blanc.
 */
export function optionsDe(entry: DevLogEntry): OptionDecision[] {
  const brut = entry.options
  if (!Array.isArray(brut)) return []
  const vues = new Set<string>()
  const options: OptionDecision[] = []
  for (const o of brut) {
    if (!o || typeof o !== "object") continue
    const candidat = o as Record<string, unknown>
    const libelle = typeof candidat.libelle === "string" ? candidat.libelle.trim() : ""
    if (!libelle) continue
    const cle = typeof candidat.cle === "string" && candidat.cle.trim() ? candidat.cle.trim() : libelle
    // Deux options de même clé rendraient l'une des deux impossible à
    // désigner : la réponse enregistrée ne dirait plus laquelle il a choisie.
    if (vues.has(cle)) continue
    vues.add(cle)
    options.push({
      cle,
      libelle,
      aide: typeof candidat.aide === "string" ? candidat.aide : null,
      recommande: candidat.recommande === true,
    })
  }
  return options
}

/**
 * Ce qui l'attend, dans l'ordre où il doit le voir : les actions d'abord.
 *
 * Une action bloque tout le reste — tant que la clé n'est pas déposée, aucune
 * session ne peut avancer sur les douze chantiers qui en dépendent. Une
 * décision, elle, ne bloque qu'un chantier. Puis la plus ancienne d'abord :
 * c'est celle qui attend depuis le plus longtemps.
 */
export function questionsEnAttente(entries: DevLogEntry[]): DevLogEntry[] {
  return entries
    .filter(enAttenteDeRaphael)
    .sort(
      (a, b) =>
        (a.kind === "action" ? 0 : 1) - (b.kind === "action" ? 0 : 1) ||
        a.created_at.localeCompare(b.created_at),
    )
}

/**
 * Le corps de la réponse, tel qu'il s'écrit dans le journal.
 *
 * Ce texte est LA réponse : il part dans une entrée `kind = 'reponse'`
 * ordinaire, celle que le chantier affiche déjà dans sa conversation et que le
 * hook de démarrage injecte déjà. Rien à décoder côté session — ni jointure,
 * ni jsonb à relire : ses mots sont lisibles tels quels, des années après,
 * même si le code qui a posé la question a disparu.
 *
 * L'option choisie passe donc en toutes lettres, pas par sa clé : « oui »
 * n'apprend rien, « Sans limite » se comprend seul.
 */
export function corpsReponse(option: OptionDecision | null, commentaire: string): string {
  const morceaux: string[] = []
  if (option) morceaux.push(option.libelle)
  const mot = commentaire.trim()
  if (mot) morceaux.push(mot)
  return morceaux.join(" — ")
}

/** Vrai si on peut envoyer : une option choisie, ou des mots écrits. */
export function reponsePrete(option: OptionDecision | null, commentaire: string): boolean {
  return option !== null || commentaire.trim().length > 0
}

/**
 * La compression d'une photo avant envoi, décidée ici plutôt que dans le
 * composant : c'est la partie qui peut être fausse sans que rien ne le dise.
 *
 * Raphaël envoie des captures d'écran depuis la 4G. Une capture de téléphone
 * brute fait 2 à 4 Mo ; envoyée telle quelle, elle échoue en silence ou coûte
 * une minute d'attente. Mesuré sur les fiches du 4 sept. : côté maximal
 * 1400 px et qualité JPEG dégressive font tomber une image de 3000 × 2000 à
 * environ 130 Ko, et elle reste lisible.
 */
export const COTE_MAX_PHOTO = 1400
export const POIDS_MAX_PHOTO = 400 * 1024
export const QUALITES_PHOTO = [0.82, 0.7, 0.6, 0.5, 0.4]

/** La taille à donner à l'image, en gardant ses proportions. */
export function tailleReduite(
  largeur: number,
  hauteur: number,
  coteMax = COTE_MAX_PHOTO,
): { largeur: number; hauteur: number } {
  const cote = Math.max(largeur, hauteur)
  // Une image déjà petite n'est jamais AGRANDIE : on gagnerait du poids sans
  // gagner un pixel d'information.
  if (cote <= coteMax || cote === 0) {
    return { largeur: Math.round(largeur), hauteur: Math.round(hauteur) }
  }
  const facteur = coteMax / cote
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  }
}

/** Le nom du fichier dans le bucket : sous son dossier, sinon RLS refuse. */
export function cheminPhoto(userId: string, id: string): string {
  return `${userId}/reponses/${id}.jpg`
}
