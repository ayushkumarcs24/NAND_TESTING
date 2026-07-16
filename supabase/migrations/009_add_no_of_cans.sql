-- ============================================================
-- Nand Dairy — Add No Of Cans Column to Milk Entry Table
-- Migration: 009_add_no_of_cans.sql
-- ============================================================

ALTER TABLE milk_entry ADD COLUMN no_of_cans INTEGER DEFAULT 0 CHECK (no_of_cans >= 0);
