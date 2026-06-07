#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TIMEOUT_MS = Number(process.env.OPENAI_ACCESS_TEST_TIMEOUT_MS || 30_000);
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

function appDataRoot() {
  return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
}

function loadSettings() {
  const dirs = [
    join(appDataRoot(), 'better-life-naver'),
    join(appDataRoot(), 'Better Life Naver'),
    join(process.cwd(), 'config'),
  ];
  const settings = [];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!/^settings.*\.json$/i.test(file) && file !== '.config.json') continue;
      try {
        settings.push({
          file: join(dir, file),
          data: JSON.parse(readFileSync(join(dir, file), 'utf-8')),
        });
      } catch {
        // Ignore unreadable settings files.
      }
    }
  }

  return settings;
}

function readConfigValue(settings, field) {
  for (const item of settings) {
    const value = item.data?.[field];
    if (typeof value === 'string' && value.trim()) {
      return { value: value.trim(), source: `${field} in ${item.file}` };
    }
  }
  return null;
}

function resolveOpenAiKeyCandidates(settings) {
  const candidates = [];
  let encryptedInSettings = false;

  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) {
    candidates.push({ key: envKey, source: 'OPENAI_API_KEY env' });
  }

  for (const item of settings) {
    const value = item.data?.openaiApiKey;
    if (typeof value !== 'string' || !value.trim()) continue;
    const trimmed = value.trim();
    if (trimmed.startsWith('enc:v1:')) {
      encryptedInSettings = true;
      continue;
    }
    if (!candidates.some((candidate) => candidate.key === trimmed)) {
      candidates.push({ key: trimmed, source: `openaiApiKey in ${item.file}` });
    }
  }

  return { candidates, encryptedInSettings };
}

function resolveConfiguredModels(settings) {
  const selected = readConfigValue(settings, 'primaryGeminiTextModel')?.value || '';
  const structured = process.env.OPENAI_STRUCTURED_MODEL || process.env.OPENAI_MODEL || '';
  const mapped = selected === 'openai-gpt41'
    ? 'gpt-4.1'
    : selected === 'openai-gpt4o'
      ? 'gpt-4o'
      : selected === 'openai-gpt4o-search'
        ? 'gpt-4o-search-preview'
        : selected === 'openai-gpt4o-mini'
          ? 'gpt-4.1-mini'
          : '';

  return [...new Set([
    structured,
    mapped,
    'gpt-4.1-mini',
    'gpt-4.1',
    'gpt-4o',
  ].filter(Boolean))];
}

function redact(text, key) {
  return String(text || '')
    .replaceAll(key, '[redacted-openai-key]')
    .replace(/sk-[a-z0-9_-]*\*+[a-z0-9_-]*/gi, '[redacted-openai-key]')
    .replace(/sk-[a-z0-9_-]{8,}/gi, '[redacted-openai-key]')
    .slice(0, 500);
}

function classifyOpenAiError(status, payload) {
  const error = payload?.error || {};
  const code = String(error.code || '').toLowerCase();
  const type = String(error.type || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();

  if (status === 401 || /invalid api key|incorrect api key|api key/.test(message)) return 'auth_invalid_key';
  if (status === 403) return 'permission_or_project_forbidden';
  if (status === 404 || code === 'model_not_found') return 'model_unavailable_or_no_access';
  if (/insufficient_quota|billing_hard_limit|credit|balance|payment/.test(`${code} ${type} ${message}`)) return 'billing_or_credit';
  if (status === 429 || /rate_limit|quota|too many/.test(`${code} ${type} ${message}`)) return 'rate_limit_or_quota';
  return 'unknown_api_error';
}

async function fetchWithTimeout(url, options, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }
    return { response, payload };
  } catch (error) {
    throw new Error(`${label} request failed: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

async function openAiRequest(path, key, body) {
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  return fetchWithTimeout(
    `${OPENAI_BASE_URL}${path}`,
    body ? { method: 'POST', headers, body: JSON.stringify(body) } : { method: 'GET', headers },
    path,
  );
}

async function main() {
  const settings = loadSettings();
  const { candidates, encryptedInSettings } = resolveOpenAiKeyCandidates(settings);
  const modelsToTest = resolveConfiguredModels(settings);

  console.log('[openai-access] OpenAI access diagnosis started');
  console.log(`[openai-access] settings files scanned: ${settings.length}`);

  if (candidates.length === 0) {
    if (encryptedInSettings) {
      console.log('[openai-access] EXTERNAL auth: OpenAI key exists only as encrypted Electron safeStorage data. Standalone diagnosis cannot decrypt it.');
      console.log('[openai-access] Set OPENAI_API_KEY in the shell, or run the in-app generation path to use the encrypted key.');
    } else {
      console.log('[openai-access] EXTERNAL auth: OPENAI_API_KEY/openaiApiKey is not configured.');
    }
    process.exit(2);
  }

  if (encryptedInSettings) {
    console.log('[openai-access] note: encrypted OpenAI key also exists in settings, but this standalone script can only test env/plaintext candidates.');
  }

  let totalPassed = 0;
  for (const [index, candidate] of candidates.entries()) {
    const key = candidate.key;
    console.log(`[openai-access] candidate ${index + 1}/${candidates.length}: ${candidate.source}`);
    console.log(`[openai-access] candidate ${index + 1} key length: ${key.length} chars`);

    const modelList = await openAiRequest('/models', key);
    if (!modelList.response.ok) {
      const reason = classifyOpenAiError(modelList.response.status, modelList.payload);
      console.log(`[openai-access] FAIL candidate ${index + 1} /models status=${modelList.response.status} reason=${reason}`);
      console.log(`[openai-access] message=${redact(modelList.payload?.error?.message || modelList.payload?.raw || '', key)}`);
      continue;
    }

    const availableIds = new Set((modelList.payload?.data || []).map((model) => model.id));
    console.log(`[openai-access] PASS candidate ${index + 1} /models count=${availableIds.size}`);

    let candidatePassed = 0;
    for (const model of modelsToTest) {
      const listed = availableIds.has(model) ? 'listed' : 'not-listed';
      const body = {
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_completion_tokens: 20,
      };

      const result = await openAiRequest('/chat/completions', key, body);
      if (result.response.ok) {
        const text = result.payload?.choices?.[0]?.message?.content || '';
        console.log(`[openai-access] PASS candidate ${index + 1} ${model} (${listed}) reply=${JSON.stringify(String(text).trim())}`);
        candidatePassed++;
        totalPassed++;
        continue;
      }

      const reason = classifyOpenAiError(result.response.status, result.payload);
      console.log(`[openai-access] FAIL candidate ${index + 1} ${model} (${listed}) status=${result.response.status} reason=${reason}`);
      console.log(`[openai-access] message=${redact(result.payload?.error?.message || result.payload?.raw || '', key)}`);
    }

    console.log(`[openai-access] candidate ${index + 1} usable models: ${candidatePassed}/${modelsToTest.length}`);
  }

  if (totalPassed === 0) {
    console.log('[openai-access] RESULT: no tested OpenAI chat model is usable with this key.');
    process.exit(2);
  }

  console.log(`[openai-access] RESULT: ${totalPassed} tested OpenAI chat model call(s) usable across ${candidates.length} candidate key(s).`);
}

main().catch((error) => {
  console.error(`[openai-access] ERROR ${error?.message || error}`);
  process.exit(1);
});
