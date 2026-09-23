-- Le destinataire d'un message programmé est VÉRIFIÉ au moment de programmer
-- (chantier a122a936, 23 sept. 2026).
--
-- Ses mots : « améliorer la gestion des contacts lors de la programmation de
-- messages, en s'assurant que le contact WhatsApp programmé soit visible et
-- garanti ». MESURÉ le 22 sept. à 10h44 : « Programme un message à envoyer à
-- Harry locataire bureau sur WhatsApp pour 18h… » a été enregistré avec pour
-- destinataire « ce contact » — le nom n'était pas arrivé, et l'app avait
-- comblé en silence. Rien ne l'aurait trouvé à 18h.
--
-- `destinataire` reste ce qu'il a DIT (c'est ce qu'on lui relit). Les deux
-- colonnes ci-dessous portent ce que le RÉPERTOIRE a répondu à ce moment-là :
-- le nom exact du contact et son numéro. Présentes = vérifié, et c'est ce
-- numéro-là qui sert à l'heure dite, sans deviner une seconde fois. Absentes
-- = à vérifier, et l'écran « Programmé » le montre.
alter table public.messages_programmes
  add column if not exists contact_nom text,
  add column if not exists telephone text;
