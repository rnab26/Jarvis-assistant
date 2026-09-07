-- 0034 — le témoin de la mémoire cessait de dire la vérité.
--
-- CE QU'IL A SIGNALÉ, 7 sept. 2026, capture à l'appui : « La mémoire de Jarvis
-- ne retient plus rien — 21 échanges dictés depuis la dernière chose retenue ».
--
-- C'ÉTAIT FAUX, et c'est vérifiable : au moment même de sa capture (18:21 chez
-- lui), la mémoire venait de retenir « L'épouse de Raphaël se prénomme Yael »
-- (souvenir créé à 15:23:17 UTC, journal « mémoire : nouveau » à la même
-- seconde). Elle tournait.
--
-- LA CAUSE : `sante_memoire()` compte TOUS les échanges depuis le dernier
-- souvenir. Or depuis le 5 sept., `src/lib/echangeLocal.ts` écrit aussi dans
-- `echanges` les commandes comprises SUR L'APPAREIL — et celles-là ne passent
-- JAMAIS par l'extraction de souvenirs. C'est écrit dans le CLAUDE.md et c'est
-- délibéré : « la consigne dit déjà de ne rien retenir d'une demande de
-- création de tâche ou de chantier, et ce sont exactement celles-là ».
--
-- Autrement dit, le compteur montait sur des échanges qui ne POUVAIENT pas le
-- faire redescendre. Plus il dicte de tâches, plus la mémoire a l'air morte.
-- Un témoin qui s'allume à tort n'est plus lu du tout — et le jour de la vraie
-- panne, il ne servira à rien. C'est précisément ce que sa note d'origine
-- voulait éviter (« sinon le témoin crie au loup »).
--
-- LE DÉFAUT NULLABLE EST VOULU : les échanges déjà en base n'ont pas de source
-- connue, et les compter comme « appareil » les effacerait du témoin à tort.
-- `null` veut dire « on ne sait pas », et on les compte donc comme avant.

alter table public.echanges
  add column if not exists source text;

comment on column public.echanges.source is
  'Par où la commande est passée : « serveur » (voice-command, donc l''extraction de souvenirs a eu lieu) ou « appareil » (comprise localement, sans extraction — elle ne peut PAS produire de souvenir). NULL = antérieur au 7 sept. 2026, compté comme avant.';

create index if not exists echanges_user_source_idx
  on public.echanges (user_id, source, created_at desc);
