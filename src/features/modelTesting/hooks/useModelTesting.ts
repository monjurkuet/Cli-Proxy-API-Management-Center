/**
 * Model Testing Hook
 * Core logic for fetching models and running tests
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores';
import { useNotificationStore } from '@/stores';
import { providersApi } from '@/services/api';
import { fetchAllModels, testModelCompletion } from '@/services/api/modelTesting';
import type {
  ModelInfo,
  ModelTestResult,
  ModelTestStatus,
  ProviderConfigRef,
  ModelTestHistoryEntry,
} from '@/features/modelTesting/types';
import {
  createInitialResult,
  saveTestHistory,
  loadTestHistory,
  generateCSV,
  downloadCSV,
} from '@/features/modelTesting/utils';

const TEST_DELAY_MS = 100; // Small delay between tests to avoid rate limiting

export interface UseModelTestingResult {
  // State
  models: ModelInfo[];
  results: Record<string, ModelTestResult>;
  isLoading: boolean;
  isTesting: boolean;
  currentTestingModel: string | null;
  progress: { current: number; total: number };
  lastTestRun: ModelTestHistoryEntry | null;
  error: string | null;
  history: ModelTestHistoryEntry[];

  // Actions
  fetchModels: () => Promise<void>;
  testModel: (model: string, providerConfig: ProviderConfigRef) => Promise<void>;
  testAllModels: () => Promise<void>;
  testSelectedModels: (modelIds: string[]) => Promise<void>;
  clearResults: () => void;
  exportResults: () => void;
  loadHistory: () => void;
}

export function useModelTesting(): UseModelTestingResult {
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const apiBase = useAuthStore((s) => s.apiBase);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [results, setResults] = useState<Record<string, ModelTestResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [currentTestingModel, setCurrentTestingModel] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastTestRun, setLastTestRun] = useState<ModelTestHistoryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ModelTestHistoryEntry[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const providerConfigsRef = useRef<ProviderConfigRef[]>([]);

  // Load history on mount
  useEffect(() => {
    const loaded = loadTestHistory();
    setHistory(loaded);
    if (loaded.length > 0) {
      setLastTestRun(loaded[0]);
    }
  }, []);

  // Fetch provider configs when authenticated
  useEffect(() => {
    if (connectionStatus === 'connected' && isAuthenticated) {
      loadProviderConfigs();
    }
  }, [connectionStatus, isAuthenticated]);

  const loadProviderConfigs = useCallback(async () => {
    if (!apiBase) return;

    try {
      const configs: ProviderConfigRef[] = [];

      // Get Meta configs
      try {
        const metaConfigs = await providersApi.getMetaConfigs();
        for (const cfg of metaConfigs) {
          configs.push({
            id: cfg.authIndex || (cfg.source ? String(cfg.source.groupIndex) : `meta-${Math.random().toString(36).slice(2)}`),
            brand: 'meta',
            name: 'Meta',
            baseUrl: cfg.baseUrl || apiBase,
            apiKey: cfg.apiKey,
            authIndex: cfg.authIndex,
            proxyUrl: cfg.proxyUrl,
            headers: cfg.headers,
          });
        }
      } catch { /* ignore */ }

      // Get Vertex configs
      try {
        const vertexConfigs = await providersApi.getVertexConfigs();
        for (const cfg of vertexConfigs) {
          configs.push({
            id: cfg.authIndex || (cfg.source ? String(cfg.source.groupIndex) : `vertex-${Math.random().toString(36).slice(2)}`),
            brand: 'vertex',
            name: 'Vertex AI',
            baseUrl: cfg.baseUrl || apiBase,
            apiKey: cfg.apiKey,
            authIndex: cfg.authIndex,
            proxyUrl: cfg.proxyUrl,
            headers: cfg.headers,
          });
        }
      } catch { /* ignore */ }

      // Get OpenAI Compatibility providers
      try {
        const openaiProviders = await providersApi.getOpenAIProviders();
        for (const provider of openaiProviders) {
          if (provider.apiKeyEntries && provider.apiKeyEntries.length > 0) {
            for (let i = 0; i < provider.apiKeyEntries.length; i++) {
              const entry = provider.apiKeyEntries[i];
              configs.push({
                id: `${provider.name || 'openai'}-${entry.sourceIndex ?? i}`,
                brand: 'openaiCompatibility',
                name: provider.name || 'OpenAI Compatible',
                baseUrl: provider.baseUrl || apiBase,
                apiKey: entry.apiKey,
                authIndex: entry.authIndex,
                proxyUrl: entry.proxyUrl,
                headers: provider.headers,
              });
            }
          } else {
            configs.push({
              id: provider.name || `openai-${Math.random().toString(36).slice(2)}`,
              brand: 'openaiCompatibility',
              name: provider.name || 'OpenAI Compatible',
              baseUrl: provider.baseUrl || apiBase,
              apiKey: undefined,
              authIndex: undefined,
              proxyUrl: undefined,
              headers: provider.headers,
            });
          }
        }
      } catch { /* ignore */ }

      providerConfigsRef.current = configs;
    } catch (err) {
      console.error('Failed to load provider configs:', err);
    }
  }, [apiBase]);

  const fetchModels = useCallback(async () => {
    if (!apiBase || connectionStatus !== 'connected') {
      setError('Not connected to API');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the first available provider config to fetch models
      const firstConfig = providerConfigsRef.current[0];
      if (!firstConfig) {
        // Try to load configs first
        await loadProviderConfigs();
      }

      const modelList = await fetchAllModels(apiBase, providerConfigsRef.current);

      const modelInfos: ModelInfo[] = modelList.map((id) => ({ id }));
      setModels(modelInfos);

      // Initialize results for new models
      setResults((prev) => {
        const next = { ...prev };
        for (const model of modelInfos) {
          if (!next[model.id]) {
            next[model.id] = createInitialResult(model.id, 'unknown', 'unknown');
          }
        }
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch models';
      setError(msg);
      showNotification(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, connectionStatus, loadProviderConfigs, showNotification]);

  const testModel = useCallback(
    async (model: string, providerConfig: ProviderConfigRef) => {
      if (!apiBase) return;

      setResults((prev) => ({
        ...prev,
        [model]: {
          ...prev[model],
          status: 'pending' as ModelTestStatus,
          testedAt: new Date().toISOString(),
          providerFamily: providerConfig.brand,
          providerConfigId: providerConfig.id,
          providerConfigName: providerConfig.name,
        },
      }));

      try {
        const result = await testModelCompletion(apiBase, model, providerConfig);

        setResults((prev) => ({
          ...prev,
          [model]: {
            ...prev[model],
            status: result.success ? 'working' : 'error',
            responseTimeMs: result.responseTimeMs,
            errorMessage: result.error ?? null,
            testedAt: new Date().toISOString(),
            providerFamily: providerConfig.brand,
            providerConfigId: providerConfig.id,
            providerConfigName: providerConfig.name,
          },
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Test failed';
        setResults((prev) => ({
          ...prev,
          [model]: {
            ...prev[model],
            status: 'error',
            responseTimeMs: null,
            errorMessage: msg,
            testedAt: new Date().toISOString(),
            providerFamily: providerConfig.brand,
            providerConfigId: providerConfig.id,
            providerConfigName: providerConfig.name,
          },
        }));
      }
    },
    [apiBase]
  );

  const testAllModels = useCallback(async () => {
    if (!apiBase || models.length === 0) return;
    if (providerConfigsRef.current.length === 0) {
      showNotification('No provider configurations available', 'error');
      return;
    }

    abortRef.current = new AbortController();
    setIsTesting(true);
    setProgress({ current: 0, total: models.length });
    setError(null);

    // Default to first provider config for all models
    const defaultConfig = providerConfigsRef.current[0];

    for (let i = 0; i < models.length; i++) {
      if (abortRef.current?.signal.aborted) break;

      const model = models[i].id;
      setCurrentTestingModel(model);
      setProgress({ current: i + 1, total: models.length });

      await testModel(model, defaultConfig);

      // Small delay between tests
      if (i < models.length - 1) {
        await new Promise((r) => setTimeout(r, TEST_DELAY_MS));
      }
    }

    setIsTesting(false);
    setCurrentTestingModel(null);

    // Save to history
    const historyEntry: ModelTestHistoryEntry = {
      timestamp: new Date().toISOString(),
      results: Object.values(results),
      apiBase,
      totalModels: models.length,
      working: Object.values(results).filter((r) => r.status === 'working').length,
      timeout: Object.values(results).filter((r) => r.status === 'timeout').length,
      error: Object.values(results).filter((r) => r.status === 'error').length,
    };

    saveTestHistory(historyEntry);
    setHistory((prev) => [historyEntry, ...prev.slice(0, 49)]);
    setLastTestRun(historyEntry);

    showNotification(
      `Tested ${models.length} models: ${historyEntry.working} working, ${historyEntry.timeout} timeout, ${historyEntry.error} errors`,
      historyEntry.error > 0 ? 'warning' : 'success'
    );
  }, [apiBase, models, testModel, showNotification]);

  const testSelectedModels = useCallback(
    async (modelIds: string[]) => {
      if (!apiBase || modelIds.length === 0) return;
      if (providerConfigsRef.current.length === 0) {
        showNotification('No provider configurations available', 'error');
        return;
      }

      abortRef.current = new AbortController();
      setIsTesting(true);
      setProgress({ current: 0, total: modelIds.length });
      setError(null);

      const defaultConfig = providerConfigsRef.current[0];

      for (let i = 0; i < modelIds.length; i++) {
        if (abortRef.current?.signal.aborted) break;

        const model = modelIds[i];
        setCurrentTestingModel(model);
        setProgress({ current: i + 1, total: modelIds.length });

        await testModel(model, defaultConfig);

        if (i < modelIds.length - 1) {
          await new Promise((r) => setTimeout(r, TEST_DELAY_MS));
        }
      }

      setIsTesting(false);
      setCurrentTestingModel(null);
      showNotification(`Tested ${modelIds.length} selected models`, 'success');
    },
    [apiBase, testModel, showNotification]
  );

  const clearResults = useCallback(() => {
    setResults({});
    setLastTestRun(null);
    setProgress({ current: 0, total: 0 });
  }, []);

  const exportResults = useCallback(() => {
    const resultValues = Object.values(results);
    if (resultValues.length === 0) {
      showNotification('No results to export', 'warning');
      return;
    }

    const csv = generateCSV(resultValues, apiBase);
    const filename = `model-test-results-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
    showNotification('Results exported to CSV', 'success');
  }, [results, apiBase, showNotification]);

  const loadHistory = useCallback(() => {
    const loaded = loadTestHistory();
    setHistory(loaded);
    if (loaded.length > 0) {
      setLastTestRun(loaded[0]);
    }
  }, []);

  return {
    models,
    results,
    isLoading,
    isTesting,
    currentTestingModel,
    progress,
    lastTestRun,
    error,
    history,
    fetchModels,
    testModel,
    testAllModels,
    testSelectedModels,
    clearResults,
    exportResults,
    loadHistory,
  };
}