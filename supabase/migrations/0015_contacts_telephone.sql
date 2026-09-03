-- Numéro de téléphone des contacts.
--
-- Sans lui, "appelle Yoni" ou "envoie un message à Dylan" n'ont aucune cible :
-- Jarvis sait qui est Yoni (table contacts), mais pas où le joindre. On ne lit
-- PAS le répertoire du téléphone pour ça — ce serait une permission très large
-- (accès à tous les contacts, leurs historiques, leurs groupes) pour un besoin
-- qui se règle en retenant les quelques numéros que Raphaël dicte lui-même.
--
-- Format libre à dessein : il dictera "06 12 34 56 78" ou "+972…", la
-- normalisation se fait à l'usage, au moment de construire le lien.

alter table contacts add column if not exists phone text;
