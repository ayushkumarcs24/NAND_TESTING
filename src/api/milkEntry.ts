import { supabase } from '../db/supabase';
import { writeAuditLog } from './audit';
import type { MilkEntry } from '../types';

export async function getMilkEntries(params: {
  date: string;
  shift: 'morning' | 'evening';
  vehicle_id?: string | null;
}): Promise<MilkEntry[]> {
  let query = supabase
    .from('milk_entry')
    .select('*')
    .eq('date', params.date)
    .eq('shift', params.shift)
    .eq('is_deleted', false);

  if (params.vehicle_id !== undefined) {
    if (params.vehicle_id === null) {
      query = query.is('vehicle_id', null);
    } else {
      query = query.eq('vehicle_id', params.vehicle_id);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as MilkEntry[];
}

export async function getExistingSamitiEntry(params: {
  date: string;
  shift: 'morning' | 'evening';
  samiti_id: string;
}): Promise<MilkEntry | null> {
  const { data, error } = await supabase
    .from('milk_entry')
    .select('*')
    .eq('date', params.date)
    .eq('shift', params.shift)
    .eq('samiti_id', params.samiti_id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) throw error;
  return data as MilkEntry | null;
}

export async function createMilkEntry(
  payload: Omit<MilkEntry, 'id' | 'created_at' | 'updated_at' | 'is_deleted'>
): Promise<MilkEntry> {
  const { data, error } = await supabase
    .from('milk_entry')
    .insert({
      date: payload.date,
      shift: payload.shift,
      samiti_id: payload.samiti_id,
      vehicle_id: payload.vehicle_id,
      quantity_litres: payload.quantity_litres,
      entered_by: payload.entered_by,
      is_deleted: false,
    })
    .select()
    .single();

  if (error) throw error;

  const entry = data as MilkEntry;

  // Log audit
  await writeAuditLog({
    entity_type: 'MilkEntry',
    entity_id: entry.id,
    user_id: payload.entered_by,
    action: 'INSERT',
    old_value: null,
    new_value: entry,
  });

  return entry;
}

export async function updateMilkEntry(
  id: string,
  quantityLitres: number,
  userId: string
): Promise<MilkEntry> {
  // Get old value first for audit
  const { data: oldData, error: fetchError } = await supabase
    .from('milk_entry')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from('milk_entry')
    .update({
      quantity_litres: quantityLitres,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  const entry = data as MilkEntry;

  // Log audit
  await writeAuditLog({
    entity_type: 'MilkEntry',
    entity_id: entry.id,
    user_id: userId,
    action: 'UPDATE',
    old_value: oldData,
    new_value: entry,
  });

  return entry;
}

export async function softDeleteMilkEntry(id: string, userId: string): Promise<void> {
  // Get old value
  const { data: oldData, error: fetchError } = await supabase
    .from('milk_entry')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from('milk_entry')
    .update({
      is_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'MilkEntry',
    entity_id: id,
    user_id: userId,
    action: 'DELETE',
    old_value: oldData,
    new_value: data,
  });
}
