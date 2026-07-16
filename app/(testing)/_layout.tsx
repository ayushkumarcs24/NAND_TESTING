import { Stack, router } from 'expo-router';
import { useEffect, useCallback } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import LoadingScreen from '../../src/components/LoadingScreen';

export default function TestingLayout() {
  const { session, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && (!session || session.role !== 'testing_user')) {
      router.replace('/');
    }
  }, [session, loading]);

  if (loading) return <LoadingScreen />;

  const handleLogout = async () => {
    router.replace('/');
    await logout();
  };

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#4a148c' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={{ marginRight: 4 }}>
            <Text style={{ color: '#fff', fontSize: 14 }}>Logout</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Milk Testing' }} />
    </Stack>
  );
}
