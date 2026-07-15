import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { getVehicles, deactivateVehicle } from '../../../src/api/vehicle';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { Vehicle } from '../../../src/types';

export default function VehiclesScreen() {
  const { session } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getVehicles();
      setVehicles(data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load vehicles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = vehicles.filter(
    (v) =>
      v.vehicle_no.toLowerCase().includes(search.toLowerCase()) ||
      v.driver_name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDeactivate(v: Vehicle) {
    Alert.alert(
      'Deactivate Vehicle',
      `Deactivate ${v.vehicle_no} (${v.driver_name})? Historical entries remain intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await deactivateVehicle(v.id, session!.userId);
              load();
            } catch {
              Alert.alert('Error', 'Failed to deactivate vehicle.');
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Search vehicles..."
          placeholderTextColor="#90a4ae"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/(admin)/vehicles/new')}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(v) => v.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🚛</Text>
            <Text style={styles.emptyText}>{loading ? 'Loading...' : 'No vehicles found.'}</Text>
          </View>
        }
        renderItem={({ item: v }) => (
          <View style={[styles.card, !v.active && styles.cardInactive]}>
            <View style={styles.cardLeft}>
              <Text style={styles.vehicleNo}>{v.vehicle_no}</Text>
              <Text style={styles.driverName}>Driver: {v.driver_name}</Text>
              <View style={[styles.badge, v.active ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={styles.badgeText}>{v.active ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push(`/(admin)/vehicles/${v.id}` as never)}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              {v.active && (
                <TouchableOpacity
                  style={styles.deactivateBtn}
                  onPress={() => handleDeactivate(v)}
                >
                  <Text style={styles.deactivateBtnText}>Deactivate</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  searchRow: { flexDirection: 'row', padding: 16, gap: 10, alignItems: 'center' },
  searchInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    height: 44, fontSize: 15, color: '#1a237e',
    borderWidth: 1, borderColor: '#e3e8f0',
  },
  addBtn: {
    backgroundColor: '#1a237e', borderRadius: 12,
    paddingHorizontal: 18, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#1a237e', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardInactive: { opacity: 0.55 },
  cardLeft: { flex: 1 },
  vehicleNo: { fontSize: 17, fontWeight: '700', color: '#1a237e' },
  driverName: { fontSize: 13, color: '#546e7a', marginTop: 2 },
  badge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeActive: { backgroundColor: '#e8f5e9' },
  badgeInactive: { backgroundColor: '#fbe9e7' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#37474f' },
  cardActions: { gap: 8 },
  editBtn: {
    backgroundColor: '#e8eaf6', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  editBtnText: { color: '#1a237e', fontWeight: '600', fontSize: 13 },
  deactivateBtn: {
    backgroundColor: '#fbe9e7', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  deactivateBtnText: { color: '#c62828', fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: '#90a4ae', fontSize: 15, marginTop: 12 },
});
