-- Migration 027: Player club join requests
ALTER TABLE transfer_requests
  ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(16) NOT NULL DEFAULT 'club';
