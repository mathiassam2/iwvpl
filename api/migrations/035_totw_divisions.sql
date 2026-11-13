-- ---------------------------------------------------------------------------
-- Team of the Week per division and game week.
--
-- A TOTW week is now bound to one division of one season and to one game week
-- (matches.round_number). The suggestion engine ranks players by the rating
-- they earned in that game week, so the week has to name the game week: with
-- nothing but a free-text label there is no way to tell a current rating from
-- a stale one.
--
-- The columns are nullable so a week that predates this migration still
-- exists. The admin UI requires both from now on.
--
-- The rating columns on totw_players are a snapshot of the game week's
-- numbers, taken when the pick is saved. The card then shows the rating the
-- pick was actually justified by, instead of a figure recomputed from data
-- that has since moved on.
-- ---------------------------------------------------------------------------

ALTER TABLE totw_weeks
  ADD COLUMN IF NOT EXISTS division_id INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS season_id  INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS game_week  SMALLINT UNSIGNED NULL DEFAULT NULL;

-- One Team of the Week per division per game week.
--
-- NULLs do not collide in a unique index, so weeks that are not bound to a
-- division yet do not block each other.
--
-- Written as a plain ADD UNIQUE KEY rather than with IF NOT EXISTS: TiDB does
-- not accept IF NOT EXISTS on ADD UNIQUE, and the migration ledger already
-- guarantees this file runs exactly once.
ALTER TABLE totw_weeks
  ADD UNIQUE KEY uq_totw_division_week (division_id, game_week);

ALTER TABLE totw_players
  ADD COLUMN IF NOT EXISTS rating  DECIMAL(3,1) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS goals   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assists SMALLINT UNSIGNED NOT NULL DEFAULT 0;
