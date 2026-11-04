-- 033_clean_orphan_player_users.sql — Unlink players whose user_id no longer exists in users
-- and clean up dangling references so gamertags from deleted accounts can be claimed or reused.

UPDATE players
   SET user_id = NULL
 WHERE user_id IS NOT NULL
   AND user_id NOT IN (SELECT id FROM users);
