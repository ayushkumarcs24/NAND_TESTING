import { supabase } from '../db/supabase';
import { writeAuditLog } from './audit';
import type { MilkTest } from '../types';

export interface PendingTest {
  milk_entry_id: string;
  date: string;
  shift: 'morning' | 'evening';
  quantity_litres: number;
  entered_at: string;
  samiti_id: string;
  samiti_code: string;
  samiti_name: string;
}

export async function getPendingTestingQueue(): Promise<PendingTest[]> {
  const { data, error } = await supabase
    .from('pending_testing_queue')
    .select('*')
    .order('entered_at', { ascending: true });

  if (error) throw error;
  return data as PendingTest[];
}

export async function createMilkTest(
  payload: Omit<MilkTest, 'id' | 'created_at'>
): Promise<MilkTest> {
  const { data, error } = await supabase
    .from('milk_test')
    .insert({
      milk_entry_id: payload.milk_entry_id,
      samiti_id: payload.samiti_id,
      fat_pct: payload.fat_pct,
      snf_pct: payload.snf_pct,
      lacto_value: payload.lacto_value,
      tested_by: payload.tested_by,
      is_voided: payload.is_voided,
      voided_reason: payload.voided_reason,
      voided_by: payload.voided_by,
      voided_at: payload.voided_at,
    })
    .select()
    .single();

  if (error) throw error;

  const test = data as MilkTest;

  // Log audit
  await writeAuditLog({
    entity_type: 'MilkTest',
    entity_id: test.id,
    user_id: payload.tested_by,
    action: 'INSERT',
    old_value: null,
    new_value: test,
  });

  return test;
}

export async function deleteMilkTest(id: string, userId: string): Promise<void> {
  // Get old value
  const { data: oldData, error: fetchError } = await supabase
    .from('milk_test')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('milk_test')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'MilkTest',
    entity_id: id,
    user_id: userId,
    action: 'DELETE',
    old_value: oldData,
    new_value: null,
  });
}
