/**
 * Le catalogue des sections de Paramètres — une seule fois, pas une copie
 * par consommateur.
 *
 * Jusqu'ici `SECTIONS` vivait uniquement dans `SettingsPage.tsx`, lue par la
 * recherche au clavier (chantier c4f9798c). Chantier `aac9a0dd` : Jarvis doit
 * pouvoir NAVIGUER vers une section depuis une commande comme « emmène-moi
 * dans les notifications ». Cette navigation vocale elle-même est hors du
 * périmètre de cette session (elle passe par
 * `supabase/functions/voice-command/**`, `src/lib/commandeLocale.ts` et
 * `MicButton.tsx`, propriété du thème « Le téléphone » — voir dev_log). Ce
 * qui est livré ici est l'autre moitié, côté application : une cible de
 * navigation RÉSOLUE (un mot ou une clé de section) doit pouvoir désigner
 * sans ambiguïté la section à ouvrir. En sortant le catalogue d'ici, la
 * future action vocale n'aura qu'à importer `resoudreCibleParametres` —
 * jamais une seconde liste de mots-clés qui finirait par diverger de celle
 * de la recherche.
 */
import { sansAccents } from "./dateOrale.ts"

export interface SectionParametres {
  cle: string
  titre: string
  resume?: string
  motsCles?: string
}

/** Vrai si la section répond à ce qu'on cherche. Sans accents ni casse :
 * « echeance » doit trouver « échéance ». */
export function sectionCorrespond(
  { titre, resume, motsCles }: Pick<SectionParametres, "titre" | "resume" | "motsCles">,
  filtre: string,
): boolean {
  const terme = sansAccents(filtre.trim()).toLowerCase()
  if (!terme) return true
  const foin = sansAccents(`${titre} ${resume ?? ""} ${motsCles ?? ""}`).toLowerCase()
  // Chaque mot tapé doit être présent : « voix jarvis » ne doit pas ramener
  // tout ce qui contient « jarvis ».
  return terme.split(/\s+/).every((mot) => foin.includes(mot))
}

/** Les sections de l'écran : leur titre, leur résumé, et ce qu'on peut taper
 * pour les retrouver. Déclarées ici et étalées dans le rendu (`{...SECTIONS.voix}`)
 * plutôt qu'écrites deux fois — sinon les mots-clés de la recherche et ceux
 * de la section auraient divergé au premier ajout, et la recherche aurait
 * compté des résultats qu'elle n'affiche pas. */
export const SECTIONS_PARAMETRES = {
  // EN PREMIER, et c'est une demande de Raphaël du 5 sept. 2026 : « pour la
  // mise à jour, il faut que je descende tout en bas, essaye de la rehausser ».
  // C'est la section qu'il ouvre le plus souvent, et c'était la septième.
  app: {
    cle: "app",
    titre: "L'application",
    resume: "Version, mise à jour, nouveautés",
    motsCles:
      "version build mise à jour apk installer télécharger réinstaller automatique nouveautés changements",
  },
  // Les autorisations Android, dites par ce qu'elles permettent. Haut de
  // page volontairement : c'est le premier écran d'un téléphone neuf, et le
  // seul recours quand une autorisation a été refusée une fois — Android ne
  // la redemande alors plus jamais tout seul.
  autorisations: {
    cle: "autorisations",
    titre: "Autorisations du téléphone",
    resume: "Ce que Jarvis a le droit de faire",
    motsCles:
      "autorisation permission accès micro enregistrement contacts répertoire numéro téléphone appel appeler notification position gps localisation arrière-plan installer mise à jour assistant appui long bouton refusée bloquée accorder android réglages système premier lancement",
  },
  voix: {
    cle: "voix",
    titre: "Voix et écoute",
    resume: "Sa voix, le rythme, le mot-clé de réveil",
    motsCles:
      "voix parler muet silence débit vitesse hauteur ton rythme pause silence enchaîner mot-clé réveil jarvis prononciation entendre travers accent langue mode live conversation continue essai moteur reconnaissance vocale android google automatique service",
  },
  taches: {
    cle: "taches",
    titre: "Tâches et organisation",
    resume: "Widget d'écran d'accueil, rappels de lieu",
    motsCles:
      "widget écran d'accueil nombre de tâches urgentes catégorie rappel de lieu géolocalisation position gps arriver sur place",
  },
  notifications: {
    cle: "notifications",
    titre: "Notifications",
    resume: "Ce que Jarvis a le droit de faire sonner",
    motsCles:
      "notification sonner déranger alerte rappel échéance heure d'une tâche avance point du matin briefing résumé nouvelle version chantier livré session bloquée alarme exacte permission tester silencieux apprentissage apprend appris priorités insistance ouvre ignore remettre à zéro",
  },
  apps: {
    cle: "apps",
    titre: "Ce que Jarvis utilise",
    resume: "Applications par défaut, appui long sur le bouton",
    motsCles:
      "application par défaut musique spotify itinéraire navigation waze maps canal des messages whatsapp sms question à une ia assistant numérique touche latérale bouton appui long perplexity bixby lancer jarvis rôle android bulle flottante pastille par-dessus superposition délai annuler arrêter avant d'agir mal entendu",
  },
  consommation: {
    cle: "consommation",
    titre: "Ce que Jarvis consomme",
    resume: "Phrases et jetons du jour, et la marge qu'il reste",
    motsCles:
      "consommation credit quota jetons tokens gemini plafond limite gratuit combien il reste phrases modele secours lenteur temps de reponse cout",
  },
  memoire: {
    cle: "memoire",
    titre: "Mémoire",
    resume: "Combien de temps il garde tes conversations",
    motsCles:
      "mémoire conversation mot-à-mot historique échanges garder conserver effacer purge durée 7 30 90 jours sans limite souvenirs oubli",
  },
  cockpit: {
    cle: "cockpit",
    titre: "Le cockpit",
    resume: "Ce qui compte comme « livré », les sessions qui travaillent sans toi, et le moteur de langue",
    motsCles:
      "cockpit chantier section où j'en suis livré aujourd'hui 24 heures 7 jours semaine bilan avancement bouge dort pour toi sessions autonomes automatique nuit absence routine déclencheur libre crédit",
  },
  apparence: {
    cle: "apparence",
    titre: "Apparence",
    resume: "Thème clair ou sombre, image du cœur",
    motsCles: "thème clair sombre nuit couleur affichage cœur réacteur image logo animation",
  },
  comptes: {
    cle: "comptes",
    titre: "Comptes et connexions",
    resume: "Google, déconnexion",
    motsCles: "compte google agenda calendrier gmail mail brancher connecter débrancher autorisation deconnexion déconnexion se déconnecter quitter session sortir",
  },
  // TOUT EN BAS, et c'est une demande de Raphaël (17 sept. 2026) : « ça nous
  // intéresse pas dans les paramètres, c'est vraiment tout en bas qu'il faut
  // le mettre ». Dernière section de la page, exprès.
  confidentialite: {
    cle: "confidentialite",
    titre: "Confidentialité",
    resume: "Remettre les réglages par défaut, lire la politique de confidentialité",
    motsCles:
      "confidentialité données vie privée politique réinitialiser réglages par défaut remettre à zéro suppression compte",
  },
} as const satisfies Record<string, SectionParametres>

export const LISTE_SECTIONS_PARAMETRES: readonly SectionParametres[] = Object.values(
  SECTIONS_PARAMETRES,
)

/**
 * Résout une cible de navigation (« notifications », ou une clé exacte comme
 * « app ») en la clé d'UNE section de Paramètres — ou `null` si rien ou PLUS
 * D'UNE section correspond.
 *
 * Extraire un mot-clé depuis une phrase complète (« emmène-moi dans les
 * notifications ») n'est PAS fait ici : c'est la même famille de travail que
 * `commandeLocale.ts` (isoler la commande du verbe qui l'introduit), hors du
 * périmètre de cette session. Cette fonction reçoit déjà une cible propre.
 *
 * Le silence sur l'ambiguïté est voulu, même famille que
 * `suggestionTheme.ts` : ouvrir la mauvaise section serait pire que ne rien
 * ouvrir — Raphaël devrait comprendre qu'il est au mauvais endroit avant de
 * pouvoir se corriger.
 */
export function resoudreCibleParametres(cible: string): string | null {
  const terme = cible.trim()
  if (!terme) return null

  const parCle = LISTE_SECTIONS_PARAMETRES.find((sec) => sec.cle === terme)
  if (parCle) return parCle.cle

  const correspondantes = LISTE_SECTIONS_PARAMETRES.filter((sec) =>
    sectionCorrespond(sec, terme),
  )
  return correspondantes.length === 1 ? correspondantes[0].cle : null
}
