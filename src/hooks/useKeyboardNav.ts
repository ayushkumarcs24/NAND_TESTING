import { useRef, useCallback } from 'react';
import { TextInput } from 'react-native';

/**
 * useKeyboardNav — reusable focus-managed keyboard navigation hook.
 *
 * Powers the spreadsheet-style grid keyboard interactions in both:
 * - Milk Entry screen (one column: quantity_litres)
 * - Milk Testing screen (three columns: fat_pct → snf_pct → lacto_value)
 *
 * Usage:
 *   const { registerRef, focusCell, focusNext, focusPrev } = useKeyboardNav(rowCount, columnCount);
 *
 *   In each TextInput:
 *     ref={(el) => registerRef(rowIndex, colIndex, el)}
 *     onSubmitEditing={() => focusNext(rowIndex, colIndex)}
 */

export function useKeyboardNav(rowCount: number, colCount: number) {
  // 2D ref map: refs[row][col] = TextInput ref
  const refs = useRef<Array<Array<TextInput | null>>>([]);

  // Initialize / extend the ref grid as needed
  const ensureSize = useCallback((rows: number, cols: number) => {
    while (refs.current.length < rows) {
      refs.current.push([]);
    }
    for (let r = 0; r < rows; r++) {
      while ((refs.current[r]?.length ?? 0) < cols) {
        refs.current[r]?.push(null);
      }
    }
  }, []);

  const registerRef = useCallback(
    (row: number, col: number, el: TextInput | null) => {
      ensureSize(rowCount, colCount);
      if (!refs.current[row]) refs.current[row] = [];
      refs.current[row][col] = el;
    },
    [rowCount, colCount, ensureSize]
  );

  const focusCell = useCallback((row: number, col: number) => {
    refs.current[row]?.[col]?.focus();
  }, []);

  /** Move focus to the next cell (right then down, wraps rows). */
  const focusNext = useCallback(
    (row: number, col: number) => {
      const nextCol = col + 1;
      if (nextCol < colCount) {
        focusCell(row, nextCol);
      } else if (row + 1 < rowCount) {
        focusCell(row + 1, 0);
      }
    },
    [colCount, rowCount, focusCell]
  );

  /** Move focus to the previous cell (left then up). */
  const focusPrev = useCallback(
    (row: number, col: number) => {
      const prevCol = col - 1;
      if (prevCol >= 0) {
        focusCell(row, prevCol);
      } else if (row - 1 >= 0) {
        focusCell(row - 1, colCount - 1);
      }
    },
    [colCount, focusCell]
  );

  /** Move focus down one row (same column). */
  const focusDown = useCallback(
    (row: number, col: number) => {
      if (row + 1 < rowCount) focusCell(row + 1, col);
    },
    [rowCount, focusCell]
  );

  /** Move focus up one row (same column). */
  const focusUp = useCallback(
    (row: number, col: number) => {
      if (row - 1 >= 0) focusCell(row - 1, col);
    },
    [focusCell]
  );

  return { registerRef, focusCell, focusNext, focusPrev, focusDown, focusUp };
}
