import { supabase } from '../db/supabase';
import { writeAuditLog } from './audit';
import type { Vehicle } from '../types';

// ─── Vehicle API ───────────────────────────────────────────────

export async function getVehicles(activeOnly = false): Promise<Vehicle[]> {
  let query = supabase
    .from('vehicle')
    .select('*')
    .order('vehicle_no', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as Vehicle[];
}

export async function getVehicleById(id: string): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicle')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Vehicle;
}

export async function createVehicle(
  payload: { vehicle_no: string; driver_name: string },
  userId: string
): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicle')
    .insert({ ...payload, active: true })
    .select()
    .single();
  if (error) throw error;

  const vehicle = data as Vehicle;

  await writeAuditLog({
    entity_type: 'Vehicle',
    entity_id: vehicle.id,
    user_id: userId,
    action: 'INSERT',
    old_value: null,
    new_value: vehicle,
  });

  return vehicle;
}

export async function updateVehicle(
  id: string,
  payload: Partial<Pick<Vehicle, 'vehicle_no' | 'driver_name' | 'active'>>,
  userId: string
): Promise<Vehicle> {
  // Fetch old data
  const { data: oldData } = await supabase
    .from('vehicle')
    .select('*')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('vehicle')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const vehicle = data as Vehicle;

  await writeAuditLog({
    entity_type: 'Vehicle',
    entity_id: vehicle.id,
    user_id: userId,
    action: 'UPDATE',
    old_value: oldData,
    new_value: vehicle,
  });

  return vehicle;
}

export async function deactivateVehicle(id: string, userId: string): Promise<void> {
  // Fetch old data
  const { data: oldData } = await supabase
    .from('vehicle')
    .select('*')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('vehicle')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  await writeAuditLog({
    entity_type: 'Vehicle',
    entity_id: id,
    user_id: userId,
    action: 'UPDATE',
    old_value: oldData,
    new_value: data,
  });
}
