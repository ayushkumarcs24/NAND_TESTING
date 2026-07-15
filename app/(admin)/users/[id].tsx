import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getUserById, updateUser, unlockUser, resetPassword } from '../../../src/api/users';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { UserWithoutHash } from '../../../src/api/users';
import type { UserRole, Language } from '../../../src/types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: '🛡️ Admin' },
  { value: 'entry_operator', label: '✏️ Entry Operator' },
  { value: 'testing_user', label: '🧪 Testing User' },
];

export default function EditUserScreen() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<UserWithoutHash | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('entry_operator');
  const [language, setLanguage] = useState<Language>('en');
  const [active, setActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!id) return;
    getUserById(id)
      .then((u) => {
        setUser(u);
        setName(u.name);
        setRole(u.role as UserRole);
        setLanguage((u.preferred_language ?? 'en') as Language);
        setActive(u.active);
      })
      .catch(() => Alert.alert('Error', 'Failed to load user.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Validation', 'Name is required.'); return; }
    setSaving(true);
    try {
      await updateUser(id!, { name: name.trim(), role, active, preferred_language: language }, session!.userId);
      router.back();
    } catch { Alert.alert('Error', 'Failed to update user.'); }
    finally { setSaving(false); }
  }

  async function handleResetPassword() {
    if (newPassword.length < 6) { Alert.alert('Validation', 'Password must be at least 6 characters.'); return; }
    Alert.alert('Reset Password', `Reset password for ${user?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: async () => {
          setResettingPw(true);
          try {
            await resetPassword(id!, newPassword, session!.userId);
            setNewPassword('');
            Alert.alert('Done', 'Password reset successfully.');
          } catch { Alert.alert('Error', 'Failed to reset password.'); }
          finally { setResettingPw(false); }
        },
      },
    ]);
  }

  async function handleUnlock() {
    setUnlocking(true);
    try {
      await unlockUser(id!, session!.userId);
      setUser((prev) => prev ? { ...prev, is_locked: false, failed_login_attempts: 0 } : prev);
      Alert.alert('Done', 'Account unlocked.');
    } catch { Alert.alert('Error', 'Failed to unlock account.'); }
    finally { setUnlocking(false); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#1a237e" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoPhone}>📞 {user?.phone}</Text>
        {user?.is_locked && (
          <View style={styles.lockedAlert}>
            <Text style={styles.lockedAlertText}>🔒 This account is locked.</Text>
            <TouchableOpacity style={styles.unlockInlineBtn} onPress={handleUnlock} disabled={unlocking}>
              {unlocking ? <ActivityIndicator size="small" color="#2e7d32" /> : <Text style={styles.unlockInlineBtnText}>Unlock Now</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Full Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" />

        <Text style={styles.label}>Role *</Text>
        <View style={styles.optionGroup}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.optionBtn, role === r.value && styles.optionBtnActive]}
              onPress={() => setRole(r.value)}
            >
              <Text style={[styles.optionText, role === r.value && styles.optionTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Language</Text>
        <View style={styles.langRow}>
          {(['en', 'hi'] as Language[]).map((l) => (
            <TouchableOpacity
              key={l}
              style={[styles.langBtn, language === l && styles.langBtnActive]}
              onPress={() => setLanguage(l)}
            >
              <Text style={[styles.langBtnText, language === l && styles.langBtnTextActive]}>
                {l === 'en' ? '🇬🇧 English' : '🇮🇳 हिन्दी'}
              </Text>
            </TouchableOpacity>
          ))}
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
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>💾  Update User</Text>}
        </TouchableOpacity>
      </View>

      {/* Password Reset Section */}
      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Reset Password</Text>
        <Text style={styles.label}>New Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Min 6 characters"
          placeholderTextColor="#90a4ae"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.resetBtn, resettingPw && styles.saveBtnDisabled]}
          onPress={handleResetPassword}
          disabled={resettingPw}
        >
          {resettingPw ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>🔑  Reset Password</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelBtnText}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  infoBanner: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 1,
  },
  infoPhone: { fontSize: 15, fontWeight: '600', color: '#37474f' },
  lockedAlert: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fce4ec', borderRadius: 8, padding: 10, marginTop: 8,
  },
  lockedAlertText: { color: '#c62828', fontWeight: '600', fontSize: 13 },
  unlockInlineBtn: { backgroundColor: '#e8f5e9', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  unlockInlineBtnText: { color: '#2e7d32', fontWeight: '700', fontSize: 12 },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a237e', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#546e7a', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14,
    height: 48, fontSize: 15, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0',
  },
  optionGroup: { gap: 8 },
  optionBtn: {
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: '#f5f7ff', borderWidth: 2, borderColor: '#e3e8f0',
  },
  optionBtnActive: { borderColor: '#1a237e', backgroundColor: '#e8eaf6' },
  optionText: { fontSize: 14, color: '#90a4ae', fontWeight: '600' },
  optionTextActive: { color: '#1a237e' },
  langRow: { flexDirection: 'row', gap: 10 },
  langBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#f5f7ff', borderWidth: 2, borderColor: '#e3e8f0',
  },
  langBtnActive: { borderColor: '#1a237e', backgroundColor: '#e8eaf6' },
  langBtnText: { fontSize: 13, color: '#90a4ae', fontWeight: '600' },
  langBtnTextActive: { color: '#1a237e' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  saveBtn: {
    backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
  },
  resetBtn: {
    backgroundColor: '#37474f', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 12,
  },
  saveBtnDisabled: { backgroundColor: '#90a4ae' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { color: '#90a4ae', fontSize: 14 },
});
