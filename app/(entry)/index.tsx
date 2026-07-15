import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/AuthContext';
import { getVehicles } from '../../src/api/vehicle';
import { getSamitis } from '../../src/api/samiti';
import { getSamitisForVehicle } from '../../src/api/vehicleSamitiMap';
import {
  getMilkEntries,
  getExistingSamitiEntry,
  createMilkEntry,
  updateMilkEntry,
  softDeleteMilkEntry,
} from '../../src/api/milkEntry';
import { useKeyboardNav } from '../../src/hooks/useKeyboardNav';
import { useEditStack } from '../../src/hooks/useEditStack';
import { isDateLockedForSamiti } from '../../src/api/paymentEngine';
import type { Vehicle, Samiti, MilkEntry } from '../../src/types';

interface GridRow {
  samiti: Samiti;
  qtyText: string;
  savedQty: number | null;
  entry: MilkEntry | null;
  status: 'idle' | 'saving' | 'saved' | 'error';
  errorMsg?: string;
}

export default function MilkEntryScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();

  // Session Controls (locked to today)
  const todayStr = new Date().toISOString().split('T')[0];
  const [date] = useState(todayStr); // Locked date
  const [shift, setShift] = useState<'morning' | 'evening'>('morning');
  const [mode, setMode] = useState<'vehicle' | 'self'>('vehicle');

  // Master Data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [allSamitis, setAllSamitis] = useState<Samiti[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Autocomplete / Search States
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [samitiSearch, setSamitiSearch] = useState('');
  const [showSamitiDropdown, setShowSamitiDropdown] = useState(false);

  // Grid Data
  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);

  // Hooks for keyboard nav and undo/redo
  const { registerRef, focusCell, focusDown, focusUp } = useKeyboardNav(gridRows.length, 1);
  const { pushEdit, undo, redo, resetStack, canUndo, canRedo } = useEditStack();

  // Load vehicles and samitis on mount
  useEffect(() => {
    getVehicles(true).then(setVehicles).catch(console.error);
    getSamitis(true).then(setAllSamitis).catch(console.error);
  }, []);

  // Reload grid when shift, vehicle, or mode changes
  const loadGrid = useCallback(async () => {
    setLoadingGrid(true);
    resetStack();
    try {
      if (mode === 'vehicle') {
        if (!selectedVehicle) {
          setGridRows([]);
          setLoadingGrid(false);
          return;
        }

        // 1. Get samitis mapped to vehicle
        const mappings = await getSamitisForVehicle(selectedVehicle.id);
        const routeSamitis = mappings
          .filter((m) => m.samiti && m.samiti.active)
          .map((m) => m.samiti);

        if (routeSamitis.length === 0) {
          setGridRows([]);
          setLoadingGrid(false);
          return;
        }

        // 2. Get existing entries
        const entries = await getMilkEntries({
          date,
          shift,
          vehicle_id: selectedVehicle.id,
        });

        // 3. Map into rows
        const rows: GridRow[] = routeSamitis.map((samiti) => {
          const matchedEntry = entries.find((e) => e.samiti_id === samiti.id);
          return {
            samiti,
            qtyText: matchedEntry ? matchedEntry.quantity_litres.toString() : '',
            savedQty: matchedEntry ? matchedEntry.quantity_litres : null,
            entry: matchedEntry || null,
            status: matchedEntry ? 'saved' : 'idle',
          };
        });

        setGridRows(rows);
      } else {
        // Self-delivery mode
        const entries = await getMilkEntries({
          date,
          shift,
          vehicle_id: null,
        });

        // Load full samiti details for each entry
        const rows: GridRow[] = [];
        for (const entry of entries) {
          const samiti = allSamitis.find((s) => s.id === entry.samiti_id);
          if (samiti) {
            rows.push({
              samiti,
              qtyText: entry.quantity_litres.toString(),
              savedQty: entry.quantity_litres,
              entry,
              status: 'saved',
            });
          }
        }
        setGridRows(rows);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load milk entries.');
    } finally {
      setLoadingGrid(false);
    }
  }, [mode, selectedVehicle, date, shift, allSamitis, resetStack]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  // Handle vehicle route selection
  const handleSelectVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setVehicleSearch(vehicle.vehicle_no);
    setShowVehicleDropdown(false);
  };

  // Handle adding self-delivery samiti
  const handleAddSelfSamiti = async (samiti: Samiti) => {
    // Check if already in the list
    if (gridRows.some((r) => r.samiti.id === samiti.id)) {
      Alert.alert('Info', `${samiti.name} is already in the entry list.`);
      setSamitiSearch('');
      setShowSamitiDropdown(false);
      return;
    }

    setLoadingGrid(true);
    try {
      // Check if entry already exists in DB for this date/shift
      const existing = await getExistingSamitiEntry({
        date,
        shift,
        samiti_id: samiti.id,
      });

      const newRow: GridRow = {
        samiti,
        qtyText: existing ? existing.quantity_litres.toString() : '',
        savedQty: existing ? existing.quantity_litres : null,
        entry: existing || null,
        status: existing ? 'saved' : 'idle',
      };

      setGridRows((prev) => [...prev, newRow]);
      setSamitiSearch('');
      setShowSamitiDropdown(false);
    } catch {
      Alert.alert('Error', 'Failed to add samiti.');
    } finally {
      setLoadingGrid(false);
    }
  };

  // Perform single row database write
  const saveRow = async (index: number, quantity: number, forceOverwrite = false) => {
    const row = gridRows[index];
    if (!row || !session) return;

    // Hard block <= 0
    if (quantity <= 0) {
      updateRowState(index, { status: 'error', errorMsg: 'Qty must be > 0' });
      return;
    }

    updateRowState(index, { status: 'saving', errorMsg: undefined });

    try {
      if (row.entry) {
        // Update existing entry
        const updated = await updateMilkEntry(row.entry.id, quantity, session.userId);
        updateRowState(index, {
          entry: updated,
          savedQty: quantity,
          status: 'saved',
        });
      } else {
        // Check for duplicate entry same samiti+date+shift (if not already loaded)
        if (!forceOverwrite) {
          const duplicate = await getExistingSamitiEntry({
            date,
            shift,
            samiti_id: row.samiti.id,
          });

          if (duplicate) {
            updateRowState(index, { status: 'idle' });
            Alert.alert(
              'Duplicate Entry',
              `${row.samiti.name} already has an entry of ${duplicate.quantity_litres}L for this shift. Overwrite or Cancel?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Overwrite',
                  onPress: () => {
                    // Associate the existing entry ID and update it
                    updateRowState(index, { entry: duplicate });
                    saveRow(index, quantity, true);
                  },
                },
              ]
            );
            return;
          }
        }

        // Insert new entry
        const created = await createMilkEntry({
          date,
          shift,
          samiti_id: row.samiti.id,
          vehicle_id: mode === 'vehicle' ? selectedVehicle?.id || null : null,
          quantity_litres: quantity,
          entered_by: session.userId,
        });

        updateRowState(index, {
          entry: created,
          savedQty: quantity,
          status: 'saved',
        });
      }
    } catch (err: any) {
      console.error(err);
      updateRowState(index, { status: 'error', errorMsg: err.message || 'Network error' });
    }
  };

  // Helper to modify row state
  const updateRowState = (index: number, state: Partial<GridRow>) => {
    setGridRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...state };
      return copy;
    });
  };

  // Triggered when text input changes
  const handleQtyChange = (text: string, index: number) => {
    updateRowState(index, { qtyText: text, status: 'idle' });
  };

  // Confirm row (on Enter or End Editing)
  const handleConfirmRow = async (index: number) => {
    const row = gridRows[index];
    if (!row) return;

    const val = parseFloat(row.qtyText);

    try {
      const isLocked = await isDateLockedForSamiti(date, row.samiti.id);
      if (isLocked) {
        Alert.alert(
          'Finalized Payment Warning',
          'This entry is part of a finalized payment — editing it will not automatically recalculate that payment; regenerate the report if needed.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Proceed', onPress: () => proceedConfirmRow(index, val) }
          ]
        );
        return;
      }
    } catch (e) {
      console.error(e);
    }

    proceedConfirmRow(index, val);
  };

  const proceedConfirmRow = (index: number, val: number) => {
    const row = gridRows[index];
    if (!row) return;

    if (isNaN(val)) {
      // If empty and had existing entry, soft-delete it
      if (row.entry) {
        Alert.alert(
          'Delete Entry',
          `Are you sure you want to delete the entry for ${row.samiti.name}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                updateRowState(index, { status: 'saving' });
                try {
                  await softDeleteMilkEntry(row.entry!.id, session!.userId);
                  updateRowState(index, {
                    entry: null,
                    savedQty: null,
                    qtyText: '',
                    status: 'idle',
                  });
                } catch {
                  updateRowState(index, { status: 'error', errorMsg: 'Failed to delete' });
                }
              },
            },
          ]
        );
      }
      return;
    }

    // Don't save if quantity didn't change
    if (val === row.savedQty) {
      updateRowState(index, { status: 'saved' });
      return;
    }

    // Warn if quantity is unusually large outlier (e.g. > 2000L)
    if (val > 2000) {
      Alert.alert(
        'Warning',
        `The quantity entered (${val}L) is larger than usual. Save anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, Save',
            onPress: () => {
              pushEdit({
                rowId: row.samiti.id,
                field: 'quantity_litres',
                oldValue: row.savedQty,
                newValue: val,
              });
              saveRow(index, val);
            },
          },
        ]
      );
      return;
    }

    pushEdit({
      rowId: row.samiti.id,
      field: 'quantity_litres',
      oldValue: row.savedQty,
      newValue: val,
    });
    saveRow(index, val);
  };

  // Keyboard navigation & shortcuts
  const handleKeyPress = (e: any, index: number) => {
    const key = e.nativeEvent.key;
    if (key === 'ArrowDown') {
      focusDown(index, 0);
    } else if (key === 'ArrowUp') {
      focusUp(index, 0);
    } else if (key === 'Escape') {
      const row = gridRows[index];
      if (row) {
        updateRowState(index, {
          qtyText: row.savedQty ? row.savedQty.toString() : '',
          status: row.savedQty ? 'saved' : 'idle',
        });
      }
    }
  };

  // Undo edit action
  const handleUndo = async () => {
    const record = undo();
    if (!record) return;

    const index = gridRows.findIndex((r) => r.samiti.id === record.rowId);
    if (index === -1) return;

    const oldVal = record.oldValue as number | null;
    if (oldVal === null) {
      // Revert to empty (delete entry)
      updateRowState(index, { qtyText: '', status: 'saving' });
      const row = gridRows[index];
      if (row.entry) {
        try {
          await softDeleteMilkEntry(row.entry.id, session!.userId);
          updateRowState(index, { entry: null, savedQty: null, status: 'idle' });
        } catch {
          updateRowState(index, { status: 'error', errorMsg: 'Undo failed' });
        }
      }
    } else {
      updateRowState(index, { qtyText: oldVal.toString() });
      await saveRow(index, oldVal, true);
    }
  };

  // Redo edit action
  const handleRedo = async () => {
    const record = redo();
    if (!record) return;

    const index = gridRows.findIndex((r) => r.samiti.id === record.rowId);
    if (index === -1) return;

    const newVal = record.newValue as number;
    updateRowState(index, { qtyText: newVal.toString() });
    await saveRow(index, newVal, true);
  };

  // Calculate live sum
  const runningTotal = gridRows.reduce((acc, row) => {
    const val = parseFloat(row.qtyText);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  // Filter lists for auto-complete search
  const filteredVehicles = vehicles.filter((v) =>
    v.vehicle_no.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  const filteredSamitis = allSamitis
    .filter((s) => s.delivery_mode === 'self' && s.active)
    .filter(
      (s) =>
        s.code.toLowerCase().includes(samitiSearch.toLowerCase()) ||
        s.name.toLowerCase().includes(samitiSearch.toLowerCase())
    );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Session controls */}
      <View style={styles.header}>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>📅  {date}</Text>
          <View style={styles.shiftSelector}>
            <TouchableOpacity
              style={[styles.shiftBtn, shift === 'morning' && styles.shiftBtnActive]}
              onPress={() => setShift('morning')}
            >
              <Text style={[styles.shiftBtnText, shift === 'morning' && styles.shiftBtnTextActive]}>☀️ Morning</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shiftBtn, shift === 'evening' && styles.shiftBtnActive]}
              onPress={() => setShift('evening')}
            >
              <Text style={[styles.shiftBtnText, shift === 'evening' && styles.shiftBtnTextActive]}>🌙 Evening</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Mode selector */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'vehicle' && styles.modeBtnActive]}
            onPress={() => {
              setMode('vehicle');
              setGridRows([]);
            }}
          >
            <Text style={[styles.modeBtnText, mode === 'vehicle' && styles.modeBtnTextActive]}>🚛 Vehicle Route</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'self' && styles.modeBtnActive]}
            onPress={() => {
              setMode('self');
              setGridRows([]);
            }}
          >
            <Text style={[styles.modeBtnText, mode === 'self' && styles.modeBtnTextActive]}>🚶 Self-Delivery</Text>
          </TouchableOpacity>
        </View>

        {/* Vehicle search or Samiti search */}
        {mode === 'vehicle' ? (
          <View style={styles.searchWrapper}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search Vehicle No..."
              placeholderTextColor="#90a4ae"
              value={vehicleSearch}
              onChangeText={(t) => {
                setVehicleSearch(t);
                setShowVehicleDropdown(true);
              }}
              onFocus={() => setShowVehicleDropdown(true)}
            />
            {showVehicleDropdown && filteredVehicles.length > 0 && (
              <View style={styles.dropdown}>
                {filteredVehicles.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.dropdownItem}
                    onPress={() => handleSelectVehicle(v)}
                  >
                    <Text style={styles.dropdownText}>{v.vehicle_no} ({v.driver_name})</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.searchWrapper}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search & add Samiti code or name..."
              placeholderTextColor="#90a4ae"
              value={samitiSearch}
              onChangeText={(t) => {
                setSamitiSearch(t);
                setShowSamitiDropdown(true);
              }}
              onFocus={() => setShowSamitiDropdown(true)}
            />
            {showSamitiDropdown && filteredSamitis.length > 0 && (
              <View style={styles.dropdown}>
                {filteredSamitis.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.dropdownItem}
                    onPress={() => handleAddSelfSamiti(s)}
                  >
                    <Text style={styles.dropdownText}>{s.code} - {s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Undo/Redo Buttons */}
      <View style={styles.undoRedoBar}>
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

      {/* The main Grid */}
      {loadingGrid ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a237e" />
        </View>
      ) : gridRows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {mode === 'vehicle'
              ? 'Select a vehicle with mapped samitis to display the entry grid.'
              : 'Add self-delivery samitis using the search box above.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={gridRows}
          keyExtractor={(r) => r.samiti.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item: r, index }) => (
            <View style={styles.gridRow}>
              <View style={styles.samitiDetails}>
                <Text style={styles.gridSamitiCode}>{r.samiti.code}</Text>
                <Text style={styles.gridSamitiName} numberOfLines={1}>
                  {r.samiti.name}
                </Text>
              </View>

              {/* Litres input cell */}
              <View style={styles.qtyCellWrapper}>
                <TextInput
                  ref={(el) => registerRef(index, 0, el)}
                  style={[
                    styles.qtyInput,
                    r.status === 'saved' && styles.qtySaved,
                    r.status === 'error' && styles.qtyError,
                  ]}
                  placeholder="Qty (L)"
                  placeholderTextColor="#b0bec5"
                  value={r.qtyText}
                  onChangeText={(t) => handleQtyChange(t, index)}
                  onEndEditing={() => handleConfirmRow(index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>

              {/* Status display */}
              <View style={styles.statusCell}>
                {r.status === 'saving' && <ActivityIndicator size="small" color="#1a237e" />}
                {r.status === 'saved' && <Text style={styles.statusSaved}>✅</Text>}
                {r.status === 'error' && (
                  <TouchableOpacity onPress={() => Alert.alert('Row Error', r.errorMsg || 'Failed to save. Tap to retry.')}>
                    <Text style={styles.statusError}>⚠️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Running Total Bar */}
      <View style={styles.footer}>
        <Text style={styles.totalLabel}>Total Volume:</Text>
        <Text style={styles.totalVal}>{runningTotal.toFixed(2)} L</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#90a4ae', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  header: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e3e8f0', zIndex: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  metaText: { fontSize: 15, fontWeight: '700', color: '#1a237e' },
  shiftSelector: { flexDirection: 'row', gap: 6 },
  shiftBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f5f7ff', borderWidth: 1, borderColor: '#e3e8f0' },
  shiftBtnActive: { backgroundColor: '#1a237e', borderColor: '#1a237e' },
  shiftBtnText: { fontSize: 12, color: '#546e7a', fontWeight: '600' },
  shiftBtnTextActive: { color: '#fff' },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#f5f7ff', borderWidth: 1, borderColor: '#e3e8f0' },
  modeBtnActive: { backgroundColor: '#e8eaf6', borderColor: '#1a237e' },
  modeBtnText: { fontSize: 13, color: '#546e7a', fontWeight: '600' },
  modeBtnTextActive: { color: '#1a237e' },
  searchWrapper: { position: 'relative' },
  searchInput: { height: 44, backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14, fontSize: 14, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0' },
  dropdown: { position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e3e8f0', maxHeight: 200, zIndex: 100, elevation: 5 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f5f7ff' },
  dropdownText: { fontSize: 13, color: '#37474f' },
  undoRedoBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 10, justifyContent: 'flex-end', backgroundColor: '#f5f7ff' },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e8f0' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#1a237e' },
  actionBtnTextDisabled: { color: '#b0bec5' },
  gridRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, shadowColor: '#1a237e', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 1 },
  samitiDetails: { flex: 1, gap: 2 },
  gridSamitiCode: { fontSize: 14, fontWeight: '700', color: '#1a237e' },
  gridSamitiName: { fontSize: 12, color: '#78909c' },
  qtyCellWrapper: { width: 100, marginRight: 10 },
  qtyInput: { height: 40, backgroundColor: '#f5f7ff', borderRadius: 8, textAlign: 'right', paddingHorizontal: 10, fontSize: 15, fontWeight: '600', color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0' },
  qtySaved: { borderColor: '#81c784', backgroundColor: '#e8f5e9' },
  qtyError: { borderColor: '#e57373', backgroundColor: '#ffebee' },
  statusCell: { width: 30, alignItems: 'center', justifyContent: 'center' },
  statusSaved: { fontSize: 14 },
  statusError: { fontSize: 16 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a237e', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  totalVal: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
