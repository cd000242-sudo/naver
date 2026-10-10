/**
 * 홈판 벤치마크 카드의 [지금 제목 만들기](2026-10-07). 회차가 1,000장 중 25장만 제목을 붙여 나머지는 '제목 준비 중'뿐이었다.
 * 비어 있는 카드는 앱(본인 구독)이 회차와 같은 엔진으로 바로 짓는다 — 배선이 끊기면 다시 '준비 중'만 남는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('제목이 없는 카드는 준비 중 대신 [지금 제목 만들기]를 그린다', () => {
  const card = read('../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx');
  assert.ok(!card.includes('제목 준비 중 — 다음 회차에 붙습니다'), '옛 준비 중 문구가 남아 있다');
  assert.ok(card.includes('titles.length===0&&<MakeTitles'), '편집자 제목만 있어도 20개 목록이 없으면 버튼이 보여야 한다');
  assert.ok(card.includes('bridgeBenchmarkTitles(card)'));
  assert.ok(card.includes('localStorage.setItem(MADE_KEY(c.id)'), '만든 제목을 이 브라우저에 기억한다');
  assert.ok(card.includes("r.status==='offline'") && card.includes("r.status==='outdated'"), '앱 꺼짐 · 구버전 안내');
});

test('브리지는 앱의 벤치마크 제목 경로로 POST 하고 4분까지 기다린다', () => {
  const bridge = read('../src/lib/bridge.ts');
  const at = bridge.indexOf("'/v1/bridge/benchmark-titles'");
  assert.ok(at > 0);
  const seg = bridge.slice(at, at + 260);
  assert.ok(seg.includes("method: 'POST'") && seg.includes('JSON.stringify({ card })') && seg.includes('240_000'));
});

// 2026-10-10 사장님 "이 제목도 복사 가능하게" — 카드 맨 위 소재 제목(벤치마크 원문 제목)에도 복사 버튼.
test('카드 맨 위 소재 제목에 복사 버튼 — 제목 줄과 같은 복사(클립보드 실패 시 안내)', () => {
  const card = read('../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx');
  assert.ok(card.includes('<div className="hfb-headline"><h3>{c.title||c.keyword}</h3><CopyHeadline text={c.title||c.keyword}/></div>'), '소재 제목 바로 옆 복사 버튼');
  assert.equal(card.split('<h3>').length - 1, 1, '제목 줄은 하나(복사 없는 사본이 남지 않게)');
  const at = card.indexOf('function CopyHeadline');
  assert.ok(at > 0 && card.slice(at, at + 500).includes('navigator.clipboard.writeText(text)'));
});
