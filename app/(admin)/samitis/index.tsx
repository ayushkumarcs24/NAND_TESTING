import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { getSamitis, deactivateSamiti } from '../../../src/api/samiti';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { Samiti } from '../../../src/types';

export default function SamitisScreen() {
  const { session } = useAuth();
  const [samitis, setSamitis] = useState<Samiti[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getSamitis();
      setSamitis(data);
    } catch {
      Alert.alert('Error', 'Failed to load samitis.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = samitis.filter(
    (s) =>
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.village.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDeactivate(s: Samiti) {
    Alert.alert(
      'Deactivate Samiti',
      `Deactivate ${s.name} (${s.code})? Historical entries remain intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate', style: 'destructive',
          onPress: async () => {
            try { await deactivateSamiti(s.id, session!.userId); load(); }
            catch { Alert.alert('Error', 'Failed to deactivate.'); }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Search by code, name, village..."
          placeholderTextColor="#90a4ae"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(admin)/samitis/new')}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏘️</Text>
            <Text style={styles.emptyText}>{loading ? 'Loading...' : 'No samitis found.'}</Text>
          </View>
        }
        renderItem={({ item: s }) => (
          <View style={[styles.card, !s.active && styles.cardInactive]}>
            <View style={styles.cardLeft}>
              <View style={styles.codeRow}>
                <Text style={styles.code}>{s.code}</Text>
                <View style={[styles.modeBadge, s.delivery_mode === 'vehicle' ? styles.modeVehicle : styles.modeSelf]}>
                  <Text style={styles.modeBadgeText}>
                    {s.delivery_mode === 'vehicle' ? '🚛 Route' : '🚶 Self'}
                  </Text>
                </View>
              </View>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.village}>📍 {s.village}</Text>
              <View style={[styles.badge, s.active ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={styles.badgeText}>{s.active ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push(`/(admin)/samitis/${s.id}` as never)}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              {s.active && (
                <TouchableOpacity style={styles.deactivateBtn} onPress={() => handleDeactivate(s)}>
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
    height: 44, fontSize: 15, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0',
  },
  addBtn: {
    backgroundColor: '#1a237e', borderRadius: 12,
    paddingHorizontal: 18, height: 44, alignItems: 'center', justifyContent: 'center',
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
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  code: { fontSize: 16, fontWeight: '700', color: '#1a237e' },
  modeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  modeVehicle: { backgroundColor: '#e3f2fd' },
  modeSelf: { backgroundColor: '#f3e5f5' },
  modeBadgeText: { fontSize: 11, fontWeight: '600', color: '#37474f' },
  name: { fontSize: 14, color: '#37474f', fontWeight: '500' },
  village: { fontSize: 12, color: '#90a4ae', marginTop: 2 },
  badge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeActive: { backgroundColor: '#e8f5e9' },
  badgeInactive: { backgroundColor: '#fbe9e7' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#37474f' },
  cardActions: { gap: 8 },
  editBtn: { backgroundColor: '#e8eaf6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: '#1a237e', fontWeight: '600', fontSize: 13 },
  deactivateBtn: { backgroundColor: '#fbe9e7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  deactivateBtnText: { color: '#c62828', fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: '#90a4ae', fontSize: 15, marginTop: 12 },
});
