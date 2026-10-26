-- Fix homepage_regions flag emojis
UPDATE homepage_regions SET flag = '🇸🇬' WHERE UPPER(iso) = 'SG';
UPDATE homepage_regions SET flag = '🇲🇾' WHERE UPPER(iso) = 'MY';
UPDATE homepage_regions SET flag = '🇮🇩' WHERE UPPER(iso) = 'ID';
