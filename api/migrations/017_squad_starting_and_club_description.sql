-- Add club description and formation to clubs, and starting 11 / squad metadata to players.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER logo_local,
  ADD COLUMN IF NOT EXISTS formation VARCHAR(16) NOT NULL DEFAULT '4-3-3' AFTER description;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_starting_11 BOOLEAN NOT NULL DEFAULT FALSE AFTER is_free_agent,
  ADD COLUMN IF NOT EXISTS shirt_number INT UNSIGNED NULL AFTER is_starting_11,
  ADD COLUMN IF NOT EXISTS position VARCHAR(16) NULL AFTER shirt_number,
  ADD COLUMN IF NOT EXISTS sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER position;
