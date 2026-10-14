-- Removes two test clubs left behind in the league data.
--
--   30001  ZZ Test FC                (withdrawn, 0 players)
--   30002  ZZ Pending Approval FC    (withdrawn, 0 players)
--
-- Both had been entered into a division, so each carries a league entry and a
-- standings row. Those are removed first: they are the rows that would block
-- the delete, and leaving them behind would put a club in a table it is no
-- longer in.
--
-- Every statement is guarded on the club's id AND its name. Ids alone would be
-- wrong if the rows were ever recreated with different content, and a cleanup
-- that silently deleted a real club would be much worse than one that did
-- nothing.
--
-- Matches are deliberately not deleted. If either club turns out to be in a
-- fixture, the foreign key stops this migration and it rolls back — a loud
-- failure to investigate, rather than a quiet deletion of a real result.

-- Ordered children first, clubs last.
DELETE FROM season_division_movements
 WHERE club_id IN (
       SELECT id FROM clubs
        WHERE (id = 30001 AND name = 'ZZ Test FC')
           OR (id = 30002 AND name = 'ZZ Pending Approval FC')
     );

DELETE FROM standings_snapshot
 WHERE club_id IN (
       SELECT id FROM clubs
        WHERE (id = 30001 AND name = 'ZZ Test FC')
           OR (id = 30002 AND name = 'ZZ Pending Approval FC')
     );

DELETE FROM division_clubs
 WHERE club_id IN (
       SELECT id FROM clubs
        WHERE (id = 30001 AND name = 'ZZ Test FC')
           OR (id = 30002 AND name = 'ZZ Pending Approval FC')
     );

-- No subquery here: MySQL refuses to delete from a table it is also reading.
DELETE FROM clubs
 WHERE (id = 30001 AND name = 'ZZ Test FC')
    OR (id = 30002 AND name = 'ZZ Pending Approval FC');