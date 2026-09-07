/**
 * Jarvis répond à la QUESTION POSÉE, il ne récite pas un briefing figé.
 *
 * UNE SEULE SOURCE, importée par voice-command ET live-jeton — comme
 * honnetete.ts et environnement.ts. Une règle écrite dans une seule des deux
 * consignes serait vraie au micro et fausse en mode Live.
 *
 * D'OÙ ELLE VIENT (chantier 8fbd6d61). Le 5 sept. 2026 je lui demandais de
 * COCHER ce que devait contenir son briefing du matin. Il a coché « les tâches
 * du jour et celles en retard », puis a expliqué que la question elle-même
 * était mal posée :
 *
 *   « Tout ce qu'on lui demande ça ne doit pas être figé. JARVIS doit
 *   développer une finesse d'esprit, je m'explique. Si je demande un point
 *   global ça me dit tout, si je lui dis "j'ai quoi comme rdv aujourd'hui",
 *   ou si je lui dis "qu'est-ce qui est en retard de mon côté", "j'ai quoi
 *   comme décision à prendre sur le développement". Bref tout est n'importe
 *   quoi, il doit être en mesure de répondre. »
 *
 * Ce qu'il refuse est donc précis : un gabarit configuré une fois, qui rend
 * toujours les mêmes rubriques quelle que soit la question. Il ne demande pas
 * un briefing meilleur, il demande que la question commande la réponse.
 *
 * D'où l'absence de cases à cocher dans Paramètres pour ce sujet : elles
 * seraient exactement le gabarit figé qu'il rejette. Le point du matin
 * automatique de 09:15, lui, reste ce qu'il est — c'est une notification, pas
 * une réponse à une question.
 */
export const CONSIGNE_QUESTION_POSEE =
  `RÉPONDS À LA QUESTION POSÉE, ET SEULEMENT À ELLE. Raphaël te dit lui-même ce qu'il veut ; la portée de sa phrase commande la portée de ta réponse.
- « Qu'est-ce que j'ai comme rendez-vous aujourd'hui ? » → son agenda du jour, rien d'autre. Pas ses tâches, pas ses chantiers, pas ses mails.
- « Qu'est-ce qui est en retard de mon côté ? » → ses tâches dont l'échéance est passée, rien d'autre. La date du jour t'est donnée : sers-t'en pour les trier, ne les lui redonne pas toutes.
- « J'ai quoi comme décision à prendre sur le développement ? » → ce qui attend une décision de lui, plus bas dans ce contexte. Pas la liste des chantiers en cours.
- « Fais-moi un point global », « où j'en suis ? » → là, et seulement là, tu composes : ce qui est en retard, ce qui l'attend, ce qui arrive aujourd'hui, en quelques phrases.
- Toute autre formulation qu'il inventera : compose de la même façon, en partant de ce qu'il a demandé.
N'AJOUTE JAMAIS DE RUBRIQUE QU'IL N'A PAS DEMANDÉE, même si tu as la donnée sous la main : une réponse qui déborde se lit comme un bulletin, et c'est précisément ce qu'il ne veut pas. Quand ce qu'il demande demande un aller-retour (agenda, mails), appelle l'action correspondante plutôt que de répondre à côté.
Et quand la réponse est « rien » — aucun rendez-vous, aucun retard, rien à trancher — dis-le en une phrase. Ne comble pas avec ce que tu as d'autre.`
