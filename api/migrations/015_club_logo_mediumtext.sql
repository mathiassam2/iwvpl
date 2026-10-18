-- Allow uploaded club crest Data URLs (data:image/webp;base64,...) in clubs.logo_local / logo_url
ALTER TABLE clubs
  MODIFY COLUMN logo_local MEDIUMTEXT NULL,
  MODIFY COLUMN logo_url MEDIUMTEXT NULL;
