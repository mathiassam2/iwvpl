-- ---------------------------------------------------------------------------
-- Password resets table for self-service forgotten password flow
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_resets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_password_resets_token (token),
  INDEX idx_password_resets_user (user_id),
  INDEX idx_password_resets_expires (expires_at)
) DEFAULT CHARSET=utf8mb4;
