-- Allow a fixture to be created before its kickoff is confirmed.
ALTER TABLE matches MODIFY COLUMN kickoff DATETIME NULL;
