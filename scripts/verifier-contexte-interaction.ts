/**
 * L'écran affiché et le dernier bouton touché, tels qu'ils arrivent dans
 * journal_ecoute et jarvis_erreurs.
 *
 *   node --experimental-strip-types scripts/verifier-contexte-interaction.ts
 *
 * Chantier 6d94ab6a, 17 sept. 2026. Raphaël veut comprendre après coup
 * comment Jarvis se comporte, à la voix ET au clic — sa réponse au périmètre :
 * « Enrichir l'existant » (journal_ecoute, jarvis_erreurs), pas un quatrième
 * endroit. Ce contrôle tient le module PUR qui décide de ce qui est encore
 * pertinent (`src/lib/contexteInteraction.ts`), et vérifie par lecture du
 * code que les deux points de branchement (`journalEcoute.ts`, `erreurs.ts`)
 * n'ont pas été défaits — l'écriture réelle en base n'est pas rejouable ici
 * sans réseau, comme le reste des vérifications de cette famille.
 */

import { readFileSync } from "node:fs"
import {
  FENETRE_CLIC_MS,
  appuiPertinent,
  contextePourErreur,
  detailInteraction,
  libelleElement,
  noterAppui,
  noterEcranActuel,
  nomEcran,
  reinitialiserContexteInteraction,
} from "../src/lib/contexteInteraction.ts"

let echecs = 0

function verifier(nom: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`,
  )
}

// --- 1. Le nom d'écran -------------------------------------------------
{
  verifier("la racine est « Tâches »", nomEcran("/"), "Tâches")
  verifier("le cockpit est nommé", nomEcran("/cockpit"), "Cockpit dev")
  verifier("un chemin avec recherche ignore la recherche", nomEcran("/settings?section=voix"), "Paramètres")
  verifier("un / de fin est ignoré", nomEcran("/cockpit/"), "Cockpit dev")
  verifier(
    "un chemin inconnu se montre tel quel plutôt que de se taire",
    nomEcran("/un-futur-ecran"),
    "/un-futur-ecran",
  )
}

// --- 2. Un appui, pertinent ou périmé -----------------------------------
{
  verifier("aucun appui connu → rien", appuiPertinent(null, 1000), null)
  verifier(
    "un appui à l'instant → pertinent",
    appuiPertinent({ libelle: "Supprimer", at: 1000 }, 1000),
    { libelle: "Supprimer", il_y_a_ms: 0 },
  )
  verifier(
    "un appui juste avant la fenêtre → encore pertinent",
    appuiPertinent({ libelle: "Supprimer", at: 1000 }, 1000 + FENETRE_CLIC_MS),
    { libelle: "Supprimer", il_y_a_ms: FENETRE_CLIC_MS },
  )
  verifier(
    "un appui juste après la fenêtre → périmé",
    appuiPertinent({ libelle: "Supprimer", at: 1000 }, 1000 + FENETRE_CLIC_MS + 1),
    null,
  )
  verifier(
    "une horloge qui recule n'est jamais « à l'instant »",
    appuiPertinent({ libelle: "Supprimer", at: 2000 }, 1000),
    null,
  )
}

// --- 3. Le libellé d'un élément touché -----------------------------------
{
  verifier(
    "aria-label l'emporte sur le texte (bouton icône)",
    libelleElement("Fermer", "×"),
    "Fermer",
  )
  verifier("à défaut, le texte visible", libelleElement(null, "  Enregistrer  "), "Enregistrer")
  verifier("les espaces multiples sont réduits", libelleElement(null, "Tout\n  supprimer"), "Tout supprimer")
  verifier("rien de lisible → rien", libelleElement(null, "   "), null)
  verifier("rien du tout → rien", libelleElement(null, null), null)
  const long = "x".repeat(80)
  verifier(
    "un libellé trop long est coupé, pas envoyé en entier",
    libelleElement(null, long)?.length,
    61, // 60 caractères + le point de suspension
  )
}

// --- 4. Ce qui part dans journal_ecoute -----------------------------------
{
  reinitialiserContexteInteraction()
  verifier("écran par défaut, aucun clic → pas d'appel qui invente", detailInteraction(1000), {
    ecran: "Tâches",
    clic: null,
    clic_il_y_a_ms: null,
    plateforme: "web",
  })

  noterEcranActuel("/cockpit")
  noterAppui("Archiver", 1000)
  verifier("après un appui, il apparaît avec son délai", detailInteraction(1500), {
    ecran: "Cockpit dev",
    clic: "Archiver",
    clic_il_y_a_ms: 500,
    plateforme: "web",
  })

  verifier("passé la fenêtre, l'écran reste mais le clic disparaît", detailInteraction(1500 + FENETRE_CLIC_MS), {
    ecran: "Cockpit dev",
    clic: null,
    clic_il_y_a_ms: null,
    plateforme: "web",
  })

  // `noterAppui(null)` doit laisser le dernier appui connu intact — un clic
  // sur un élément sans libellé lisible ne doit pas effacer le précédent.
  noterAppui(null)
  verifier("un clic illisible n'efface pas le précédent", detailInteraction(1500), {
    ecran: "Cockpit dev",
    clic: "Archiver",
    clic_il_y_a_ms: 500,
    plateforme: "web",
  })

  // Chantier f0228dc7, 23 sept. 2026 : sous Node (comme dans un vrai
  // navigateur), Capacitor.isNativePlatform() rend "web" — aucune des deux
  // ne pose androidBridge/webkit.messageHandlers.bridge sur globalThis.
  verifier(
    "hors application native (Node, comme un navigateur), la plateforme est web",
    detailInteraction(1000).plateforme,
    "web",
  )
}

// --- 5. Ce qui part dans jarvis_erreurs.contexte --------------------------
{
  reinitialiserContexteInteraction()
  noterEcranActuel("/settings")
  verifier("sans clic récent : juste l'écran", contextePourErreur(1000), "Écran : Paramètres")

  noterAppui("Enregistrer", 1000)
  verifier(
    "avec un clic récent : l'écran ET le bouton, en secondes",
    contextePourErreur(1000 + 4200),
    "Écran : Paramètres — dernier bouton touché : « Enregistrer » (4 s avant)",
  )
}

// --- 6. Les deux branchements n'ont pas été défaits ------------------------
// L'écriture réelle passe par le réseau (Supabase) : ici on vérifie par
// lecture du code que journalEcoute.ts et erreurs.ts appellent bien ce
// module, plutôt que de rejouer l'appel — même famille que verifier-capteurs.ts.
{
  const journal = readFileSync(new URL("../src/lib/journalEcoute.ts", import.meta.url), "utf8")
  verifier(
    "journalEcoute.ts enrichit le detail avec l'écran et le dernier clic",
    journal.includes("detailInteraction()") && journal.includes("...detailInteraction()"),
    true,
  )

  const erreurs = readFileSync(new URL("../src/lib/erreurs.ts", import.meta.url), "utf8")
  verifier(
    "erreurs.ts retombe sur contextePourErreur() quand l'appelant n'a rien fourni",
    erreurs.includes("contexte ?? contextePourErreur()"),
    true,
  )
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
