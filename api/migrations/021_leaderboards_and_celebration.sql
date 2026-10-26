-- Add celebration_image to players and clean_sheets to player_season_stats
ALTER TABLE players ADD COLUMN celebration_image MEDIUMTEXT NULL AFTER avatar_local;
ALTER TABLE player_season_stats ADD COLUMN clean_sheets SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER saves;
