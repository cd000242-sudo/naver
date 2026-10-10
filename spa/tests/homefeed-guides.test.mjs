/**
 * 홈판 벤치마크 작성 안내 합치기(2026-10-10 사장님 "전부 다 붙이고 싶다 — 확인하는 사람이 있거든").
 * 안내는 앱 레포의 안내 작업(homefeed-guides.yml)이 자기 파일(homefeed-benchmark-guides.json)에만 쓴다 — 판 파일을 같이 고치면 판 발행이 충돌한다.
 * 화면이 판과 합친다: 카드 id → 없으면 원문 주소(회차마다 카드 id 가 바뀌어도 같은 글이면 안내를 찾는다).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withGuides } from '../src/lib/homefeedGuides.mjs';

const guide = { direction: '동구동락 축제 라인업 검색 수요를 노린다.', searchTargets: ['동구동락 축제 라인업'], mustInclude: ['리센느 무대 시간', '날짜별 라인업 표'], mustAvoid: ['멤버 개인사 추측'], checkBefore: ['대전 동구청 공지의 최종 일정'] };
const board = () => ({ schemaVersion: 1, candidates: [
  { id: 'a', writingDirection: '', searchTargets: [], mustInclude: [], mustAvoid: [], verificationNeeded: ['상업적 관계와 홍보성 주장 확인'], sources: [{ url: 'https://blog.naver.com/a/1' }] },
  { id: 'b-new-id', writingDirection: '', searchTargets: [], mustInclude: [], mustAvoid: [], verificationNeeded: [], sources: [{ url: 'https://blog.naver.com/b/2' }] },
  { id: 'c', writingDirection: '', searchTargets: [], mustInclude: [], mustAvoid: [], verificationNeeded: [], sources: [{ url: 'https://blog.naver.com/c/3' }] },
] });

test('안내 합치기 — 카드 id 로, 없으면 원문 주소로 찾고, 작성 전 확인은 안내 항목 + 그 카드 경고', () => {
  const store = { guides: [{ id: 'a', urls: [], guide }, { id: 'b-old-id', urls: ['https://blog.naver.com/b/2'], guide: { ...guide, direction: '주소로 찾은 안내' } }] };
  const out = withGuides(board(), store);
  assert.equal(out.candidates[0].writingDirection, guide.direction);
  assert.deepEqual(out.candidates[0].searchTargets, guide.searchTargets);
  assert.deepEqual(out.candidates[0].mustInclude, guide.mustInclude);
  assert.deepEqual(out.candidates[0].mustAvoid, guide.mustAvoid);
  assert.deepEqual(out.candidates[0].verificationNeeded, ['대전 동구청 공지의 최종 일정', '상업적 관계와 홍보성 주장 확인']);
  assert.equal(out.candidates[1].writingDirection, '주소로 찾은 안내');
  assert.equal(out.candidates[2].writingDirection, '', '안내가 없는 카드는 그대로(빈칸)');
});

test('안내 파일이 없거나 모양이 틀리면 판을 그대로 — 방향이 빈 항목 · 문자열 아닌 항목은 버린다', () => {
  const b = board();
  assert.equal(withGuides(b, null), b);
  assert.equal(withGuides(b, { guides: '아님' }), b);
  const out = withGuides(b, { guides: [{ id: 'a', guide: { direction: '' } }, { id: 'c', guide: { direction: '방향', mustInclude: ['가', 42, ''], searchTargets: 'x' } }] });
  assert.equal(out.candidates[0].writingDirection, '');
  assert.deepEqual(out.candidates[2].mustInclude, ['가']);
  assert.deepEqual(out.candidates[2].searchTargets, []);
});

test('배선 — 화면이 판과 안내 파일을 함께 받아 정기 판 · 실시간 판 모두 안내를 합친 판에서 시작한다', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/components/leword/homefeed/HomefeedBenchmarkBoard.tsx', import.meta.url)), 'utf8');
  assert.match(src, /\/data\/homefeed-benchmark-guides\.json/);
  assert.match(src, /withGuides\(/);
  assert.ok(src.indexOf('withGuides(') < src.indexOf('normalizeBenchmarkBoard(raw)'), '정규화 전에 합친다');
  assert.ok(src.indexOf('withGuides(') < src.indexOf('mergeLiveBoardOffThread(raw'), '실시간 합치기도 안내가 붙은 판에서');
});
