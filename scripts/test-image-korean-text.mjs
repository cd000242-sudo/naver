#!/usr/bin/env node
/**
 * 나노바나나 3종 + 덕테이프 한글 텍스트 렌더링 검증 스크립트 (v2.10.335 Stage 7)
 *
 * 목적: 그리드/드롭다운 4개 엔진이 한글 텍스트를 이미지 안에 렌더링하는지
 *   실제 API를 호출해 검증한다. 생성된 이미지는 test-output-korean-text/에 저장되어
 *   사용자가 한글이 깨지지 않고 정확히 나오는지 육안으로 최종 확인할 수 있다.
 *
 * 사용법:
 *   GEMINI_API_KEY=... OPENAI_API_KEY=... node scripts/test-image-korean-text.mjs
 *   - 키가 없는 엔진은 SKIP 처리하고 안내를 출력한다 (비치명적).
 *
 * 검증 모델 ID (src/runtime/imageEngineCatalog.ts SSOT와 일치해야 함):
 *   나노바나나2   → gemini-3.1-flash-image
 *   나노바나나프로 → gemini-3-pro-image
 *   나노바나나     → gemini-2.5-flash-image
 *   덕테이프       → gpt-image-2
 */
import fs from 'fs';
import path from 'path';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OUT_DIR = path.resolve('test-output-korean-text');

/** 이미지 안에 렌더링을 요구할 한글 헤드라인 */
const KOREAN_TEXT = '겨울철 건강관리 꿀팁';
const PROMPT =
  `Create a clean blog thumbnail. Render the Korean headline text "${KOREAN_TEXT}" ` +
  `large, bold, and perfectly legible — the Korean characters must be spelled EXACTLY ` +
  `as given with no broken or garbled glyphs. Simple modern background, high contrast.`;

const ENGINES = [
  { name: '나노바나나2', kind: 'gemini', model: 'gemini-3.1-flash-image' },
  { name: '나노바나나프로', kind: 'gemini', model: 'gemini-3-pro-image' },
  { name: '나노바나나', kind: 'gemini', model: 'gemini-2.5-flash-image' },
  { name: '덕테이프', kind: 'openai', model: 'gpt-image-2' },
];

const MIN_VALID_BYTES = 2048;

/** Gemini :generateContent 이미지 생성 */
async function genGemini(model, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 240)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const b64 = imgPart?.inlineData?.data || imgPart?.inline_data?.data;
  if (!b64) throw new Error('응답에 이미지 inlineData 없음');
  return Buffer.from(b64, 'base64');
}

/** OpenAI 이미지 생성 (gpt-image-2 = 덕테이프) */
async function genOpenAI(model, key) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt: PROMPT, n: 1, size: '1024x1024' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 240)}`);
  }
  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const img = await fetch(item.url);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('응답에 b64_json/url 없음');
}

async function runEngine(engine) {
  const key = engine.kind === 'gemini' ? GEMINI_KEY : OPENAI_KEY;
  const keyName = engine.kind === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  if (!key) {
    console.log(`⏭️  [${engine.name}] SKIP — ${keyName} 환경변수 미설정`);
    return { engine: engine.name, status: 'skip' };
  }
  try {
    console.log(`🎨 [${engine.name}] ${engine.model} 호출 중...`);
    const buffer =
      engine.kind === 'gemini'
        ? await genGemini(engine.model, key)
        : await genOpenAI(engine.model, key);
    if (!buffer || buffer.length < MIN_VALID_BYTES) {
      throw new Error(`이미지가 비었거나 손상 (${buffer ? buffer.length : 0} bytes)`);
    }
    const file = path.join(OUT_DIR, `${engine.name}.png`);
    fs.writeFileSync(file, buffer);
    console.log(`✅ [${engine.name}] 성공 — ${Math.round(buffer.length / 1024)}KB → ${file}`);
    return { engine: engine.name, status: 'ok', bytes: buffer.length, file };
  } catch (e) {
    console.log(`❌ [${engine.name}] 실패 — ${e.message}`);
    return { engine: engine.name, status: 'fail', error: e.message };
  }
}

async function main() {
  console.log('═══ 한글 텍스트 이미지 생성 검증 (4개 엔진) ═══');
  console.log(`헤드라인: "${KOREAN_TEXT}"`);
  if (!GEMINI_KEY && !OPENAI_KEY) {
    console.log('\n⚠️  API 키가 하나도 없습니다. 아래처럼 키를 지정해 실행하세요:');
    console.log('   GEMINI_API_KEY=xxx OPENAI_API_KEY=yyy node scripts/test-image-korean-text.mjs\n');
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const results = [];
  for (const engine of ENGINES) {
    results.push(await runEngine(engine));
  }

  console.log('\n═══ 결과 요약 ═══');
  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : r.status === 'skip' ? '⏭️' : '❌';
    console.log(`${icon} ${r.engine}: ${r.status}${r.error ? ` (${r.error})` : ''}`);
  }
  const ok = results.filter((r) => r.status === 'ok').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  console.log(`\n총 ${results.length}개 — 성공 ${ok} / 실패 ${fail} / 스킵 ${skip}`);
  if (ok > 0) {
    console.log(`📂 생성된 이미지를 ${OUT_DIR} 에서 열어 한글이 깨지지 않았는지 육안 확인하세요.`);
  }
  // 실패가 있으면 비정상 종료 (CI에서 감지 가능). 스킵만 있는 경우는 정상 종료.
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('스크립트 오류:', e);
  process.exit(1);
});
