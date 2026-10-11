/**
 * 오늘의 글감 제목 후보 복사(2026-10-11 사장님 "얘네들 제목들도 복사 버튼 추가해") — 네이버 SEO 제목 · 홈판 제목마다 복사 버튼.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('글감 카드 — SEO 제목 · 홈판 제목 줄마다 복사 버튼(누르면 라디오 선택은 안 바뀐다)', () => {
  const src = readFileSync(new URL('../src/components/leword/TopicBriefsBoard.tsx', import.meta.url), 'utf8');
  assert.equal((src.match(/<CopyTitle text=\{title\} \/>/g) || []).length, 2, 'SEO · 홈판 두 목록 모두');
  const at = src.indexOf('function CopyTitle');
  assert.ok(at > 0);
  const body = src.slice(at, at + 700);
  assert.match(body, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(body, /preventDefault\(\)/, '라벨 안 버튼 — 라디오 선택이 같이 바뀌지 않게');
});
