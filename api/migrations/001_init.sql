-- 001_init.sql — initial schema for the IWVPL league database.
--
-- Written for TiDB Cloud (MySQL-compatible), so a few deliberate choices differ
-- from a plain MySQL 8 schema. Read these before changing anything:
--
--   * INT UNSIGNED, never BIGINT. mysql2 returns BIGINT columns as strings to
--     avoid precision loss, which turns every id into `typeof id === 'string'`
--     in TypeScript. INT UNSIGNED tops out at 4.29 billion rows, far past what
--     a league site will ever hold.
--
--   * VARCHAR + a comment documenting allowed values, never ENUM. TiDB added
--     ENUM support late and it is still not consistently available across
--     serverless cluster versions; a VARCHAR behaves identically everywhere and
--     keeps migrations cheap.
--
--   * No ON UPDATE CURRENT_TIMESTAMP. TiDB treats TIMESTAMP auto-update
--     inconsistently across versions, so `updated_at` is written by the
--     application instead (see src/db.ts `touchUpdatedAt`).
--
--   * Foreign keys are declared for documentation, but TiDB disables FK
--     enforcement by default and older clusters ignore them outright. Integrity
--     is enforced in the API layer; do not assume the database will catch a bad
--     write. Every API route must validate references before writing.
--
--   * All identifiers are lowercase snake_case. TiDB is case-sensitive for
--     table names by default where MySQL on Windows is not, so a schema that
--     works locally can 1049 "table not found" in the cloud.
--
--   * All text columns are utf8mb4. Club flags are regional-indicator emoji pairs
--     and silently truncate to '?' under utf8mb3.

-- ---------------------------------------------------------------------------
-- Competition structure
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seasons (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(64)  NOT NULL,
  year        SMALLINT UNSIGNED NOT NULL,
  -- Exactly one season should carry this at a time; the app enforces that.
  is_current  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seasons_name (name)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS divisions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id   INT UNSIGNED NOT NULL,
  name        VARCHAR(64)  NOT NULL,
  slug        VARCHAR(80)  NOT NULL,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_divisions_slug (slug),
  KEY ix_divisions_season (season_id),
  CONSTRAINT fk_divisions_season FOREIGN KEY (season_id) REFERENCES seasons (id)
) DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Clubs and players
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clubs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  -- Dash-separated, lowercase, derived by the same rule as clubSlug() on the
  -- front end. This is the public identifier used in URLs.
  slug        VARCHAR(140) NOT NULL,
  -- Short code shown in tables and on crests. NOT unique: the crawl emits
  -- 'KKV' for both KITA KITA VFC and KOEMPOEL KEBOW VFC, so a unique index
  -- here would reject real data. Codes are decorative; slugs are identity.
  short_code  VARCHAR(8)   NULL,
  -- Regional-indicator emoji pair, e.g. '🇮🇩'. Empty for many clubs in the
  -- crawl, so it is optional rather than defaulted to a placeholder.
  flag        VARCHAR(16)  NULL,
  -- Remote crest from the source site, plus the local optimised copy actually
  -- served by the SPA. Both are kept so a re-crawl can refresh the remote
  -- without forcing a re-optimisation of every image.
  logo_url    VARCHAR(512) NULL,
  logo_local  VARCHAR(512) NULL,
  source_url  VARCHAR(512) NULL,
  -- 'active' | 'pending' | 'withdrawn'
  status      VARCHAR(32)  NOT NULL DEFAULT 'active',
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clubs_slug (slug),
  KEY ix_clubs_status (status)
) DEFAULT CHARSET=utf8mb4;

-- Club membership is per-season: a club can change division between seasons,
-- so putting division_id directly on clubs would corrupt history.
CREATE TABLE IF NOT EXISTS division_clubs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  division_id INT UNSIGNED NOT NULL,
  club_id     INT UNSIGNED NOT NULL,
  -- Snapshot of the code at the time of registration, because short codes are
  -- reused across clubs and edited over time.
  code_at_registration VARCHAR(8) NULL,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_division_clubs (division_id, club_id),
  KEY ix_division_clubs_club (club_id),
  CONSTRAINT fk_dc_division FOREIGN KEY (division_id) REFERENCES divisions (id),
  CONSTRAINT fk_dc_club FOREIGN KEY (club_id) REFERENCES clubs (id)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS players (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- EA FC gamertag as displayed, e.g. 'LethaL_ShoTs11'. Underscores and mixed
  -- case are part of the identity, so it is stored verbatim.
  gamertag      VARCHAR(120) NOT NULL,
  -- Case-insensitive uniqueness key. Two rows differing only in case would be
  -- the same human and must not both exist.
  gamertag_key  VARCHAR(120) NOT NULL,
  slug          VARCHAR(140) NOT NULL,
  avatar_url    VARCHAR(512) NULL,
  avatar_local  VARCHAR(512) NULL,
  source_url    VARCHAR(512) NULL,
  -- Club as of the most recent recorded move. NULL for a free agent, which is
  -- a state rather than an absence.
  club_id       INT UNSIGNED NULL,
  is_free_agent BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_players_gamertag_key (gamertag_key),
  UNIQUE KEY uq_players_slug (slug),
  KEY ix_players_club (club_id)
) DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matches (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  division_id   INT UNSIGNED NOT NULL,
  season_id     INT UNSIGNED NOT NULL,
  home_club_id  INT UNSIGNED NOT NULL,
  away_club_id  INT UNSIGNED NOT NULL,
  -- Naive local wall-clock, exactly as published. See the note in seed.ts: the
  -- crawl pairs a date with a time in an unstated zone, and rows straddling
  -- midnight are ambiguous. Values are stored verbatim rather than normalised
  -- to UTC, because inventing a zone would fabricate precision we do not have.
  kickoff       DATETIME     NOT NULL,
  -- NULL while unplayed. 'scheduled' | 'live' | 'finished'
  status        VARCHAR(16)  NOT NULL DEFAULT 'scheduled',
  home_score    SMALLINT UNSIGNED NULL,
  away_score    SMALLINT UNSIGNED NULL,
  -- Venue and broadcast links are optional and largely unfilled by the crawl.
  venue         VARCHAR(160) NULL,
  stream_url    VARCHAR(512) NULL,
  source_url    VARCHAR(512) NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  -- Stops the same fixture being imported twice if a re-crawl overlaps.
  UNIQUE KEY uq_matches_fixture (season_id, home_club_id, away_club_id, kickoff),
  -- The results page and schedule both read by kickoff within a season.
  KEY ix_matches_kickoff (season_id, kickoff),
  KEY ix_matches_home (home_club_id, kickoff),
  KEY ix_matches_away (away_club_id, kickoff),
  CONSTRAINT fk_matches_division FOREIGN KEY (division_id) REFERENCES divisions (id),
  CONSTRAINT fk_matches_home FOREIGN KEY (home_club_id) REFERENCES clubs (id),
  CONSTRAINT fk_matches_away FOREIGN KEY (away_club_id) REFERENCES clubs (id)
) DEFAULT CHARSET=utf8mb4;

-- 'goal' | 'own_goal' | 'yellow' | 'red' | 'sub'
CREATE TABLE IF NOT EXISTS match_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id    INT UNSIGNED NOT NULL,
  minute      TINYINT UNSIGNED NOT NULL,
  type        VARCHAR(16)  NOT NULL,
  -- 'home' | 'away'
  team_side   VARCHAR(8)   NOT NULL,
  player_name VARCHAR(120) NULL,
  -- For substitutions: 'Player A for Player B'.
  detail      VARCHAR(255) NULL,
  -- Running score after this event, so a rendered timeline cannot show a 6-2
  -- above an earlier 3-2.
  score       VARCHAR(16)  NULL,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_match_events_match (match_id, minute),
  CONSTRAINT fk_events_match FOREIGN KEY (match_id) REFERENCES matches (id)
) DEFAULT CHARSET=utf8mb4;

-- One row per match: seven home/away stat pairs.
CREATE TABLE IF NOT EXISTS match_stats (
  match_id           INT UNSIGNED NOT NULL,
  possession_home    SMALLINT UNSIGNED NULL,
  possession_away    SMALLINT UNSIGNED NULL,
  shots_home         SMALLINT UNSIGNED NULL,
  shots_away         SMALLINT UNSIGNED NULL,
  on_target_home     SMALLINT UNSIGNED NULL,
  on_target_away     SMALLINT UNSIGNED NULL,
  corners_home       SMALLINT UNSIGNED NULL,
  corners_away       SMALLINT UNSIGNED NULL,
  fouls_home         SMALLINT UNSIGNED NULL,
  fouls_away         SMALLINT UNSIGNED NULL,
  offsides_home      SMALLINT UNSIGNED NULL,
  offsides_away      SMALLINT UNSIGNED NULL,
  pass_accuracy_home SMALLINT UNSIGNED NULL,
  pass_accuracy_away SMALLINT UNSIGNED NULL,
  PRIMARY KEY (match_id),
  CONSTRAINT fk_stats_match FOREIGN KEY (match_id) REFERENCES matches (id)
) DEFAULT CHARSET=utf8mb4;

-- Per-player season totals. The leaderboards read this directly.
-- Derived from match_events in principle, but seeded from the crawl's
-- leaderboard values and then incremented as new results are entered.
CREATE TABLE IF NOT EXISTS player_season_stats (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id     INT UNSIGNED NOT NULL,
  season_id     INT UNSIGNED NOT NULL,
  division_id   INT UNSIGNED NOT NULL,
  appearances   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  goals         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  assists       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  saves         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_player_season (player_id, season_id, division_id),
  -- Leaderboard queries always filter a board then order by its column.
  KEY ix_stats_goals (division_id, season_id, goals),
  KEY ix_stats_assists (division_id, season_id, assists),
  KEY ix_stats_saves (division_id, season_id, saves),
  CONSTRAINT fk_pss_player FOREIGN KEY (player_id) REFERENCES players (id)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transfers (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id    INT UNSIGNED NOT NULL,
  -- NULL when the counterparty is free agency rather than a club.
  from_club_id INT UNSIGNED NULL,
  to_club_id   INT UNSIGNED NULL,
  occurred_at  DATE         NOT NULL,
  -- 'loan' | 'free' | 'permanent' | NULL
  kind         VARCHAR(16)  NULL,
  created_at   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_transfers_player (player_id, occurred_at),
  KEY ix_transfers_date (occurred_at),
  CONSTRAINT fk_transfers_player FOREIGN KEY (player_id) REFERENCES players (id)
) DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Standings
-- ---------------------------------------------------------------------------

-- Materialised table, NOT a view over matches. This is load-bearing.
--
-- The crawl holds 50 results, but the published table says 18 teams have played
-- 17 rounds each — 153 matches. Roughly two thirds of the season is simply not
-- in our data. Recomputing standings from the matches we do have would show
-- every club on ~6 played with wildly wrong points, replacing numbers the site
-- currently shows correctly.
--
-- So the crawl's table is treated as the authoritative base state, and each
-- newly entered result is applied to it incrementally (see
-- src/domain/standings.ts). A full recompute is only correct once the matches
-- table actually holds every fixture of the season.
CREATE TABLE IF NOT EXISTS standings_snapshot (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id   INT UNSIGNED NOT NULL,
  division_id INT UNSIGNED NOT NULL,
  club_id     INT UNSIGNED NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL,
  played      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  won         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  drawn       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  lost        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  goals_for   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  goals_against SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  goal_difference SMALLINT       NOT NULL DEFAULT 0,
  points      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- Last five results as a compact string, e.g. 'WWDLW'. Empty until five
  -- results have been played.
  form        VARCHAR(16)  NOT NULL DEFAULT '',
  updated_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_standings (season_id, division_id, club_id),
  KEY ix_standings_order (division_id, season_id, position),
  CONSTRAINT fk_standings_club FOREIGN KEY (club_id) REFERENCES clubs (id)
) DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Admin access
-- ---------------------------------------------------------------------------

-- 'owner' | 'admin' | 'club_manager'. A club_manager is additionally scoped to
-- one club via club_id and may only edit that club's squad and results.
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  -- bcrypt hash. Never the plaintext, never reversible.
  password_hash VARCHAR(120) NOT NULL,
  display_name  VARCHAR(120) NULL,
  role          VARCHAR(24)  NOT NULL DEFAULT 'club_manager',
  club_id       INT UNSIGNED NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) DEFAULT CHARSET=utf8mb4;

-- Server-side sessions, so revoking access is a single DELETE. A stateless
-- JWT cannot be revoked before it expires.
-- token_hash stores sha256(token); the raw token only ever exists in the
-- cookie the client holds.
CREATE TABLE IF NOT EXISTS sessions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  user_agent  VARCHAR(255) NULL,
  ip_address  VARCHAR(45)  NULL,
  created_at  DATETIME     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) DEFAULT CHARSET=utf8mb4;