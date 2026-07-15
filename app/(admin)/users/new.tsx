import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { createUser } from '../../../src/api/users';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { UserRole, Language } from '../../../src/types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: '🛡️ Admin' },
  { value: 'entry_operator', label: '✏️ Entry Operator' },
  { value: 'testing_user', label: '🧪 Testing User' },
];

export default function NewUserScreen() {
  const { session } = useAuth();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('entry_operator');
  const [language, setLanguage] = useState<Language>('en');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!phone.trim() || !name.trim() || !password) {
      Alert.alert('Validation', 'Phone, Name, and Password are required.');
      return;
    }
    if (phone.trim().length < 10) {
      Alert.alert('Validation', 'Please enter a valid 10-digit phone number.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await createUser({ phone: phone.trim(), name: name.trim(), password, role, preferred_language: language }, session!.userId);
      router.back();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create user.';
      Alert.alert('Error', msg.includes('unique') ? 'Phone number already registered.' : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        <Text style={styles.label}>Phone Number *</Text>
        <TextInput
          style={styles.input}
          placeholder="10-digit mobile number"
          placeholderTextColor="#90a4ae"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
        />

        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Ramesh Kumar"
          placeholderTextColor="#90a4ae"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Password *</Text>
        <TextInput
          style={styles.input}
          placeholder="Min 6 characters"
          placeholderTextColor="#90a4ae"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.label}>Role *</Text>
        <View style={styles.optionGroup}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.optionBtn, role === r.value && styles.optionBtnActive]}
              onPress={() => setRole(r.value)}
            >
              <Text style={[styles.optionText, role === r.value && styles.optionTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Language</Text>
        <View style={styles.langRow}>
          <TouchableOpacity
            style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>🇬🇧 English</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, language === 'hi' && styles.langBtnActive]}
            onPress={() => setLanguage('hi')}
          >
            <Text style={[styles.langBtnText, language === 'hi' && styles.langBtnTextActive]}>🇮🇳 हिन्दी</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>💾  Create User</Text>}
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
  saveBtn: {
    backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnDisabled: { backgroundColor: '#90a4ae' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', marginTop: 12 },
  cancelBtnText: { color: '#90a4ae', fontSize: 14 },
});
