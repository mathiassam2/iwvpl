-- Add optional username column to users so legacy WordPress user_login can be used to sign in alongside email.
ALTER TABLE users
  ADD COLUMN username VARCHAR(120) NULL AFTER email;
