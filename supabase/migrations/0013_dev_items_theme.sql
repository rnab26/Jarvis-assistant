-- Thème d'un chantier.
--
-- Pourquoi : les chantiers arrivent un par un, dictés au fil de l'eau, et se
-- retrouvent éparpillés. Une session Claude en prenait un, corrigeait le
-- symptôme, et le suivant du même sujet revenait plus tard — c'est exactement
-- ce que Raphaël appelle des pansements. Groupés par thème, ils se traitent
-- d'un bloc, à la racine.
--
-- Texte libre plutôt qu'une liste fermée : les thèmes se découvrent en
-- travaillant, ils ne se décrètent pas à l'avance. null = pas encore classé.

alter table dev_items add column theme text;

create index dev_items_theme_idx on dev_items (theme) where archived_at is null;
