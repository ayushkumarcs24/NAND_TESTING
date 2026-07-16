import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, FlatList, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getSamitis } from '../../src/api/samiti';
import { getCalculatedEntries, CalculatedEntry } from '../../src/api/paymentEngine';
import type { Samiti } from '../../src/types';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { documentDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';

interface ReportRow {
  samitiId: string;
  samitiCode: string;
  samitiName: string;
  date: string;
  shift: 'morning' | 'evening';
  litres: number;
  fat: number;
  snf: number;
  lacto: number;
  amountPayable: number;
  status: 'ok' | 'no_payment' | 'pending';
  reason?: string;
}

export default function ReportsScreen() {
  const todayStr = new Date().toISOString().split('T')[0];

  // Filters
  const [scope, setScope] = useState<'all' | 'single'>('all');
  const [selectedSamitiId, setSelectedSamitiId] = useState('');
  const [range, setRange] = useState<'single' | 'custom'>('single');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reportType, setReportType] = useState<'standard' | 'rejected'>('standard');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'morning' | 'evening'>('all');

  // Date Pickers States
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Helper date parsing/formatting functions
  const parseDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date();
  };

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Master lists
  const [samitis, setSamitis] = useState<Samiti[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);

  // Report results
  const [loadingReport, setLoadingReport] = useState(false);
  const [rawEntries, setRawEntries] = useState<CalculatedEntry[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Load samiti master list
  useEffect(() => {
    getSamitis(true)
      .then(setSamitis)
      .catch(console.error)
      .finally(() => setLoadingMaster(false));
  }, []);

  // Compute reports from calculated entries
  const generateReport = async () => {
    const sDate = startDate.trim();
    const eDate = range === 'single' ? sDate : endDate.trim();

    if (!sDate || !eDate) {
      Alert.alert('Validation', 'Start and end dates are required.');
      return;
    }

    if (scope === 'single' && !selectedSamitiId) {
      Alert.alert('Validation', 'Please select a Samiti.');
      return;
    }

    setLoadingReport(true);
    try {
      const entries = await getCalculatedEntries({
        startDate: sDate,
        endDate: eDate,
        samitiId: scope === 'single' ? selectedSamitiId : undefined,
      });

      setRawEntries(entries);

      // Filter entries by shift if shiftFilter is not 'all'
      const filteredEntries = entries.filter((item) => {
        if (shiftFilter !== 'all' && item.entry.shift !== shiftFilter) {
          return false;
        }
        return true;
      });

      // Count untested/pending entries
      const pending = filteredEntries.filter((e) => e.status === 'pending').length;
      setPendingCount(pending);

      // Group & aggregate entries
      const rows: ReportRow[] = [];

      for (const item of filteredEntries) {
        // Filter standard vs rejected
        if (reportType === 'rejected' && item.status !== 'no_payment') {
          continue;
        }

        rows.push({
          samitiId: item.entry.samiti_id,
          samitiCode: item.entry.samiti?.code || '',
          samitiName: item.entry.samiti?.name || '',
          date: item.entry.date,
          shift: item.entry.shift as 'morning' | 'evening',
          litres: item.entry.quantity_litres,
          fat: item.test ? item.test.fat_pct : 0,
          snf: item.test ? item.test.snf_pct : 0,
          lacto: item.test ? item.test.lacto_value : 0,
          amountPayable: item.status === 'ok' ? item.amount : 0,
          status: item.status,
          reason: item.reason,
        });
      }

      // Sort rows by Samiti code then date then shift
      rows.sort((a, b) => {
        const cmpCode = a.samitiCode.localeCompare(b.samitiCode);
        if (cmpCode !== 0) return cmpCode;
        const cmpDate = a.date.localeCompare(b.date);
        if (cmpDate !== 0) return cmpDate;
        return a.shift.localeCompare(b.shift);
      });

      setReportRows(rows);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to generate report.');
    } finally {
      setLoadingReport(false);
    }
  };

  // Grand Totals calculations
  const grandTotalLitres = reportRows.reduce((sum, r) => sum + r.litres, 0);
  const grandAmountPayable = reportRows.reduce((sum, r) => sum + r.amountPayable, 0);
  const grandNoPaymentCount = reportRows.filter(r => r.status === 'no_payment').length;

  // Generate HTML table for printing/PDF
  const buildHtmlReport = () => {
    const sDate = startDate.trim();
    const eDate = range === 'single' ? sDate : endDate.trim();

    let tableRowsHtml = reportRows
      .map(
        (r) => {
          let statusText = 'OK';
          if (r.status === 'pending') statusText = 'Pending Test';
          else if (r.status === 'no_payment') statusText = `REJECTED (${r.reason || 'Failed Threshold'})`;

          return `
            <tr>
              <td>${r.samitiCode}</td>
              <td>${r.samitiName}</td>
              <td>${r.date}</td>
              <td>${r.shift === 'morning' ? '☀️ Morning' : '🌙 Evening'}</td>
              <td style="text-align:right">${r.litres.toFixed(2)}</td>
              <td style="text-align:right">${r.fat > 0 ? `${r.fat.toFixed(2)}%` : '-'}</td>
              <td style="text-align:right">${r.snf > 0 ? `${r.snf.toFixed(2)}%` : '-'}</td>
              <td style="text-align:right">${r.lacto > 0 ? r.lacto.toFixed(1) : '-'}</td>
              <td style="text-align:right">₹${r.amountPayable.toFixed(2)}</td>
              <td style="${r.status === 'no_payment' ? 'color:#c62828;font-weight:bold;' : ''}">${statusText}</td>
            </tr>
          `;
        }
      )
      .join('');

    let shiftLabel = 'All Shifts';
    if (shiftFilter === 'morning') shiftLabel = '☀️ Morning';
    else if (shiftFilter === 'evening') shiftLabel = '🌙 Evening';

    return `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            h2 { color: #1a237e; text-align: center; }
            h4 { text-align: center; color: #546e7a; margin-top: -5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cfd8dc; padding: 8px; font-size: 11px; }
            th { background-color: #1a237e; color: #fff; text-align: left; }
            tr:nth-child(even) { background-color: #f5f7ff; }
            .grand-total { font-weight: bold; background-color: #e8eaf6 !important; }
            .provisional { color: #e65100; text-align: center; font-weight: bold; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <h2>Nand Dairy Collection Report</h2>
          <h4>Period: ${sDate} to ${eDate} | Shift: ${shiftLabel} | Mode: ${reportType.toUpperCase()}</h4>
          ${pendingCount > 0 ? `<div class="provisional">⚠️ PROVISIONAL - ${pendingCount} entries pending test</div>` : ''}
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Samiti</th>
                <th>Date</th>
                <th>Shift</th>
                <th style="text-align:right">Litres</th>
                <th style="text-align:right">Fat</th>
                <th style="text-align:right">SNF</th>
                <th style="text-align:right">Lacto</th>
                <th style="text-align:right">Payable Amount</th>
                <th>Status / Reason</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
              <tr class="grand-total">
                <td colspan="4">GRAND TOTAL</td>
                <td style="text-align:right">${grandTotalLitres.toFixed(2)} L</td>
                <td colspan="3"></td>
                <td style="text-align:right">₹${grandAmountPayable.toFixed(2)}</td>
                <td>Rejections: ${grandNoPaymentCount}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
  };

  // Export to PDF
  const exportPdf = async () => {
    if (reportRows.length === 0) {
      Alert.alert('Info', 'Generate a report first before exporting.');
      return;
    }

    try {
      const htmlContent = buildHtmlReport();
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Report PDF' });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate PDF.');
    }
  };

  // Export to Excel / CSV
  const exportExcel = async () => {
    if (reportRows.length === 0) {
      Alert.alert('Info', 'Generate a report first before exporting.');
      return;
    }

    try {
      const headers = ['Samiti Code', 'Samiti Name', 'Date', 'Shift', 'Litres', 'Fat%', 'SNF%', 'Lacto', 'Amount Payable', 'Status', 'Reason'];
      const lines = [headers.join(',')];

      for (const r of reportRows) {
        const rowData = [
          `"${r.samitiCode}"`,
          `"${r.samitiName}"`,
          r.date,
          r.shift,
          r.litres.toFixed(2),
          r.fat.toFixed(2),
          r.snf.toFixed(2),
          r.lacto.toFixed(1),
          r.amountPayable.toFixed(2),
          r.status,
          `"${r.reason || ''}"`,
        ];
        lines.push(rowData.join(','));
      }

      // Add grand totals row
      const grandTotalRow = [
        'GRAND TOTAL',
        '',
        '',
        '',
        grandTotalLitres.toFixed(2),
        '',
        '',
        '',
        grandAmountPayable.toFixed(2),
        '',
        `"Total Rejections: ${grandNoPaymentCount}"`,
      ];
      lines.push(grandTotalRow.join(','));

      const csvContent = lines.join('\n');
      const filename = `Nand_Dairy_Report_${startDate}_to_${endDate}.csv`;
      const fileUri = `${documentDirectory}${filename}`;

      await writeAsStringAsync(fileUri, csvContent, { encoding: EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share CSV Report' });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate CSV.');
    }
  };

  if (loadingMaster) return <View style={styles.center}><ActivityIndicator size="large" color="#1a237e" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Report filters card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Report Filters</Text>

        {/* Standard vs Rejected */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, reportType === 'standard' && styles.tabBtnActive]}
            onPress={() => setReportType('standard')}
          >
            <Text style={[styles.tabText, reportType === 'standard' && styles.tabTextActive]}>📊 Collection Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, reportType === 'rejected' && styles.tabBtnActive]}
            onPress={() => setReportType('rejected')}
          >
            <Text style={[styles.tabText, reportType === 'rejected' && styles.tabTextActive]}>⚠️ Rejections Only</Text>
          </TouchableOpacity>
        </View>

        {/* Scope Selection */}
        <Text style={styles.label}>Scope</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, scope === 'all' && styles.toggleBtnActive]}
            onPress={() => setScope('all')}
          >
            <Text style={[styles.toggleBtnText, scope === 'all' && styles.toggleBtnTextActive]}>All Samitis</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, scope === 'single' && styles.toggleBtnActive]}
            onPress={() => setScope('single')}
          >
            <Text style={[styles.toggleBtnText, scope === 'single' && styles.toggleBtnTextActive]}>Single Samiti</Text>
          </TouchableOpacity>
        </View>

        {scope === 'single' && (
          <View style={styles.dropdownWrapper}>
            <Text style={styles.label}>Select Samiti</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.samitiSelectRow}>
              {samitis.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.samitiChip, selectedSamitiId === s.id && styles.samitiChipActive]}
                  onPress={() => setSelectedSamitiId(s.id)}
                >
                  <Text style={[styles.samitiChipText, selectedSamitiId === s.id && styles.samitiChipTextActive]}>
                    {s.code} - {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Shift Filter */}
        <Text style={styles.label}>Shift</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, shiftFilter === 'all' && styles.toggleBtnActive]}
            onPress={() => setShiftFilter('all')}
          >
            <Text style={[styles.toggleBtnText, shiftFilter === 'all' && styles.toggleBtnTextActive]}>All Shifts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, shiftFilter === 'morning' && styles.toggleBtnActive]}
            onPress={() => setShiftFilter('morning')}
          >
            <Text style={[styles.toggleBtnText, shiftFilter === 'morning' && styles.toggleBtnTextActive]}>Morning</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, shiftFilter === 'evening' && styles.toggleBtnActive]}
            onPress={() => setShiftFilter('evening')}
          >
            <Text style={[styles.toggleBtnText, shiftFilter === 'evening' && styles.toggleBtnTextActive]}>Evening</Text>
          </TouchableOpacity>
        </View>

        {/* Range Selection */}
        <Text style={styles.label}>Date Range</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, range === 'single' && styles.toggleBtnActive]}
            onPress={() => setRange('single')}
          >
            <Text style={[styles.toggleBtnText, range === 'single' && styles.toggleBtnTextActive]}>Single Day</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, range === 'custom' && styles.toggleBtnActive]}
            onPress={() => setRange('custom')}
          >
            <Text style={[styles.toggleBtnText, range === 'custom' && styles.toggleBtnTextActive]}>Custom Range</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dateInputs}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{range === 'single' ? 'Date' : 'Start Date'}</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.datePickerBtnText}>{startDate}</Text>
              <Text style={styles.datePickerEmoji}>📅</Text>
            </TouchableOpacity>
            {showStartPicker && (
              <DateTimePicker
                value={parseDate(startDate)}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowStartPicker(Platform.OS === 'ios');
                  if (selectedDate) setStartDate(formatDate(selectedDate));
                }}
              />
            )}
          </View>
          {range === 'custom' && (
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>End Date</Text>
              <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowEndPicker(true)}>
                <Text style={styles.datePickerBtnText}>{endDate}</Text>
                <Text style={styles.datePickerEmoji}>📅</Text>
              </TouchableOpacity>
              {showEndPicker && (
                <DateTimePicker
                  value={parseDate(endDate)}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowEndPicker(Platform.OS === 'ios');
                    if (selectedDate) setEndDate(formatDate(selectedDate));
                  }}
                />
              )}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.generateBtn, loadingReport && styles.generateBtnDisabled]}
          onPress={generateReport}
          disabled={loadingReport}
        >
          {loadingReport ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateBtnText}>📈 Generate Report</Text>}
        </TouchableOpacity>
      </View>

      {/* Provisional notice banner */}
      {pendingCount > 0 && (
        <View style={styles.provisionalBanner}>
          <Text style={styles.provisionalTitle}>⚠️  Provisional Report</Text>
          <Text style={styles.provisionalSub}>{pendingCount} entries are still pending testing queue completion.</Text>
        </View>
      )}

      {/* Report Rows */}
      {reportRows.length > 0 && (
        <View style={styles.card}>
          <View style={styles.reportHeader}>
            <Text style={styles.cardTitle}>Report Data</Text>
            <View style={styles.exportRow}>
              <TouchableOpacity style={styles.exportBtn} onPress={exportPdf}>
                <Text style={styles.exportBtnText}>📄 PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportBtn} onPress={exportExcel}>
                <Text style={styles.exportBtnText}>📊 Excel (CSV)</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={reportRows}
            keyExtractor={(item, idx) => `${item.samitiId}_${item.date}_${item.shift}_${idx}`}
            scrollEnabled={false}
            renderItem={({ item: r }) => (
              <View style={styles.reportRow}>
                <View style={styles.rowTop}>
                  <Text style={styles.samitiLabel}>{r.samitiCode} - {r.samitiName}</Text>
                  <Text style={styles.rowDate}>{r.date} | {r.shift === 'morning' ? '☀️ Morning' : '🌙 Evening'}</Text>
                </View>
                <View style={styles.rowGrid}>
                  <View style={styles.gridCell}>
                    <Text style={styles.cellLabel}>Litres</Text>
                    <Text style={styles.cellVal}>{r.litres.toFixed(1)} L</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.cellLabel}>Fat / SNF / Lacto</Text>
                    <Text style={styles.cellVal}>
                      {r.fat > 0 ? r.fat.toFixed(2) : '-'}% / {r.snf > 0 ? r.snf.toFixed(2) : '-'}% / {r.lacto > 0 ? r.lacto.toFixed(1) : '-'}
                    </Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.cellLabel}>Amount</Text>
                    <Text style={styles.cellValAmount}>₹{r.amountPayable.toFixed(2)}</Text>
                  </View>
                </View>
                {r.status === 'no_payment' && (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionText}>
                      ⚠️  Rejected. Reason: {r.reason || 'Failed quality threshold'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          />

          {/* Grand Totals */}
          <View style={styles.grandTotalBox}>
            <Text style={styles.grandTotalTitle}>GRAND TOTAL</Text>
            <View style={styles.grandTotalStats}>
              <Text style={styles.grandTotalLitres}>Volume: {grandTotalLitres.toFixed(2)} L</Text>
              <Text style={styles.grandTotalAmount}>Payable: ₹{grandAmountPayable.toFixed(2)}</Text>
            </View>
            {grandNoPaymentCount > 0 && (
              <Text style={styles.grandTotalRejections}>Total Rejections: {grandNoPaymentCount} entries</Text>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#1a237e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1a237e' },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#f5f7ff', borderWidth: 1, borderColor: '#e3e8f0' },
  tabBtnActive: { backgroundColor: '#e8eaf6', borderColor: '#1a237e' },
  tabText: { fontSize: 12, color: '#546e7a', fontWeight: '600' },
  tabTextActive: { color: '#1a237e' },
  label: { fontSize: 12, fontWeight: '600', color: '#78909c', marginBottom: 6, marginTop: 12 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#f5f7ff', borderWidth: 1, borderColor: '#e3e8f0' },
  toggleBtnActive: { backgroundColor: '#e8eaf6', borderColor: '#1a237e' },
  toggleBtnText: { fontSize: 13, color: '#546e7a', fontWeight: '600' },
  toggleBtnTextActive: { color: '#1a237e' },
  dropdownWrapper: { marginTop: 10 },
  samitiSelectRow: { gap: 8, paddingVertical: 4 },
  samitiChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f5f7ff', borderColor: '#e3e8f0', borderWidth: 1 },
  samitiChipActive: { backgroundColor: '#e8eaf6', borderColor: '#1a237e' },
  samitiChipText: { fontSize: 12, color: '#546e7a', fontWeight: '600' },
  samitiChipTextActive: { color: '#1a237e' },
  dateInputs: { flexDirection: 'row', gap: 12 },
  datePickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: '#e3e8f0' },
  datePickerBtnText: { fontSize: 14, color: '#1a237e', fontWeight: '600' },
  datePickerEmoji: { fontSize: 16 },
  input: { backgroundColor: '#f5f7ff', borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 14, color: '#1a237e', borderWidth: 1, borderColor: '#e3e8f0' },
  generateBtn: { backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  generateBtnDisabled: { backgroundColor: '#90a4ae' },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  provisionalBanner: { backgroundColor: '#fff3e0', padding: 14, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#f57c00' },
  provisionalTitle: { color: '#e65100', fontSize: 14, fontWeight: '800' },
  provisionalSub: { color: '#ef6c00', fontSize: 12, marginTop: 2, lineHeight: 16 },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f5f7ff', paddingBottom: 10 },
  exportRow: { flexDirection: 'row', gap: 8 },
  exportBtn: { backgroundColor: '#f5f7ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e3e8f0' },
  exportBtnText: { fontSize: 11, fontWeight: '700', color: '#1a237e' },
  reportRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f7ff' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  samitiLabel: { fontSize: 14, fontWeight: '700', color: '#37474f' },
  rowDate: { fontSize: 11, color: '#90a4ae' },
  rowGrid: { flexDirection: 'row', gap: 10 },
  gridCell: { flex: 1 },
  cellLabel: { fontSize: 10, color: '#90a4ae' },
  cellVal: { fontSize: 13, fontWeight: '600', color: '#37474f', marginTop: 2 },
  cellValAmount: { fontSize: 13, fontWeight: '700', color: '#2e7d32', marginTop: 2 },
  rejectionBox: { backgroundColor: '#ffebee', padding: 8, borderRadius: 6, marginTop: 8 },
  rejectionText: { fontSize: 11, color: '#c62828', fontWeight: '600' },
  grandTotalBox: { backgroundColor: '#e8eaf6', borderRadius: 12, padding: 16, marginTop: 16, gap: 6 },
  grandTotalTitle: { fontSize: 14, fontWeight: '800', color: '#1a237e' },
  grandTotalStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grandTotalLitres: { fontSize: 14, fontWeight: '700', color: '#37474f' },
  grandTotalAmount: { fontSize: 15, fontWeight: '800', color: '#2e7d32' },
  grandTotalRejections: { fontSize: 12, color: '#c62828', fontWeight: '600' },
});
