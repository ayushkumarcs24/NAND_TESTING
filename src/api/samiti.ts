import { supabase } from '../db/supabase';
import { writeAuditLog } from './audit';
import type { Samiti } from '../types';

// ─── Samiti API ────────────────────────────────────────────────

export async function getSamitis(activeOnly = false): Promise<Samiti[]> {
  let query = supabase
    .from('samiti')
    .select('*')
    .order('code', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as Samiti[];
}

export async function getSamitiById(id: string): Promise<Samiti> {
  const { data, error } = await supabase
    .from('samiti')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Samiti;
}

export async function getSamitisByDeliveryMode(
  mode: 'vehicle' | 'self',
  activeOnly = true
): Promise<Samiti[]> {
  let query = supabase
    .from('samiti')
    .select('*')
    .eq('delivery_mode', mode)
    .order('code', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as Samiti[];
}

export async function createSamiti(
  payload: {
    code: string;
    name: string;
    village: string;
    dairy_id: string;
    delivery_mode: 'vehicle' | 'self';
  },
  userId: string
): Promise<Samiti> {
  const { data, error } = await supabase
    .from('samiti')
    .insert({ ...payload, active: true })
    .select()
    .single();
  if (error) throw error;

  const samiti = data as Samiti;

  await writeAuditLog({
    entity_type: 'Samiti',
    entity_id: samiti.id,
    user_id: userId,
    action: 'INSERT',
    old_value: null,
    new_value: samiti,
  });

  return samiti;
}

export async function updateSamiti(
  id: string,
  payload: Partial<Pick<Samiti, 'code' | 'name' | 'village' | 'delivery_mode' | 'active'>>,
  userId: string
): Promise<Samiti> {
  // Fetch old data
  const { data: oldData } = await supabase
    .from('samiti')
    .select('*')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('samiti')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const samiti = data as Samiti;

  await writeAuditLog({
    entity_type: 'Samiti',
    entity_id: samiti.id,
    user_id: userId,
    action: 'UPDATE',
    old_value: oldData,
    new_value: samiti,
  });

  return samiti;
}

export async function deactivateSamiti(id: string, userId: string): Promise<void> {
  // Fetch old data
  const { data: oldData } = await supabase
    .from('samiti')
    .select('*')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('samiti')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  await writeAuditLog({
    entity_type: 'Samiti',
    entity_id: id,
    user_id: userId,
    action: 'UPDATE',
    old_value: oldData,
    new_value: data,
  });
}

export async function getDairyId(): Promise<string> {
  const { data, error } = await supabase
    .from('dairy')
    .select('id')
    .limit(1)
    .single();
  if (error) {
    // If no dairy row yet, create one
    const { data: created, error: createErr } = await supabase
      .from('dairy')
      .insert({ name: 'Nand Dairy', address: '' })
      .select('id')
      .single();
    if (createErr) throw createErr;
    return (created as { id: string }).id;
  }
  return (data as { id: string }).id;
}
