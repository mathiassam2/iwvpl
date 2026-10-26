-- Dynamic CMS storage for website content sections (site info, about & FAQ, entry passes/products, news posts).
CREATE TABLE IF NOT EXISTS site_content (
  section_key VARCHAR(64) NOT NULL,
  content_json LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (section_key)
) DEFAULT CHARSET=utf8mb4;
