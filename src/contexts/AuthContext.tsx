import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../db/supabase';
import { switchLanguage } from '../i18n';
import type { UserRole, Language } from '../types';

// ─── Session stored in AsyncStorage ────────────────────────────
export interface StoredSession {
  userId: string;
  role: UserRole;
  name: string;
  preferredLanguage: Language;
}

const SESSION_KEY = '@nand_dairy_session';

// ─── Auth Context shape ─────────────────────────────────────────
interface AuthContextValue {
  session: StoredSession | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

export type LoginResult =
  | { success: true; role: UserRole }
  | { success: false; reason: 'wrong_credentials' | 'locked' | 'disabled' | 'error'; message: string };

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        if (raw) {
          const stored = JSON.parse(raw) as StoredSession;
          setSession(stored);
          // Restore saved language
          switchLanguage(stored.preferredLanguage).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phone: string, password: string): Promise<LoginResult> => {
    try {
      const { data, error } = await supabase.rpc('verify_login', {
        p_phone: phone.trim(),
        p_password: password,
      });

      if (error) throw error;

      // RPC returns an array of rows
      const row = Array.isArray(data) ? data[0] : data;

      if (!row || row.auth_status === 'not_found' || row.auth_status === 'wrong_password') {
        return { success: false, reason: 'wrong_credentials', message: 'invalid_credentials' };
      }

      if (row.auth_status === 'locked') {
        return { success: false, reason: 'locked', message: 'account_locked' };
      }

      if (row.auth_status === 'disabled') {
        return { success: false, reason: 'disabled', message: 'account_disabled' };
      }

      // auth_status === 'ok'
      const newSession: StoredSession = {
        userId: row.user_id,
        role: row.user_role as UserRole,
        name: row.user_name,
        preferredLanguage: (row.preferred_language ?? 'en') as Language,
      };

      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      await switchLanguage(newSession.preferredLanguage);
      setSession(newSession);

      return { success: true, role: newSession.role };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, reason: 'error', message: 'network_error' };
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
