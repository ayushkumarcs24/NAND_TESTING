import { supabase } from '../db/supabase';
import { writeAuditLog } from './audit';
import type { VehicleSamitiMap, Samiti } from '../types';

// ─── Vehicle–Samiti Mapping API ────────────────────────────────

export interface VehicleSamitiMapWithDetails extends VehicleSamitiMap {
  samiti: Samiti;
}

export async function getSamitisForVehicle(vehicleId: string): Promise<VehicleSamitiMapWithDetails[]> {
  const { data, error } = await supabase
    .from('vehicle_samiti_map')
    .select(`
      *,
      samiti (*)
    `)
    .eq('vehicle_id', vehicleId)
    .order('sequence_no', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as VehicleSamitiMapWithDetails[];
}

export async function getMappedSamitiIds(vehicleId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('vehicle_samiti_map')
    .select('samiti_id')
    .eq('vehicle_id', vehicleId);
  if (error) throw error;
  return (data ?? []).map((r: { samiti_id: string }) => r.samiti_id);
}

export async function addSamitiToVehicle(
  vehicleId: string,
  samitiId: string,
  sequenceNo?: number
): Promise<void> {
  const { error } = await supabase
    .from('vehicle_samiti_map')
    .insert({ vehicle_id: vehicleId, samiti_id: samitiId, sequence_no: sequenceNo ?? null });
  if (error) throw error;
}

export async function removeSamitiFromVehicle(vehicleId: string, samitiId: string): Promise<void> {
  const { error } = await supabase
    .from('vehicle_samiti_map')
    .delete()
    .eq('vehicle_id', vehicleId)
    .eq('samiti_id', samitiId);
  if (error) throw error;
}

export async function setVehicleSamitis(
  vehicleId: string,
  samitiIds: string[],
  userId: string
): Promise<void> {
  // Fetch existing for audit
  const { data: existing } = await supabase
    .from('vehicle_samiti_map')
    .select('*')
    .eq('vehicle_id', vehicleId);

  // Delete existing
  await supabase.from('vehicle_samiti_map').delete().eq('vehicle_id', vehicleId);

  if (samitiIds.length === 0) {
    await writeAuditLog({
      entity_type: 'VehicleRoute',
      entity_id: vehicleId,
      user_id: userId,
      action: 'UPDATE',
      old_value: existing,
      new_value: [],
    });
    return;
  }

  // Insert new
  const rows = samitiIds.map((sid, idx) => ({
    vehicle_id: vehicleId,
    samiti_id: sid,
    sequence_no: idx + 1,
  }));
  const { data, error } = await supabase
    .from('vehicle_samiti_map')
    .insert(rows)
    .select();

  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'VehicleRoute',
    entity_id: vehicleId,
    user_id: userId,
    action: 'UPDATE',
    old_value: existing,
    new_value: data,
  });
}
