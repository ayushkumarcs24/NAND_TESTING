import { supabase } from '../db/supabase';
import { writeAuditLog } from './audit';
import type { RateChart, QualityThreshold } from '../types';

// ─── Carry-Forward Lookup Helpers ─────────────────────────────

export async function getQualityThresholdForDate(date: string): Promise<QualityThreshold | null> {
  const { data, error } = await supabase
    .from('quality_threshold')
    .select('*')
    .lte('effective_date', date)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as QualityThreshold | null;
}

export async function getRateChartForDate(date: string): Promise<RateChart[]> {
  // 1. Get the most recent effective date on or before the given date
  const { data: dateData, error: dateError } = await supabase
    .from('rate_chart')
    .select('effective_date')
    .lte('effective_date', date)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dateError) throw dateError;
  if (!dateData) return [];

  // 2. Fetch all bands sharing that effective date
  const { data, error } = await supabase
    .from('rate_chart')
    .select('*')
    .eq('effective_date', dateData.effective_date);

  if (error) throw error;
  return data as RateChart[];
}

// ─── History Helpers ──────────────────────────────────────────

export async function getQualityThresholdHistory(): Promise<QualityThreshold[]> {
  const { data, error } = await supabase
    .from('quality_threshold')
    .select('*')
    .order('effective_date', { ascending: false });

  if (error) throw error;
  return data as QualityThreshold[];
}

export async function getRateChartHistory(): Promise<{ effective_date: string; created_at: string; set_by: string }[]> {
  const { data, error } = await supabase
    .from('rate_chart')
    .select('effective_date, created_at, set_by')
    .order('effective_date', { ascending: false });

  if (error) throw error;

  // De-duplicate in JS by effective_date
  const unique: Record<string, { effective_date: string; created_at: string; set_by: string }> = {};
  for (const row of data || []) {
    if (!unique[row.effective_date]) {
      unique[row.effective_date] = row;
    }
  }
  return Object.values(unique).sort((a, b) => b.effective_date.localeCompare(a.effective_date));
}

// ─── Setters ──────────────────────────────────────────────────

export async function createQualityThreshold(
  payload: Omit<QualityThreshold, 'id' | 'created_at'>
): Promise<QualityThreshold> {
  // Check if threshold already exists for this exact date to replace/update it
  const { data: existing } = await supabase
    .from('quality_threshold')
    .select('*')
    .eq('effective_date', payload.effective_date)
    .maybeSingle();

  if (existing) {
    // Update
    const { data, error } = await supabase
      .from('quality_threshold')
      .update({
        min_fat_pct: payload.min_fat_pct,
        min_snf_pct: payload.min_snf_pct,
        min_lacto_value: payload.min_lacto_value,
        set_by: payload.set_by,
      })
      .eq('effective_date', payload.effective_date)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      entity_type: 'QualityThreshold',
      entity_id: data.id,
      user_id: payload.set_by,
      action: 'UPDATE',
      old_value: existing,
      new_value: data,
    });
    return data as QualityThreshold;
  } else {
    // Insert
    const { data, error } = await supabase
      .from('quality_threshold')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      entity_type: 'QualityThreshold',
      entity_id: data.id,
      user_id: payload.set_by,
      action: 'INSERT',
      old_value: null,
      new_value: data,
    });
    return data as QualityThreshold;
  }
}

export async function createRateChart(
  effectiveDate: string,
  bands: Omit<RateChart, 'id' | 'created_at' | 'effective_date' | 'set_by'>[],
  setBy: string
): Promise<void> {
  // 1. Fetch existing bands for this exact date to log in audit
  const { data: existing } = await supabase
    .from('rate_chart')
    .select('*')
    .eq('effective_date', effectiveDate);

  // 2. Delete existing bands for this date
  await supabase
    .from('rate_chart')
    .delete()
    .eq('effective_date', effectiveDate);

  // 3. Insert new bands
  const rows = bands.map((b) => ({
    effective_date: effectiveDate,
    fat_pct_from: b.fat_pct_from,
    fat_pct_to: b.fat_pct_to,
    snf_pct_from: b.snf_pct_from,
    snf_pct_to: b.snf_pct_to,
    rate_per_litre: b.rate_per_litre,
    set_by: setBy,
  }));

  const { data, error } = await supabase
    .from('rate_chart')
    .insert(rows)
    .select();

  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'RateChart',
    entity_id: '00000000-0000-0000-0000-000000000000', // Date-based snapshot has dummy id
    user_id: setBy,
    action: existing && existing.length > 0 ? 'UPDATE' : 'INSERT',
    old_value: existing,
    new_value: data,
  });
}

// ─── Affected Payments Check ──────────────────────────────────

export async function getAffectedPayments(effectiveDate: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('payment')
    .select(`
      *,
      samiti:samiti_id (code, name)
    `)
    .neq('status', 'draft')
    .gte('period_end', effectiveDate);

  if (error) throw error;
  return data || [];
}
