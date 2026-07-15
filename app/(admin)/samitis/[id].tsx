import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getSamitiById, updateSamiti } from '../../../src/api/samiti';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { Samiti } from '../../../src/types';

export default function EditSamitiScreen() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [samiti, setSamiti] = useState<Samiti | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [village, setVillage] = useState('');
  const [mode, setMode] = useState<'vehicle' | 'self'>('vehicle');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getSamitiById(id)
      .then((s) => {
        setSamiti(s);
        setCode(s.code);
        setName(s.name);
        setVillage(s.village);
        setMode(s.delivery_mode);
        setActive(s.active);
      })
      .catch(() => Alert.alert('Error', 'Failed to load samiti.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!code.trim() || !name.trim() || !village.trim()) {
      Alert.alert('Validation', 'Code, Name, and Village are all required.');
      return;
    }
    setSaving(true);
    try {
      await updateSamiti(id!, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        village: village.trim(),
        delivery_mode: mode,
        active,
      }, session!.userId);
      router.back();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update.';
      Alert.alert('Error', msg.includes('unique') ? 'Samiti Code already exists.' : msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#1a237e" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        <Text style={styles.label}>Samiti Code *</Text>
        <TextInput style={styles.input} value={code} onChangeText={setCode} autoCapitalize="characters" />

        <Text style={styles.label}>Samiti Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" />

        <Text style={styles.label}>Village / Location *</Text>
        <TextInput style={styles.input} value={village} onChangeText={setVillage} autoCapitalize="words" />

        <Text style={styles.label}>Delivery Mode *</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'vehicle' && styles.modeBtnActive]}
            onPress={() => setMode('vehicle')}
          >
            <Text style={[styles.modeBtnText, mode === 'vehicle' && styles.modeBtnTextActive]}>🚛 Route</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'self' && styles.modeBtnActive]}
            onPress={() => setMode('self')}
          >
            <Text style={[styles.modeBtnText, mode === 'self' && styles.modeBtnTextActive]}>🚶 Self</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Active</Text>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: '#1a237e', false: '#ccc' }} />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>💾  Update Samiti</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#546e7a', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14,
    height: 48, fontSize: 15, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0',
  },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#f5f7ff', borderWidth: 2, borderColor: '#e3e8f0',
  },
  modeBtnActive: { borderColor: '#1a237e', backgroundColor: '#e8eaf6' },
  modeBtnText: { fontSize: 13, color: '#90a4ae', fontWeight: '600' },
  modeBtnTextActive: { color: '#1a237e' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  saveBtn: {
    backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnDisabled: { backgroundColor: '#90a4ae' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', marginTop: 12 },
  cancelBtnText: { color: '#90a4ae', fontSize: 14 },
});
