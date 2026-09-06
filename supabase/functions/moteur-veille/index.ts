// La passe qui essaie les nouveaux modèles et décide s'il faut en changer.
//
// Chantier 66a7a233. Elle est déclenchée PARESSEUSEMENT, après une phrase de
// Raphaël, quand la précédente date de plus d'un jour — le même motif que
// `purger_echanges`, et pour la même raison : il n'y a ni pg_cron ni pg_net sur
// ce projet, et les installer donnerait à sa base la capacité d'appeler
// l'extérieur, ce qui est un choix de sécurité et pas un détail
// d'implémentation. Elle peut aussi être appelée à la main, pour la voir
// travailler.
//
// TROIS RÈGLES QUI COMMANDENT TOUT LE RESTE :
//
// 1. ON N'UTILISE QUE LA CLÉ DE TEST (`GEMINI_API_KEY_TEST`). Essayer des
//    modèles consomme du quota, et le quota de Raphaël est ce qui lui permet de
//    parler à Jarvis. Le 3 sept. à 21h28 il s'est retrouvé sans assistant parce
//    que nos vérifications avaient vidé son seau du jour. Sans clé de test, la
//    passe s'arrête et le dit — elle ne se rabat JAMAIS sur la sienne.
// 2. ON N'ESSAIE QU'UN CANDIDAT PAR PASSE. La passe tourne tous les jours, il
//    sort rarement plusieurs modèles à la fois, et une invocation courte est
//    une invocation qui va au bout.
// 3. LA DÉCISION N'EST PAS PRISE ICI. Elle est dans `_shared/veilleModele.ts`,
//    pur et vérifié hors ligne — parce qu'un mécanisme qui change le cerveau de
//    Jarvis tout seul, la nuit, ne peut pas reposer sur du code qu'on n'a
//    jamais fait tourner autrement qu'en production.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { gemini } from "../_shared/gemini.ts"
import { seauDuRefus, type Echec } from "../_shared/modele.ts"
import { CONSIGNE_CONTROLE, CONTROLES, OUTIL_CONTROLE, controleReussi } from "../_shared/controlesModele.ts"
import { type Essai, type EtatVeille, decider, doitVeiller } from "../_shared/veilleModele.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const HOTE = "https://generativelanguage.googleapis.com/v1beta"

/**
 * Ce qu'on refuse d'essayer, par la forme du nom.
 *
 * Ce filtre ne remplace PAS l'essai réel — c'est l'essai qui décide. Il évite
 * seulement de dépenser du quota sur des modèles qui ne peuvent pas tenir ce
 * rôle : générateurs d'images, synthèse et transcription vocales, robotique,
 * musique, recherche longue, usage de l'ordinateur. Et les « pro », qui sont
 * lents là où la commande vocale a besoin de moins d'une seconde.
 */
const HORS_SUJET = /image|tts|transcribe|embedding|robotics|lyria|nano-banana|deep-research|computer-use|antigravity|-pro|gemma/i

/** Un principal doit être rapide : on ne regarde que les familles rapides. */
const FAMILLES_RAPIDES = /flash|lite/i

/** Une pause entre deux contrôles, pour ne pas confondre « mauvais » et « trop vite ». */
const PAUSE_ENTRE_CONTROLES_MS = 1500

async function modelesAnnonces(cle: string): Promise<string[]> {
  const r = await fetch(`${HOTE}/models`, { headers: { "x-goog-api-key": cle } })
  if (!r.ok) return []
  const d = await r.json()
  return (d.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes("generateContent"))
    .map((m: { name: string }) => m.name.replace("models/", ""))
}

/**
 * Essaie un modèle pour de vrai, sur nos propres phrases.
 *
 * On passe par `gemini.unEssai`, c'est-à-dire EXACTEMENT le code qui sert
 * Jarvis : même requête, même lecture de la réponse, même lecture du quota. Un
 * banc d'essai qui parlerait à l'API autrement mesurerait autre chose que ce
 * qu'on met en service.
 */
async function essayer(modele: string, cle: string): Promise<Essai> {
  let repond = false
  let appelleOutil = false
  let reussis = 0
  let plafondJour: number | null = null
  let plafondMinute: number | null = null
  const latences: number[] = []
  const ratés: string[] = []

  for (const controle of CONTROLES) {
    const debut = Date.now()
    const r = await gemini.unEssai({
      role: "commande",
      modele,
      cle,
      systeme: CONSIGNE_CONTROLE,
      texte: controle.phrase,
      outil: OUTIL_CONTROLE,
      maxTokens: 1024,
    })

    if (r.echec) {
      const seau = seauDuRefus({ ...r.echec, passager: false } as Echec)
      const limite = Number(r.echec.quota?.limite)
      if (seau === "jour" && Number.isFinite(limite)) plafondJour = limite
      if (seau === "minute" && Number.isFinite(limite)) plafondMinute = limite
      ratés.push(`${controle.phrase} → ${r.echec.statut}`)
      continue
    }

    repond = true
    latences.push(Date.now() - debut)
    if (r.args) appelleOutil = true
    if (controleReussi(controle, r.args)) reussis++
    else ratés.push(`${controle.phrase} → ${JSON.stringify(r.args).slice(0, 80)}`)

    await new Promise((r) => setTimeout(r, PAUSE_ENTRE_CONTROLES_MS))
  }

  latences.sort((a, b) => a - b)
  return {
    modele,
    // La date est posée par la base (fuseau de Raphaël) ; ce champ n'est lu
    // qu'après relecture, il n'a pas besoin d'être juste ici.
    jour: "",
    repond,
    appelle_outil: appelleOutil,
    controles_reussis: reussis,
    controles_total: CONTROLES.length,
    ms_median: latences.length ? latences[Math.floor(latences.length / 2)] : null,
    plafond_jour: plafondJour,
    plafond_minute: plafondMinute,
    // Ce qui a raté, en clair : sans ça, « 4 sur 6 » ne dit pas quoi regarder.
    ...(ratés.length ? { detail: ratés.join(" | ") } : {}),
  } as Essai & { detail?: string }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  // Les écritures passent par la clé de service : les tables de la veille sont
  // en lecture seule pour l'utilisateur, ce qui est voulu — c'est un journal,
  // pas quelque chose qu'on modifie depuis le téléphone.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  let passe: string | null = null
  const fermer = async (verdict: string, detail: string) => {
    if (passe) {
      await admin.from("veilles_modele").update({ verdict, detail, fini_at: new Date().toISOString() }).eq("id", passe)
    } else {
      await admin.from("veilles_modele").insert({ verdict, detail, fini_at: new Date().toISOString() })
    }
    return json({ verdict, detail })
  }

  try {
    const { data: etatBrut } = await admin.rpc("etat_veille_modele")
    const etat = etatBrut as EtatVeille
    const maintenant = new Date()

    const quand = doitVeiller(etat, maintenant)
    if (quand !== "veille") {
      // Une passe qui ne fait rien s'enregistre AUSSI. Sans ça, « il n'y avait
      // rien de neuf cette nuit » et « la veille ne tourne plus depuis trois
      // jours » se ressemblent parfaitement.
      const dit: Record<string, string> = {
        gelee: "Le moteur est gelé depuis Paramètres : Raphaël a demandé qu'on n'y touche pas.",
        occupee: "Une autre passe est déjà en cours.",
        trop_tot: "La dernière passe date de moins d'un jour.",
      }
      return await fermer(quand === "trop_tot" ? "rien_a_faire" : quand, dit[quand] ?? quand)
    }

    // ON NE MESURE JAMAIS AVEC LA CLÉ DE RAPHAËL. Sans clé de test, on s'arrête.
    const cle = Deno.env.get("GEMINI_API_KEY_TEST")
    if (!cle) {
      return await fermer(
        "echec",
        "GEMINI_API_KEY_TEST absente : essayer des modèles avec la clé de Raphaël viderait le quota qui lui sert à parler à Jarvis.",
      )
    }

    const { data: ouverte } = await admin
      .from("veilles_modele")
      .insert({ verdict: "en_cours" })
      .select("id")
      .single()
    passe = ouverte?.id ?? null

    // Ce que le serveur utilise EN CE MOMENT : la ligne en base si elle
    // existe, sinon ce que dit le code. Sans ce repli, la toute première
    // promotion serait impossible.
    const enBase = etat.en_service?.find((s) => s.role === "commande")
    const parDefaut = gemini.modeles("commande")
    const courant = enBase
      ? { modele: enBase.modele, secours: enBase.secours, promu_at: enBase.promu_at }
      : { modele: parDefaut.modele, secours: parDefaut.secours, promu_at: new Date(0).toISOString() }

    // Un seul candidat par passe : la passe repasse demain, et une invocation
    // courte est une invocation qui va au bout.
    const memoire = etat.en_service?.find((s) => s.role === "memoire")
    const dejaPris = new Set([
      courant.modele,
      ...courant.secours,
      ...(memoire ? [memoire.modele, ...memoire.secours] : []),
      ...gemini.modeles("memoire").secours,
      gemini.modeles("memoire").modele,
    ])
    const dejaEssayesAujourdhui = new Set(
      etat.essais_recents
        .filter((e) => e.jour === new Date().toISOString().slice(0, 10))
        .map((e) => e.modele),
    )

    const candidats = (await modelesAnnonces(cle)).filter(
      (m) => FAMILLES_RAPIDES.test(m) && !HORS_SUJET.test(m) && !dejaPris.has(m) && !dejaEssayesAujourdhui.has(m),
    )

    const essais: Essai[] = []
    if (candidats.length) {
      const essai = await essayer(candidats[0], cle)
      await admin.from("essais_modele").insert({
        fournisseur: "gemini",
        role: "commande",
        modele: essai.modele,
        repond: essai.repond,
        appelle_outil: essai.appelle_outil,
        controles_reussis: essai.controles_reussis,
        controles_total: essai.controles_total,
        ms_median: essai.ms_median,
        plafond_jour: essai.plafond_jour,
        plafond_minute: essai.plafond_minute,
        detail: (essai as Essai & { detail?: string }).detail ?? null,
      })
      // Relu avec la date que la base a posée, pour que la règle des DEUX
      // JOURS compare bien des jours du fuseau de Raphaël.
      essais.push({ ...essai, jour: new Date().toISOString().slice(0, 10) })
    }

    const decision = decider(etat, essais, courant, maintenant)

    if (decision.quoi === "retour_arriere") {
      const { data: fait } = await admin.rpc("retour_arriere_moteur", {
        p_role: "commande",
        p_raison: decision.raison,
      })
      return await fermer(
        fait ? "retour_arriere" : "rien_a_faire",
        fait ? decision.raison : `${decision.raison} (mais rien à remettre)`,
      )
    }

    if (decision.quoi === "promouvoir") {
      await admin.rpc("promouvoir_modele", {
        p_role: "commande",
        p_fournisseur: "gemini",
        p_modele: decision.modele,
        p_secours: decision.secours,
        p_par: "veille",
        p_raison: decision.raison,
      })
      return await fermer("promotion", decision.raison)
    }

    const essaye = essais.length ? ` Essayé : ${essais[0].modele} (${essais[0].controles_reussis}/${essais[0].controles_total}).` : ""
    return await fermer("rien_a_faire", `${decision.raison}${essaye}`)
  } catch (err) {
    // Une passe qui plante s'enregistre elle aussi : un silence se lirait
    // comme « tout va bien » alors que la veille est morte.
    return await fermer("echec", String(err).slice(0, 400))
  }
})
