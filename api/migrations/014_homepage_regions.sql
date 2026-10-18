-- Homepage regions ("The Island" horizontal flags & clubs rail).
--
-- `homepage_regions` backs the horizontal nation/flag rail on the main homepage.
-- Admins can add/edit/reorder/toggle regions, upload custom flag/campaign artwork
-- (stored as a data URL or asset path in `art_url`), and clubs are automatically
-- matched by their registered `flag` / region.

CREATE TABLE IF NOT EXISTS homepage_regions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  iso         VARCHAR(16)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  flag        VARCHAR(32)  NOT NULL,
  art_url     MEDIUMTEXT   NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_homepage_regions_order (sort_order, id)
);

INSERT INTO homepage_regions (iso, name, flag, art_url, is_active, sort_order, created_at, updated_at)
SELECT 'SG', 'Singapore', '🇸🇬', '/assets/hero/sg-hero.webp', TRUE, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM homepage_regions LIMIT 1);

INSERT INTO homepage_regions (iso, name, flag, art_url, is_active, sort_order, created_at, updated_at)
SELECT 'MY', 'Malaysia', '🇲🇾', '/assets/hero/my-hero.webp', TRUE, 1, NOW(), NOW()
WHERE (SELECT COUNT(*) FROM homepage_regions) = 1;

INSERT INTO homepage_regions (iso, name, flag, art_url, is_active, sort_order, created_at, updated_at)
SELECT 'ID', 'Indonesia', '🇮🇩', '/assets/hero/in-hero.webp', TRUE, 2, NOW(), NOW()
WHERE (SELECT COUNT(*) FROM homepage_regions) = 2;
