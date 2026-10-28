-- System settings storage for league-wide configurations (e.g. manager passcode, registration controls)
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
) DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_settings (setting_key, setting_value, updated_at)
VALUES 
  ('manager_passcode', 'IWVPL2026', NOW()),
  ('manager_passcode_enabled', 'true', NOW());
