import { supabase } from '../db/supabase';
import { getQualityThresholdForDate, getRateChartForDate } from './config';
import type { MilkEntry, MilkTest, Payment } from '../types';

export interface CalculatedEntry {
  entry: MilkEntry & { samiti?: { code: string; name: string } };
  test: MilkTest | null;
  rate: number;
  amount: number;
  status: 'ok' | 'no_payment' | 'pending';
  reason?: string;
}

export function calculateSingleEntry(
  entry: MilkEntry & { samiti?: { code: string; name: string } },
  test: MilkTest | null,
  threshold: any,
  rateBands: any[]
): CalculatedEntry {
  if (!test) {
    return { entry, test, rate: 0, amount: 0, status: 'pending', reason: 'untested' };
  }

  if (test.is_voided) {
    return { entry, test, rate: 0, amount: 0, status: 'no_payment', reason: 'voided' };
  }

  // Check quality thresholds
  if (threshold) {
    const fatFail = test.fat_pct < threshold.min_fat_pct;
    const snfFail = test.snf_pct < threshold.min_snf_pct;
    const lactoFail = test.lacto_value < threshold.min_lacto_value;

    if (fatFail || snfFail || lactoFail) {
      const reasons: string[] = [];
      if (fatFail) reasons.push(`Fat < ${threshold.min_fat_pct}%`);
      if (snfFail) reasons.push(`SNF < ${threshold.min_snf_pct}%`);
      if (lactoFail) reasons.push(`Lacto < ${threshold.min_lacto_value}`);

      return {
        entry,
        test,
        rate: 0,
        amount: 0,
        status: 'no_payment',
        reason: reasons.join(', '),
      };
    }
  }

  // Find matching band in rate chart
  const band = rateBands.find(
    (b) =>
      b.fat_pct_from <= test.fat_pct &&
      test.fat_pct <= b.fat_pct_to &&
      b.snf_pct_from <= test.snf_pct &&
      test.snf_pct <= b.snf_pct_to
  );

  if (!band) {
    return {
      entry,
      test,
      rate: 0,
      amount: 0,
      status: 'no_payment',
      reason: 'No matching rate band',
    };
  }

  const rate = band.rate_per_litre;
  const amount = Math.round((entry.quantity_litres * rate + Number.EPSILON) * 100) / 100;

  return {
    entry,
    test,
    rate,
    amount,
    status: 'ok',
  };
}

export async function getCalculatedEntries(params: {
  startDate: string;
  endDate: string;
  samitiId?: string;
}): Promise<CalculatedEntry[]> {
  // 1. Fetch milk entries
  let query = supabase
    .from('milk_entry')
    .select('*, samiti:samiti_id (code, name)')
    .eq('is_deleted', false)
    .gte('date', params.startDate)
    .lte('date', params.endDate);

  if (params.samitiId) {
    query = query.eq('samiti_id', params.samitiId);
  }

  const { data: entries, error: entriesError } = await query;
  if (entriesError) throw entriesError;

  if (!entries || entries.length === 0) return [];

  // 2. Fetch all milk tests for these entries
  const entryIds = entries.map((e) => e.id);
  const { data: tests, error: testsError } = await supabase
    .from('milk_test')
    .select('*')
    .in('milk_entry_id', entryIds);

  if (testsError) throw testsError;

  // 3. Resolve configs per date
  const uniqueDates = Array.from(new Set(entries.map((e) => e.date)));
  const thresholdCache: Record<string, any> = {};
  const rateChartCache: Record<string, any[]> = {};

  for (const d of uniqueDates) {
    thresholdCache[d] = await getQualityThresholdForDate(d);
    rateChartCache[d] = await getRateChartForDate(d);
  }

  // 4. Calculate each entry
  return entries.map((entry) => {
    const test = tests.find((t) => t.milk_entry_id === entry.id) || null;
    const threshold = thresholdCache[entry.date] || null;
    const rateBands = rateChartCache[entry.date] || [];
    return calculateSingleEntry(entry, test, threshold, rateBands);
  });
}

// ─── Payment Cycle Database Operations ────────────────────────

export async function getPaymentsForPeriod(
  start: string,
  end: string
): Promise<(Payment & { samiti?: { code: string; name: string } })[]> {
  const { data, error } = await supabase
    .from('payment')
    .select('*, samiti:samiti_id (code, name)')
    .eq('period_start', start)
    .eq('period_end', end);

  if (error) throw error;
  return data as any[];
}

export async function createOrUpdatePaymentDraft(payload: {
  samiti_id: string;
  period_start: string;
  period_end: string;
  total_litres: number;
  avg_fat: number;
  avg_snf: number;
  rate_applied: number;
  total_amount: number;
}): Promise<Payment> {
  const { data: existing } = await supabase
    .from('payment')
    .select('*')
    .eq('samiti_id', payload.samiti_id)
    .eq('period_start', payload.period_start)
    .eq('period_end', payload.period_end)
    .maybeSingle();

  if (existing) {
    if (existing.status !== 'draft') {
      throw new Error('Cannot update a finalized or paid payment.');
    }
    const { data, error } = await supabase
      .from('payment')
      .update({
        total_litres: payload.total_litres,
        avg_fat: payload.avg_fat,
        avg_snf: payload.avg_snf,
        rate_applied: payload.rate_applied,
        total_amount: payload.total_amount,
        generated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data as Payment;
  } else {
    const { data, error } = await supabase
      .from('payment')
      .insert({
        ...payload,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    return data as Payment;
  }
}

export async function finalizePayment(id: string): Promise<void> {
  const { error } = await supabase
    .from('payment')
    .update({ status: 'finalized' })
    .eq('id', id);

  if (error) throw error;
}

export async function unlockPayment(id: string): Promise<void> {
  const { error } = await supabase
    .from('payment')
    .update({ status: 'draft' })
    .eq('id', id);

  if (error) throw error;
}

export async function markPaymentPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('payment')
    .update({ status: 'paid' })
    .eq('id', id);

  if (error) throw error;
}

export async function isDateLockedForSamiti(date: string, samitiId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('payment')
    .select('id')
    .eq('samiti_id', samitiId)
    .lte('period_start', date)
    .gte('period_end', date)
    .neq('status', 'draft')
    .maybeSingle();

  if (error) throw error;
  return !!data;
}
