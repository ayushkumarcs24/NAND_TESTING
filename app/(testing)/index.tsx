import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal, ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getPendingTestingQueue,
  createMilkTest,
  deleteMilkTest,
  PendingTest,
} from '../../src/api/milkTesting';
import LoadingScreen from '../../src/components/LoadingScreen';
import { getRateChartForDate } from '../../src/api/config';
import { useKeyboardNav } from '../../src/hooks/useKeyboardNav';
import { useEditStack } from '../../src/hooks/useEditStack';
import { supabase } from '../../src/db/supabase';
import type { MilkTest } from '../../src/types';

interface TestRowInput {
  pendingTest: PendingTest;
  fatText: string;
  snfText: string;
  lactoText: string;
  status: 'idle' | 'saving' | 'saved' | 'error';
  errorMsg?: string;
}

// Configurable plausible ranges
const LIMITS = {
  MIN_FAT: 1.5,
  MAX_FAT: 12.0,
  MIN_SNF: 5.0,
  MAX_SNF: 15.0,
  MIN_LACTO: 15.0,
  MAX_LACTO: 45.0,
};

export default function MilkTestingScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
 
  const [rows, setRows] = useState<TestRowInput[]>([]);
  const [loading, setLoading] = useState(true);

  // Void Modal State
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidTargetIndex, setVoidTargetIndex] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Hooks for keyboard nav and undo/redo
  // ColCount is 3 (Fat, SNF, Lacto)
  const { registerRef, focusCell, focusNext, focusPrev, focusDown, focusUp } = useKeyboardNav(rows.length, 3);
  const { pushEdit, undo, redo, resetStack, canUndo, canRedo } = useEditStack();

  // Load pending queue from DB
  const loadQueue = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const pending = await getPendingTestingQueue();
      setRows((prevRows) => {
        // Merge pending items to avoid losing active text inputs
        const merged: TestRowInput[] = [];
        for (const item of pending) {
          const existing = prevRows.find((r) => r.pendingTest.milk_entry_id === item.milk_entry_id);
          if (existing) {
            // Keep existing user input values and status
            merged.push({
              ...existing,
              pendingTest: item, // update with latest DB info if any
            });
          } else {
            // Add new pending item
            merged.push({
              pendingTest: item,
              fatText: '',
              snfText: '',
              lactoText: '',
              status: 'idle',
            });
          }
        }
        return merged;
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load pending testing queue.');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadQueue(true);
  }, [loadQueue]);

  // Realtime subscriber for auto-appending new entries
  useEffect(() => {
    const channel = supabase
      .channel('milk_entry_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'milk_entry' },
        () => {
          loadQueue(false);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'milk_entry' },
        () => {
          loadQueue(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadQueue]);

  // Auto-focus row #1 column 0 on load
  useEffect(() => {
    if (rows.length > 0 && loading === false) {
      // Focus first row fat input after rendering
      setTimeout(() => {
        focusCell(0, 0);
      }, 100);
    }
  }, [rows.length, loading, focusCell]);

  // Handle single input edit
  const handleInputChange = (text: string, rowIndex: number, colIndex: number) => {
    setRows((prev) => {
      const copy = [...prev];
      const row = copy[rowIndex];
      if (row) {
        if (colIndex === 0) row.fatText = text;
        else if (colIndex === 1) row.snfText = text;
        else if (colIndex === 2) row.lactoText = text;
        row.status = 'idle';
      }
      return copy;
    });
  };

  // Perform commit/save of the milk test
  const commitTest = async (rowIndex: number, forceSave = false) => {
    const row = rows[rowIndex];
    if (!row || !session) return;

    const fat = parseFloat(row.fatText);
    const snf = parseFloat(row.snfText);
    const lacto = parseFloat(row.lactoText);

    // 1. Hard validation
    if (isNaN(fat) || isNaN(snf) || isNaN(lacto)) {
      updateRowState(rowIndex, { status: 'error', errorMsg: 'All test values are required' });
      return;
    }

    if (fat < 0 || snf < 0 || lacto < 0) {
      updateRowState(rowIndex, { status: 'error', errorMsg: 'Values cannot be negative' });
      return;
    }

    // 2. Soft warnings
    if (!forceSave) {
      const outOfFat = fat < LIMITS.MIN_FAT || fat > LIMITS.MAX_FAT;
      const outOfSnf = snf < LIMITS.MIN_SNF || snf > LIMITS.MAX_SNF;
      const outOfLacto = lacto < LIMITS.MIN_LACTO || lacto > LIMITS.MAX_LACTO;

      if (outOfFat || outOfSnf || outOfLacto) {
        Alert.alert(
          'Out of Range Warning',
          `Some values are outside normal limits:\n` +
          `- Fat (normal: ${LIMITS.MIN_FAT}%-${LIMITS.MAX_FAT}%)\n` +
          `- SNF (normal: ${LIMITS.MIN_SNF}%-${LIMITS.MAX_SNF}%)\n` +
          `- Lacto (normal: ${LIMITS.MIN_LACTO}-${LIMITS.MAX_LACTO})\n\n` +
          `Proceed with saving anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Save', onPress: () => commitTest(rowIndex, true) }
          ]
        );
        return;
      }
    }

    updateRowState(rowIndex, { status: 'saving', errorMsg: undefined });

    try {
      // Validate rate chart band coverage for that date
      const bands = await getRateChartForDate(row.pendingTest.date);
      const matches = bands.some(
        (b) =>
          b.fat_pct_from <= fat &&
          fat <= b.fat_pct_to &&
          b.snf_pct_from <= snf &&
          snf <= b.snf_pct_to
      );

      if (!matches) {
        updateRowState(rowIndex, {
          status: 'error',
          errorMsg: `No rate band covers Fat ${fat}% / SNF ${snf}% for this date.`,
        });
        Alert.alert(
          'Rate Chart Error',
          `No rate band covers Fat ${fat}% / SNF ${snf}% for this date (${row.pendingTest.date}). Please ask the admin to fix the rate chart.`
        );
        return;
      }
      const created = await createMilkTest({
        milk_entry_id: row.pendingTest.milk_entry_id,
        samiti_id: row.pendingTest.samiti_id,
        fat_pct: fat,
        snf_pct: snf,
        lacto_value: lacto,
        tested_by: session.userId,
        is_voided: false,
        voided_reason: null,
        voided_by: null,
        voided_at: null,
      });

      // Log edit record to support Undo/Redo
      pushEdit({
        rowId: created.id, // Keep the MilkTest ID for potential undo deletion
        field: 'MilkTest',
        oldValue: null,
        newValue: created,
      });

      // Remove row from list & auto focus new #1
      setRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
      Alert.alert('Success', `Test saved for ${row.pendingTest.samiti_name}.`);
    } catch (err: any) {
      console.error(err);
      const isUniqueError = err.message?.includes('unique') || err.message?.includes('duplicate');
      updateRowState(rowIndex, {
        status: 'error',
        errorMsg: isUniqueError ? 'This entry has already been tested.' : (err.message || 'Error saving test'),
      });
    }
  };

  // Voiding flow
  const openVoidModal = (index: number) => {
    setVoidTargetIndex(index);
    setVoidReason('');
    setVoidModalVisible(true);
  };

  const submitVoid = async () => {
    if (voidTargetIndex === null || !session) return;
    if (!voidReason.trim()) {
      Alert.alert('Validation', 'Please provide a reason for voiding.');
      return;
    }

    const row = rows[voidTargetIndex];
    setVoiding(true);

    try {
      const created = await createMilkTest({
        milk_entry_id: row.pendingTest.milk_entry_id,
        samiti_id: row.pendingTest.samiti_id,
        fat_pct: 0,
        snf_pct: 0,
        lacto_value: 0,
        tested_by: session.userId,
        is_voided: true,
        voided_reason: voidReason.trim(),
        voided_by: session.userId,
        voided_at: new Date().toISOString(),
      });

      pushEdit({
        rowId: created.id,
        field: 'MilkTest',
        oldValue: null,
        newValue: created,
      });

      setRows((prev) => prev.filter((_, idx) => idx !== voidTargetIndex));
      setVoidModalVisible(false);
      Alert.alert('Voided', 'Sample marked as voided successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to void sample.');
    } finally {
      setVoiding(false);
      setVoidTargetIndex(null);
    }
  };

  // Keyboard navigation Flow
  const handleKeyPress = (e: any, rowIndex: number, colIndex: number) => {
    const key = e.nativeEvent.key;
    if (key === 'ArrowDown') {
      focusDown(rowIndex, colIndex);
    } else if (key === 'ArrowUp') {
      focusUp(rowIndex, colIndex);
    } else if (key === 'Enter') {
      if (colIndex < 2) {
        focusNext(rowIndex, colIndex);
      } else {
        // Last column committed on Enter
        commitTest(rowIndex);
      }
    } else if (key === 'Escape') {
      setRows((prev) => {
        const copy = [...prev];
        const r = copy[rowIndex];
        if (r) {
          r.fatText = '';
          r.snfText = '';
          r.lactoText = '';
          r.status = 'idle';
        }
        return copy;
      });
    }
  };

  // Undo last submitted test
  const handleUndo = async () => {
    const record = undo();
    if (!record) return;

    // Delete the MilkTest row from the DB
    try {
      const test = record.newValue as MilkTest;
      await deleteMilkTest(test.id, session!.userId);
      await loadQueue(false);
      Alert.alert('Undo Complete', 'Last test removed. Entry is back in the queue.');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Undo action failed.');
    }
  };

  // Redo last test
  const handleRedo = async () => {
    const record = redo();
    if (!record) return;

    try {
      const test = record.newValue as MilkTest;
      await createMilkTest({
        milk_entry_id: test.milk_entry_id,
        samiti_id: test.samiti_id,
        fat_pct: test.fat_pct,
        snf_pct: test.snf_pct,
        lacto_value: test.lacto_value,
        tested_by: session!.userId,
        is_voided: test.is_voided,
        voided_reason: test.voided_reason,
        voided_by: test.voided_by,
        voided_at: test.voided_at,
      });
      await loadQueue(false);
      Alert.alert('Redo Complete', 'Test re-applied.');
    } catch {
      Alert.alert('Error', 'Redo action failed.');
    }
  };

  const updateRowState = (index: number, state: Partial<TestRowInput>) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...state };
      return copy;
    });
  };

  if (!session) return <LoadingScreen />;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4a148c" />
        <Text style={styles.loadingText}>Loading FIFO testing queue...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Undo/Redo Header Bar */}
      <View style={styles.topBar}>
        <Text style={styles.queueCount}>📋  Pending samples: {rows.length}</Text>
        <View style={styles.actionsGroup}>
          <TouchableOpacity
            style={[styles.actionBtn, !canUndo && styles.actionBtnDisabled]}
            onPress={handleUndo}
            disabled={!canUndo}
          >
            <Text style={[styles.actionBtnText, !canUndo && styles.actionBtnTextDisabled]}>↩️ Undo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, !canRedo && styles.actionBtnDisabled]}
            onPress={handleRedo}
            disabled={!canRedo}
          >
            <Text style={[styles.actionBtnText, !canRedo && styles.actionBtnTextDisabled]}>↪️ Redo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>🎉  All milk samples have been tested!</Text>
          <Text style={styles.emptySubtext}>Waiting for entry operators to save new entries...</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.pendingTest.milk_entry_id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          renderItem={({ item: r, index }) => (
            <View style={styles.card}>
              {/* Row Header Information */}
              <View style={styles.rowHeader}>
                <View style={styles.leftInfo}>
                  <Text style={styles.samitiCode}>{r.pendingTest.samiti_code}</Text>
                  <Text style={styles.samitiName}>{r.pendingTest.samiti_name}</Text>
                </View>
                <View style={styles.rightInfo}>
                  <Text style={styles.qtyText}>🥛  {r.pendingTest.quantity_litres} L</Text>
                  <Text style={styles.timeText}>
                    ⏳  {new Date(r.pendingTest.entered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>

              {/* Input Spreadsheet Inputs */}
              <View style={styles.inputsRow}>
                <View style={styles.inputCol}>
                  <Text style={styles.inputLabel}>Fat %</Text>
                  <TextInput
                    ref={(el) => registerRef(index, 0, el)}
                    style={[styles.testInput, r.status === 'error' && styles.inputErr]}
                    placeholder="0.0"
                    placeholderTextColor="#b0bec5"
                    value={r.fatText}
                    onChangeText={(t) => handleInputChange(t, index, 0)}
                    onKeyPress={(e) => handleKeyPress(e, index, 0)}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                </View>

                <View style={styles.inputCol}>
                  <Text style={styles.inputLabel}>SNF %</Text>
                  <TextInput
                    ref={(el) => registerRef(index, 1, el)}
                    style={[styles.testInput, r.status === 'error' && styles.inputErr]}
                    placeholder="0.0"
                    placeholderTextColor="#b0bec5"
                    value={r.snfText}
                    onChangeText={(t) => handleInputChange(t, index, 1)}
                    onKeyPress={(e) => handleKeyPress(e, index, 1)}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                </View>

                <View style={styles.inputCol}>
                  <Text style={styles.inputLabel}>Lacto</Text>
                  <TextInput
                    ref={(el) => registerRef(index, 2, el)}
                    style={[styles.testInput, r.status === 'error' && styles.inputErr]}
                    placeholder="30"
                    placeholderTextColor="#b0bec5"
                    value={r.lactoText}
                    onChangeText={(t) => handleInputChange(t, index, 2)}
                    onKeyPress={(e) => handleKeyPress(e, index, 2)}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                </View>
              </View>

              {/* Row Status / Operations */}
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.voidBtn} onPress={() => openVoidModal(index)}>
                  <Text style={styles.voidBtnText}>🚫 Void</Text>
                </TouchableOpacity>

                <View style={styles.saveSection}>
                  {r.status === 'saving' && <ActivityIndicator color="#4a148c" />}
                  {r.status === 'error' && (
                    <TouchableOpacity onPress={() => Alert.alert('Error Info', r.errorMsg || 'Validation error')}>
                      <Text style={styles.errorIndicator}>⚠️ Error</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.commitBtn, r.status === 'saving' && styles.commitBtnDisabled]}
                    onPress={() => commitTest(index)}
                    disabled={r.status === 'saving'}
                  >
                    <Text style={styles.commitBtnText}>✓ Save Test</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Void Modal */}
      <Modal visible={voidModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Void Milk Sample</Text>
            <Text style={styles.modalSubtitle}>Please specify the reason for voiding this sample (e.g. spilled, sour):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for voiding..."
              placeholderTextColor="#90a4ae"
              value={voidReason}
              onChangeText={setVoidReason}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setVoidModalVisible(false)}
                disabled={voiding}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, voiding && styles.modalSubmitDisabled]}
                onPress={submitVoid}
                disabled={voiding}
              >
                {voiding ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitText}>Submit Void</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { color: '#7b1fa2', marginTop: 12, fontSize: 14 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#4a148c', textAlign: 'center', marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: '#7b1fa2', textAlign: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e1bee7' },
  queueCount: { fontSize: 14, fontWeight: '700', color: '#4a148c' },
  actionsGroup: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3e5f5', borderWidth: 1, borderColor: '#e1bee7' },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#4a148c' },
  actionBtnTextDisabled: { color: '#b0bec5' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#4a148c', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f3e5f5', paddingBottom: 10, marginBottom: 12 },
  leftInfo: { gap: 2 },
  samitiCode: { fontSize: 17, fontWeight: '800', color: '#4a148c' },
  samitiName: { fontSize: 13, color: '#7b1fa2' },
  rightInfo: { alignItems: 'flex-end', gap: 2 },
  qtyText: { fontSize: 14, fontWeight: '700', color: '#37474f' },
  timeText: { fontSize: 11, color: '#90a4ae' },
  inputsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  inputCol: { flex: 1 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: '#78909c', marginBottom: 4, paddingLeft: 2 },
  testInput: { height: 44, backgroundColor: '#fcf8fe', borderRadius: 10, borderWidth: 1, borderColor: '#e1bee7', textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#4a148c' },
  inputErr: { borderColor: '#ef5350', backgroundColor: '#ffebee' },
  rowActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voidBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#ffebee' },
  voidBtnText: { color: '#c62828', fontSize: 12, fontWeight: '700' },
  saveSection: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorIndicator: { color: '#c62828', fontSize: 12, fontWeight: '700' },
  commitBtn: { backgroundColor: '#4a148c', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  commitBtnDisabled: { backgroundColor: '#b0bec5' },
  commitBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#4a148c' },
  modalSubtitle: { fontSize: 13, color: '#78909c', lineHeight: 18 },
  modalInput: { backgroundColor: '#f5f7ff', borderRadius: 10, borderWidth: 1, borderColor: '#e3e8f0', padding: 12, height: 80, textAlignVertical: 'top', fontSize: 14, color: '#37474f' },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#f5f7ff' },
  modalCancelText: { color: '#90a4ae', fontWeight: '700' },
  modalSubmit: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#c62828' },
  modalSubmitDisabled: { backgroundColor: '#b0bec5' },
  modalSubmitText: { color: '#fff', fontWeight: '700' },
});
