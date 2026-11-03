// 2026-10-22 사장님 "벤치마킹 블로그를 접속하는 법을 모르는 것 같다 · 초보자와 시니어도 이미지와 같이 볼 수 있게"
// 원문 썸네일(네이버 이미지 서버 · 유튜브 https 만)을 정기 판과 실시간 수집 두 곳 모두 싣고, 카드 위쪽에 원문 타일을 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeBenchmarkBoard, safeBenchmarkImage } from '../src/lib/homefeedBenchmarkModel.mjs';
import { parseRss } from '../src/lib/homefeedLive.mjs';

test('썸네일은 네이버 이미지 서버 · 유튜브 https 주소만 받는다', () => {
  assert.equal(safeBenchmarkImage('https://blogthumb.pstatic.net/a/30.jpg?type=s3'), 'https://blogthumb.pstatic.net/a/30.jpg?type=s3');
  assert.equal(safeBenchmarkImage('https://i2.ytimg.com/vi/x/hqdefault.jpg'), 'https://i2.ytimg.com/vi/x/hqdefault.jpg');
  assert.equal(safeBenchmarkImage('http://blogthumb.pstatic.net/a.jpg'), null);
  assert.equal(safeBenchmarkImage('https://evil.example/pstatic.net/a.jpg'), null);
  assert.equal(safeBenchmarkImage('javascript:alert(1)'), null);
});

test('정기 판 정리에서 출처 썸네일을 지키고, 이상한 주소는 버린다', () => {
  const card = (image) => ({ id: 'c', keyword: 'k', title: 't', status: 'review-now', sources: [{ id: 's', name: 'n', url: 'https://blog.naver.com/a/1', title: '글', image }] });
  const board = normalizeBenchmarkBoard({ schemaVersion: 1, generatedAt: '2026-10-22T00:00:00.000Z', sources: [], candidates: [card('https://blogthumb.pstatic.net/a/30.jpg?type=s3'), { ...card('https://evil.example/x.jpg'), id: 'd' }] });
  assert.equal(board.candidates[0].sources[0].image, 'https://blogthumb.pstatic.net/a/30.jpg?type=s3');
  assert.equal(board.candidates[1].sources[0].image, null);
});

test('실시간 수집(RSS)도 본문의 첫 이미지를 싣는다', () => {
  const xml = '<rss><channel><title>블로그</title><item><title>글1</title><link>https://blog.naver.com/a/1</link><pubDate>Wed, 21 Oct 2026 10:00:00 +0900</pubDate><description>&lt;img src="https://blogthumb.pstatic.net/abc/30.jpg?type=s3"&gt; 본문</description></item></channel></rss>';
  const { posts } = parseRss(xml, { id: 'a', platform: 'naver-blog' }, '2026-10-21T03:00:00.000Z');
  assert.equal(posts[0].image, 'https://blogthumb.pstatic.net/abc/30.jpg?type=s3');
});

test('카드 위쪽에 원문 타일 — 리퍼러 없이 썸네일 · 원문 열기 버튼, 아래 접힌 칸은 캡처 안내', () => {
  const card = readFileSync(new URL('../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx', import.meta.url), 'utf8');
  assert.match(card, /<BenchmarkSources sources=\{c\.sources\} \/>/);
  const tiles = readFileSync(new URL('../src/components/leword/homefeed/BenchmarkSources.tsx', import.meta.url), 'utf8');
  assert.match(tiles, /referrerPolicy="no-referrer"/);
  assert.match(tiles, /원문 열기/);
  assert.ok(card.indexOf('<BenchmarkSources') < card.indexOf('<TitleList'), '원문 타일이 제목 목록보다 위');
});

test('실측 신호를 화면에 — 출처 블로그 홈판 상위 횟수 배지 · 발행 시각 안내(2026-10-27)', () => {
  const tiles = readFileSync(new URL('../src/components/leword/homefeed/BenchmarkSources.tsx', import.meta.url), 'utf8');
  assert.match(tiles, /홈판 상위 \{tops\}회/);
  const card = readFileSync(new URL('../src/components/leword/homefeed/HomefeedBenchmarkCard.tsx', import.meta.url), 'utf8');
  assert.match(card, /label:'언제 올릴지'/);
  const board = normalizeBenchmarkBoard({ schemaVersion: 1, generatedAt: '2026-10-22T00:00:00.000Z', sources: [], homefeedTopBlogs: { abc: 3, 'bad id!': 2, zero: 0 }, candidates: [{ id: 'c', keyword: 'k', title: 't', status: 'review-now', sources: [{ id: 's', name: 'n', url: 'https://blog.naver.com/a/1', title: '글', homefeedTops: 3 }] }] });
  assert.deepEqual(board.homefeedTopBlogs, { abc: 3 });
  assert.equal(board.candidates[0].sources[0].homefeedTops, 3);
});
