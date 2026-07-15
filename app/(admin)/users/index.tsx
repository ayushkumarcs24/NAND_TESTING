import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { getUsers, deactivateUser, unlockUser } from '../../../src/api/users';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { UserWithoutHash } from '../../../src/api/users';

const ROLE_LABELS: Record<string, string> = {
  admin: '🛡️ Admin',
  entry_operator: '✏️ Entry Operator',
  testing_user: '🧪 Testing User',
};

export default function UsersScreen() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserWithoutHash[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      Alert.alert('Error', 'Failed to load users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search)
  );

  async function handleDeactivate(u: UserWithoutHash) {
    Alert.alert('Deactivate User', `Deactivate ${u.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive',
        onPress: async () => {
          try { await deactivateUser(u.id, session!.userId); load(); }
          catch { Alert.alert('Error', 'Failed to deactivate user.'); }
        },
      },
    ]);
  }

  async function handleUnlock(u: UserWithoutHash) {
    Alert.alert('Unlock Account', `Unlock ${u.name}'s account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlock',
        onPress: async () => {
          try { await unlockUser(u.id, session!.userId); load(); }
          catch { Alert.alert('Error', 'Failed to unlock account.'); }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Search by name or phone..."
          placeholderTextColor="#90a4ae"
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(admin)/users/new')}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(u) => u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyText}>{loading ? 'Loading...' : 'No users found.'}</Text>
          </View>
        }
        renderItem={({ item: u }) => (
          <View style={[styles.card, !u.active && styles.cardInactive]}>
            <View style={styles.cardLeft}>
              <Text style={styles.userName}>{u.name}</Text>
              <Text style={styles.phone}>📞 {u.phone}</Text>
              <Text style={styles.role}>{ROLE_LABELS[u.role] ?? u.role}</Text>
              {u.is_locked && (
                <View style={styles.lockedBadge}>
                  <Text style={styles.lockedText}>🔒 Locked</Text>
                </View>
              )}
              <View style={[styles.badge, u.active ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={styles.badgeText}>{u.active ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push(`/(admin)/users/${u.id}` as never)}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              {u.is_locked && (
                <TouchableOpacity style={styles.unlockBtn} onPress={() => handleUnlock(u)}>
                  <Text style={styles.unlockBtnText}>Unlock</Text>
                </TouchableOpacity>
              )}
              {u.active && !u.is_locked && (
                <TouchableOpacity style={styles.deactivateBtn} onPress={() => handleDeactivate(u)}>
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
  userName: { fontSize: 16, fontWeight: '700', color: '#1a237e' },
  phone: { fontSize: 13, color: '#546e7a', marginTop: 2 },
  role: { fontSize: 12, color: '#78909c', marginTop: 2 },
  lockedBadge: {
    marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#fce4ec',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  lockedText: { fontSize: 11, fontWeight: '700', color: '#c62828' },
  badge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeActive: { backgroundColor: '#e8f5e9' },
  badgeInactive: { backgroundColor: '#fbe9e7' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#37474f' },
  cardActions: { gap: 6 },
  editBtn: { backgroundColor: '#e8eaf6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: '#1a237e', fontWeight: '600', fontSize: 13 },
  unlockBtn: { backgroundColor: '#e8f5e9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  unlockBtnText: { color: '#2e7d32', fontWeight: '600', fontSize: 13 },
  deactivateBtn: { backgroundColor: '#fbe9e7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  deactivateBtnText: { color: '#c62828', fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: '#90a4ae', fontSize: 15, marginTop: 12 },
});
