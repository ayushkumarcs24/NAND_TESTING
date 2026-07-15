-- ============================================================
-- Nand Dairy — Audit Log RLS Policies
-- Migration: 003_audit_log_policies.sql
-- ============================================================

-- RLS policies for audit_log
CREATE POLICY "authenticated_insert_audit_log" ON audit_log
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_audit_log" ON audit_log
  FOR ALL
  USING ((SELECT role FROM users WHERE id = auth.uid()) = 'admin');
