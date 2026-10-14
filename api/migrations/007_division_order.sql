ALTER TABLE divisions
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0;

UPDATE divisions d
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY season_id ORDER BY name, id) - 1 AS position
    FROM divisions
) ordered_divisions ON ordered_divisions.id = d.id
SET d.sort_order = ordered_divisions.position;

CREATE INDEX ix_divisions_season_order
  ON divisions (season_id, sort_order, id);
