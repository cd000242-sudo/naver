import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(path) {
 const url = new URL(path, import.meta.url);
 const code = ts.transpileModule(fs.readFileSync(url,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const output={exports:{}};
 new Function('require','module','exports',code)((id)=>require(id),output,output.exports);
 return output.exports;
}
const { myBlogFitRows, myTitleWords, boardKeywordCount, keywordWords } = load('../src/lib/myBlogPublic.ts');

const titles = [
 { title: '쏘렌토 하이브리드 실연비 직접 재봤습니다' },
 { title: '쏘렌토 2026 가격표 정리' },
 { title: '아이오닉5 충전 요금 이러니까 바로 풀리네요' },
 { title: '제주 렌트카 예약 후기' },
];
const picks = [{ topic: '자동차', rows: [
 { keyword: '쏘렌토 하이브리드', searchVolume: 12000, documentCount: 3000, ratio: 4 },
 { keyword: '아이오닉5 충전', searchVolume: 800, documentCount: 200, ratio: 4 },
 { keyword: '그랜저 풀체인지', searchVolume: 9000, documentCount: 100, ratio: 90 },
]}];
const golden = [
 { keyword: '쏘렌토 하이브리드 실연비', topic: '자동차', tierLabel: '1페이지', openSlot: 4, searchVolume: 2100, documentCount: 900 },
 { keyword: '제주 렌트카', topic: '여행', tierLabel: '상위 3', openSlot: 2, searchVolume: null, documentCount: null },
];

test('내 제목 어절 절반 이상이 든 보드 키워드만 남고, 빈자리 실측 → 내 글 편수 → 검색량 순', () => {
 const rows = myBlogFitRows(titles, picks, golden);
 assert.deepEqual(rows.map((row) => row.keyword), ['제주 렌트카', '쏘렌토 하이브리드 실연비', '쏘렌토 하이브리드', '아이오닉5 충전']);
 assert.equal(rows.find((row) => row.keyword === '그랜저 풀체인지'), undefined);
 const sorento = rows.find((row) => row.keyword === '쏘렌토 하이브리드');
 // '쏘렌토' 하나만 든 두 번째 글도 어절 2개 중 1개(절반)라 센다
 assert.equal(sorento.myPosts, 2);
 assert.deepEqual(sorento.matchedWords, ['쏘렌토', '하이브리드']);
 assert.equal(sorento.sampleTitles.length, 2);
 const golden1 = rows.find((row) => row.keyword === '쏘렌토 하이브리드 실연비');
 assert.equal(golden1.source, 'golden'); assert.equal(golden1.openSlot, 4); assert.equal(golden1.tierLabel, '1페이지');
 // 어절 3개 중 2개 이상 — 첫 글만
 assert.equal(golden1.myPosts, 1);
});

test('숫자 시작 어절은 매칭에서 빼고, 두 보드에 다 있으면 황금 쪽을 남기며 빈 검색량은 다른 쪽 값으로 채운다', () => {
 const rows = myBlogFitRows([{ title: '2027 그랜저 풀체인지 출시일' }],
  [{ topic: '자동차', rows: [{ keyword: '2027 그랜저 풀체인지', searchVolume: 5000, documentCount: 700 }] }],
  [{ keyword: '2027 그랜저 풀체인지', topic: '자동차', openSlot: 1, searchVolume: null, documentCount: null }]);
 assert.equal(rows.length, 1);
 assert.equal(rows[0].source, 'golden');
 assert.equal(rows[0].searchVolume, 5000);
 assert.equal(rows[0].documentCount, 700);
 assert.deepEqual(rows[0].matchedWords, ['그랜저', '풀체인지']);
});

test('제목이 없으면 빈 표, 상한을 지킨다', () => {
 assert.deepEqual(myBlogFitRows([], picks, golden), []);
 const many = Array.from({ length: 40 }, (_, i) => ({ keyword: `말${i} 후기`, topic: '기타', openSlot: null, searchVolume: i, documentCount: 1 }));
 assert.equal(myBlogFitRows([{ title: '후기 모음' }], [], many, 30).length, 30);
});

test('내 제목 어절 상위 — 글 편수 기준, 한 글에 두 번 나와도 1편', () => {
 const words = myTitleWords([{ title: '쏘렌토 쏘렌토 후기' }, { title: '쏘렌토 가격' }, { title: '2026 가격' }]);
 // 편수 같으면 가나다순
 assert.deepEqual(words.slice(0, 2), [{ word: '가격', posts: 2 }, { word: '쏘렌토', posts: 2 }]);
 assert.equal(words.find((item) => item.word === '2026'), undefined);
 assert.deepEqual(keywordWords('아이오닉5, 충전!'), ['아이오닉5', '충전']);
 assert.equal(boardKeywordCount(picks, golden), 5);
});
