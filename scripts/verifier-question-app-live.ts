/**
 * « Avec quelle application ? » en mode Live, sans micro ni modèle.
 *
 *   node --experimental-strip-types scripts/verifier-question-app-live.ts
 *
 * Chantier d3b6eeb4 : au micro classique la question est posée une fois puis
 * retenue ; en Live elle ne l'était pas, et Android ouvrait son sélecteur
 * « Terminer l'action avec… » — ce que Raphaël a dit ne pas vouloir.
 *
 * Le cas qui compte vraiment est celui où il NE répond PAS : sans garde-fou,
 * sa phrase suivante serait enregistrée comme « son application de musique »,
 * définitivement et en silence.
 */

import {
  consigneQuestionApp,
  MEMOIRE_QUESTION_MS,
  reponseEstUnNomDApp,
  suiteDeLaQuestion,
  type QuestionEnAttente,
} from "../src/lib/questionAppLive.ts"

let echecs = 0

function verifier(nom: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu)
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`,
  )
}

const attente = (poseeAt = 0): QuestionEnAttente => ({
  demande: "mets de la musique",
  categorie: "musique",
  poseeAt,
})

// --- 1. Rien en attente : on ne change rien au comportement d'avant --------
{
  verifier("aucune question en attente → commande normale", suiteDeLaQuestion(null, "ajoute une tâche", 1000), {
    suite: "normale",
  })
}

// --- 2. Il répond : on retient et on rejoue sa demande d'origine -----------
{
  verifier("« Spotify » → préférence enregistrée, demande rejouée", suiteDeLaQuestion(attente(), "Spotify", 5000), {
    suite: "enregistrer",
    categorie: "musique",
    app: "Spotify",
    demande: "mets de la musique",
  })
  verifier(
    "« Google Maps » (deux mots) est un nom d'app",
    suiteDeLaQuestion({ ...attente(), categorie: "navigation", demande: "emmène-moi à Tel Aviv" }, "Google Maps", 5000),
    { suite: "enregistrer", categorie: "navigation", app: "Google Maps", demande: "emmène-moi à Tel Aviv" },
  )
  verifier("les espaces autour sont retirés", suiteDeLaQuestion(attente(), "  WhatsApp  ", 5000), {
    suite: "enregistrer",
    categorie: "musique",
    app: "WhatsApp",
    demande: "mets de la musique",
  })
}

// --- 3. IL NE RÉPOND PAS : on oublie, on n'enregistre RIEN -----------------
// Le cas dangereux. Enregistrer « ajoute une tâche pour le plombier » comme
// application de musique serait invisible et définitif.
{
  verifier(
    "il redemande autre chose → oublié, jamais enregistré",
    suiteDeLaQuestion(attente(), "ajoute une tâche pour le plombier", 5000),
    { suite: "oublier" },
  )
  verifier("une question → oubliée", suiteDeLaQuestion(attente(), "quelles sont mes tâches ?", 5000), {
    suite: "oublier",
  })
  verifier(
    "une phrase entière → oubliée",
    suiteDeLaQuestion(attente(), "en fait laisse tomber je vais le faire moi-même", 5000),
    { suite: "oublier" },
  )
  verifier("une réponse vide → oubliée", suiteDeLaQuestion(attente(), "   ", 5000), { suite: "oublier" })
}

// --- 4. Il répond trop tard : la question a péri ---------------------------
{
  verifier(
    "réponse juste avant la limite → encore acceptée",
    suiteDeLaQuestion(attente(0), "Spotify", MEMOIRE_QUESTION_MS - 1).suite,
    "enregistrer",
  )
  verifier(
    "réponse après la limite → oubliée",
    suiteDeLaQuestion(attente(0), "Spotify", MEMOIRE_QUESTION_MS + 1).suite,
    "oublier",
  )
}

// --- 5. La forme d'une réponse --------------------------------------------
{
  verifier("« SMS »", reponseEstUnNomDApp("SMS"), true)
  verifier("« ChatGPT »", reponseEstUnNomDApp("ChatGPT"), true)
  verifier("« Waze »", reponseEstUnNomDApp("Waze"), true)
  verifier("un verbe en tête n'est pas une réponse", reponseEstUnNomDApp("ouvre Spotify et mets du jazz"), false)
  verifier("« mets… » n'est pas une réponse", reponseEstUnNomDApp("mets autre chose"), false)
  verifier("vide n'est pas une réponse", reponseEstUnNomDApp(""), false)
}

// --- 6. Ce qu'on rend au modèle doit lui dire de RAPPELER l'outil ----------
// Sans cet ordre, le modèle acquiesce, n'appelle jamais commande_jarvis, la
// préférence n'est jamais enregistrée et la demande d'origine est perdue.
{
  const consigne = consigneQuestionApp("Avec quelle application ?")
  verifier("la question est reprise telle quelle", consigne.startsWith("Avec quelle application ?"), true)
  verifier("le modèle est prié de rappeler l'outil", /commande_jarvis/.test(consigne), true)
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
