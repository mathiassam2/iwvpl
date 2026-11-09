-- Fix form column in standings_snapshot for INVICTUS ELITE VFC (club_id = 12, season_id = 6)
-- Invictus won 4-0 vs ST Risen FC (2026-11-09 22:30:00) and lost 0-1 vs TORJÄGER VFC (2026-11-09 23:15:00).
-- The actual chronological form is 'WL', but was recorded as 'LL'.
UPDATE standings_snapshot
   SET form = 'WL'
 WHERE club_id = 12
   AND season_id = 6;
