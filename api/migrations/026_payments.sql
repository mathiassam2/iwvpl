-- Payments and Orders for Stripe Checkout
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(64) NOT NULL UNIQUE,
  user_id INT NULL,
  club_id INT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'SGD',
  status ENUM('pending', 'paid', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  stripe_session_id VARCHAR(255) NULL UNIQUE,
  stripe_payment_intent_id VARCHAR(255) NULL,
  items_json JSON NULL,
  metadata_json JSON NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_club (club_id),
  INDEX idx_orders_session (stripe_session_id)
);
