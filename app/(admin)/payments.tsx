import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, FlatList, TextInput, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../src/contexts/AuthContext';
import { getSamitis } from '../../src/api/samiti';
import {
  getPaymentsForPeriod,
  createOrUpdatePaymentDraft,
  finalizePayment,
  unlockPayment,
  markPaymentPaid,
  getCalculatedEntries,
  CalculatedEntry,
} from '../../src/api/paymentEngine';
import { writeAuditLog } from '../../src/api/audit';
import type { Payment, Samiti } from '../../src/types';

export default function PaymentsScreen() {
  const { session } = useAuth();

  // Date selection states
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(currentMonth); // "01" - "12"
  const [cycle, setCycle] = useState<'1' | '2' | '3'>('1'); // Cycle 1 (1-10), Cycle 2 (11-20), Cycle 3 (21-End)

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
      setYear(String(date.getFullYear()));
      setMonth(String(date.getMonth() + 1).padStart(2, '0'));
      const day = date.getDate();
      if (day <= 10) setCycle('1');
      else if (day <= 20) setCycle('2');
      else setCycle('3');
    }
  };

  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<(Payment & { samiti?: { code: string; name: string } })[]>([]);
  const [samitis, setSamitis] = useState<Samiti[]>([]);
  const [search, setSearch] = useState('');

  // Load Samitis list for reference
  useEffect(() => {
    getSamitis(true).then(setSamitis).catch(console.error);
  }, []);

  // Compute period start and end dates based on inputs
  const getDates = useCallback(() => {
    const y = parseInt(year);
    const m = parseInt(month);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return { start: '', end: '' };
    }

    const startDay = cycle === '1' ? '01' : cycle === '2' ? '11' : '21';
    let endDay = '10';
    if (cycle === '2') {
      endDay = '20';
    } else if (cycle === '3') {
      // Get last day of the month
      const last = new Date(y, m, 0).getDate();
      endDay = String(last);
    }

    const formattedMonth = String(m).padStart(2, '0');
    return {
      start: `${y}-${formattedMonth}-${startDay}`,
      end: `${y}-${formattedMonth}-${endDay}`,
    };
  }, [year, month, cycle]);

  const loadPayments = useCallback(async () => {
    const { start, end } = getDates();
    if (!start || !end) return;

    setLoading(true);
    try {
      const data = await getPaymentsForPeriod(start, end);
      setPayments(data);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load payments for selected period.');
    } finally {
      setLoading(false);
    }
  }, [getDates]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Generate draft payments for the selected cycle
  const handleGenerateDrafts = async () => {
    const { start, end } = getDates();
    if (!start || !end) {
      Alert.alert('Validation', 'Please enter a valid year and month.');
      return;
    }

    setLoading(true);
    try {
      // Fetch calculated entries
      const entries = await getCalculatedEntries({ startDate: start, endDate: end });
      if (entries.length === 0) {
        setLoading(false);
        Alert.alert('Info', 'No milk entries found for the selected period.');
        return;
      }

      // Group entries by Samiti
      const grouped: Record<string, CalculatedEntry[]> = {};
      for (const e of entries) {
        if (!grouped[e.entry.samiti_id]) {
          grouped[e.entry.samiti_id] = [];
        }
        grouped[e.entry.samiti_id].push(e);
      }

      // Generate drafts
      for (const [samitiId, items] of Object.entries(grouped)) {
        let totalLitres = 0;
        let sumFatLitres = 0;
        let sumSnfLitres = 0;
        let weightedLitres = 0;
        let totalAmount = 0;

        for (const item of items) {
          totalLitres += item.entry.quantity_litres;
          if (item.status === 'ok') {
            totalAmount += item.amount;
          }
          if (item.test && !item.test.is_voided) {
            sumFatLitres += item.test.fat_pct * item.entry.quantity_litres;
            sumSnfLitres += item.test.snf_pct * item.entry.quantity_litres;
            weightedLitres += item.entry.quantity_litres;
          }
        }

        const avgFat = weightedLitres > 0 ? sumFatLitres / weightedLitres : 0;
        const avgSnf = weightedLitres > 0 ? sumSnfLitres / weightedLitres : 0;
        const rateApplied = totalLitres > 0 ? totalAmount / totalLitres : 0;

        await createOrUpdatePaymentDraft({
          samiti_id: samitiId,
          period_start: start,
          period_end: end,
          total_litres: totalLitres,
          avg_fat: avgFat,
          avg_snf: avgSnf,
          rate_applied: rateApplied,
          total_amount: totalAmount,
        });
      }

      Alert.alert('Success', 'Draft payments calculated successfully.');
      loadPayments();
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e.message || 'Failed to generate drafts.');
    } finally {
      setLoading(false);
    }
  };

  // Finalize payment check and action
  const handleFinalize = async (payment: Payment & { samiti?: { name: string } }) => {
    setLoading(true);
    try {
      // 1. Get entries for this samiti in period to check for pending tests
      const entries = await getCalculatedEntries({
        startDate: payment.period_start,
        endDate: payment.period_end,
        samitiId: payment.samiti_id,
      });

      const pending = entries.filter((e) => e.status === 'pending');

      if (pending.length > 0) {
        setLoading(false);
        const list = pending.map((e) => `• Date: ${e.entry.date} | Shift: ${e.entry.shift} | ${e.entry.quantity_litres}L`).join('\n');
        
        Alert.alert(
          'Untested Entries Found',
          `Cannot finalize payment. The following entries are untested:\n\n${list}\n\nDo you want to override and finalize anyway? (This override will be logged in audit).`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Override & Finalize',
              style: 'destructive',
              onPress: async () => {
                setLoading(true);
                try {
                  // Log override audit
                  await writeAuditLog({
                    entity_type: 'Payment',
                    entity_id: payment.id,
                    user_id: session!.userId,
                    action: 'UPDATE',
                    old_value: { status: 'draft' },
                    new_value: { status: 'finalized', override: true, untested_count: pending.length },
                  });
                  await finalizePayment(payment.id);
                  loadPayments();
                  Alert.alert('Finalized', 'Payment finalized successfully via admin override.');
                } catch {
                  Alert.alert('Error', 'Failed to finalize.');
                } finally {
                  setLoading(false);
                }
              },
            },
          ]
        );
        return;
      }

      await finalizePayment(payment.id);
      Alert.alert('Finalized', 'Payment cycle locked and finalized.');
      loadPayments();
    } catch {
      Alert.alert('Error', 'Failed to finalize payment.');
    } finally {
      setLoading(false);
    }
  };

  // Unlock payment back to draft
  const handleUnlock = async (paymentId: string) => {
    Alert.alert('Unlock Payment', 'Revert status to Draft for recalculation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlock',
        onPress: async () => {
          setLoading(true);
          try {
            await unlockPayment(paymentId);
            loadPayments();
          } catch {
            Alert.alert('Error', 'Failed to unlock.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  // Mark payment as paid
  const handleMarkPaid = async (paymentId: string) => {
    Alert.alert('Mark Paid', 'Mark this payment as fully paid?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Paid',
        onPress: async () => {
          setLoading(true);
          try {
            await markPaymentPaid(paymentId);
            loadPayments();
          } catch {
            Alert.alert('Error', 'Failed to mark paid.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const filtered = payments.filter(
    (p) =>
      p.samiti?.code.toLowerCase().includes(search.toLowerCase()) ||
      p.samiti?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Date / Cycle Selector */}
      <View style={styles.header}>
        <View style={styles.filterRow}>
          <View style={{ flex: 4 }}>
            <Text style={styles.label}>Select Month / Date</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.datePickerBtnText}>
                {year}-{month} (Cycle #{cycle})
              </Text>
              <Text style={styles.datePickerEmoji}>📅</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}
          </View>
          <View style={{ flex: 3 }}>
            <Text style={styles.label}>Cycle Quick Toggle</Text>
            <View style={styles.cycleRow}>
              {['1', '2', '3'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cycleBtn, cycle === c && styles.cycleBtnActive]}
                  onPress={() => setCycle(c as any)}
                >
                  <Text style={[styles.cycleBtnText, cycle === c && styles.cycleBtnTextActive]}>#{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateDrafts}>
          <Text style={styles.generateBtnText}>⚙️  Generate Draft Payments</Text>
        </TouchableOpacity>
      </View>

      {/* Search and list */}
      <View style={styles.listWrapper}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍  Search by Samiti..."
            placeholderTextColor="#90a4ae"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#1a237e" /></View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No payments calculated for this cycle.</Text>
              </View>
            }
            renderItem={({ item: p }) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.samitiLabel}>{p.samiti?.code} - {p.samiti?.name}</Text>
                    <Text style={styles.statsLabel}>
                      🥛 {p.total_litres.toFixed(1)}L  |  Fat {p.avg_fat.toFixed(2)}%  |  SNF {p.avg_snf.toFixed(2)}%
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    p.status === 'draft' && styles.badgeDraft,
                    p.status === 'finalized' && styles.badgeFinalized,
                    p.status === 'paid' && styles.badgePaid,
                  ]}>
                    <Text style={styles.statusText}>{p.status.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={styles.cardBottom}>
                  <Text style={styles.amountText}>₹{p.total_amount.toFixed(2)}</Text>
                  <View style={styles.actionsRow}>
                    {p.status === 'draft' && (
                      <TouchableOpacity style={styles.actionBtnFinalize} onPress={() => handleFinalize(p)}>
                        <Text style={styles.actionTextWhite}>🔒 Finalize</Text>
                      </TouchableOpacity>
                    )}
                    {p.status === 'finalized' && (
                      <>
                        <TouchableOpacity style={styles.actionBtnUnlock} onPress={() => handleUnlock(p.id)}>
                          <Text style={styles.actionTextBlue}>↩️ Unlock</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtnPaid} onPress={() => handleMarkPaid(p.id)}>
                          <Text style={styles.actionTextWhite}>💰 Paid</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#90a4ae', textAlign: 'center', fontSize: 14 },
  header: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e3e8f0', gap: 12 },
  filterRow: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 11, fontWeight: '600', color: '#78909c', marginBottom: 6 },
  input: { backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 12, height: 42, fontSize: 14, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0', textAlign: 'center' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: '#e3e8f0' },
  datePickerBtnText: { fontSize: 13, color: '#1a237e', fontWeight: '600' },
  datePickerEmoji: { fontSize: 16 },
  cycleRow: { flexDirection: 'row', gap: 4 },
  cycleBtn: { flex: 1, height: 42, backgroundColor: '#f5f7ff', borderRadius: 10, borderColor: '#e3e8f0', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cycleBtnActive: { backgroundColor: '#e8eaf6', borderColor: '#1a237e' },
  cycleBtnText: { fontSize: 13, color: '#546e7a', fontWeight: '700' },
  cycleBtnTextActive: { color: '#1a237e' },
  generateBtn: { backgroundColor: '#1a237e', borderRadius: 12, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  listWrapper: { flex: 1 },
  searchRow: { padding: 16, paddingBottom: 0 },
  searchInput: { height: 42, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, fontSize: 14, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, gap: 12, shadowColor: '#1a237e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  samitiLabel: { fontSize: 14, fontWeight: '700', color: '#37474f' },
  statsLabel: { fontSize: 12, color: '#78909c', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeDraft: { backgroundColor: '#eceff1' },
  badgeFinalized: { backgroundColor: '#fff3e0' },
  badgePaid: { backgroundColor: '#e8f5e9' },
  statusText: { fontSize: 10, fontWeight: '800', color: '#37474f' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f5f7ff', paddingTop: 10 },
  amountText: { fontSize: 18, fontWeight: '800', color: '#2e7d32' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtnFinalize: { backgroundColor: '#1a237e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionBtnUnlock: { backgroundColor: '#eceff1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionBtnPaid: { backgroundColor: '#2e7d32', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionTextWhite: { color: '#fff', fontSize: 12, fontWeight: '700' },
  actionTextBlue: { color: '#1a237e', fontSize: 12, fontWeight: '700' },
});
