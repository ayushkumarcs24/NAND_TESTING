-- ============================================================
-- Nand Dairy — PostgreSQL Schema (Supabase Migration)
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DAIRY (single-row owner org)
-- ============================================================
CREATE TABLE dairy (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone                  TEXT NOT NULL UNIQUE,
  password_hash          TEXT NOT NULL,
  role                   TEXT NOT NULL CHECK (role IN ('admin', 'entry_operator', 'testing_user')),
  name                   TEXT NOT NULL,
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_language     TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi')),
  is_locked              BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- VEHICLE
-- ============================================================
CREATE TABLE vehicle (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_no   TEXT NOT NULL UNIQUE,
  driver_name  TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SAMITI
-- ============================================================
CREATE TABLE samiti (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  village        TEXT NOT NULL,
  dairy_id       UUID NOT NULL REFERENCES dairy(id),
  delivery_mode  TEXT NOT NULL CHECK (delivery_mode IN ('vehicle', 'self')),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- VEHICLE–SAMITI MAP (route join table)
-- ============================================================
CREATE TABLE vehicle_samiti_map (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id   UUID NOT NULL REFERENCES vehicle(id),
  samiti_id    UUID NOT NULL REFERENCES samiti(id),
  sequence_no  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehicle_id, samiti_id)
);

-- ============================================================
-- MILK ENTRY (core transactional record)
-- ============================================================
CREATE TABLE milk_entry (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date             DATE NOT NULL,
  shift            TEXT NOT NULL CHECK (shift IN ('morning', 'evening')),
  samiti_id        UUID NOT NULL REFERENCES samiti(id),
  vehicle_id       UUID REFERENCES vehicle(id),  -- nullable for self-delivery
  quantity_litres  NUMERIC(10, 2) NOT NULL CHECK (quantity_litres > 0),
  entered_by       UUID NOT NULL REFERENCES users(id),
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_milk_entry_date_shift_samiti ON milk_entry (date, shift, samiti_id);
CREATE INDEX idx_milk_entry_vehicle ON milk_entry (vehicle_id);
CREATE INDEX idx_milk_entry_samiti_date ON milk_entry (samiti_id, date);
CREATE INDEX idx_milk_entry_is_deleted ON milk_entry (is_deleted) WHERE is_deleted = FALSE;

-- ============================================================
-- MILK TEST
-- ============================================================
CREATE TABLE milk_test (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  milk_entry_id   UUID NOT NULL UNIQUE REFERENCES milk_entry(id),  -- UNIQUE: one test per entry
  samiti_id       UUID NOT NULL REFERENCES samiti(id),  -- denormalized for easy querying
  fat_pct         NUMERIC(5, 2) NOT NULL,
  snf_pct         NUMERIC(5, 2) NOT NULL,
  lacto_value     NUMERIC(6, 2) NOT NULL,
  tested_by       UUID NOT NULL REFERENCES users(id),
  is_voided       BOOLEAN NOT NULL DEFAULT FALSE,
  voided_reason   TEXT,
  voided_by       UUID REFERENCES users(id),
  voided_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the FIFO testing queue: untested entries ordered by created_at
CREATE UNIQUE INDEX idx_milk_test_entry ON milk_test (milk_entry_id);
CREATE INDEX idx_milk_test_samiti ON milk_test (samiti_id);

-- ============================================================
-- RATE CHART (per-day Fat/SNF slab table, carry-forward)
-- ============================================================
CREATE TABLE rate_chart (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  effective_date  DATE NOT NULL,
  fat_pct_from    NUMERIC(5, 2) NOT NULL,
  fat_pct_to      NUMERIC(5, 2) NOT NULL,
  snf_pct_from    NUMERIC(5, 2) NOT NULL,
  snf_pct_to      NUMERIC(5, 2) NOT NULL,
  rate_per_litre  NUMERIC(8, 2) NOT NULL,
  set_by          UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for carry-forward rate lookup
CREATE INDEX idx_rate_chart_effective_date ON rate_chart (effective_date DESC);

-- ============================================================
-- QUALITY THRESHOLD (per-day min Fat/SNF/Lacto, carry-forward)
-- ============================================================
CREATE TABLE quality_threshold (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  effective_date   DATE NOT NULL UNIQUE,  -- one threshold set per day
  min_fat_pct      NUMERIC(5, 2) NOT NULL,
  min_snf_pct      NUMERIC(5, 2) NOT NULL,
  min_lacto_value  NUMERIC(6, 2) NOT NULL,
  set_by           UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for carry-forward threshold lookup
CREATE INDEX idx_quality_threshold_effective_date ON quality_threshold (effective_date DESC);

-- ============================================================
-- PAYMENT (10-day cycle summaries)
-- ============================================================
CREATE TABLE payment (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  samiti_id     UUID NOT NULL REFERENCES samiti(id),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  total_litres  NUMERIC(12, 2) NOT NULL,
  avg_fat       NUMERIC(5, 2) NOT NULL,
  avg_snf       NUMERIC(5, 2) NOT NULL,
  rate_applied  NUMERIC(8, 2) NOT NULL,
  total_amount  NUMERIC(12, 2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'paid')),
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (samiti_id, period_start, period_end)
);

CREATE INDEX idx_payment_samiti ON payment (samiti_id);
CREATE INDEX idx_payment_period ON payment (period_start, period_end);

-- ============================================================
-- AUDIT LOG (who/what/old→new for every entity edit)
-- ============================================================
CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type  TEXT NOT NULL,  -- 'MilkEntry', 'MilkTest', 'Vehicle', etc.
  entity_id    UUID NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_value    JSONB,
  new_value    JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_user ON audit_log (user_id);
CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);

-- ============================================================
-- OFFLINE SYNC QUEUE (tracked server-side for conflict resolution)
-- ============================================================
CREATE TABLE sync_queue (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  operation    TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  payload      JSONB NOT NULL,
  device_id    TEXT,
  user_id      UUID REFERENCES users(id),
  synced       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Policies
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE dairy ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE samiti ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_samiti_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_chart ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_threshold ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- Admin: full access to everything
CREATE POLICY "admin_all" ON users FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON vehicle FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON samiti FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON vehicle_samiti_map FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON milk_entry FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON milk_test FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON rate_chart FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON quality_threshold FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "admin_all" ON payment FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

-- Entry operators: read active vehicles/samitis, write own milk entries
CREATE POLICY "entry_op_read_vehicle" ON vehicle FOR SELECT USING (
  active = TRUE AND (SELECT role FROM users WHERE id = auth.uid()) = 'entry_operator'
);
CREATE POLICY "entry_op_read_samiti" ON samiti FOR SELECT USING (
  active = TRUE AND (SELECT role FROM users WHERE id = auth.uid()) = 'entry_operator'
);
CREATE POLICY "entry_op_read_vehicle_samiti_map" ON vehicle_samiti_map FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('entry_operator', 'testing_user')
);
CREATE POLICY "entry_op_write_milk_entry" ON milk_entry FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'entry_operator'
  AND entered_by = auth.uid()
);

-- Testing users: read active samitis/entries, write own milk tests
CREATE POLICY "testing_read_samiti" ON samiti FOR SELECT USING (
  active = TRUE AND (SELECT role FROM users WHERE id = auth.uid()) = 'testing_user'
);
CREATE POLICY "testing_read_milk_entry" ON milk_entry FOR SELECT USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'testing_user'
  AND is_deleted = FALSE
);
CREATE POLICY "testing_write_milk_test" ON milk_test FOR ALL USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'testing_user'
  AND tested_by = auth.uid()
);

-- ============================================================
-- SEED: Insert a default admin user (password must be changed)
-- Password hash below is bcrypt of 'Admin@1234' — CHANGE IN PRODUCTION
-- ============================================================
-- INSERT INTO users (phone, password_hash, role, name, active)
-- VALUES ('9999999999', '$2b$10$PLACEHOLDER_HASH', 'admin', 'Nand Dairy Admin', TRUE);
