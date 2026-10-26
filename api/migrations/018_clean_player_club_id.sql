-- Clean up player accounts that had users.club_id set during legacy import.
-- Only club managers, admins, and owners manage a club via users.club_id; players belong to a club via players.club_id.
UPDATE users
   SET club_id = NULL,
       updated_at = NOW()
 WHERE role = 'player'
   AND club_id IS NOT NULL;
