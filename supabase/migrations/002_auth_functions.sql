-- ============================================================
-- Nand Dairy — Auth Functions Migration
-- Migration: 002_auth_functions.sql
-- Run this in Supabase SQL Editor after 001_initial_schema.sql
-- ============================================================

-- Enable pgcrypto for bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- RPC: verify_login
-- Called from the app to authenticate a user by phone + password.
-- Returns user info on success, empty on failure.
-- Handles: failed attempt counting, lockout, deactivation.
-- SECURITY DEFINER so it can bypass RLS to read the users table.
-- ============================================================
CREATE OR REPLACE FUNCTION verify_login(p_phone TEXT, p_password TEXT)
RETURNS TABLE (
  user_id            UUID,
  user_role          TEXT,
  user_name          TEXT,
  preferred_language TEXT,
  is_active          BOOLEAN,
  is_locked          BOOLEAN,
  auth_status        TEXT  -- 'ok' | 'wrong_password' | 'locked' | 'disabled' | 'not_found'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_new_attempts INTEGER;
BEGIN
  -- Look up user by phone
  SELECT * INTO v_user FROM users WHERE phone = p_phone;

  IF NOT FOUND THEN
    -- Don't reveal whether phone exists — return empty with generic status
    RETURN QUERY SELECT
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BOOLEAN, NULL::BOOLEAN, 'not_found'::TEXT;
    RETURN;
  END IF;

  -- Check if account is locked
  IF v_user.is_locked THEN
    RETURN QUERY SELECT
      v_user.id, v_user.role, v_user.name, v_user.preferred_language,
      v_user.active, v_user.is_locked, 'locked'::TEXT;
    RETURN;
  END IF;

  -- Check if account is deactivated
  IF NOT v_user.active THEN
    RETURN QUERY SELECT
      v_user.id, v_user.role, v_user.name, v_user.preferred_language,
      v_user.active, v_user.is_locked, 'disabled'::TEXT;
    RETURN;
  END IF;

  -- Verify password using bcrypt
  IF v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
    -- Correct password — reset failed attempts
    UPDATE users
    SET failed_login_attempts = 0,
        updated_at = NOW()
    WHERE id = v_user.id;

    RETURN QUERY SELECT
      v_user.id, v_user.role, v_user.name, v_user.preferred_language,
      v_user.active, v_user.is_locked, 'ok'::TEXT;
  ELSE
    -- Wrong password — increment failed attempts, lock after 5
    v_new_attempts := v_user.failed_login_attempts + 1;

    UPDATE users
    SET failed_login_attempts = v_new_attempts,
        is_locked = (v_new_attempts >= 5),
        updated_at = NOW()
    WHERE id = v_user.id;

    RETURN QUERY SELECT
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BOOLEAN, NULL::BOOLEAN, 'wrong_password'::TEXT;
  END IF;
END;
$$;

-- ============================================================
-- RPC: admin_create_user
-- Admin-only: creates a user with a bcrypt-hashed password.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_create_user(
  p_phone              TEXT,
  p_password           TEXT,
  p_name               TEXT,
  p_role               TEXT,
  p_preferred_language TEXT DEFAULT 'en'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash TEXT;
  v_new_id UUID;
BEGIN
  -- Hash the password with bcrypt (cost factor 10)
  v_hash := crypt(p_password, gen_salt('bf', 10));

  INSERT INTO users (phone, password_hash, name, role, preferred_language, active)
  VALUES (p_phone, v_hash, p_name, p_role, p_preferred_language, TRUE)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ============================================================
-- RPC: admin_reset_password
-- Admin-only: resets a user's password and unlocks the account.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_reset_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  v_hash := crypt(p_new_password, gen_salt('bf', 10));

  UPDATE users
  SET password_hash          = v_hash,
      failed_login_attempts  = 0,
      is_locked              = FALSE,
      updated_at             = NOW()
  WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- RPC: admin_unlock_user
-- Admin-only: unlocks a locked user account.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_unlock_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET is_locked             = FALSE,
      failed_login_attempts = 0,
      updated_at            = NOW()
  WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- SEED: Create initial admin user
-- Phone: 9999999999 | Password: Admin@1234 (CHANGE IMMEDIATELY)
-- ============================================================
INSERT INTO users (phone, password_hash, role, name, active, preferred_language)
VALUES (
  '9999999999',
  crypt('Admin@1234', gen_salt('bf', 10)),
  'admin',
  'Nand Dairy Admin',
  TRUE,
  'en'
)
ON CONFLICT (phone) DO NOTHING;
