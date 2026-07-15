import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, FlatList,
} from 'react-native';
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
  date?: string;
  totalLitres: number;
  weightedFat: number;
  weightedSnf: number;
  amountPayable: number;
  noPaymentCount: number;
  noPaymentLitres: number;
  noPaymentReasons: string;
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

      // Count untested/pending entries
      const pending = entries.filter((e) => e.status === 'pending').length;
      setPendingCount(pending);

      // Group & aggregate entries
      // If single day, group by Samiti. If custom date range, group by Samiti + Date
      const isMultiDay = range === 'custom' && sDate !== eDate;
      const groups: Record<string, CalculatedEntry[]> = {};

      for (const item of entries) {
        // Filter standard vs rejected
        if (reportType === 'rejected' && item.status !== 'no_payment') {
          continue;
        }

        const key = isMultiDay
          ? `${item.entry.samiti_id}_${item.entry.date}`
          : item.entry.samiti_id;

        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }

      const rows: ReportRow[] = Object.entries(groups).map(([key, items]) => {
        const first = items[0];
        const samitiId = first.entry.samiti_id;
        const samitiCode = first.entry.samiti?.code || '';
        const samitiName = first.entry.samiti?.name || '';
        const date = isMultiDay ? first.entry.date : undefined;

        let totalLitres = 0;
        let sumFatLitres = 0;
        let sumSnfLitres = 0;
        let weightedLitres = 0;
        let amountPayable = 0;
        let noPaymentCount = 0;
        let noPaymentLitres = 0;
        const reasonsSet = new Set<string>();

        for (const item of items) {
          totalLitres += item.entry.quantity_litres;

          if (item.status === 'pending') continue;

          if (item.status === 'no_payment') {
            noPaymentCount++;
            noPaymentLitres += item.entry.quantity_litres;
            if (item.reason) reasonsSet.add(item.reason);
          } else {
            // ok status
            amountPayable += item.amount;
          }

          // Weighted average applies to all tested non-voided entries
          if (item.test && !item.test.is_voided) {
            sumFatLitres += item.test.fat_pct * item.entry.quantity_litres;
            sumSnfLitres += item.test.snf_pct * item.entry.quantity_litres;
            weightedLitres += item.entry.quantity_litres;
          }
        }

        return {
          samitiId,
          samitiCode,
          samitiName,
          date,
          totalLitres,
          weightedFat: weightedLitres > 0 ? sumFatLitres / weightedLitres : 0,
          weightedSnf: weightedLitres > 0 ? sumSnfLitres / weightedLitres : 0,
          amountPayable: Math.round(amountPayable * 100) / 100,
          noPaymentCount,
          noPaymentLitres,
          noPaymentReasons: Array.from(reasonsSet).join('; '),
        };
      });

      // Sort rows by Samiti code then date
      rows.sort((a, b) => {
        const cmpCode = a.samitiCode.localeCompare(b.samitiCode);
        if (cmpCode !== 0) return cmpCode;
        if (a.date && b.date) return a.date.localeCompare(b.date);
        return 0;
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
  const grandTotalLitres = reportRows.reduce((sum, r) => sum + r.totalLitres, 0);
  const grandAmountPayable = reportRows.reduce((sum, r) => sum + r.amountPayable, 0);
  const grandNoPaymentCount = reportRows.reduce((sum, r) => sum + r.noPaymentCount, 0);

  // Generate HTML table for printing/PDF
  const buildHtmlReport = () => {
    const sDate = startDate.trim();
    const eDate = range === 'single' ? sDate : endDate.trim();

    let tableRowsHtml = reportRows
      .map(
        (r) => `
      <tr>
        <td>${r.samitiCode}</td>
        <td>${r.samitiName}</td>
        ${r.date ? `<td>${r.date}</td>` : ''}
        <td style="text-align:right">${r.totalLitres.toFixed(2)}</td>
        <td style="text-align:right">${r.weightedFat.toFixed(2)}%</td>
        <td style="text-align:right">${r.weightedSnf.toFixed(2)}%</td>
        <td style="text-align:right">₹${r.amountPayable.toFixed(2)}</td>
        <td style="text-align:center">${r.noPaymentCount} (${r.noPaymentLitres.toFixed(1)}L)</td>
      </tr>
    `
      )
      .join('');

    return `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            h2 { color: #1a237e; text-align: center; }
            h4 { text-align: center; color: #546e7a; margin-top: -5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cfd8dc; padding: 8px; font-size: 12px; }
            th { background-color: #1a237e; color: #fff; text-align: left; }
            tr:nth-child(even) { background-color: #f5f7ff; }
            .grand-total { font-weight: bold; background-color: #e8eaf6 !important; }
            .provisional { color: #e65100; text-align: center; font-weight: bold; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <h2>Nand Dairy Collection Report</h2>
          <h4>Period: ${sDate} to ${eDate} | Mode: ${reportType.toUpperCase()}</h4>
          ${pendingCount > 0 ? `<div class="provisional">⚠️ PROVISIONAL - ${pendingCount} entries pending test</div>` : ''}
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Samiti</th>
                ${range === 'custom' ? '<th>Date</th>' : ''}
                <th style="text-align:right">Total Litres</th>
                <th style="text-align:right">Avg Fat</th>
                <th style="text-align:right">Avg SNF</th>
                <th style="text-align:right">Payable Amount</th>
                <th style="text-align:center">Rejected (Litres)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
              <tr class="grand-total">
                <td colspan="${range === 'custom' ? '3' : '2'}">GRAND TOTAL</td>
                <td style="text-align:right">${grandTotalLitres.toFixed(2)} L</td>
                <td colspan="2"></td>
                <td style="text-align:right">₹${grandAmountPayable.toFixed(2)}</td>
                <td style="text-align:center">${grandNoPaymentCount}</td>
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
      const headers = ['Samiti Code', 'Samiti Name', ...(range === 'custom' ? ['Date'] : []), 'Total Litres', 'Avg Fat%', 'Avg SNF%', 'Amount Payable', 'Rejected Count', 'Rejected Litres', 'Rejection Reasons'];
      const lines = [headers.join(',')];

      for (const r of reportRows) {
        const rowData = [
          `"${r.samitiCode}"`,
          `"${r.samitiName}"`,
          ...(r.date ? [r.date] : []),
          r.totalLitres.toFixed(2),
          r.weightedFat.toFixed(2),
          r.weightedSnf.toFixed(2),
          r.amountPayable.toFixed(2),
          r.noPaymentCount,
          r.noPaymentLitres.toFixed(2),
          `"${r.noPaymentReasons}"`,
        ];
        lines.push(rowData.join(','));
      }

      // Add grand totals row
      const grandTotalRow = [
        'GRAND TOTAL',
        '',
        ...(range === 'custom' ? [''] : []),
        grandTotalLitres.toFixed(2),
        '',
        '',
        grandAmountPayable.toFixed(2),
        grandNoPaymentCount,
        '',
        '',
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
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
          {range === 'custom' && (
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>End Date</Text>
              <TextInput
                style={styles.input}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
              />
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
            keyExtractor={(item, idx) => `${item.samitiId}_${idx}`}
            scrollEnabled={false}
            renderItem={({ item: r }) => (
              <View style={styles.reportRow}>
                <View style={styles.rowTop}>
                  <Text style={styles.samitiLabel}>{r.samitiCode} - {r.samitiName}</Text>
                  {r.date && <Text style={styles.rowDate}>{r.date}</Text>}
                </View>
                <View style={styles.rowGrid}>
                  <View style={styles.gridCell}>
                    <Text style={styles.cellLabel}>Litres</Text>
                    <Text style={styles.cellVal}>{r.totalLitres.toFixed(1)} L</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.cellLabel}>Avg Fat/SNF</Text>
                    <Text style={styles.cellVal}>{r.weightedFat.toFixed(1)} / {r.weightedSnf.toFixed(1)}</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.cellLabel}>Amount</Text>
                    <Text style={styles.cellValAmount}>₹{r.amountPayable.toFixed(2)}</Text>
                  </View>
                </View>
                {r.noPaymentCount > 0 && (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionText}>
                      ⚠️  Rejected: {r.noPaymentCount} tests ({r.noPaymentLitres.toFixed(1)}L). Reason: {r.noPaymentReasons}
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
