import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { initI18n } from '../src/i18n';
import { initLocalDB } from '../src/db/sqlite';
import { AuthProvider } from '../src/contexts/AuthContext';

export default function RootLayout() {
  useEffect(() => {
    initI18n().catch(console.error);
    initLocalDB();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a237e' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="(entry)" options={{ headerShown: false }} />
        <Stack.Screen name="(testing)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
