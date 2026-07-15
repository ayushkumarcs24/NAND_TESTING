import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

interface MenuItem {
  label: string;
  emoji: string;
  description: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Vehicles', emoji: '🚛', description: 'Manage vehicle routes', route: '/(admin)/vehicles' },
  { label: 'Samitis', emoji: '🏘️', description: 'Manage samiti master data', route: '/(admin)/samitis' },
  { label: 'Vehicle–Samiti Map', emoji: '🗺️', description: 'Assign samitis to vehicle routes', route: '/(admin)/mapping' },
  { label: 'Users', emoji: '👥', description: 'Manage operators & testers', route: '/(admin)/users' },
  { label: 'Rate Chart', emoji: '📊', description: 'Define price slabs for Fat/SNF', route: '/(admin)/rate-chart' },
  { label: 'Quality Thresholds', emoji: '🛡️', description: 'Set min Fat/SNF/Lacto requirements', route: '/(admin)/quality-thresholds' },
  { label: 'Reports', emoji: '📈', description: 'View and export collection reports', route: '/(admin)/reports' },
  { label: 'Payments', emoji: '💰', description: 'Generate and lock payment cycles', route: '/(admin)/payments' },
];

export default function AdminDashboard() {
  const { session } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Welcome */}
      <View style={styles.welcome}>
        <Text style={styles.greeting}>Welcome,</Text>
        <Text style={styles.name}>{session?.name ?? 'Admin'} 👋</Text>
        <Text style={styles.role}>Administrator · Nand Dairy</Text>
      </View>

      {/* Menu Grid */}
      <View style={styles.grid}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.card}
            onPress={() => router.push(item.route as never)}
            activeOpacity={0.85}
          >
            <Text style={styles.cardEmoji}>{item.emoji}</Text>
            <Text style={styles.cardLabel}>{item.label}</Text>
            <Text style={styles.cardDesc}>{item.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 20, paddingBottom: 40 },
  welcome: {
    backgroundColor: '#1a237e',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  role: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '47%',
    shadowColor: '#1a237e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardEmoji: { fontSize: 32, marginBottom: 8 },
  cardLabel: { fontSize: 15, fontWeight: '700', color: '#1a237e' },
  cardDesc: { fontSize: 12, color: '#90a4ae', marginTop: 4 },
  comingSoon: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#90a4ae',
  },
  comingSoonTitle: { fontSize: 13, fontWeight: '700', color: '#90a4ae', marginBottom: 8 },
  comingSoonItem: { fontSize: 13, color: '#b0bec5', marginBottom: 4 },
});
