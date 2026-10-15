-- One row per completed season rollover.
--
-- A rollover ends the current season, promotes and relegates by final position,
-- and opens a new season. The finished season is left alone: its standings and
-- results stay exactly as they were played. Clubs move into the new season
-- instead of being rewritten in the old one, so history reads the way it
-- happened.
--
-- `movements` stores the plan that was committed rather than re-deriving it on
-- undo. By the time an admin asks to undo, the standings that chose those clubs
-- may have changed, and undo has to reverse what actually happened, not what
-- would happen now. `notificationIds` is the same idea for the messages sent to
-- the managers of the clubs that moved, so a rollback does not leave
-- "promoted to League 2" notifications behind about a move that no longer
-- happened.
CREATE TABLE IF NOT EXISTS season_rollovers (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_season_id INT UNSIGNED NOT NULL,
  season_id        INT UNSIGNED NOT NULL,
  movements        MEDIUMTEXT   NOT NULL,
  notification_ids MEDIUMTEXT   NOT NULL,
  completed_at     DATETIME     NOT NULL,
  PRIMARY KEY (id),
  -- One rollover opens one season, so the season identifies the rollover.
  UNIQUE KEY uq_season_rollovers_season (season_id),
  KEY ix_season_rollovers_source (source_season_id),
  CONSTRAINT fk_season_rollovers_source FOREIGN KEY (source_season_id) REFERENCES seasons (id),
  CONSTRAINT fk_season_rollovers_season FOREIGN KEY (season_id) REFERENCES seasons (id)
) DEFAULT CHARSET=utf8mb4;