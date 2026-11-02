-- Remove accidental "Leave club" transfer record for LKN-mattzyus (BALLOTZ VFC -> Free Agent)
DELETE t
  FROM transfers t
  JOIN players p ON p.id = t.player_id
 WHERE LOWER(p.gamertag) = 'lkn-mattzyus'
   AND t.to_club_id IS NULL;
