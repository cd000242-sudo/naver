/**
 * LEWORD 비서(2026-10-01) — 사이트는 이 PC 앱 브리지로만 묻는다(사용자 본인 구독). 운영자 키 · 외부 AI 직접 호출 금지.
 * 규칙 · 설명서는 앱이 붙인다 — 사이트가 지시문을 보내면 브리지가 임의 프롬프트 통로가 된다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('비서는 앱 브리지 한 경로로만 대화 · 화면 자료를 보낸다', () => {
  const src = read('../src/lib/assistantChat.ts');
  assert.match(src, /bridgeCall<AssistantReply>\('\/v1\/bridge\/my-blog\/assistant'/);
  assert.match(src, /JSON\.stringify\(\{ turns: turns\.slice\(-MAX_TURNS\), page, facts: facts\.slice\(0, MAX_FACTS\) \}\)/);
  assert.doesNotMatch(src, /system|prompt|callWorkerRaw|api\.anthropic\.com|api\.openai\.com|generativelanguage|loadUserKeys/);
});
test('비서 창은 운영자 연결을 1:1 문의로 잇고, 로그인한 사람에게만 열린다', () => {
  const panel = read('../src/components/leword/AssistantPanel.tsx');
  assert.match(panel, /OPERATOR_INQUIRY_URL/);
  assert.match(panel, /m\.escalate &&/);
  assert.doesNotMatch(panel, /fetch\(/);
  const page = read('../src/pages/LewordPage.tsx');
  assert.match(page, /\{assistantOpen && session && \(/);
});
