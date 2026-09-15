/**
 * Quel bouton l'écran « Mettre à jour l'application » doit afficher — et
 * surtout QUAND il ne doit pas en proposer un qui crie.
 *
 * SA CAPTURE DU 15 SEPT. 2026, où il entoure les deux à la fois : un bouton
 * noir « Mettre à jour » collé à un badge « À jour ». Ses mots : « ya
 * confusion car ca propose de mettre la version a jour alors que cest deja a
 * jour ». Vérifié côté GitHub au même instant, pas supposé : la release
 * `latest-debug` était `build: 281 / commit: 26e43f5`, exactement ce qu'il
 * faisait tourner. **Il n'y avait rien à mettre à jour.**
 *
 * LA CAUSE, lue dans `MettreAJour.tsx` : la mise à jour rapide n'est possible
 * que lorsqu'une version ATTEND (le verdict n'est calculé que dans ce cas),
 * donc dès qu'on est à jour la condition retombait sur la branche « APK » et
 * affichait son bouton en action PRINCIPALE. Un bouton noir, actif, à côté de
 * « À jour ». Il a appuyé — c'est la seule chose raisonnable à faire devant
 * ça — et a téléchargé 11,1 Mo d'APK pour rien, sur sa 4G.
 *
 * Module PUR : c'est une décision qui peut être fausse en silence, et elle
 * l'a été. `scripts/verifier-bouton-maj.ts` la garde.
 */

/** L'état du verdict de version, tel que le rend `useUpdateCheck`. */
export type EtatVersion = "checking" | "up-to-date" | "update-available" | "unknown"

export type ActionMaj =
  /** Le paquet web : quelques secondes, aucune réinstallation. */
  | "maj_rapide"
  /** Une vraie version attend et touche le natif : il faut l'APK. */
  | "installer_apk"
  /** Rien n'attend. Le bouton reste atteignable (coquille abîmée, doute),
   *  mais DISCRET et nommé pour ce qu'il fait vraiment. */
  | "reinstaller_apk"
  /** Hors de l'app Android : le site est déjà à jour, le lien donne l'APK. */
  | "telecharger_web"
  /** On ne sait pas encore : on ne propose rien plutôt qu'au hasard. */
  | "attendre"

export interface BoutonMaj {
  action: ActionMaj
  libelle: string
  /** Action PRINCIPALE (bouton plein) ou simple recours (bouton discret).
   * Vrai seulement quand quelque chose attend vraiment. */
  principal: boolean
}

export function boutonMaj(opts: {
  natif: boolean
  etat: EtatVersion
  /** Le paquet web publié peut-il s'appliquer sans réinstaller ? */
  majRapidePossible: boolean
}): BoutonMaj {
  const { natif, etat, majRapidePossible } = opts

  if (!natif) {
    return {
      action: "telecharger_web",
      libelle: "Télécharger la dernière version",
      // Sur le site, la page est republiée à chaque push : elle est à jour
      // par construction. Le lien ne sert qu'à récupérer l'APK Android, ce
      // n'est jamais l'action attendue de cet écran.
      principal: etat === "update-available",
    }
  }

  // Tant qu'on interroge GitHub, on ne sait rien. Proposer une action ici
  // reviendrait à deviner, et c'est une réinstallation de 11 Mo qu'on
  // devinerait.
  if (etat === "checking") {
    return { action: "attendre", libelle: "Vérification…", principal: false }
  }

  if (etat === "update-available") {
    return majRapidePossible
      ? { action: "maj_rapide", libelle: "Mettre à jour maintenant", principal: true }
      : { action: "installer_apk", libelle: "Mettre à jour", principal: true }
  }

  // À JOUR, ou verdict inconnu (GitHub injoignable) : PAS d'action
  // principale. Le libellé dit ce que le bouton fait — réinstaller — plutôt
  // que « Mettre à jour », qui promet une nouveauté qui n'existe pas.
  return {
    action: "reinstaller_apk",
    libelle: "Réinstaller l'application",
    principal: false,
  }
}

/**
 * Ce qu'on écrit sous le bouton discret, pour que personne n'ait à deviner
 * pourquoi il est là. `null` quand le bouton est l'action attendue : le
 * commenter serait du bruit.
 */
export function pourquoiCeBouton(action: ActionMaj, etat: EtatVersion): string | null {
  if (action !== "reinstaller_apk") return null
  return etat === "unknown"
    ? "Je n'ai pas pu joindre GitHub pour comparer les versions. Ce bouton réinstalle la dernière APK publiée."
    : "Tu as déjà la dernière version. Ce bouton ne sert que si l'application se comporte mal et que tu veux la réinstaller."
}
