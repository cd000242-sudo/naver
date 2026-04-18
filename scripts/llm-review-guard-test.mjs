// SPEC-REVIEW-001 P0 — live LLM verification script.
//
// Purpose: exercise the real shopping-connect assembly path (productBlock +
// shopping_review.prompt + review guard block) against OpenAI so we can see
// what the model actually produces when no review data is available. This
// is what the vitest smoke test cannot cover.
//
// Usage:
//   OPENAI_API_KEY=sk-... node scripts/llm-review-guard-test.mjs
//
// Inputs: 3 fixtures (가전/뷰티/식품), each with reviews=[].
// Outputs: console dump of the system prompt length, the model response,
// and a forbidden-phrase scan verdict.

import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildReviewGuardBlock } = require('../dist/content/reviewGuard.js');
const { scanForbiddenPhrases } = require('../dist/content/forbiddenPhrases.js');

const MODEL = process.env.LLM_TEST_MODEL || 'gpt-4o-mini';

const FIXTURES = [
  {
    category: '가전 (로봇청소기)',
    articleType: 'shopping_review',
    name: '스마트 로봇청소기 X100',
    spec: '흡입력 3,000Pa, 배터리 사용시간 150분, 무게 2.8kg, 본체 높이 9.5cm, 물걸레 겸용, LDS 레이저 매핑, 앱 원격 제어',
    price: '299,000원',
  },
  {
    category: '뷰티 (비타민C 앰플)',
    articleType: 'shopping_review',
    name: '퓨어 비타민C 앰플 20',
    spec: '용량 30ml, 순수 비타민C 20% 함유, 비건 인증, 무향, 펌프 타입, 이중 진공 포장',
    price: '38,000원',
  },
  {
    category: '식품 (유기농 냉동 블루베리)',
    articleType: 'shopping_review',
    name: '국내산 유기농 냉동 블루베리',
    spec: '중량 1kg, 국내산 유기농 인증, 냉동 IQF 방식, 세척 후 냉동, 보관 -18°C 이하',
    price: '24,900원',
  },
];

function loadShoppingPromptFile(articleType) {
  const base = path.resolve('./src/prompts/affiliate');
  const file = articleType === 'shopping_expert_review'
    ? 'shopping_expert_review.prompt'
    : 'shopping_review.prompt';
  const full = path.join(base, file);
  return fs.readFileSync(full, 'utf-8');
}

function assembleSystemPrompt(fx) {
  const productBlock = [
    '[쇼핑커넥트 제품 정보 - 반드시 활용하세요!]',
    `📦 제품명: ${fx.name}`,
    `💰 가격: ${fx.price}`,
    `📋 스펙: ${fx.spec}`,
    '⚠️ 실제 구매자 리뷰 데이터가 수집되지 않았습니다 — 스펙/공식 설명 기반 분석 모드로 작성하세요.',
    '(체험 서술, 기간 주장, 수령 시점 묘사는 아래 P0 가드 블록에서 금지됩니다.)',
  ].join('\n');

  const shoppingPrompt = loadShoppingPromptFile(fx.articleType)
    .replace(/\{\{TONE_STYLE\}\}/g, 'friendly');

  const guard = buildReviewGuardBlock({
    reviewCount: 0,
    hasSpec: true,
    hasPrice: true,
  });

  return [productBlock, shoppingPrompt, guard].join('\n\n');
}

async function runOne(fx, client) {
  const system = assembleSystemPrompt(fx);
  const user = `위 제품 정보를 바탕으로 네이버 블로그에 올릴 쇼핑커넥트 리뷰 글을 작성해주세요. JSON이나 구조화된 형식이 아닌, 제목 한 줄 + 본문(소제목 포함)으로 자연스러운 블로그 글로만 출력하세요.`;

  const started = Date.now();
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  });
  const elapsed = Date.now() - started;

  const body = res.choices?.[0]?.message?.content ?? '';
  const scan = scanForbiddenPhrases(body);
  const usage = res.usage || {};

  return {
    category: fx.category,
    systemPromptChars: system.length,
    responseChars: body.length,
    elapsedMs: elapsed,
    tokens: {
      prompt: usage.prompt_tokens,
      completion: usage.completion_tokens,
      total: usage.total_tokens,
    },
    forbidden: scan,
    body,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing. Aborting.');
    process.exit(1);
  }

  const client = new OpenAI();
  const filterIdx = process.env.FIXTURE_INDEX;
  const fixtures = filterIdx != null ? [FIXTURES[Number(filterIdx)]] : FIXTURES;

  console.log(`Model: ${MODEL}`);
  console.log(`Fixtures: ${fixtures.length}${filterIdx != null ? ` (filtered index=${filterIdx})` : ''}\n`);

  const results = [];
  for (const fx of fixtures) {
    console.log(`--- Running: ${fx.category} ---`);
    try {
      const r = await runOne(fx, client);
      results.push(r);
      console.log(`  system prompt: ${r.systemPromptChars} chars`);
      console.log(`  response:      ${r.responseChars} chars, ${r.elapsedMs}ms`);
      console.log(`  tokens:        ${r.tokens.prompt} in + ${r.tokens.completion} out = ${r.tokens.total}`);
      console.log(`  forbidden:     ${r.forbidden.clean ? 'CLEAN' : 'FAIL — ' + r.forbidden.matches.join(', ')}`);
      console.log('');
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ category: fx.category, error: err.message });
    }
  }

  console.log('\n\n================ FULL OUTPUTS ================\n');
  for (const r of results) {
    if (r.error) continue;
    console.log(`\n========== ${r.category} ==========`);
    console.log(r.body);
    console.log(`\n[forbidden scan] ${r.forbidden.clean ? 'CLEAN' : 'HITS: ' + r.forbidden.matches.join(', ')}`);
    console.log('----------------------------------------');
  }

  const allClean = results.every((r) => r.forbidden?.clean);
  console.log(`\n=== VERDICT ===`);
  console.log(allClean ? 'All fixtures CLEAN (0 forbidden phrases).' : 'At least one fixture has forbidden phrases.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
