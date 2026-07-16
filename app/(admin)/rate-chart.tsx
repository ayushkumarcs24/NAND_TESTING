import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, FlatList, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  createRateChart,
  getRateChartForDate,
  getRateChartHistory,
  getAffectedPayments,
} from '../../src/api/config';
import type { RateChart } from '../../src/types';

interface SlabInput {
  fat_pct_from: string;
  fat_pct_to: string;
  snf_pct_from: string;
  snf_pct_to: string;
  rate_per_litre: string;
}

export default function RateChartScreen() {
  const { session } = useAuth();

  const todayStr = new Date().toISOString().split('T')[0];
  const [effectiveDate, setEffectiveDate] = useState(todayStr);
  const [slabs, setSlabs] = useState<SlabInput[]>([
    { fat_pct_from: '1.5', fat_pct_to: '5.0', snf_pct_from: '5.0', snf_pct_to: '9.0', rate_per_litre: '35.00' },
  ]);

  const [showDatePicker, setShowDatePicker] = useState(false);

  const parseDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date();
  };

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [history, setHistory] = useState<{ effective_date: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const hist = await getRateChartHistory();
      setHistory(hist);

      // Load today's active rate chart slabs
      const activeBands = await getRateChartForDate(todayStr);
      if (activeBands.length > 0) {
        setSlabs(
          activeBands.map((b) => ({
            fat_pct_from: b.fat_pct_from.toString(),
            fat_pct_to: b.fat_pct_to.toString(),
            snf_pct_from: b.snf_pct_from.toString(),
            snf_pct_to: b.snf_pct_to.toString(),
            rate_per_litre: b.rate_per_litre.toFixed(2),
          }))
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => { loadData(); }, [loadData]);

  const addSlab = () => {
    setSlabs((prev) => [
      ...prev,
      { fat_pct_from: '', fat_pct_to: '', snf_pct_from: '', snf_pct_to: '', rate_per_litre: '' },
    ]);
  };

  const removeSlab = (idx: number) => {
    if (slabs.length === 1) {
      Alert.alert('Info', 'At least one slab rate is required.');
      return;
    }
    setSlabs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSlabChange = (text: string, idx: number, field: keyof SlabInput) => {
    setSlabs((prev) => {
      const copy = [...prev];
      copy[idx][field] = text;
      return copy;
    });
  };

  // Check overlaps between slabs
  const validateSlabs = (parsed: Omit<RateChart, 'id' | 'created_at' | 'effective_date' | 'set_by'>[]) => {
    for (let i = 0; i < parsed.length; i++) {
      const a = parsed[i];
      if (a.fat_pct_from > a.fat_pct_to) return `Slab ${i + 1}: Fat From cannot be greater than Fat To.`;
      if (a.snf_pct_from > a.snf_pct_to) return `Slab ${i + 1}: SNF From cannot be greater than SNF To.`;
      if (a.rate_per_litre <= 0) return `Slab ${i + 1}: Rate must be greater than 0.`;

      for (let j = i + 1; j < parsed.length; j++) {
        const b = parsed[j];
        // Slabs overlap if both Fat ranges overlap AND SNF ranges overlap
        const fatOverlap = Math.max(a.fat_pct_from, b.fat_pct_from) < Math.min(a.fat_pct_to, b.fat_pct_to);
        const snfOverlap = Math.max(a.snf_pct_from, b.snf_pct_from) < Math.min(a.snf_pct_to, b.snf_pct_to);
        if (fatOverlap && snfOverlap) {
          return `Overlap detected between Slab ${i + 1} and Slab ${j + 1}.`;
        }
      }
    }
    return null;
  };

  const handleSave = async (force = false) => {
    // Parse slabs
    const parsed: Omit<RateChart, 'id' | 'created_at' | 'effective_date' | 'set_by'>[] = [];
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      const fatF = parseFloat(s.fat_pct_from);
      const fatT = parseFloat(s.fat_pct_to);
      const snfF = parseFloat(s.snf_pct_from);
      const snfT = parseFloat(s.snf_pct_to);
      const rate = parseFloat(s.rate_per_litre);

      if (isNaN(fatF) || isNaN(fatT) || isNaN(snfF) || isNaN(snfT) || isNaN(rate)) {
        Alert.alert('Validation', `All fields in Slab ${i + 1} must be valid numbers.`);
        return;
      }
      parsed.push({
        fat_pct_from: fatF,
        fat_pct_to: fatT,
        snf_pct_from: snfF,
        snf_pct_to: snfT,
        rate_per_litre: rate,
      });
    }

    const overlapError = validateSlabs(parsed);
    if (overlapError) {
      Alert.alert('Validation Error', overlapError);
      return;
    }

    setSaving(true);
    try {
      if (!force) {
        // Check for affected finalized payments
        const affected = await getAffectedPayments(effectiveDate);
        if (affected.length > 0) {
          setSaving(false);
          const list = affected.map((p) => `• ${p.samiti.name} (${p.period_start} to ${p.period_end})`).join('\n');
          Alert.alert(
            '⚠️ Historical Change Warning',
            `This rate chart change will affect the following finalized payments:\n\n${list}\n\nDo you want to proceed?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Yes, Proceed', style: 'destructive', onPress: () => handleSave(true) }
            ]
          );
          return;
        }
      }

      await createRateChart(effectiveDate, parsed, session!.userId);
      Alert.alert('Saved', 'Rate Chart saved successfully.');
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save Rate Chart.');
    } finally {
      setSaving(false);
    }
  };

  const loadPastChart = async (dateStr: string) => {
    setLoading(true);
    try {
      const bands = await getRateChartForDate(dateStr);
      setEffectiveDate(dateStr);
      setSlabs(
        bands.map((b) => ({
          fat_pct_from: b.fat_pct_from.toString(),
          fat_pct_to: b.fat_pct_to.toString(),
          snf_pct_from: b.snf_pct_from.toString(),
          snf_pct_to: b.snf_pct_to.toString(),
          rate_per_litre: b.rate_per_litre.toFixed(2),
        }))
      );
    } catch {
      Alert.alert('Error', 'Failed to load chart.');
    } finally {
      setLoading(false);
    }
  };

  const isFuture = effectiveDate > todayStr;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a237e" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Editor Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rate Chart Slabs Editor</Text>

        <Text style={styles.label}>Effective Date *</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.datePickerBtnText}>{effectiveDate}</Text>
            <Text style={styles.datePickerEmoji}>📅</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={parseDate(effectiveDate)}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) setEffectiveDate(formatDate(selectedDate));
              }}
            />
          )}
          {isFuture && (
            <View style={styles.futureBadge}>
              <Text style={styles.futureText}>Future Date</Text>
            </View>
          )}
        </View>

        {/* Slab Editor Rows */}
        <Text style={[styles.label, { marginTop: 16 }]}>Slab Definitions</Text>
        {slabs.map((slab, idx) => (
          <View key={idx} style={styles.slabRow}>
            <View style={styles.slabInputCol}>
              <Text style={styles.slabInputLabel}>Fat % Range</Text>
              <View style={styles.rangeInputs}>
                <TextInput
                  style={styles.slabInput}
                  placeholder="Min"
                  value={slab.fat_pct_from}
                  onChangeText={(t) => handleSlabChange(t, idx, 'fat_pct_from')}
                  keyboardType="numeric"
                />
                <Text style={styles.rangeDivider}>-</Text>
                <TextInput
                  style={styles.slabInput}
                  placeholder="Max"
                  value={slab.fat_pct_to}
                  onChangeText={(t) => handleSlabChange(t, idx, 'fat_pct_to')}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.slabInputCol}>
              <Text style={styles.slabInputLabel}>SNF % Range</Text>
              <View style={styles.rangeInputs}>
                <TextInput
                  style={styles.slabInput}
                  placeholder="Min"
                  value={slab.snf_pct_from}
                  onChangeText={(t) => handleSlabChange(t, idx, 'snf_pct_from')}
                  keyboardType="numeric"
                />
                <Text style={styles.rangeDivider}>-</Text>
                <TextInput
                  style={styles.slabInput}
                  placeholder="Max"
                  value={slab.snf_pct_to}
                  onChangeText={(t) => handleSlabChange(t, idx, 'snf_pct_to')}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.slabRateCol}>
              <Text style={styles.slabInputLabel}>Rate (₹)</Text>
              <TextInput
                style={styles.slabInput}
                placeholder="Rate"
                value={slab.rate_per_litre}
                onChangeText={(t) => handleSlabChange(t, idx, 'rate_per_litre')}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity style={styles.removeBtn} onPress={() => removeSlab(idx)}>
              <Text style={styles.removeText}>❌</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={addSlab}>
          <Text style={styles.addBtnText}>+ Add Slab Band</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={() => handleSave(false)}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>💾  Save Rate Chart</Text>}
        </TouchableOpacity>
      </View>

      {/* History Snapshots */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rate Chart History</Text>
        <FlatList
          data={history}
          keyExtractor={(item) => item.effective_date}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.emptyHist}>No history records.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.histItem}
              onPress={() => loadPastChart(item.effective_date)}
            >
              <View style={styles.histHeader}>
                <Text style={styles.histDate}>Effective: {item.effective_date}</Text>
                {item.effective_date === todayStr && <Text style={styles.currentLabel}>Active Today</Text>}
              </View>
              <Text style={styles.histDetails}>Tap to load and edit this chart.</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 20, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#1a237e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1a237e', marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#546e7a', marginBottom: 6 },
  input: { flex: 1, backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0' },
  datePickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: '#e3e8f0' },
  datePickerBtnText: { fontSize: 15, color: '#1a237e', fontWeight: '600' },
  datePickerEmoji: { fontSize: 16 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  futureBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  futureText: { color: '#e65100', fontSize: 11, fontWeight: '700' },
  slabRow: { flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f7ff', alignItems: 'flex-end' },
  slabInputCol: { flex: 3 },
  slabRateCol: { flex: 2 },
  slabInputLabel: { fontSize: 10, fontWeight: '600', color: '#78909c', marginBottom: 4 },
  rangeInputs: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slabInput: { backgroundColor: '#f5f7ff', borderRadius: 6, borderWidth: 1, borderColor: '#e3e8f0', height: 38, textAlign: 'center', fontSize: 13, color: '#1a237e', flex: 1, paddingHorizontal: 4 },
  rangeDivider: { color: '#90a4ae', fontWeight: 'bold' },
  removeBtn: { height: 38, width: 30, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 14 },
  addBtn: { backgroundColor: '#e8eaf6', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 14 },
  addBtnText: { color: '#1a237e', fontWeight: '700', fontSize: 13 },
  saveBtn: { backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnDisabled: { backgroundColor: '#90a4ae' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyHist: { color: '#b0bec5', fontSize: 13, textAlign: 'center', marginTop: 10 },
  histItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f7ff' },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  histDate: { fontSize: 14, fontWeight: '700', color: '#37474f' },
  currentLabel: { fontSize: 11, fontWeight: '700', color: '#2e7d32', backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  histDetails: { fontSize: 12, color: '#90a4ae', marginTop: 2 },
});
