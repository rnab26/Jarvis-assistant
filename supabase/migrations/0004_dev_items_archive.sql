-- Archivage des chantiers du cockpit dev : distinct du statut (un chantier
-- "terminé" peut rester visible un moment avant d'être archivé pour garder
-- un historique sans encombrer le tableau actif).

alter table dev_items add column archived_at timestamptz;
