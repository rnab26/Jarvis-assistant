// Mémoire longue durée de Jarvis.
//
// Isolé dans son propre module à dessein : plusieurs sessions Claude Code
// travaillent en parallèle sur index.ts, et la mémoire ne doit y ajouter que
// deux appels, pas quelques centaines de lignes.
//
// Ce qui est retenu : des faits courts (personnes, dossiers, engagements,
// préférences), jamais le texte des conversations. Le mot-à-mot vit 7 jours
// dans `echanges` puis disparaît — c'est le choix de Raphaël.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { appelerModele } from "../_shared/modele.ts"
import { signalerPanne } from "../_shared/pannes.ts"
import {
  type CandidatSouvenir,
  PROXIMITE_CANDIDATS,
  SEUILS_PAR_DEFAUT,
  type Seuils,
  cosinus,
  decider,
} from "./dedoublonnage.ts"

/**
 * LA MÉMOIRE N'UTILISE JAMAIS UN MODÈLE DE LA COMMANDE, et cette règle a été
 * payée cher — elle ne bouge pas.
 *
 * Les quotas de l'offre gratuite sont comptés par modèle. Chaque phrase de
 * Raphaël déclenche deux appels (comprendre, puis mémoriser) : sur le même
 * modèle, la mémoire consomme la moitié du quota de Jarvis. Le 3 sept. 2026 à
 * 21h28 le seau du JOUR était vide et Jarvis est resté muet, alors que la
 * mémoire n'est qu'un confort — elle retient des faits pour plus tard, et son
 * échec ne se voit pas dans l'instant.
 *
 * Le rôle « memoire » porte cette séparation : le fournisseur choisi lui donne
 * son propre modèle et ses propres secours (voir `_shared/gemini.ts`, qui garde
 * les mesures ayant fait choisir chacun). Un troisième appelant qui demanderait
 * le rôle « commande » ici referait exactement l'erreur du 3 sept.
 */

/** Modèle embarqué dans les Edge Functions Supabase : gratuit, sur place. */
const MODELE_EMBEDDING = "gte-small"

const MAX_SOUVENIRS_RAPPELES = 8
const MAX_FAITS_PAR_ECHANGE = 5

/**
 * Extraits de conversation remontés avec les souvenirs. Trois, et pas plus :
 * chaque phrase envoie déjà ~45 000 caractères à Gemini, et le mot-à-mot est
 * bien plus long qu'un fait. Trois suffisent à répondre « on avait parlé de
 * quoi pour la villa Dan ? ».
 */
const MAX_ECHANGES_RAPPELES = 3
/** Au-delà, on tronque : un extrait sert à se rappeler, pas à tout relire. */
const EXTRAIT_MAX = 300
/**
 * Échanges anciens ré-empreints à chaque phrase, pour rattraper le passé.
 * Dix, pas cinq : Raphaël avait 75 échanges sans empreinte au moment du
 * chantier, et à cinq par phrase le rattrapage aurait couru derrière la purge
 * à sept jours. Le calcul est local et gratuit, et il tourne en tâche de fond
 * après la réponse — il ne coûte rien à l'utilisateur.
 */
const RATTRAPAGE_PAR_PHRASE = 10

/** Souvenirs voisins descendus de la base avant d'en insérer un nouveau. */
const MAX_CANDIDATS_DOUBLON = 8

/**
 * Les deux seuils du dédoublonnage, réglables sans redéployer par les secrets
 * SOUVENIRS_SEUIL_PROXIMITE et SOUVENIRS_SEUIL_LEXICAL — c'est le seul chemin
 * de réglage ici : la mémoire tourne côté serveur, hors de portée de l'écran
 * Paramètres. Leurs valeurs par défaut sont mesurées sur les vraies données,
 * voir l'en-tête de dedoublonnage.ts.
 */
function seuilsDedoublonnage(): Seuils {
  const lire = (nom: string, defaut: number) => {
    const brut = Deno.env.get(nom)
    const valeur = brut ? Number(brut) : NaN
    return Number.isFinite(valeur) && valeur > 0 && valeur <= 1 ? valeur : defaut
  }
  return {
    proximite: lire("SOUVENIRS_SEUIL_PROXIMITE", SEUILS_PAR_DEFAUT.proximite),
    lexical: lire("SOUVENIRS_SEUIL_LEXICAL", SEUILS_PAR_DEFAUT.lexical),
  }
}

interface Souvenir {
  contenu: string
  categorie: string
}

/** Le runtime Supabase expose `Supabase.ai` ; absent en local, d'où le garde-fou. */
function sessionIA(): { run: (t: string, o: unknown) => Promise<number[]> } | null {
  const global = globalThis as unknown as {
    Supabase?: { ai?: { Session: new (m: string) => { run: (t: string, o: unknown) => Promise<number[]> } } }
  }
  if (!global.Supabase?.ai?.Session) return null
  return new global.Supabase.ai.Session(MODELE_EMBEDDING)
}

async function empreinte(texte: string): Promise<number[] | null> {
  const session = sessionIA()
  if (!session) return null
  try {
    const sortie = await session.run(texte, { mean_pool: true, normalize: true })
    return Array.isArray(sortie) ? sortie : null
  } catch {
    // Une empreinte manquante dégrade la recherche, elle ne casse rien.
    return null
  }
}

interface EchangePasse {
  transcript: string
  reponse: string | null
  created_at: string
}

function extrait(texte: string): string {
  const propre = texte.replace(/\s+/g, " ").trim()
  return propre.length > EXTRAIT_MAX ? `${propre.slice(0, EXTRAIT_MAX)}…` : propre
}

/** « le 3 septembre à 18:48 », dans le fuseau de Raphaël. */
function quand(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Asia/Jerusalem",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/**
 * Ce que Jarvis sait déjà, pour ce que l'utilisateur vient de dire : les FAITS
 * retenus, et le MOT-À-MOT des conversations récentes qui parlent du sujet.
 *
 * Les deux sont nécessaires et ne se remplacent pas. Un souvenir dit « le
 * matériau de la villa Dan est le grès cérame » ; il ne dit pas ce qui a été
 * dit ni quand. « On avait parlé de quoi pour la villa Dan ? » restait sans
 * réponse alors que la table `echanges` gardait tout — elle n'était jamais
 * relue (chantier caa54df2).
 *
 * Une seule empreinte sert aux deux recherches. Retourne une chaîne prête à
 * insérer dans le prompt, ou "" — jamais d'erreur : un problème de mémoire ne
 * doit pas empêcher Jarvis de répondre.
 */
export async function rappelerSouvenirs(
  supabase: SupabaseClient,
  transcript: string,
): Promise<string> {
  try {
    const vecteur = await empreinte(transcript)
    if (!vecteur) {
      // Sans empreinte, AUCUN rappel n'est possible — ni les faits, ni les
      // conversations. Jarvis répond comme s'il ne savait rien de Raphaël, et
      // rien ailleurs ne le dirait : le témoin de santé mesure les ÉCRITURES.
      await signalerPanne(
        supabase,
        "La mémoire n'a pas pu se relire : le modèle d'empreinte est indisponible",
        "Supabase.ai n'a rendu aucune empreinte pour la phrase en cours.",
        transcript.slice(0, 300),
      )
      return ""
    }
    const empreinteJson = JSON.stringify(vecteur)

    const [faits, echanges] = await Promise.all([
      supabase.rpc("chercher_souvenirs", {
        p_embedding: empreinteJson,
        p_limite: MAX_SOUVENIRS_RAPPELES,
      }),
      supabase.rpc("chercher_echanges", {
        p_embedding: empreinteJson,
        p_limite: MAX_ECHANGES_RAPPELES,
      }),
    ])

    let bloc = ""

    // Une recherche EN ÉCHEC rend exactement le même résultat qu'une recherche
    // qui n'a rien trouvé : la chaîne vide. Sans ces deux signalements, une
    // panne de lecture rendrait Jarvis amnésique en silence — « une panne qui
    // se lit comme une absence ».
    if (faits.error) {
      await signalerPanne(
        supabase,
        "La mémoire n'a pas pu relire ce qu'elle sait de Raphaël",
        faits.error,
        transcript.slice(0, 300),
      )
    }
    if (echanges.error) {
      await signalerPanne(
        supabase,
        "La mémoire n'a pas pu relire vos conversations passées",
        echanges.error,
        transcript.slice(0, 300),
      )
    }

    if (!faits.error && faits.data?.length) {
      const lignes = (faits.data as Souvenir[]).map((s) => `- (${s.categorie}) ${s.contenu}`)
      bloc += `\nCe que tu sais déjà de l'utilisateur, et qui semble en rapport avec ce qu'il vient de dire :\n${lignes.join("\n")}\nSers-t'en naturellement, sans annoncer que tu t'en souviens.`
    }

    if (!echanges.error && echanges.data?.length) {
      const lignes = (echanges.data as EchangePasse[]).map(
        (e) =>
          `- ${quand(e.created_at)}, il a dit : « ${extrait(e.transcript)} »` +
          (e.reponse ? `\n  tu avais répondu : « ${extrait(e.reponse)} »` : ""),
      )
      bloc += `\nCe que vous vous êtes dit récemment sur ce sujet (mot-à-mot, sept derniers jours seulement) :\n${lignes.join("\n")}\nS'il te demande de quoi vous aviez parlé, appuie-toi là-dessus et cite ce qui a été dit, avec la date. Si sa question porte sur quelque chose d'absent de ces extraits, dis simplement que tu ne le retrouves pas — n'invente aucune conversation.`
    }

    return bloc
  } catch (err) {
    await signalerPanne(supabase, "Le rappel de la mémoire a échoué", err, transcript.slice(0, 300))
    return ""
  }
}

const OUTIL_EXTRACTION = {
  name: "extraire_faits",
  description:
    "Extrait de l'échange les faits durables à retenir sur l'utilisateur. Zéro fait est une réponse normale et fréquente.",
  input_schema: {
    type: "object" as const,
    properties: {
      faits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            contenu: {
              type: "string",
              description:
                "Le fait, en une phrase courte et autonome, compréhensible dans six mois sans le contexte de l'échange.",
            },
            categorie: {
              type: "string",
              enum: ["personne", "dossier", "engagement", "preference", "fait"],
            },
          },
          required: ["contenu", "categorie"],
        },
      },
    },
    required: ["faits"],
  },
}

const CONSIGNE_EXTRACTION = `Tu tries ce qui mérite d'être retenu d'un échange entre Raphaël et son assistant.

RETIENS : les personnes de son entourage (qui elles sont, leur lien avec lui), les dossiers et projets (état, montants, échéances), les engagements qu'il prend, ses préférences et sa façon de travailler, et les faits durables sur lui.

NE RETIENS PAS :
- Les salutations, le bavardage, les questions de culture générale et leurs réponses.
- Ce qui n'aura plus de sens dans une semaine.
- Une demande de créer une tâche, un chantier, un document ou un rappel. C'est DÉJÀ enregistré ailleurs, en dupliquer le contenu ici est une erreur. N'en tire un souvenir que si la phrase révèle en plus quelque chose de durable sur Raphaël — une préférence, une contrainte, une façon de travailler — et alors retiens cela seulement, pas la demande.
- Un bug ou un problème technique de l'application : il devient un chantier, pas un souvenir.

JARVIS, C'EST TOI. Jarvis (ou Claude) est l'assistant, jamais une personne de l'entourage de Raphaël. Ne crée jamais de souvenir qui le décrive comme quelqu'un qu'il connaît, et ne retiens rien sur le fonctionnement de l'assistant lui-même.

UN SEUL SOUVENIR PAR IDÉE. Ne découpe pas la même information en deux ou trois faits qui se répètent sous des angles différents : garde le plus utile et jette les autres.

MÉFIE-TOI DE LA TRANSCRIPTION. Ces phrases viennent d'une dictée vocale : un nom propre inconnu et improbable est souvent une erreur de reconnaissance. Dans le doute, n'en fais pas un fait.

Chaque fait tient en une phrase courte et se suffit à lui-même. Zéro fait est une réponse normale et fréquente : la plupart des échanges n'ont rien à retenir. N'invente jamais, ne déduis pas au-delà de ce qui a été dit.`

/**
 * Dit au registre des erreurs que la mémoire a lâché.
 *
 * POURQUOI. La mémorisation est silencieuse par construction — choix de
 * Raphaël, elle ne doit jamais le déranger — et elle avale ses erreurs. Le
 * 4 sept. 2026, le modèle de la mémoire s'est révélé plafonné à vingt
 * requêtes par jour : passé vingt phrases, plus rien n'était retenu, et
 * personne ne l'a vu pendant des heures. Silencieuse ne doit pas vouloir dire
 * invisible : elle ne dérange pas, mais elle laisse une trace là où Raphaël
 * peut aller la lire (le registre des erreurs du cockpit, migration 0019).
 *
 * Ne lève jamais, n'attend rien de l'appelant : un registre d'erreurs qui
 * ferait échouer ce qu'il observe serait la pire des ironies.
 */
async function signalerPanneMemoire(
  supabase: SupabaseClient,
  titre: string,
  erreur: unknown,
  transcript: string,
): Promise<void> {
  await signalerPanne(
    supabase,
    titre,
    erreur,
    `Phrase en cours de mémorisation : « ${transcript.slice(0, 300)} »`,
  )
}

/**
 * Range l'échange : garde le mot-à-mot 7 jours, en extrait les faits durables.
 *
 * Silencieux par construction (choix de Raphaël) : rien n'est annoncé à
 * l'utilisateur, la page « Ce que Jarvis sait de moi » lui sert de contrôle.
 */
export async function memoriser(
  supabase: SupabaseClient,
  userId: string,
  transcript: string,
  reponse: string | null,
  /** Vrai quand l'appel vient de nos vérifications : voir `AppelModele.essai`. */
  essai = false,
): Promise<void> {
  try {
    // L'empreinte est calculée ICI, à l'écriture : c'est elle qui rend
    // l'échange retrouvable plus tard par le sens (chantier caa54df2). Elle
    // est facultative — si Supabase.ai n'est pas là, l'échange est quand même
    // gardé, il ne sera simplement pas cherchable.
    const empreinteEchange = await empreinte(transcript)
    await supabase.from("echanges").insert({
      user_id: userId,
      transcript,
      reponse,
      embedding: empreinteEchange ? JSON.stringify(empreinteEchange) : null,
    })
    // Purge paresseuse : pas de tâche planifiée à maintenir.
    await supabase.rpc("purger_echanges")
    // Même esprit pour le passé : quelques échanges antérieurs à ce chantier
    // reçoivent leur empreinte à chaque phrase, plutôt qu'un script à lancer
    // à la main. Gratuit (modèle local) et borné.
    await rattraperEmpreintes(supabase)

    const { args } = await appelerModele({
      role: "memoire",
      systeme: CONSIGNE_EXTRACTION,
      texte: `Raphaël a dit : « ${transcript} »\n${reponse ? `Jarvis a répondu : « ${reponse} »` : ""}`,
      outil: OUTIL_EXTRACTION,
      maxTokens: 512,
      essai,
      journal: { supabase, userId },
    })

    const faits: Souvenir[] = (args?.faits as Souvenir[] | undefined) ?? []
    if (!faits.length) return

    await ranger(supabase, userId, faits.slice(0, MAX_FAITS_PAR_ECHANGE), transcript)
  } catch (err) {
    // Un échec de mémorisation ne doit jamais remonter à l'utilisateur : sa
    // commande a déjà été exécutée et sa réponse déjà donnée. Mais il ne doit
    // plus disparaître pour autant — il part dans le registre des erreurs.
    console.log(`mémoire : échec — ${err}`)
    await signalerPanneMemoire(
      supabase,
      "La mémoire n'a rien pu retenir de cet échange",
      err,
      transcript,
    )
  }
}

/** Les souvenirs déjà en base assez proches pour être le même fait. */
async function candidatsDoublon(
  supabase: SupabaseClient,
  vecteur: number[] | null,
  seuils: Seuils,
): Promise<CandidatSouvenir[]> {
  if (!vecteur) return []
  try {
    const { data, error } = await supabase.rpc("chercher_souvenirs", {
      p_embedding: JSON.stringify(vecteur),
      p_limite: MAX_CANDIDATS_DOUBLON,
      // Volontairement plus bas que le seuil de décision : baisser le seuil par
      // secret doit suffire, sans avoir à redéployer pour élargir la pêche.
      p_seuil: Math.min(PROXIMITE_CANDIDATS, seuils.proximite) - 0.01,
    })
    if (error || !data?.length) return []
    return data as CandidatSouvenir[]
  } catch {
    // Pas de candidat = on insère, comme avant ce chantier. Jamais d'erreur.
    return []
  }
}

/**
 * Range les faits d'un échange, un par un, au lieu de les empiler.
 *
 * Trois issues par fait, et une seule ligne écrite dans chaque cas :
 *   - il redit un souvenir connu    → ce souvenir est enrichi (jamais effacé) ;
 *   - il met à jour un chiffre      → l'ancien est périmé, le nouveau inséré ;
 *   - il est neuf                   → il est inséré.
 *
 * Rien n'est jamais supprimé ici : un souvenir périmé reste lisible et
 * réactivable depuis l'onglet Mémoire, qui est le seul contrôle de Raphaël sur
 * une mémorisation silencieuse.
 */
async function ranger(
  supabase: SupabaseClient,
  userId: string,
  faits: Souvenir[],
  transcript: string,
): Promise<void> {
  const seuils = seuilsDedoublonnage()
  const source = transcript.slice(0, 500)
  const maintenant = new Date().toISOString()

  // Les faits déjà acceptés pendant CET échange comptent aussi comme
  // candidats : le modèle redit parfois la même idée sous deux angles, et une
  // insertion groupée ne se voit pas elle-même.
  const enAttente: { contenu: string; vecteur: number[] | null; ligne: Record<string, unknown> }[] = []
  const journal: string[] = []

  for (const fait of faits) {
    const contenu = fait?.contenu?.trim()
    if (!contenu) continue
    const categorie = fait.categorie ?? "fait"
    const vecteur = await empreinte(contenu)

    const candidats = await candidatsDoublon(supabase, vecteur, seuils)
    if (vecteur) {
      enAttente.forEach((precedent, index) => {
        if (!precedent.vecteur) return
        candidats.push({
          id: `echange:${index}`,
          contenu: precedent.contenu,
          proximite: cosinus(vecteur, precedent.vecteur),
        })
      })
    }

    const decision = decider(contenu, candidats, seuils)
    const dansCetEchange = decision.type !== "nouveau" && decision.id.startsWith("echange:")

    // Doublon né dans cet échange : la ligne n'existe pas encore en base, on
    // corrige celle qui attend au lieu d'en ajouter une deuxième.
    if (dansCetEchange) {
      const index = Number(decision.id.slice("echange:".length))
      const precedent = enAttente[index]
      if (decision.type === "fusion" && precedent && decision.garderNouvelleFormulation) {
        precedent.contenu = contenu
        precedent.vecteur = vecteur
        precedent.ligne.contenu = contenu
        precedent.ligne.categorie = categorie
        precedent.ligne.embedding = vecteur ? JSON.stringify(vecteur) : null
      }
      journal.push(`répété dans l'échange (${decision.proximite.toFixed(3)})`)
      continue
    }

    if (decision.type === "fusion") {
      // `fusionne_at` est la trace que la MÉMOIRE a travaillé — `updated_at`
      // bouge aussi quand Raphaël corrige un souvenir à la main, et ne peut
      // donc pas servir de témoin (sante_memoire, migration 0020).
      const modification: Record<string, unknown> = { updated_at: maintenant, fusionne_at: maintenant }
      if (decision.garderNouvelleFormulation) {
        modification.contenu = contenu
        modification.categorie = categorie
        modification.source = source
        modification.embedding = vecteur ? JSON.stringify(vecteur) : null
      }
      const { error } = await supabase.from("souvenirs").update(modification).eq("id", decision.id)
      journal.push(
        error
          ? `fusion impossible (${error.message})`
          : `fusionné avec un souvenir existant (${decision.proximite.toFixed(3)}${
              decision.garderNouvelleFormulation ? ", formulation remplacée" : ""
            })`,
      )
      continue
    }

    if (decision.type === "remplacement") {
      const { error } = await supabase
        .from("souvenirs")
        .update({ perime_at: maintenant, updated_at: maintenant })
        .eq("id", decision.id)
      journal.push(
        error ? `péremption impossible (${error.message})` : `met à jour un souvenir, l'ancien est périmé`,
      )
    }

    const ligne: Record<string, unknown> = {
      user_id: userId,
      contenu,
      categorie,
      source,
      embedding: vecteur ? JSON.stringify(vecteur) : null,
    }
    enAttente.push({ contenu, vecteur, ligne })
    if (decision.type === "nouveau") journal.push("nouveau")
  }

  if (enAttente.length) {
    const { error } = await supabase.from("souvenirs").insert(enAttente.map((e) => e.ligne))
    if (error) journal.push(`insertion impossible (${error.message})`)
  }
  if (journal.length) console.log(`mémoire : ${journal.join(" | ")}`)

  // Une écriture refusée ne lève pas ici (le client Supabase rend l'erreur au
  // lieu de la jeter) : sans ce relevé, elle ne serait ni vue ni signalée.
  const rates = journal.filter((l) => l.includes("impossible"))
  if (rates.length) {
    await signalerPanneMemoire(
      supabase,
      "La mémoire n'a pas pu écrire en base",
      rates.join(" | "),
      transcript,
    )
  }
}

/**
 * Donne son empreinte à une poignée d'échanges qui n'en ont pas.
 *
 * Les échanges écrits avant le chantier caa54df2 sont invisibles à la
 * recherche par le sens. Plutôt qu'un script à lancer une fois (et à ne pas
 * oublier), le rattrapage se fait tout seul, quelques lignes par phrase :
 * l'empreinte se calcule dans l'Edge Function, gratuitement et sur place, et
 * la table est petite par construction (sept jours glissants).
 *
 * Silencieux comme le reste de la mémoire : un échec ne remonte jamais.
 */
async function rattraperEmpreintes(supabase: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("echanges_a_empreindre", {
      p_limite: RATTRAPAGE_PAR_PHRASE,
    })
    if (error || !data?.length) return
    for (const ligne of data as { id: string; transcript: string }[]) {
      const vecteur = await empreinte(ligne.transcript)
      if (!vecteur) return // Supabase.ai indisponible : inutile d'insister.
      // `.select("id")` n'est pas décoratif : RLS ne refuse pas bruyamment un
      // UPDATE, il RESTREINT les lignes visibles. Sans politique UPDATE sur
      // `echanges`, cette écriture touchait ZÉRO ligne et rendait un succès —
      // le rattrapage n'a rien fait pendant deux jours sans que rien ne le
      // dise (corrigé par la migration 0021). On lit donc ce qui a vraiment
      // été écrit, et on le signale si c'est vide.
      const { data: ecrits, error: erreurEcriture } = await supabase
        .from("echanges")
        .update({ embedding: JSON.stringify(vecteur) })
        .eq("id", ligne.id)
        .select("id")
      if (erreurEcriture || !ecrits?.length) {
        await signalerPanne(
          supabase,
          "La mémoire n'a pas pu rendre cherchable un échange passé",
          erreurEcriture ??
            "L'écriture n'a touché aucune ligne : politique RLS manquante sur echanges, ou ligne disparue.",
          ligne.transcript.slice(0, 300),
        )
        return // Inutile d'insister sur les neuf suivants : c'est la même cause.
      }
    }
  } catch {
    // Le rattrapage est un confort : il ne doit jamais gêner la mémorisation.
  }
}
