-- ============================================================
-- Nand Dairy — Pending Testing Queue View
-- Migration: 004_testing_queue_view.sql
-- ============================================================

CREATE OR REPLACE VIEW pending_testing_queue AS
SELECT 
  me.id AS milk_entry_id,
  me.date,
  me.shift,
  me.quantity_litres,
  me.created_at AS entered_at,
  s.id AS samiti_id,
  s.code AS samiti_code,
  s.name AS samiti_name
FROM milk_entry me
JOIN samiti s ON me.samiti_id = s.id
LEFT JOIN milk_test mt ON mt.milk_entry_id = me.id
WHERE me.is_deleted = FALSE 
  AND mt.id IS NULL;
