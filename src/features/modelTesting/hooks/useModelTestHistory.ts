/**
 * Model Test History Hook
 */

import { useState, useCallback, useEffect } from 'react';
import type { ModelTestHistoryEntry } from '../types';
import { loadTestHistory, clearTestHistory } from '../utils';

export function useModelTestHistory() {
  const [history, setHistory] = useState<ModelTestHistoryEntry[]>([]);

  useEffect(() => {
    const loaded = loadTestHistory();
    setHistory(loaded);
  }, []);

  const refresh = useCallback(() => {
    const loaded = loadTestHistory();
    setHistory(loaded);
  }, []);

  const clear = useCallback(() => {
    clearTestHistory();
    setHistory([]);
  }, []);

  return {
    history,
    refresh,
    clear,
  };
}