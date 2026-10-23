/**
 * Model Testing Feature Utilities
 */

import type { ModelTestResult, ModelTestStatus, ModelTestHistoryEntry } from './types';

export const MODEL_TEST_STATUSES: Record<ModelTestStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#6b7280' },
  working: { label: 'Working', color: '#10b981' },
  timeout: { label: 'Timeout', color: '#f59e0b' },
  error: { label: 'Error', color: '#ef4444' },
};

export function formatResponseTime(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  } catch {
    return iso;
  }
}

export function getStatusBadgeClass(status: ModelTestStatus): string {
  const base = 'status-badge';
  const colors: Record<ModelTestStatus, string> = {
    pending: 'status-pending',
    working: 'status-working',
    timeout: 'status-timeout',
    error: 'status-error',
  };
  return `${base} ${colors[status]}`;
}

export function generateCSV(results: ModelTestResult[], apiBase: string): string {
  const headers = [
    'timestamp',
    'model',
    'status',
    'response_time_ms',
    'error_message',
    'provider_family',
    'provider_config_id',
    'provider_config_name',
    'api_base',
  ];

  const rows = results.map((r) => [
    r.testedAt,
    r.model,
    r.status,
    r.responseTimeMs?.toString() ?? '',
    r.errorMessage ?? '',
    r.providerFamily,
    r.providerConfigId,
    r.providerConfigName ?? '',
    apiBase,
  ]);

  return [headers.join(','), ...rows.map((row) => row.map(escapeCSV).join(','))].join('\n');
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function saveTestHistory(entry: ModelTestHistoryEntry): void {
  try {
    const existing = loadTestHistory();
    const updated = [entry, ...existing.slice(0, 49)]; // Keep last 50 entries
    localStorage.setItem('modelTestingHistory', JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
}

export function loadTestHistory(): ModelTestHistoryEntry[] {
  try {
    const stored = localStorage.getItem('modelTestingHistory');
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function clearTestHistory(): void {
  try {
    localStorage.removeItem('modelTestingHistory');
  } catch {
    // Ignore
  }
}

export function createInitialResult(model: string, providerFamily: string, providerConfigId: string): ModelTestResult {
  return {
    model,
    status: 'pending',
    responseTimeMs: null,
    errorMessage: null,
    testedAt: new Date().toISOString(),
    providerFamily,
    providerConfigId,
  };
}

export function groupModelsByProvider(models: Array<{ id: string; ownedBy?: string }>, providerConfigs: Map<string, string>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const model of models) {
    // Try to find which provider owns this model
    let provider = model.ownedBy || 'unknown';
    // Normalize provider name
    provider = provider.toLowerCase().replace(/\s+/g, '-');
    // Check if we have a configured provider for this model
    if (providerConfigs.has(model.id)) {
      provider = providerConfigs.get(model.id)!;
    }
    const existing = grouped.get(provider) || [];
    existing.push(model.id);
    grouped.set(provider, existing);
  }

  return grouped;
}