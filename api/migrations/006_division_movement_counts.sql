ALTER TABLE divisions
  ADD COLUMN promotion_count SMALLINT UNSIGNED NULL,
  ADD COLUMN relegation_count SMALLINT UNSIGNED NULL;

UPDATE divisions
   SET promotion_count = CASE
         WHEN promotion_from IS NOT NULL AND promotion_to >= promotion_from
         THEN promotion_to - promotion_from + 1
         ELSE NULL
       END,
       relegation_count = CASE
         WHEN relegation_from IS NOT NULL AND relegation_to >= relegation_from
         THEN relegation_to - relegation_from + 1
         ELSE NULL
       END;
