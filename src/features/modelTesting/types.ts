/**
 * Model Testing Feature Types
 */

export type ModelTestStatus = 'pending' | 'working' | 'timeout' | 'error';

export interface ModelTestResult {
  model: string;
  status: ModelTestStatus;
  responseTimeMs: number | null;
  errorMessage: string | null;
  testedAt: string;
  providerFamily: string;
  providerConfigId: string;
  providerConfigName?: string;
}

export interface ModelTestHistoryEntry {
  timestamp: string;
  results: ModelTestResult[];
  apiBase: string;
  totalModels: number;
  working: number;
  timeout: number;
  error: number;
}

export interface ModelInfo {
  id: string;
  ownedBy?: string;
  displayName?: string;
}

export interface ProviderConfigRef {
  id: string;
  brand: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  authIndex?: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
}

export interface ModelTestingState {
  models: ModelInfo[];
  results: Record<string, ModelTestResult>;
  isLoading: boolean;
  isTesting: boolean;
  currentTestingModel: string | null;
  progress: {
    current: number;
    total: number;
  };
  lastTestRun: ModelTestHistoryEntry | null;
  error: string | null;
}

export interface TestModelOptions {
  model: string;
  providerConfig: ProviderConfigRef;
  timeoutMs?: number;
  testPrompt?: string;
  maxTokens?: number;
}