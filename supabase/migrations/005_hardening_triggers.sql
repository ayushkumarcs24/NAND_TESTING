

-- ============================================================
-- Nand Dairy — Server-Side Validation Hardening Triggers
-- Migration: 005_hardening_triggers.sql
-- ============================================================

-- 1. Trigger: validate_milk_entry_active_entities
-- Enforces that milk entry is made against active Samiti and Vehicle.
-- Also enforces the Date Lock: non-admin users cannot submit backdated/future entries.
CREATE OR REPLACE FUNCTION validate_milk_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_samiti_active BOOLEAN;
  v_vehicle_active BOOLEAN;
BEGIN
  -- Fetch user role
  SELECT role INTO v_role FROM users WHERE id = NEW.entered_by;

  -- Enforce date lock for non-admins (entry operator & testing users)
  IF v_role IS DISTINCT FROM 'admin' THEN
    IF NEW.date IS DISTINCT FROM CURRENT_DATE THEN
      RAISE EXCEPTION 'Date lock: Non-admin users can only submit entries for today (% vs %).', CURRENT_DATE, NEW.date;
    END IF;
  END IF;

  -- Validate active Samiti
  SELECT active INTO v_samiti_active FROM samiti WHERE id = NEW.samiti_id;
  IF NOT FOUND OR NOT v_samiti_active THEN
    RAISE EXCEPTION 'Validation error: Cannot make entry against an inactive or non-existent Samiti.';
  END IF;

  -- Validate active Vehicle (if specified)
  IF NEW.vehicle_id IS NOT NULL THEN
    SELECT active INTO v_vehicle_active FROM vehicle WHERE id = NEW.vehicle_id;
    IF NOT FOUND OR NOT v_vehicle_active THEN
      RAISE EXCEPTION 'Validation error: Cannot make entry against an inactive or non-existent Vehicle.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_milk_entry ON milk_entry;
CREATE TRIGGER trg_validate_milk_entry
  BEFORE INSERT OR UPDATE ON milk_entry
  FOR EACH ROW
  EXECUTE FUNCTION validate_milk_entry();


-- 2. Trigger: validate_payment_finalize
-- Enforces that a payment period cannot be finalized if there are untested entries,
-- unless there is an approved admin override (which is checked via audit log).
CREATE OR REPLACE FUNCTION validate_payment_finalize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_untested_count INTEGER;
  v_override_exists BOOLEAN;
BEGIN
  -- If status is changing to finalized or paid
  IF NEW.status IN ('finalized', 'paid') AND OLD.status = 'draft' THEN
    -- Check for untested entries in this period
    SELECT COUNT(*) INTO v_untested_count
    FROM milk_entry me
    LEFT JOIN milk_test mt ON mt.milk_entry_id = me.id
    WHERE me.samiti_id = NEW.samiti_id
      AND me.date >= NEW.period_start
      AND me.date <= NEW.period_end
      AND me.is_deleted = FALSE
      AND mt.id IS NULL;

    IF v_untested_count > 0 THEN
      -- Check if there's a recent audit log entry logging an admin override for this payment
      SELECT EXISTS (
        SELECT 1 FROM audit_log
        WHERE entity_type = 'Payment'
          AND entity_id = NEW.id
          AND action = 'UPDATE'
          AND (new_value->>'override')::BOOLEAN = TRUE
          AND created_at >= NOW() - INTERVAL '1 minute'
      ) INTO v_override_exists;

      IF NOT v_override_exists THEN
        RAISE EXCEPTION 'Finalize blocked: There are % untested milk entries in this payment cycle.', v_untested_count;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_finalize ON payment;
CREATE TRIGGER trg_validate_payment_finalize
  BEFORE UPDATE ON payment
  FOR EACH ROW
  EXECUTE FUNCTION validate_payment_finalize();
