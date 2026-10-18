-- Homepage controls for competition formats ("Four ways to compete") and
-- featured clubs ("Every club in the league").
--
-- `competition_formats` backs the homepage Formats strip and the About page's
-- format list. Status can be 'active', 'coming_soon', or 'inactive'. Inactive
-- formats remain in the admin list so they can be re-enabled without retyping,
-- while the public site renders only 'active' and 'coming_soon' entries.
--
-- `clubs.is_featured` controls whether a club appears in the homepage crest
-- wall ("Every club in the league"). Existing clubs default to TRUE so the wall
-- remains populated on upgrade until an admin curates the selection.

CREATE TABLE IF NOT EXISTS competition_formats (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  tag         VARCHAR(64)  NOT NULL DEFAULT '',
  description VARCHAR(512) NOT NULL DEFAULT '',
  status      VARCHAR(24)  NOT NULL DEFAULT 'active',
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_competition_formats_order (sort_order, id)
);

INSERT INTO competition_formats (name, tag, description, status, sort_order, created_at, updated_at)
SELECT 'Pro Club League',
       '11 vs 11',
       'The flagship 11-a-side club competition, split across 5 divisions with promotion and relegation.',
       'active',
       0,
       NOW(),
       NOW()
WHERE NOT EXISTS (SELECT 1 FROM competition_formats LIMIT 1);

INSERT INTO competition_formats (name, tag, description, status, sort_order, created_at, updated_at)
SELECT 'FUT League',
       '1 vs 1',
       'Head-to-head FUT battles decided on individual skill and tactical mastery.',
       'active',
       1,
       NOW(),
       NOW()
WHERE (SELECT COUNT(*) FROM competition_formats) = 1;

INSERT INTO competition_formats (name, tag, description, status, sort_order, created_at, updated_at)
SELECT 'Champions League',
       '1 vs 1',
       'A double-elimination 1v1 showdown featuring only the most iconic European clubs.',
       'active',
       2,
       NOW(),
       NOW()
WHERE (SELECT COUNT(*) FROM competition_formats) = 2;

INSERT INTO competition_formats (name, tag, description, status, sort_order, created_at, updated_at)
SELECT '2v2 Competitions',
       '2 vs 2',
       'Doubles action is on the roadmap — pair up and take on the region together.',
       'coming_soon',
       3,
       NOW(),
       NOW()
WHERE (SELECT COUNT(*) FROM competition_formats) = 3;

ALTER TABLE clubs
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT TRUE;
