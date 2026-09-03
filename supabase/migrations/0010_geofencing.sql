-- Rappels de lieu : déclenchement optionnel par géolocalisation réelle
-- (geofencing), en complément du déclenchement par conversation. lat/lng
-- sont renseignés via géocodage (Google Geocoding API, côté Edge Function)
-- uniquement quand l'utilisateur active l'option — sinon ils restent null
-- et seul le déclenchement conversationnel s'applique.
alter table place_reminders add column lat double precision;
alter table place_reminders add column lng double precision;
