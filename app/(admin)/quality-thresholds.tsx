import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  createQualityThreshold,
  getQualityThresholdHistory,
  getQualityThresholdForDate,
  getAffectedPayments,
} from '../../src/api/config';
import type { QualityThreshold } from '../../src/types';

export default function QualityThresholdsScreen() {
  const { session } = useAuth();

  // State
  const todayStr = new Date().toISOString().split('T')[0];
  const [effectiveDate, setEffectiveDate] = useState(todayStr);
  const [minFat, setMinFat] = useState('');
  const [minSnf, setMinSnf] = useState('');
  const [minLacto, setMinLacto] = useState('');

  const [history, setHistory] = useState<QualityThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const hist = await getQualityThresholdHistory();
      setHistory(hist);

      // Pre-fill fields with current effective thresholds if they exist
      const active = await getQualityThresholdForDate(todayStr);
      if (active) {
        setMinFat(active.min_fat_pct.toString());
        setMinSnf(active.min_snf_pct.toString());
        setMinLacto(active.min_lacto_value.toString());
      }
    } catch {
      Alert.alert('Error', 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => { loadData(); }, [loadData]);

  // Save quality thresholds
  const handleSave = async (force = false) => {
    const fat = parseFloat(minFat);
    const snf = parseFloat(minSnf);
    const lacto = parseFloat(minLacto);

    if (isNaN(fat) || isNaN(snf) || isNaN(lacto)) {
      Alert.alert('Validation', 'All threshold fields must be valid numbers.');
      return;
    }

    if (fat < 0 || snf < 0 || lacto < 0) {
      Alert.alert('Validation', 'Thresholds cannot be negative.');
      return;
    }

    if (!effectiveDate.trim()) {
      Alert.alert('Validation', 'Effective date is required.');
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
            `This threshold change will affect the following finalized payments:\n\n${list}\n\nDo you want to proceed?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Yes, Proceed', style: 'destructive', onPress: () => handleSave(true) }
            ]
          );
          return;
        }
      }

      await createQualityThreshold({
        effective_date: effectiveDate,
        min_fat_pct: fat,
        min_snf_pct: snf,
        min_lacto_value: lacto,
        set_by: session!.userId,
      });

      Alert.alert('Saved', 'Quality Threshold saved successfully.');
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save quality thresholds.');
    } finally {
      setSaving(false);
    }
  };

  const isFuture = effectiveDate > todayStr;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a237e" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Configuration Form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Set Quality Thresholds</Text>
        <Text style={styles.helperText}>
          Specify minimum requirements. Milk tests below these limits will be marked "No Payment".
        </Text>

        <Text style={styles.label}>Effective Date (YYYY-MM-DD) *</Text>
        <View style={styles.dateRow}>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#90a4ae"
            value={effectiveDate}
            onChangeText={setEffectiveDate}
          />
          {isFuture && (
            <View style={styles.futureBadge}>
              <Text style={styles.futureText}>Future Date</Text>
            </View>
          )}
        </View>

        <Text style={styles.label}>Min Fat % *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 3.0"
          placeholderTextColor="#90a4ae"
          value={minFat}
          onChangeText={setMinFat}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Min SNF % *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 8.0"
          placeholderTextColor="#90a4ae"
          value={minSnf}
          onChangeText={setMinSnf}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Min Lactometer Value *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 26.0"
          placeholderTextColor="#90a4ae"
          value={minLacto}
          onChangeText={setMinLacto}
          keyboardType="numeric"
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={() => handleSave(false)}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>💾  Save Thresholds</Text>}
        </TouchableOpacity>
      </View>

      {/* History Snapshots */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Threshold History</Text>
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.emptyHist}>No history records.</Text>}
          renderItem={({ item }) => (
            <View style={styles.histItem}>
              <View style={styles.histHeader}>
                <Text style={styles.histDate}>Effective: {item.effective_date}</Text>
                {item.effective_date === todayStr && <Text style={styles.currentLabel}>Active Today</Text>}
              </View>
              <Text style={styles.histDetails}>
                🐄  Min Fat: {item.min_fat_pct}%  |  Min SNF: {item.min_snf_pct}%  |  Min Lacto: {item.min_lacto_value}
              </Text>
            </View>
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
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1a237e', marginBottom: 6 },
  helperText: { fontSize: 12, color: '#90a4ae', lineHeight: 18, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#546e7a', marginBottom: 6, marginTop: 12 },
  input: { flex: 1, backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  futureBadge: { backgroundColor: '#fff3e0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  futureText: { color: '#e65100', fontSize: 11, fontWeight: '700' },
  saveBtn: { backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { backgroundColor: '#90a4ae' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyHist: { color: '#b0bec5', fontSize: 13, textAlign: 'center', marginTop: 10 },
  histItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f7ff' },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  histDate: { fontSize: 14, fontWeight: '700', color: '#37474f' },
  currentLabel: { fontSize: 11, fontWeight: '700', color: '#2e7d32', backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  histDetails: { fontSize: 13, color: '#78909c', marginTop: 4 },
});
