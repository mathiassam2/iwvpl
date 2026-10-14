-- Completed moves are season-scoped and counted against the division they leave.
CREATE TABLE IF NOT EXISTS season_division_movements (
  season_id INT UNSIGNED NOT NULL,
  club_id INT UNSIGNED NOT NULL,
  source_division_id INT UNSIGNED NOT NULL,
  destination_division_id INT UNSIGNED NOT NULL,
  movement_type VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (season_id, club_id, source_division_id),
  KEY ix_season_division_movement_source (season_id, source_division_id, movement_type),
  CONSTRAINT fk_sdm_season FOREIGN KEY (season_id) REFERENCES seasons (id),
  CONSTRAINT fk_sdm_club FOREIGN KEY (club_id) REFERENCES clubs (id),
  CONSTRAINT fk_sdm_source_division FOREIGN KEY (source_division_id) REFERENCES divisions (id),
  CONSTRAINT fk_sdm_destination_division FOREIGN KEY (destination_division_id) REFERENCES divisions (id)
) DEFAULT CHARSET=utf8mb4;
