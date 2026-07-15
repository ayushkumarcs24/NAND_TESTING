import { useState, useEffect, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { supabase } from '../db/supabase';
import { getPendingSyncOperations, markSynced } from '../db/sqlite';

/**
 * useOfflineSync — monitors network connectivity and syncs the local
 * SQLite queue to Supabase whenever the device goes back online.
 *
 * Returns:
 *   isOnline    — current network status
 *   syncPending — number of items waiting to sync
 *   syncNow()   — manually trigger a sync attempt
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncPending, setSyncPending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!state.isConnected && !!state.isInternetReachable;
      setIsOnline(online);
      if (online) {
        syncNow();
      }
    });
    return () => unsubscribe();
  }, []);

  // Count pending items on mount
  useEffect(() => {
    const pending = getPendingSyncOperations();
    setSyncPending(pending.length);
  }, []);

  const syncNow = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const pending = getPendingSyncOperations();
      setSyncPending(pending.length);

      for (const item of pending) {
        try {
          const tableName = entityTypeToTable(item.entity_type);
          if (!tableName) continue;

          if (item.operation === 'INSERT' || item.operation === 'UPDATE') {
            const { error } = await supabase
              .from(tableName)
              .upsert(item.payload as Record<string, unknown>);
            if (!error) markSynced(item.id);
          } else if (item.operation === 'DELETE') {
            // Soft delete: set is_deleted = true
            const { error } = await supabase
              .from(tableName)
              .update({ is_deleted: true, updated_at: new Date().toISOString() })
              .eq('id', item.entity_id);
            if (!error) markSynced(item.id);
          }
        } catch {
          // Individual item sync failure — leave in queue for next attempt
        }
      }

      const remaining = getPendingSyncOperations();
      setSyncPending(remaining.length);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return { isOnline, syncPending, isSyncing, syncNow };
}

function entityTypeToTable(entityType: string): string | null {
  const map: Record<string, string> = {
    MilkEntry: 'milk_entry',
    MilkTest: 'milk_test',
    Vehicle: 'vehicle',
    Samiti: 'samiti',
    User: 'users',
  };
  return map[entityType] ?? null;
}
