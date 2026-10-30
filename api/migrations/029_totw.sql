-- ---------------------------------------------------------------------------
-- Team of the Week (TOTW)
--
-- One row per week in totw_weeks (draft | published) and up to 11 rows per week
-- in totw_players, one per formation slot of the fixed 4-3-3. Photos are kept
-- as data URLs in MEDIUMTEXT, the same way club logos and celebration images
-- are, and served through the API so access can be gated.
--
-- Who may view the page is stored in system_settings (totw_access_mode and
-- totw_access_users), not here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS totw_weeks (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  label         VARCHAR(120) NOT NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'draft',
  published_at  DATETIME     NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_totw_weeks_status (status, published_at)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS totw_players (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  week_id       INT UNSIGNED NOT NULL,
  slot          TINYINT UNSIGNED NOT NULL,
  name          VARCHAR(120) NOT NULL,
  shirt_number  SMALLINT UNSIGNED NULL,
  position      VARCHAR(16)  NOT NULL,
  club_id       INT UNSIGNED NULL,
  club_name     VARCHAR(160) NULL,
  player_id     INT UNSIGNED NULL,
  photo_close   MEDIUMTEXT   NULL,
  photo_candid  MEDIUMTEXT   NULL,
  created_at    DATETIME     NOT NULL,
  updated_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_totw_week_slot (week_id, slot)
) DEFAULT CHARSET=utf8mb4;
