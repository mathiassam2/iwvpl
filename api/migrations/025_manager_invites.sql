-- Manager invite codes table bound to specific captain emails or club names.
CREATE TABLE IF NOT EXISTS manager_invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  target_email VARCHAR(190) NULL,
  target_club_name VARCHAR(120) NULL,
  notes VARCHAR(255) NULL,
  created_by_user_id INT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by_user_id INT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_invites_code (code),
  INDEX idx_invites_used (is_used),
  INDEX idx_invites_email (target_email)
) DEFAULT CHARSET=utf8mb4;
