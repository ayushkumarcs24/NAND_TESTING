import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { getVehicles } from '../../../src/api/vehicle';
import { getSamitis } from '../../../src/api/samiti';
import { getMappedSamitiIds, setVehicleSamitis } from '../../../src/api/vehicleSamitiMap';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { Vehicle, Samiti } from '../../../src/types';

export default function MappingScreen() {
  const { session } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [samitis, setSamitis] = useState<Samiti[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [mappedIds, setMappedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMasterData = useCallback(async () => {
    try {
      const [v, s] = await Promise.all([
        getVehicles(true),
        getSamitis(true),
      ]);
      setVehicles(v);
      // Only show vehicle-mode samitis for mapping
      setSamitis(s.filter((x) => x.delivery_mode === 'vehicle'));
    } catch {
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMasterData(); }, [loadMasterData]);

  async function selectVehicle(v: Vehicle) {
    setSelectedVehicle(v);
    try {
      const ids = await getMappedSamitiIds(v.id);
      setMappedIds(new Set(ids));
    } catch {
      Alert.alert('Error', 'Failed to load vehicle mappings.');
    }
  }

  function toggleSamiti(samitiId: string) {
    setMappedIds((prev) => {
      const next = new Set(prev);
      if (next.has(samitiId)) next.delete(samitiId);
      else next.add(samitiId);
      return next;
    });
  }

  async function handleSave() {
    if (!selectedVehicle) return;
    setSaving(true);
    try {
      await setVehicleSamitis(selectedVehicle.id, Array.from(mappedIds), session!.userId);
      Alert.alert('Saved', `Route updated for ${selectedVehicle.vehicle_no}.`);
    } catch {
      Alert.alert('Error', 'Failed to save mapping.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a237e" /></View>;

  return (
    <View style={styles.container}>
      {/* Vehicle selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Select Vehicle</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vehicleRow}>
          {vehicles.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[styles.vehicleChip, selectedVehicle?.id === v.id && styles.vehicleChipActive]}
              onPress={() => selectVehicle(v)}
            >
              <Text style={[styles.vehicleChipText, selectedVehicle?.id === v.id && styles.vehicleChipTextActive]}>
                🚛 {v.vehicle_no}
              </Text>
              <Text style={styles.vehicleChipDriver}>{v.driver_name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Samiti checkboxes */}
      {selectedVehicle ? (
        <View style={styles.samitiSection}>
          <Text style={styles.sectionTitle}>
            2. Assign Samitis to {selectedVehicle.vehicle_no} ({mappedIds.size} selected)
          </Text>
          <FlatList
            data={samitis}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            renderItem={({ item: s }) => {
              const checked = mappedIds.has(s.id);
              return (
                <TouchableOpacity
                  style={[styles.samitiRow, checked && styles.samitiRowChecked]}
                  onPress={() => toggleSamiti(s.id)}
                >
                  <Text style={styles.checkBox}>{checked ? '☑️' : '⬜'}</Text>
                  <View style={styles.samitiInfo}>
                    <Text style={styles.samitiCode}>{s.code}</Text>
                    <Text style={styles.samitiName}>{s.name} · {s.village}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          <View style={styles.saveBar}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>💾  Save Route</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={styles.emptyText}>Select a vehicle above to assign its Samiti route.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { backgroundColor: '#fff', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e8eaf6' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#546e7a', paddingHorizontal: 16, marginBottom: 10 },
  vehicleRow: { paddingHorizontal: 16, gap: 10 },
  vehicleChip: {
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#f0f4ff', borderWidth: 2, borderColor: '#e3e8f0', minWidth: 120,
  },
  vehicleChipActive: { borderColor: '#1a237e', backgroundColor: '#e8eaf6' },
  vehicleChipText: { fontSize: 13, fontWeight: '700', color: '#90a4ae' },
  vehicleChipTextActive: { color: '#1a237e' },
  vehicleChipDriver: { fontSize: 11, color: '#b0bec5', marginTop: 2 },
  samitiSection: { flex: 1 },
  samitiRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8, gap: 12,
    borderWidth: 2, borderColor: 'transparent',
  },
  samitiRowChecked: { borderColor: '#1a237e', backgroundColor: '#f0f4ff' },
  checkBox: { fontSize: 20 },
  samitiInfo: { flex: 1 },
  samitiCode: { fontSize: 14, fontWeight: '700', color: '#1a237e' },
  samitiName: { fontSize: 12, color: '#90a4ae', marginTop: 2 },
  saveBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e8eaf6',
  },
  saveBtn: {
    backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 15, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#90a4ae' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 56 },
  emptyText: { color: '#90a4ae', fontSize: 15, marginTop: 16, textAlign: 'center', paddingHorizontal: 40 },
});
