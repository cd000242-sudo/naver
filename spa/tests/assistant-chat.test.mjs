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
  // 2026-10-06: 우측 상단 떠 있는 버튼으로 접었다 편다 — 패널은 로그인했을 때만 붙고, 접으면 숨기기만 해 대화가 남는다.
  assert.match(page, /\{session && \(\s*<AssistantPanel open=\{assistantOpen\}/);
  assert.match(page, /if \(!session\) \{ setAuthOpen\(true\); return; \}/);
  assert.match(panel, /display: open \? 'flex' : 'none'/);
});

test('비서 버튼은 본문 맨 위 고정 띠 안에 있어 스크롤해도 남고 내용과 안 겹친다(2026-10-06)', () => {
  const fab = read('../src/components/leword/AssistantFab.tsx');
  assert.match(fab, /aria-expanded=\{open\}/);
  const page = read('../src/pages/LewordPage.tsx');
  assert.match(page, /<div className="lw-assist-bar">\s*<AssistantFab docked/);
  const styles = read('../src/components/leword/LewordStyles.tsx');
  assert.match(styles, /\.lw-assist-bar \{ position: sticky; top: 72px;/);
});
