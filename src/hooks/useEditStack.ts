import { useState, useCallback, useRef } from 'react';

/**
 * useEditStack — in-memory undo/redo stack for the Milk Entry and Testing grids.
 *
 * Every row edit is pushed onto a stack. Ctrl+Z pops from the undo stack (reverts
 * the cell to its previous value) and pushes onto the redo stack. Ctrl+Y re-applies.
 *
 * The stack is scoped to a single entry session — it resets on shift/vehicle change.
 */

export interface EditRecord {
  rowId: string;       // samiti_id or milk_entry_id
  field: string;       // field name, e.g. 'quantity_litres', 'fat_pct'
  oldValue: unknown;
  newValue: unknown;
}

export function useEditStack() {
  const undoStack = useRef<EditRecord[]>([]);
  const redoStack = useRef<EditRecord[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const refreshState = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const pushEdit = useCallback((record: EditRecord) => {
    undoStack.current.push(record);
    redoStack.current = []; // Clear redo stack on new edit
    refreshState();
  }, [refreshState]);

  const undo = useCallback((): EditRecord | null => {
    const record = undoStack.current.pop();
    if (!record) return null;
    redoStack.current.push(record);
    refreshState();
    return record;
  }, [refreshState]);

  const redo = useCallback((): EditRecord | null => {
    const record = redoStack.current.pop();
    if (!record) return null;
    undoStack.current.push(record);
    refreshState();
    return record;
  }, [refreshState]);

  const resetStack = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    refreshState();
  }, [refreshState]);

  return { pushEdit, undo, redo, resetStack, canUndo, canRedo };
}
