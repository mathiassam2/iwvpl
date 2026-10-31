-- 030_season_drafts.sql — seasons can be prepared privately before going live.
--
-- A draft season is a complete working copy: divisions, club memberships and
-- standings rows exist, but the season is never `is_current`, so every public
-- route (which reads the current season) keeps serving the live competition.
-- Publishing flips `is_draft` off and `is_current` on in a single transaction.
--
-- `published_at` records when a season first went live so the admin can tell a
-- draft that has never been published from one that was live and is now an
-- archive. Seasons that existed before this migration were live at some point,
-- so they are backfilled from `created_at` rather than left NULL.

ALTER TABLE seasons
  ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN published_at DATETIME NULL;

UPDATE seasons
   SET published_at = created_at
 WHERE published_at IS NULL;
