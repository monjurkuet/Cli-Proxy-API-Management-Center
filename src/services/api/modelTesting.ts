/**
 * Model Testing API Service
 * Uses the existing apiCallApi and modelsApi from the services
 */

import { apiCallApi, getApiCallErrorMessage } from './apiCall';
import { modelsApi } from './models';
import { normalizeApiBase } from '@/utils/connection';
import type { ProviderConfigRef } from '@/features/modelTesting/types';

const TEST_TIMEOUT_MS = 15000;
const TEST_PROMPT = 'hi';
const TEST_MAX_TOKENS = 5;

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function buildHeaders(
  config: ProviderConfigRef,
  authIndex?: string
): Record<string, string> {
  const headers: Record<string, string> = {};

  // Copy custom headers from provider config
  if (config.headers) {
    Object.assign(headers, config.headers);
  }

  // Add authorization if not present
  if (config.apiKey && !hasHeader(headers, 'authorization')) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else if (authIndex && !hasHeader(headers, 'authorization')) {
    headers.Authorization = 'Bearer $TOKEN$';
  }

  return headers;
}

function getApiKeyAndAuthIndex(config: ProviderConfigRef): { apiKey?: string; authIndex?: string } {
  if (config.apiKey?.trim()) {
    return { apiKey: config.apiKey.trim(), authIndex: undefined };
  }
  if (config.authIndex?.trim()) {
    return { apiKey: undefined, authIndex: config.authIndex.trim() };
  }
  return {};
}

export async function fetchAllModels(
  baseUrl: string,
  providerConfigs: ProviderConfigRef[]
): Promise<string[]> {
  // Try each provider config until one works
  for (const config of providerConfigs) {
    try {
      const normalizedBase = normalizeApiBase(config.baseUrl || baseUrl);
      if (!normalizedBase) continue;

      const { apiKey, authIndex } = getApiKeyAndAuthIndex(config);
      const headers = buildHeaders(config, authIndex);

      const modelList = await modelsApi.fetchV1ModelsViaApiCall(
        normalizedBase,
        apiKey,
        headers,
        authIndex,
        config.proxyUrl
      );

      return modelList.map((m) => m.name);
    } catch {
      // Try next provider
      continue;
    }
  }

  // Fallback: try the base URL directly with first config that has auth
  const configWithAuth = providerConfigs.find((c) => c.apiKey || c.authIndex);
  if (configWithAuth) {
    try {
      const normalizedBase = normalizeApiBase(configWithAuth.baseUrl || baseUrl);
      if (normalizedBase) {
        const { apiKey, authIndex } = getApiKeyAndAuthIndex(configWithAuth);
        const headers = buildHeaders(configWithAuth, authIndex);
        const modelList = await modelsApi.fetchV1ModelsViaApiCall(
          normalizedBase,
          apiKey,
          headers,
          authIndex,
          configWithAuth.proxyUrl
        );
        return modelList.map((m) => m.name);
      }
    } catch {
      // Ignore
    }
  }

  return [];
}

export async function testModelCompletion(
  baseUrl: string,
  model: string,
  providerConfig: ProviderConfigRef,
  options: {
    timeoutMs?: number;
    testPrompt?: string;
    maxTokens?: number;
  } = {}
): Promise<{ success: boolean; responseTimeMs: number; error?: string }> {
  const timeoutMs = options.timeoutMs ?? TEST_TIMEOUT_MS;
  const testPrompt = options.testPrompt ?? TEST_PROMPT;
  const maxTokens = options.maxTokens ?? TEST_MAX_TOKENS;

  const normalizedBase = normalizeApiBase(providerConfig.baseUrl || baseUrl);
  if (!normalizedBase) {
    return { success: false, responseTimeMs: 0, error: 'Invalid base URL' };
  }

  // Build the chat completions endpoint
  const endpoint = normalizedBase.replace(/\/+$/, '') + '/v1/chat/completions';

  const { authIndex } = getApiKeyAndAuthIndex(providerConfig);
  const headers = buildHeaders(providerConfig, authIndex);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();

  try {
    const result = await apiCallApi.request({
      authIndex,
      proxy_url: providerConfig.proxyUrl?.trim() || undefined,
      method: 'POST',
      url: endpoint,
      header: headers,
      data: JSON.stringify({
        model,
        messages: [{ role: 'user', content: testPrompt }],
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (result.statusCode >= 200 && result.statusCode < 300) {
      const body = result.body ?? result.bodyText;
      let parsed: unknown;
      try {
        parsed = typeof body === 'string' ? JSON.parse(body) : body;
      } catch {
        parsed = body;
      }

      // Check if response has choices
      if (parsed && typeof parsed === 'object' && 'choices' in parsed) {
        const choices = (parsed as { choices?: unknown[] }).choices;
        if (Array.isArray(choices) && choices.length > 0) {
          return { success: true, responseTimeMs: responseTime };
        }
      }
      return { success: false, responseTimeMs: responseTime, error: 'No choices in response' };
    } else {
      const errorMsg = getApiCallErrorMessage(result);
      return { success: false, responseTimeMs: responseTime, error: errorMsg };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, responseTimeMs: timeoutMs, error: 'Request timed out' };
    }

    return {
      success: false,
      responseTimeMs: responseTime,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export function getProviderConfigsFromAuthStore(): ProviderConfigRef[] {
  // This will be populated by the hook using the auth store
  return [];
}