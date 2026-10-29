-- Add club description and formation to clubs, and starting 11 / squad metadata to players.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS formation VARCHAR(16) NOT NULL DEFAULT '4-3-3';

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_starting_11 BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS shirt_number INT UNSIGNED NULL;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS position VARCHAR(16) NULL;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS sort_order INT UNSIGNED NOT NULL DEFAULT 0;
