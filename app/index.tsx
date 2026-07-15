import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Alert, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../src/contexts/AuthContext';
import { switchLanguage } from '../src/i18n';
import LoadingScreen from '../src/components/LoadingScreen';

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const { login, session, loading } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const passwordRef = useRef<TextInput>(null);

  // If already logged in, redirect to the correct role screen
  useEffect(() => {
    if (!loading && session) {
      redirectByRole(session.role);
    }
  }, [loading, session]);

  if (loading) return <LoadingScreen />;

  function redirectByRole(role: string) {
    if (role === 'admin') router.replace('/(admin)');
    else if (role === 'entry_operator') router.replace('/(entry)');
    else if (role === 'testing_user') router.replace('/(testing)');
  }

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function handleLogin() {
    if (!phone.trim() || !password) {
      setErrorMsg(t('login.invalidCredentials'));
      shake();
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const result = await login(phone.trim(), password);
    setSubmitting(false);

    if (result.success) {
      redirectByRole(result.role);
    } else {
      shake();
      if (result.reason === 'locked') {
        setErrorMsg(t('login.accountLocked'));
      } else if (result.reason === 'disabled') {
        setErrorMsg(t('login.accountDisabled'));
      } else {
        setErrorMsg(t('login.invalidCredentials'));
      }
    }
  }

  async function handleLanguageToggle() {
    const next = i18n.language === 'en' ? 'hi' : 'en';
    await switchLanguage(next);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />

      {/* Language Toggle */}
      <TouchableOpacity
        style={styles.langToggle}
        onPress={handleLanguageToggle}
        testID="lang-toggle"
      >
        <Text style={styles.langToggleText}>
          {i18n.language === 'en' ? 'हिन्दी' : 'English'}
        </Text>
      </TouchableOpacity>

      <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🐄</Text>
          </View>
          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
        </View>

        {/* Error Message */}
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        ) : null}

        {/* Phone Input */}
        <View style={[styles.inputContainer, errorMsg ? styles.inputError : null]}>
          <Text style={styles.inputIcon}>📞</Text>
          <TextInput
            style={styles.input}
            placeholder={t('login.phonePlaceholder')}
            placeholderTextColor="#90a4ae"
            value={phone}
            onChangeText={(v) => { setPhone(v); setErrorMsg(''); }}
            keyboardType="phone-pad"
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="phone-input"
          />
        </View>

        {/* Password Input */}
        <View style={[styles.inputContainer, errorMsg ? styles.inputError : null]}>
          <Text style={styles.inputIcon}>🔒</Text>
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor="#90a4ae"
            value={password}
            onChangeText={(v) => { setPassword(v); setErrorMsg(''); }}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            testID="password-input"
          />
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.loginButton, submitting && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={submitting}
          testID="login-button"
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.loginButtonText}>{t('login.loginButton')}</Text>
          }
        </TouchableOpacity>

        <Text style={styles.footer}>Nand Dairy © 2026</Text>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1b6e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  langToggle: {
    position: 'absolute',
    top: 56,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  langToggleText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  logoContainer: { alignItems: 'center', marginBottom: 28 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#e8eaf6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoEmoji: { fontSize: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#1a237e', letterSpacing: 0.5 },
  subtitle: { fontSize: 13, color: '#90a4ae', marginTop: 4 },
  errorBanner: {
    backgroundColor: '#fff3e0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#f57c00',
  },
  errorText: { color: '#e65100', fontSize: 13 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f5f7ff', borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#e3e8f0',
  },
  inputError: { borderColor: '#ef5350' },
  inputIcon: { fontSize: 18, marginRight: 10 },
  input: { flex: 1, height: 50, fontSize: 16, color: '#1a237e' },
  loginButton: {
    backgroundColor: '#1a237e', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
    shadowColor: '#1a237e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  loginButtonDisabled: { backgroundColor: '#90a4ae' },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  footer: { textAlign: 'center', color: '#b0bec5', fontSize: 12, marginTop: 24 },
});
