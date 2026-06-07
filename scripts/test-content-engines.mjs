#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_TIMEOUT_MS = Number(process.env.CONTENT_ENGINE_TEST_TIMEOUT_MS || 90_000);
const PROVIDER_FILTER = new Set(
  String(process.env.CONTENT_ENGINE_TEST_PROVIDERS || 'gemini,openai,claude,perplexity')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
);

const CHECK_PROMPT = `Return only valid minified JSON. No markdown.
Schema:
{"selectedTitle":"string","bodyPlain":"string","headings":[{"title":"string","summary":"string"}],"hashtags":["string"]}
Write in Korean about "네이버 블로그 모바일 가독성". bodyPlain must be 250-450 Korean characters.`;

const SETTINGS = loadSettings();

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
        settings.push(JSON.parse(readFileSync(join(dir, file), 'utf-8')));
      } catch {
        // Ignore unreadable user config files. The app can still use env vars.
      }
    }
  }
  return settings;
}

function firstSettingValue(...fields) {
  for (const setting of SETTINGS) {
    for (const field of fields) {
      const value = setting?.[field];
      if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === 'string' && item.trim() && !item.startsWith('enc:v1:'));
        if (first) return first.trim();
      }
      if (typeof value === 'string' && value.trim() && !value.startsWith('enc:v1:')) {
        return value.trim();
      }
    }
  }
  return '';
}

function getKey(envNames, settingFields) {
  const settingValue = firstSettingValue(...settingFields);
  if (settingValue) return settingValue;

  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function getSettingModel(...fields) {
  return firstSettingValue(...fields);
}

function withTimeout(promise, timeoutMs, label) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timeout after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });
  return {
    signal: controller.signal,
    promise: Promise.race([promise(controller.signal), timeout]).finally(() => clearTimeout(timer)),
  };
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('empty response');
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`JSON object not found: ${source.slice(0, 120)}`);
  return JSON.parse(source.slice(start, end + 1));
}

function assertContentShape(provider, json) {
  if (!json || typeof json !== 'object') throw new Error(`${provider}: parsed JSON is not an object`);
  if (typeof json.selectedTitle !== 'string' || json.selectedTitle.trim().length < 5) {
    throw new Error(`${provider}: selectedTitle is too short`);
  }
  if (typeof json.bodyPlain !== 'string' || json.bodyPlain.trim().length < 120) {
    throw new Error(`${provider}: bodyPlain is too short`);
  }
  if (!Array.isArray(json.headings) || json.headings.length < 1) {
    throw new Error(`${provider}: headings missing`);
  }
}

function classifyExternal(error) {
  const message = `${error?.message || error || ''} ${JSON.stringify(error || {})}`.toLowerCase();
  const status = error?.status || error?.response?.status;
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid api key|api key not valid|authentication/.test(message)) {
    return 'auth';
  }
  if (/billing|payment|required|insufficient_quota|credit|balance|hard_limit|monthly usage limit/.test(message)) {
    return 'billing';
  }
  if (status === 429 || /rate limit|too many requests|quota|resource_exhausted|limit: 0|rpm|tpm/.test(message)) {
    return 'quota';
  }
  return '';
}

async function runGemini() {
  const apiKey = getKey(['GEMINI_API_KEY', 'GOOGLE_API_KEY'], ['geminiApiKey', 'geminiApiKeys']);
  if (!apiKey) return skipped('gemini', 'GEMINI_API_KEY not configured');
  const model = process.env.GEMINI_MODEL || getSettingModel('geminiModel') || 'gemini-2.5-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const request = (signal) => genAI.getGenerativeModel({ model }).generateContent(
    {
      contents: [{ role: 'user', parts: [{ text: CHECK_PROMPT }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
    },
    { signal },
  );
  const { promise } = withTimeout(request, DEFAULT_TIMEOUT_MS, 'Gemini');
  const response = await promise;
  const text = response.response.text();
  const json = extractJson(text);
  assertContentShape('gemini', json);
  return passed('gemini', model, text.length);
}

async function runOpenAI() {
  const apiKey = getKey(['OPENAI_API_KEY'], ['openaiApiKey']);
  if (!apiKey) return skipped('openai', 'OPENAI_API_KEY not configured');
  const selected = getSettingModel('primaryGeminiTextModel');
  const mapped = selected === 'openai-gpt41'
    ? 'gpt-4.1'
    : selected === 'openai-gpt4o'
      ? 'gpt-4o'
      : selected === 'openai-gpt4o-search'
        ? 'gpt-4o-search-preview'
        : 'gpt-4.1-mini';
  const model = process.env.OPENAI_STRUCTURED_MODEL || process.env.OPENAI_MODEL || mapped;
  const client = new OpenAI({ apiKey });
  const request = (signal) => client.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: CHECK_PROMPT }],
      max_completion_tokens: 900,
      ...(model.includes('search-preview') ? {} : { temperature: 0.3, response_format: { type: 'json_object' } }),
    },
    { signal },
  );
  const { promise } = withTimeout(request, DEFAULT_TIMEOUT_MS, 'OpenAI');
  const response = await promise;
  const text = response.choices?.[0]?.message?.content || '';
  const json = extractJson(text);
  assertContentShape('openai', json);
  return passed('openai', model, text.length);
}

async function runClaude() {
  const apiKey = getKey(['CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'], ['claudeApiKey']);
  if (!apiKey) return skipped('claude', 'CLAUDE_API_KEY not configured');
  const selected = getSettingModel('primaryGeminiTextModel');
  const mapped = selected === 'claude-haiku'
    ? 'claude-haiku-4-5-20251001'
    : selected === 'claude-opus'
      ? 'claude-opus-4-7'
      : 'claude-sonnet-4-6';
  const model = process.env.CLAUDE_STRUCTURED_MODEL || process.env.CLAUDE_MODEL || mapped;
  const client = new Anthropic({ apiKey });
  const request = (signal) => client.messages.create(
    {
      model,
      max_tokens: 900,
      temperature: 0.3,
      messages: [{ role: 'user', content: CHECK_PROMPT }],
    },
    { signal },
  );
  const { promise } = withTimeout(request, DEFAULT_TIMEOUT_MS, 'Claude');
  const response = await promise;
  const text = response.content?.map((block) => block.type === 'text' ? block.text : '').join('') || '';
  const json = extractJson(text);
  assertContentShape('claude', json);
  return passed('claude', model, text.length);
}

async function runPerplexity() {
  const apiKey = getKey(['PERPLEXITY_API_KEY'], ['perplexityApiKey']);
  if (!apiKey) return skipped('perplexity', 'PERPLEXITY_API_KEY not configured');
  const model = process.env.PERPLEXITY_MODEL || getSettingModel('perplexityModel') || 'sonar';
  const client = new OpenAI({ apiKey, baseURL: 'https://api.perplexity.ai' });
  const request = (signal) => client.chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: 'Return strict JSON only. Do not use markdown.' },
        { role: 'user', content: CHECK_PROMPT },
      ],
      temperature: 0.3,
      max_tokens: 900,
    },
    { signal },
  );
  const { promise } = withTimeout(request, DEFAULT_TIMEOUT_MS, 'Perplexity');
  const response = await promise;
  const text = response.choices?.[0]?.message?.content || '';
  const json = extractJson(text);
  assertContentShape('perplexity', json);
  return passed('perplexity', model, text.length);
}

function passed(provider, model, chars) {
  return { provider, status: 'pass', model, chars };
}

function skipped(provider, reason) {
  return { provider, status: 'external', reason };
}

async function runProvider(provider, fn) {
  if (!PROVIDER_FILTER.has(provider)) return null;
  const start = Date.now();
  try {
    const result = await fn();
    result.ms = Date.now() - start;
    return result;
  } catch (error) {
    const external = classifyExternal(error);
    if (external) {
      return {
        provider,
        status: 'external',
        reason: external,
        message: String(error?.message || error).slice(0, 300),
        ms: Date.now() - start,
      };
    }
    return {
      provider,
      status: 'fail',
      message: String(error?.message || error).slice(0, 500),
      ms: Date.now() - start,
    };
  }
}

const runners = [
  ['gemini', runGemini],
  ['openai', runOpenAI],
  ['claude', runClaude],
  ['perplexity', runPerplexity],
];

console.log('[content-engines] starting live engine smoke test');
console.log(`[content-engines] providers=${[...PROVIDER_FILTER].join(',')} timeout=${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s`);

const results = (await Promise.all(runners.map(([provider, fn]) => runProvider(provider, fn)))).filter(Boolean);
for (const result of results) {
  if (result.status === 'pass') {
    console.log(`PASS ${result.provider} model=${result.model} chars=${result.chars} time=${Math.round(result.ms / 1000)}s`);
  } else if (result.status === 'external') {
    console.log(`EXTERNAL ${result.provider} reason=${result.reason || 'not configured'} time=${Math.round((result.ms || 0) / 1000)}s`);
  } else {
    console.error(`FAIL ${result.provider} time=${Math.round(result.ms / 1000)}s message=${result.message}`);
  }
}

const failures = results.filter((result) => result.status === 'fail');
if (failures.length > 0) {
  console.error(`[content-engines] ${failures.length} engine(s) failed for non-billing/non-quota reasons`);
  process.exit(1);
}

console.log('[content-engines] done: no non-external engine errors');
