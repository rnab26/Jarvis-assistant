/**
 * À QUOI Jarvis est réellement branché, chez CE Raphaël-là, à cet instant.
 *
 * Sa remarque du 6 sept. 2026 : « Jarvis ne connaît toujours pas son propre
 * environnement sur certains points. Par exemple quand je lui demande à quoi
 * il est branché. »
 *
 * `environnement.ts` décrit l'APPLICATION — ses onglets, ses cartes. C'est un
 * texte figé, le même à tout moment. Ici c'est l'ÉTAT de son installation :
 * son compte Google et ce qu'il autorise, les applications qu'il a choisies,
 * ce qu'il a activé. Tout se lit en base, parce que ses réglages y sont
 * recopiés (migration 0014) — rien à inventer, rien à demander à l'app.
 *
 * DEUX RÈGLES, et la seconde compte autant que la première :
 *
 * 1. COURT. Chaque phrase envoie déjà ~45 000 caractères au modèle, et
 *    l'offre gratuite se compte en jetons par minute. Ce bloc tient en
 *    quelques lignes, et il est ABSENT quand il n'y a rien à dire.
 * 2. CE QU'ON NE SAIT PAS, ON LE DIT. Les autorisations Android, le service
 *    d'accessibilité et la version installée vivent sur l'APPAREIL, pas en
 *    base : le serveur ne les voit pas. Jarvis doit répondre « je ne sais pas,
 *    regarde dans Paramètres » plutôt que d'inventer — c'est exactement le
 *    défaut qu'on vient de corriger ailleurs.
 */

export interface EtatBranchements {
  /** L'adresse du compte Google branché, ou null. */
  googleEmail: string | null
  /** Les portées réellement accordées, telles qu'elles sont en base. */
  googleScopes: string
  /** Les réglages recopiés en base, tels quels. */
  reglages: Record<string, unknown>
}

/** Les réglages qu'on sait nommer, et comment les dire à voix haute. */
const LISIBLES: { cle: string; dit: (v: string) => string }[] = [
  { cle: "jarvis_app_musique", dit: (v) => `musique : ${v}` },
  { cle: "jarvis_app_navigation", dit: (v) => `itinéraires : ${v}` },
  { cle: "jarvis_app_appels", dit: (v) => `appels : ${v}` },
  { cle: "jarvis_app_ia", dit: (v) => `questions à une autre IA : ${v}` },
  {
    cle: "jarvis_canal_messages",
    dit: (v) => `messages : ${v === "sms" ? "SMS" : "WhatsApp"}`,
  },
  {
    cle: "jarvis_app_whatsapp",
    dit: (v) => `WhatsApp visé : ${v === "com.whatsapp.w4b" ? "WhatsApp Business" : "WhatsApp"}`,
  },
]

/** Ce que dit une portée Google, en français. */
function portee(scopes: string): string[] {
  const dits: string[] = []
  if (scopes.includes("calendar")) dits.push("son agenda")
  if (scopes.includes("gmail")) dits.push("ses mails")
  return dits
}

/**
 * Le bloc à joindre à la consigne. Chaîne vide quand il n'y a rien à dire :
 * un titre suivi de rien coûte des jetons pour n'apprendre rien.
 */
export function consigneBranchements(etat: EtatBranchements): string {
  const lignes: string[] = []

  if (etat.googleEmail) {
    const acces = portee(etat.googleScopes)
    lignes.push(
      acces.length > 0
        ? `- Compte Google branché : ${etat.googleEmail}. Tu peux lire et écrire ${acces.join(" et ")}.`
        : `- Compte Google branché : ${etat.googleEmail}, mais sans autorisation utile — il doit le rebrancher depuis Paramètres › Comptes et connexions.`,
    )
  } else {
    lignes.push(
      "- Aucun compte Google branché : tu n'as accès NI à son agenda NI à ses mails. Dis-le et renvoie-le vers Paramètres › Comptes et connexions.",
    )
  }

  const choisies = LISIBLES.flatMap(({ cle, dit }) => {
    const v = etat.reglages[cle]
    return typeof v === "string" && v.trim() !== "" ? [dit(v.trim())] : []
  })
  lignes.push(
    choisies.length > 0
      ? `- Applications qu'il a choisies — ${choisies.join(" ; ")}.`
      : "- Il n'a encore choisi aucune application par défaut (musique, itinéraires, appels, messages).",
  )

  if (etat.reglages.jarvis_mode_live === "1") {
    lignes.push("- Le mode conversation Live est activé.")
  }

  return `À QUOI TU ES BRANCHÉ, chez lui, en ce moment — réponds avec ça quand il demande ce à quoi tu as accès :
${lignes.join("\n")}
CE QUE TU NE SAIS PAS D'ICI, et que tu ne dois donc pas affirmer : les autorisations Android accordées (micro, contacts, appels, position), si le service d'accessibilité est actif, et quelle version de l'application est installée. Ces trois-là vivent sur le téléphone, pas ici. S'il te les demande, dis que tu ne peux pas les voir et renvoie-le vers Paramètres › Autorisations du téléphone (ou › L'application pour la version).`
}

/** Ce que le serveur sait lire pour construire ce bloc. */
interface ClientLecture {
  from(table: string): {
    select(colonnes: string): {
      maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>
    }
  }
}

/**
 * Lit l'état en base et rend le bloc prêt à joindre à la consigne.
 *
 * Silencieux comme le reste des rappels : une lecture qui échoue rend une
 * chaîne vide plutôt que de faire échouer la phrase de Raphaël. La différence
 * avec les rappels de mémoire, c'est qu'ici l'absence n'est pas ambiguë — le
 * modèle a déjà pour consigne de ne rien affirmer qu'il ne sait pas.
 */
export async function rappelerBranchements(supabase: ClientLecture): Promise<string> {
  let googleEmail: string | null = null
  let googleScopes = ""
  let reglages: Record<string, unknown> = {}

  // LES DEUX EN PARALLÈLE. Mesuré le 6 sept. sur live-jeton (chantier
  // ba140853) : trois lectures Supabase à la suite (dont celle-ci comptait
  // pour deux) faisaient de ms_jeton le plus gros morceau d'une ouverture
  // Live. Ces deux lectures sont indépendantes ; rien ne justifie de les
  // enchaîner plutôt que de les lancer ensemble.
  const [compte, reglagesLus] = await Promise.all([
    supabase
      .from("google_accounts")
      .select("email, scopes")
      .maybeSingle()
      .catch(() => ({ data: null })),
    supabase
      .from("reglages")
      .select("valeurs")
      .maybeSingle()
      .catch(() => ({ data: null })),
  ])

  const dataCompte = compte?.data
  if (dataCompte) {
    googleEmail = typeof dataCompte.email === "string" ? dataCompte.email : null
    googleScopes = typeof dataCompte.scopes === "string" ? dataCompte.scopes : ""
  }
  const v = reglagesLus?.data?.valeurs
  if (v && typeof v === "object") reglages = v as Record<string, unknown>

  return `\n${consigneBranchements({ googleEmail, googleScopes, reglages })}`
}
