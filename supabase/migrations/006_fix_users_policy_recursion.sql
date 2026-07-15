-- Drop old recursive policies
DROP POLICY IF EXISTS "admin_all" ON users;
DROP POLICY IF EXISTS "admin_all" ON vehicle;
DROP POLICY IF EXISTS "admin_all" ON samiti;
DROP POLICY IF EXISTS "admin_all" ON vehicle_samiti_map;
DROP POLICY IF EXISTS "admin_all" ON milk_entry;
DROP POLICY IF EXISTS "admin_all" ON milk_test;
DROP POLICY IF EXISTS "admin_all" ON rate_chart;
DROP POLICY IF EXISTS "admin_all" ON quality_threshold;
DROP POLICY IF EXISTS "admin_all" ON payment;

DROP POLICY IF EXISTS "entry_op_read_vehicle" ON vehicle;
DROP POLICY IF EXISTS "entry_op_read_samiti" ON samiti;
DROP POLICY IF EXISTS "entry_op_read_vehicle_samiti_map" ON vehicle_samiti_map;
DROP POLICY IF EXISTS "entry_op_write_milk_entry" ON milk_entry;

DROP POLICY IF EXISTS "testing_read_samiti" ON samiti;
DROP POLICY IF EXISTS "testing_read_milk_entry" ON milk_entry;
DROP POLICY IF EXISTS "testing_write_milk_test" ON milk_test;

-- Helper function to fetch role without recursing RLS policies
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id uuid)
RETURNS text
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT role FROM public.users WHERE id = p_user_id);
END;
$$ LANGUAGE plpgsql;

-- Policy on users table
-- 1. Read own user record (essential for logging in and fetching preferences)
CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (id = auth.uid());

-- 2. Admin full access to users table
CREATE POLICY "admin_all" ON users
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Policies on other tables using get_user_role() function

-- Vehicles
CREATE POLICY "admin_all" ON vehicle
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "entry_op_read_vehicle" ON vehicle
  FOR SELECT USING (active = TRUE AND public.get_user_role(auth.uid()) = 'entry_operator');

-- Samitis
CREATE POLICY "admin_all" ON samiti
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "entry_op_read_samiti" ON samiti
  FOR SELECT USING (active = TRUE AND public.get_user_role(auth.uid()) = 'entry_operator');

CREATE POLICY "testing_read_samiti" ON samiti
  FOR SELECT USING (active = TRUE AND public.get_user_role(auth.uid()) = 'testing_user');

-- Vehicle-Samiti Routes
CREATE POLICY "admin_all" ON vehicle_samiti_map
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "entry_op_read_vehicle_samiti_map" ON vehicle_samiti_map
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('entry_operator', 'testing_user'));

-- Milk Entries
CREATE POLICY "admin_all" ON milk_entry
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "entry_op_write_milk_entry" ON milk_entry
  FOR ALL USING (public.get_user_role(auth.uid()) = 'entry_operator' AND entered_by = auth.uid());

CREATE POLICY "testing_read_milk_entry" ON milk_entry
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'testing_user' AND is_deleted = FALSE);

-- Milk Tests
CREATE POLICY "admin_all" ON milk_test
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "testing_write_milk_test" ON milk_test
  FOR ALL USING (public.get_user_role(auth.uid()) = 'testing_user' AND tested_by = auth.uid());

-- Rate Charts
CREATE POLICY "admin_all" ON rate_chart
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Quality Thresholds
CREATE POLICY "admin_all" ON quality_threshold
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Payments
CREATE POLICY "admin_all" ON payment
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');
