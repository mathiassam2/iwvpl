-- Migration 023: EA FC Pro Clubs integration and Match Player Stats
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS ea_club_id VARCHAR(32) NULL DEFAULT NULL;

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS ea_club_name VARCHAR(120) NULL DEFAULT NULL;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS ea_match_id VARCHAR(64) NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS match_player_stats (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id      INT UNSIGNED NOT NULL,
  player_id     INT UNSIGNED NOT NULL,
  club_id       INT UNSIGNED NOT NULL,
  gamertag      VARCHAR(120) NOT NULL,
  rating        DECIMAL(3,1) NULL DEFAULT 0.0,
  goals         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  assists       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  shots         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  passes        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tackles       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  saves         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  clean_sheet   BOOLEAN NOT NULL DEFAULT FALSE,
  is_mom        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_player (match_id, player_id),
  KEY ix_mps_match (match_id),
  KEY ix_mps_player (player_id),
  KEY ix_mps_club (club_id),
  CONSTRAINT fk_mps_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_mps_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
  CONSTRAINT fk_mps_club FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4;
