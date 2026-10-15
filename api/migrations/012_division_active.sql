-- A division can be paused without losing anything.
--
-- Deactivating hides a league from the public site and from the admin's
-- pickers, but every club membership, fixture and standings row stays exactly
-- where it was, so switching it back on restores the league untouched. That is
-- why this is a flag rather than a delete: division_clubs, matches and
-- standings_snapshot all point at the row and have no notion of a tombstone.
--
-- The default is TRUE so every existing division stays active on upgrade.
ALTER TABLE divisions
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;