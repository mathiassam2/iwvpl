-- Add optional shirt_number (1..99) to players and starting_xi_json (lineup + bench + formation) to clubs.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS shirt_number INT NULL;

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS starting_xi_json MEDIUMTEXT NULL;
