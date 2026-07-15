import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { createVehicle } from '../../../src/api/vehicle';
import { useAuth } from '../../../src/contexts/AuthContext';

export default function NewVehicleScreen() {
  const { session } = useAuth();
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!vehicleNo.trim() || !driverName.trim()) {
      Alert.alert('Validation', 'Both Vehicle No. and Driver Name are required.');
      return;
    }
    setSaving(true);
    try {
      await createVehicle({ vehicle_no: vehicleNo.trim(), driver_name: driverName.trim() }, session!.userId);
      router.back();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save vehicle.';
      Alert.alert('Error', msg.includes('unique') ? 'Vehicle No. already exists.' : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        <Text style={styles.label}>Vehicle No. *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. MH-12-AB-1234"
          placeholderTextColor="#90a4ae"
          value={vehicleNo}
          onChangeText={setVehicleNo}
          autoCapitalize="characters"
          testID="vehicle-no-input"
        />

        <Text style={styles.label}>Driver Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Ramesh Kumar"
          placeholderTextColor="#90a4ae"
          value={driverName}
          onChangeText={setDriverName}
          autoCapitalize="words"
          testID="driver-name-input"
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>💾  Save Vehicle</Text>
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
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#546e7a', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14,
    height: 48, fontSize: 15, color: '#1a237e',
    borderWidth: 1, borderColor: '#e3e8f0',
  },
  saveBtn: {
    backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnDisabled: { backgroundColor: '#90a4ae' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', marginTop: 12 },
  cancelBtnText: { color: '#90a4ae', fontSize: 14 },
});
