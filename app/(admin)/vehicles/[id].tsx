import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getVehicleById, updateVehicle } from '../../../src/api/vehicle';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { Vehicle } from '../../../src/types';

export default function EditVehicleScreen() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getVehicleById(id)
      .then((v) => {
        setVehicle(v);
        setVehicleNo(v.vehicle_no);
        setDriverName(v.driver_name);
        setActive(v.active);
      })
      .catch(() => Alert.alert('Error', 'Failed to load vehicle.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!vehicleNo.trim() || !driverName.trim()) {
      Alert.alert('Validation', 'Both Vehicle No. and Driver Name are required.');
      return;
    }
    setSaving(true);
    try {
      await updateVehicle(id!, { vehicle_no: vehicleNo.trim(), driver_name: driverName.trim(), active }, session!.userId);
      router.back();
    } catch (e: unknown) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message : String(e);
      Alert.alert('Error', msg.includes('unique') ? 'Vehicle No. already exists.' : msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#1a237e" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        <Text style={styles.label}>Vehicle No. *</Text>
        <TextInput
          style={styles.input}
          value={vehicleNo}
          onChangeText={setVehicleNo}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Driver Name *</Text>
        <TextInput
          style={styles.input}
          value={driverName}
          onChangeText={setDriverName}
          autoCapitalize="words"
        />

        <View style={styles.switchRow}>
          <Text style={styles.label}>Active</Text>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ true: '#1a237e', false: '#ccc' }}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>💾  Update Vehicle</Text>
          }
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
    height: 48, fontSize: 15, color: '#1a237e',
    borderWidth: 1, borderColor: '#e3e8f0',
  },
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
