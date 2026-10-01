/**
 * 홈판 벤치마크 실시간 판(2026-10-01) — spa/src/lib/homefeedLive.mjs.
 *
 * 규칙은 leword-app scripts/homefeed-benchmarks-core.cjs 와 같아야 한다. 아래 '묶기 · 추천' 사례는 그쪽
 * scripts/homefeed-benchmarks.test.cjs 와 **같은 사례**다 — 한쪽만 바꾸면 여기서 드러난다.
 * (2026-10-01 실원문 18곳으로 대조: 게시물 18/18 원천 완전 일치, 카드 81/81 내용 일치.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as live from '../src/lib/homefeedLive.mjs';

const now = '2026-09-28T14:00:00.000Z';
const post = (extra = {}) => ({ sourceId: 'sample', platform: 'naver-blog', name: '표본', title: '서울 장기전세 만기 확인', url: 'https://blog.naver.com/sample/123', summary: '서울 장기전세 20년 만기를 앞두고 확인할 내용입니다.', publishedAt: now, capturedAt: now, eventAt: null, metrics: { views: null, likes: null, comments: null }, ...extra });
const other = (id, title, extra = {}) => post({ sourceId: id, url: `https://blog.naver.com/${id}/9${id.length}1`, title, summary: `${title} 요약입니다.`, ...extra });
const build = (posts) => live.buildLiveCandidates(posts, now);

test('같은 원문을 퍼 나른 것은 한 소재지만 독립 근거가 아니다', () => {
  const result = build([post(), post({ sourceId: 'other', url: 'https://blog.naver.com/other/456' })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].recommended, false);
  assert.ok(result[0].flags.includes('possible-syndication'));
});
test('조사·붙여쓰기가 달라도 같은 소재는 한 묶음이고, 채널 두 곳이면 추천이다', () => {
  const result = build([other('a', '디올과 원영의 만남 🎀'), other('bb', '🎀 디올원영 어떤데?')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].recommended, true);
  assert.equal(result[0].status, 'review-now');
});
test('공통어 · 한 낱말 · 나라 이름 · 질문 틀 · 숫자 든 말만 겹치면 다른 소재다', () => {
  const pairs = [
    ['260930 에스파 카리나 (katarinabluu) 인스타그램', '260930 아이브 레이 (reinyourheart) 인스타그램'],
    ['디올과 원영의 만남', '기다렸던 디올 현진 등장'],
    ['“일본도 다낭도 아니었다” 추석 해외여행 1위, 중국 한국인들 몰린 곳', '[한국 v 중국] 배준호 역전골 ㄷㄷㄷㄷㄷ'],
    ['죽은 구교환 "72시간 뒤 다시 부활" 예매 1위 영화 부활남 원작과 뭐가 다를까', '최민식X한소희 ‘인턴’, 원작과 뭐가 다를까 한국판'],
    ['🚨윤남노가 2년 동안 서먹했던', '소녀시대 탈퇴 후 12년 만에 마린룩으로 냉면 무대 제시카 그동안 무슨 일이 있었나'],
  ];
  for (const [a, b] of pairs) assert.equal(build([other('a', a), other('bb', b)]).length, 2, `${a} / ${b}`);
});
test('채널 한 곳뿐이면 추천이 아니고, 많은 채널이 다룬 소재가 앞에 선다', () => {
  assert.equal(build([other('a', '디올과 원영의 만남 🎀')])[0].status, 'verify');
  const result = build([other('a', '안세영 금메달 포상금 얼마'), other('bb', '안세영 금메달 포상금 공개'), other('ccc', '디올과 원영의 만남'), other('dddd', '디올원영 어떤데'), other('eeeee', '원영 디올 행사 사진')]);
  assert.equal(new Set(result[0].sources.map((s) => s.id)).size, 3);
});
test('30장 상한 없음 · 48시간이 지난 소재는 싣지 않는다 · 협찬은 추천 불가', () => {
  assert.equal(build(Array.from({ length: 45 }, (_, i) => other(`s${i}`, `가나${i}다 라마${i}바 사아${i}자`))).length, 45);
  assert.equal(build([post({ publishedAt: '2026-09-25T10:00:00Z' })]).length, 0);
  const sponsored = build([post({ summary: '업체로부터 제품을 무상 제공받았습니다.' })])[0];
  assert.equal(sponsored.recommended, false);
  assert.ok(sponsored.flags.includes('sponsored'));
});

test('RSS — 작품명 꺾쇠는 글자로 남기고, CDATA · 태그 · 엔티티를 수집기와 같게 푼다', () => {
  const xml = '<rss><channel><title>표본 블로그</title><item><title><![CDATA[죽은 구교환 영화 <부활남: 더 레드> 원작과 뭐가 다를까?]]></title><link>https://blog.naver.com/sample/123?fromRss=true</link><description><![CDATA[<b>본문</b> &amp; 설명<script>bad()</script>]]></description><pubDate>Mon, 28 Sep 2026 10:00:00 +0900</pubDate></item><item><title>위험</title><link>https://evil.test/a</link></item></channel></rss>';
  const { name, posts } = live.parseRss(xml, { id: 'sample', platform: 'naver-blog' }, now);
  assert.equal(name, '표본 블로그');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, '죽은 구교환 영화 <부활남: 더 레드> 원작과 뭐가 다를까?');
  assert.equal(posts[0].url, 'https://blog.naver.com/sample/123');
  assert.equal(posts[0].summary, '본문 & 설명');
});
test('영문 꺾쇠(태그로 읽힘)는 빈칸 없이 벗긴다 — 수집기 cheerio 와 같다(실원문 mira841213)', () => {
  assert.equal(live.plainText('솔로곡인<Dream>으로 베스트 팝'), '솔로곡인으로 베스트 팝');
  assert.equal(live.plainText('영화 <부활남: 더 레드> 원작'), '영화 <부활남: 더 레드> 원작');
});
test('네이트 · 이슈링크 — 제목 · 공감 · 댓글 · 시각을 뽑는다', () => {
  const nate = '<a href="//news.nate.com/view/20260930n32410?mid=n1009" class="lt1"><span class="tb"><h2 class="tit">허진호 감독, 역사 논란</h2><span class="desc"> 허진호 감독이 입을 열었다. </span></span><span class="rnk-emotion"><span class="img">공감수</span><span class="emcnt"><em>358</em></span></span></a>';
  const n = live.parseNate(nate, { id: 'nate-ent', platform: 'news-ranking', url: 'https://news.nate.com/rank/emoticon?cate=ent' }, now).posts[0];
  assert.equal(n.url, 'https://news.nate.com/view/20260930n32410');
  assert.equal(n.title, '허진호 감독, 역사 논란');
  assert.equal(n.reactionCount, 358);
  const il = "<tr><td class='h5'>1</br> <small>펨코</small></td><td><div class='first_title'><span class='title'><a href='https://www.issuelink.co.kr/community/go/fmkorea/10396146863'>이동진: 말씀드립니다 <small>[2066]</small></a></span></div><div class=\"second_date\"> <span>2026-09-28 20:30:00</span></div></td></tr>";
  const c = live.parseCommunity(il, { id: 'issuelink', platform: 'community-ranking', url: 'https://www.issuelink.co.kr/community/listview/all/24/comment/_blank' }, now).posts[0];
  assert.equal(c.title, '이동진: 말씀드립니다');
  assert.equal(c.metrics.comments, 2066);
  assert.equal(c.name, '이슈링크 · 펨코');
  assert.equal(c.publishedAt, '2026-09-28T11:30:00.000Z');
});

test('합치기 — 인스타는 CI 판에서 되살려 함께 묶고, 홈판 제목은 같은 원문 주소의 CI 카드에서 가져온다', () => {
  const rss = (id, title, logNo) => ({ id, platform: 'naver-blog', name: id, status: 'ok', text: `<rss><channel><title>${id}</title><item><title>${title}</title><link>https://blog.naver.com/${id}/${logNo}</link><description>${title} 요약</description><pubDate>Mon, 28 Sep 2026 20:00:00 +0900</pubDate></item></channel></rss>` });
  const board = {
    schemaVersion: 1, generatedAt: '2026-09-28T10:00:00Z', status: 'partial',
    sources: [{ id: 'a', platform: 'naver-blog', url: 'https://blog.naver.com/a', status: 'ok' }, { id: 'ig', platform: 'instagram', url: 'https://www.instagram.com/ig/', status: 'ok', postCount: 1 }],
    candidates: [
      { id: 'x', title: '디올과 원영의 만남', homeTitles: ['제목 하나'], capturedAt: now, sources: [{ id: 'a', platform: 'naver-blog', url: 'https://blog.naver.com/a/111', title: '디올과 원영의 만남' }] },
      { id: 'y', title: '원영 디올 행사', capturedAt: now, sources: [{ id: 'ig', platform: 'instagram', url: 'https://www.instagram.com/p/ABC123/', title: '원영 디올 행사 🎀', summary: '원영 디올 행사 사진', publishedAt: '2026-09-28T09:00:00Z', metrics: { views: null, likes: 900, comments: 20 } }] },
    ],
  };
  const merged = live.mergeLiveBoard(board, [rss('a', '디올과 원영의 만남', 111), { id: 'b', platform: 'naver-blog', name: 'b', status: 'failed' }], now);
  assert.equal(merged.live, true);
  assert.equal(merged.generatedAt, now);
  const card = merged.candidates.find((c) => c.sources.some((s) => s.url === 'https://blog.naver.com/a/111'));
  assert.deepEqual(card.homeTitles, ['제목 하나']);
  assert.ok(card.sources.some((s) => s.platform === 'instagram'), '인스타 게시물이 같은 소재로 묶였다');
  assert.equal(card.recommended, true);
  assert.equal(merged.sources.find((s) => s.id === 'b').status, 'failed');
  assert.equal(merged.sources.find((s) => s.id === 'ig').status, 'ok');
  assert.equal(merged.sources.find((s) => s.id === 'a').capturedAt, now);
});

test('실시간에서 실패한 출처는 CI 판이 그 출처로 잡은 글을 되살린다 — 유튜브 RSS 404 처럼 들쭉날쭉한 원천(2026-10-01)', () => {
  const board = {
    schemaVersion: 1, generatedAt: '2026-09-28T10:00:00Z', status: 'partial',
    sources: [{ id: 'yt', platform: 'youtube', url: 'https://www.youtube.com/@yt', status: 'ok', postCount: 1, capturedAt: '2026-09-28T10:00:00Z' }, { id: 'dead', platform: 'naver-blog', url: 'https://blog.naver.com/dead', status: 'failed' }],
    candidates: [{ id: 'v', title: '디올과 원영의 만남', capturedAt: now, sources: [{ id: 'yt', platform: 'youtube', name: 'yt', url: 'https://www.youtube.com/watch?v=abcdefghijk', title: '디올과 원영의 만남 영상', summary: '디올 원영 행사', publishedAt: '2026-09-28T09:00:00Z', metrics: { views: 1200, likes: null, comments: null } }] }],
  };
  const feeds = [{ id: 'yt', platform: 'youtube', name: 'yt', status: 'failed', reason: 'HTTP 404' }, { id: 'dead', platform: 'naver-blog', name: 'dead', status: 'ok', text: '<rss><channel></channel></rss>' }];
  const merged = live.mergeLiveBoard(board, feeds, now);
  const yt = merged.sources.find((s) => s.id === 'yt');
  assert.equal(yt.status, 'ok', '되살린 출처는 확인 필요로 세지 않는다');
  assert.equal(yt.capturedAt, '2026-09-28T10:00:00Z', '되살린 출처는 CI 수집 시각을 그대로 단다');
  assert.ok(merged.candidates.some((c) => c.sources.some((s) => s.url === 'https://www.youtube.com/watch?v=abcdefghijk')));
  assert.equal(merged.sources.find((s) => s.id === 'dead').status, 'failed', 'CI 도 실패한 출처는 그대로 실패');
});
test('실시간 원문은 키 없는 액션 하나로만 받고 AI 를 부르지 않는다', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/lib/homefeedLiveFetch.ts', import.meta.url)), 'utf8');
  assert.match(src, /callWorkerRaw\('homefeed-benchmark-feeds', \{ batch: String\(batch\) \}\)/);
  assert.doesNotMatch(src, /loadUserKeys|licenseCode|api\.openai\.com|api\.anthropic\.com|generativelanguage/);
  assert.doesNotMatch(readFileSync(fileURLToPath(new URL('../src/lib/homefeedLive.mjs', import.meta.url)), 'utf8'), /\bfetch\(|Math\.random\(/);
});
test('일반어로만 · 구체어 하나로만 겹치면 다른 소재, 구체어 둘이면 같은 소재(수집기와 같은 사례)', () => {
  const apart = [
    ['그랜저 계약 취소각? 정신 차리고 바뀐 디자인 BMW 알피나.', '"드디어 정신차렷나" 실물 공개에 그랜저 취소합니다'],
    ['공룡 얼굴 복원도 근황.jpg', '요즘 2030 여자들이 목숨건다는 동안 얼굴 포인트'],
    ['한채영 미모는 회춘했는데... 아쉬운 패션 스타일 근황', '순간 ‘지디인 줄’.. 살 붙고 확 달라진 연예인 공항패션'],
  ];
  for (const [a, b] of apart) assert.equal(build([other('a', a), other('bb', b)]).length, 2, `${a} / ${b}`);
  assert.equal(build([other('a', '전지현 생로랑 파리 패션쇼 착장 공개'), other('bb', '쌩얼로 등장... 전지현 생로랑 공항 패션')]).length, 1);
});
test('분야 — 자동차·IT · 건강, 제목 단서 없으면 출처 주제(수집기와 같은 사례)', () => {
  assert.equal(live.category('그랜저 하이브리드 연비 실제로 타보니'), '자동차·IT');
  assert.equal(live.category('아이폰 18 프로 출시일과 가격 정리'), '자동차·IT');
  assert.equal(live.category('이제 과태료에 벌점까지 깜빡이 키셨나요'), '자동차·IT');
  assert.equal(live.category('위고비 끊고 26일 만에 10kg 뺀 식단'), '건강');
  assert.equal(live.category('요즘 다들 이렇게 한다는 그것', ['IT/차테크', 'IT/차테크', '스포츠']), '자동차·IT');
  assert.equal(live.category('요즘 다들 이렇게 한다는 그것', ['건강 상식']), '건강');
  assert.equal(live.category('요즘 다들 이렇게 한다는 그것'), '사회·이슈');
  assert.equal(live.category('손흥민 결승골 터진 순간 아시안게임', ['IT/차테크']), '스포츠·게임');
  assert.equal(live.category('41홈런으로 홈런왕 굳히나 기아타이거즈 김도영'), '스포츠·게임');
});
test('실시간 판도 CI 판 출처 목록의 주제로 분야를 매긴다', () => {
  const board = { schemaVersion: 1, generatedAt: now, status: 'partial', sources: [{ id: 'car1', platform: 'naver-blog', url: 'https://blog.naver.com/car1', status: 'ok', topic: 'IT/차테크' }], candidates: [] };
  const feeds = [{ id: 'car1', platform: 'naver-blog', name: 'car1', status: 'ok', text: '<rss><channel><title>car1</title><item><title>요즘 다들 이렇게 한다는 그것</title><link>https://blog.naver.com/car1/111</link><description>요약</description><pubDate>Mon, 28 Sep 2026 20:00:00 +0900</pubDate></item></channel></rss>' }];
  const merged = live.mergeLiveBoard(board, feeds, now);
  assert.equal(merged.candidates[0].category, '자동차·IT');
});
