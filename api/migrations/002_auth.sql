-- Accounts that play the league: sign-in, club ownership and the transfer market.
--
-- 001 already created users, sessions and transfers; they were never wired to
-- anything. This adds only what the two player-facing flows need on top.
--
-- Nothing here edits 001. The migration runner stores a checksum per file and
-- fails loudly if an applied file changes, so history is immutable.
--
-- EVERY statement in this file is idempotent, which is not a style preference.
-- A migration file is only recorded in the ledger after it runs to completion,
-- so a file that fails halfway is retried in full on the next deploy — against a
-- database where the earlier statements already took effect. Each statement
-- therefore has to be safe to run twice:
--
--   ADD COLUMN IF NOT EXISTS   confirmed in TiDB's AddColumnSpec grammar
--   CREATE TABLE IF NOT EXISTS the same form 001 uses
--
-- There is deliberately no `ADD UNIQUE KEY IF NOT EXISTS`: TiDB's AddIndexSpec
-- permits IF NOT EXISTS on KEY/INDEX but not on UNIQUE, so that statement cannot
-- be written at all. Declaring the uniqueness inline on the column parses but is
-- refused at execution:
--
--   unsupported add column 'user_id' constraint UNIQUE KEY
--
-- The index is therefore a separate single-statement file, 003, which the ledger
-- applies exactly once. One statement per file is what makes that safe: DDL in
-- TiDB is atomic, so it cannot half-apply and cannot need re-running.

-- ---------------------------------------------------------------------------
-- Which account controls which player
-- ---------------------------------------------------------------------------

-- A player row is the EA FC identity (gamertag, slug, stats); a user row is the
-- login. Exactly one account may control a given player, and an account may
-- control at most one — enforced by the unique index in 003, which also makes
-- the players->user lookup a single-index read on every signed-in request.
--
-- NULL is the normal state for the ~500 players seeded from the crawl. They are
-- real people with real squads, but none of them have signed up, and a player
-- row must not imply an account exists. The signing search filters to
-- user_id IS NOT NULL — offering a contract to someone who cannot log in to
-- answer it would strand the request forever.
--
-- No FK, matching players.club_id above: both columns are rewritten whenever a
-- player signs or leaves, and TiDB has no useful ON UPDATE behaviour for it.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS user_id INT UNSIGNED NULL AFTER source_url;

-- ---------------------------------------------------------------------------
-- Transfer requests
-- ---------------------------------------------------------------------------

-- Deliberately separate from `transfers`.
--
-- transfers is a completed-moves log: it has no status and no way to express
-- "asked but not yet answered". Writing a row there when a manager makes an
-- offer would report a signing that has not happened, and the public transfer
-- page would show it. This table holds the pending conversation; a row is
-- copied into transfers only when a player accepts.
--
-- status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
--   cancelled is the manager withdrawing an offer; the player has no cancel.
--   A player leaving their club outright is not a request and writes no row here.
CREATE TABLE IF NOT EXISTS transfer_requests (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id    INT UNSIGNED NOT NULL,
  -- The club they are at when the offer is made. NULL means they were a free
  -- agent, which is a state rather than an absence.
  from_club_id INT UNSIGNED NULL,
  to_club_id   INT UNSIGNED NOT NULL,
  -- 'loan' | 'free' | 'permanent' | NULL. Matches transfers.kind.
  kind         VARCHAR(16)  NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'pending',
  -- Optional note from the manager, shown to the player with the offer.
  message      VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL,
  -- Set on accept or reject. NULL while pending, which is how outstanding
  -- offers are found without trusting a status string alone.
  responded_at DATETIME     NULL,
  PRIMARY KEY (id),
  -- The dashboard reads one player's inbox and one club's outbox, both filtered
  -- by status, so status leads in both indexes.
  KEY ix_tr_player (player_id, status, created_at),
  KEY ix_tr_club (to_club_id, status, created_at),
  CONSTRAINT fk_tr_player FOREIGN KEY (player_id) REFERENCES players (id)
) DEFAULT CHARSET=utf8mb4;

-- There is deliberately no UNIQUE on (player_id, to_club_id). A club may make
-- the same offer again after a rejection, and a uniqueness constraint over
-- status would either block that or force a partial index MySQL cannot express.
-- "One open offer per club per player" is enforced in the route, inside the
-- transaction that creates it.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- In-app only. The player and manager flows need to tell someone something
-- happened; email would add a provider, a verified domain and a delivery
-- failure mode for a league of eighteen clubs.
--
-- One row per event. Unread count is the header badge, so the read filter
-- leads the index.
CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  -- 'offer' | 'offer_accepted' | 'offer_rejected' | 'offer_cancelled'
  -- | 'signed' | 'released' | 'welcome'. Drives the icon and grouping.
  kind       VARCHAR(32)  NOT NULL,
  title      VARCHAR(160) NOT NULL,
  body       VARCHAR(400) NULL,
  -- In-app route to open when clicked, e.g. '/dashboard'.
  link       VARCHAR(255) NULL,
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_notif_user (user_id, is_read, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id)
) DEFAULT CHARSET=utf8mb4;