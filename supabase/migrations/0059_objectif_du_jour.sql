-- « Objectif du jour » : les tâches que Raphaël veut faire en priorité
-- (sa demande du 24 nov. 2026 : une cible à côté du crayon, et la liste en
-- haut de l'onglet Tâches pour ne pas avoir à tout parcourir).
--
-- Une date plutôt qu'un booléen : le jour où il l'a ciblée. Une tâche non
-- faite reste dans l'objectif le lendemain (rien ne disparaît en silence) ;
-- la date permettra de dire « depuis hier » si la liste s'encombre.
-- null = pas dans l'objectif. Une tâche cochée quitte la liste à l'écran.
alter table public.tasks add column if not exists objectif_le date;
