import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import LoadingScreen from '../../src/components/LoadingScreen';

export default function AdminLayout() {
  const { session, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && (!session || session.role !== 'admin')) {
      router.replace('/');
    }
  }, [session, loading]);

  if (loading) return <LoadingScreen />;
  if (!session || session.role !== 'admin') return null;

  async function handleLogout() {
    await logout();
    router.replace('/');
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a237e' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={{ marginRight: 4 }}>
            <Text style={{ color: '#fff', fontSize: 14 }}>Logout</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Admin Panel' }} />
      <Stack.Screen name="vehicles/index" options={{ title: 'Vehicles' }} />
      <Stack.Screen name="vehicles/new" options={{ title: 'Add Vehicle' }} />
      <Stack.Screen name="vehicles/[id]" options={{ title: 'Edit Vehicle' }} />
      <Stack.Screen name="samitis/index" options={{ title: 'Samitis' }} />
      <Stack.Screen name="samitis/new" options={{ title: 'Add Samiti' }} />
      <Stack.Screen name="samitis/[id]" options={{ title: 'Edit Samiti' }} />
      <Stack.Screen name="mapping/index" options={{ title: 'Vehicle–Samiti Mapping' }} />
      <Stack.Screen name="users/index" options={{ title: 'Users' }} />
      <Stack.Screen name="users/new" options={{ title: 'Add User' }} />
      <Stack.Screen name="users/[id]" options={{ title: 'Edit User' }} />
      <Stack.Screen name="rate-chart" options={{ title: 'Rate Chart Config' }} />
      <Stack.Screen name="quality-thresholds" options={{ title: 'Quality Thresholds' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
      <Stack.Screen name="payments" options={{ title: 'Payments' }} />
    </Stack>
  );
}
