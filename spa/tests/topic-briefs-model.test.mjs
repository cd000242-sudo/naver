import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/topicBriefsModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const fact = { id: 'f1', title: '청년 창업 지원 공고', snippet: '청년 창업자는 월 임차료의 70%를 지원받는다.', link: 'https://example.com/source', press: '공고', publishedAt: '2026-09-17T00:00:00Z' };
const brief = (patch = {}) => ({
  title: '청년 창업 월세 지원 기준', coreKeyword: '청년 창업 월세 지원', field: '정책', timing: 'NOW', primaryIntent: '지원 대상과 산정 기준은?',
  facts: [fact], serpFacing: 1, serpVacancy: 2, searchVolume: 400, star: true,
  titles: [{ text: '청년 창업 월세 지원 대상은?', target: 'AI답변', type: '질문형' }],
  editorial: { version: 2, status: 'supported', review: { passed: true, issues: [] }, summary: fact.snippet, audience: '창업을 준비하는 청년', angle: '주거 지원과 구분해 창업 조건을 확인한다.', answers: [{ question: '얼마를 지원하나요?', answer: fact.snippet, factIds: ['f1'], excerpts: [{ factId: 'f1', text: fact.snippet }] }], missing: [], outline: ['대상', '지원 산정 기준'] },
  recommendation: { keyword: '청년 창업 월세 지원', reason: '창업자 지원 조건을 근거와 함께 설명할 수 있습니다.' }, ...patch,
});

test('빈자리나 기존 등급과 무관하게 정면 글 2개 이하만 높음이다', () => {
  assert.equal(model.strictSerpFit(8), '낮음');
  assert.equal(model.strictSerpFit(2), '높음');
  assert.equal(model.strictSerpFit(5), '보통');
  for (const value of [null, undefined, -1, 11, NaN]) assert.equal(model.strictSerpFit(value), '미측정');
});
test('옛 회차의 별표와 경험 제목을 추천·경험담으로 옮기지 않는다', () => {
  const old = model.normalizeTopicBrief(brief({ editorial: undefined, title: '세럼 바꿨더니 확 다르네요', coreKeyword: '마데카 세럼', titles: [{ text: '세럼 써보고 알았어요' }] }));
  assert.equal(old.status, 'needs_research');
  assert.equal(old.recommended, false);
  assert.match(old.title, /마데카 세럼/);
  assert.doesNotMatch(old.title, /바꿨|다르네요/);
  assert.ok(old.missing.length > 0);
  assert.ok(old.titles.every(title => !/써보고/.test(title.text)));
});
test('발췌가 원문과 연결된 v2 작성안과 같은 검색어의 측정만 추천한다', () => {
  const valid = model.normalizeTopicBrief(brief());
  assert.equal(valid.status, 'supported');
  assert.equal(valid.recommended, true);
  assert.equal(valid.answers[0].excerpts[0].source.link, fact.link);
  const broad = model.normalizeTopicBrief(brief({ recommendation: { keyword: '월세', reason: '넓은 검색어' }, alternative: { keyword: '월세', serpFacing: 1 } }));
  assert.equal(broad.recommended, false);
  assert.equal(model.normalizeTopicBrief(brief({ serpFacing: 8, serpFit: '높음' })).recommended, false);
  assert.equal(model.normalizeTopicBrief(brief({ searchVolume: 40 })).recommended, false);
});
test('누락된 사실과 빈 발췌는 근거로 승격하지 않는다', () => {
  for (const change of [{ factId: 'missing', text: '없는 사실' }, { factId: 'f1', text: '' }, { factId: 'f1', text: '999만원을 받는다' }]) {
    const item = brief(); item.editorial.answers[0].excerpts = [change];
    const normalized = model.normalizeTopicBrief(item);
    assert.equal(normalized.status, 'needs_research');
    assert.equal(normalized.recommended, false);
    assert.equal(normalized.answers.length, 0);
  }
});
test('내용 검토를 통과하지 않은 새 작성안도 추천하지 않는다', () => {
  const item = brief(); item.editorial.review = { passed: false, issues: ['대상 조건 추가 확인'] };
  const normalized = model.normalizeTopicBrief(item);
  assert.equal(normalized.recommended, false);
  assert.equal(normalized.status, 'needs_research');
  assert.ok(normalized.missing.includes('대상 조건 추가 확인'));
});
test('기사 본문을 공개하지 않아도 검증된 evidenceExcerpts로 답변을 확인한다', () => {
  const item = brief({ facts: [{ ...fact, snippet: '공고 요약', evidenceExcerpts: ['청년 창업자는 월 임차료의 70%를 지원받는다.'] }] });
  assert.equal(model.normalizeTopicBrief(item).status, 'supported');
});
test('검색/AI답변/인용 배지를 버리고 숫자2가 포함된 작품명도 수치로 보지 않는다', () => {
  assert.equal(model.titleKind('미르의 전설2 추석 이벤트 안내'), '설명');
  assert.equal(model.titleKind('청년 지원금 35만원 산정 기준'), '수치');
  assert.equal(model.titleKind('지원 대상은 누구인가요?'), '질문');
  assert.equal(model.normalizeTopicBrief(brief()).titles[0].kind, '질문');
});
test('추천 최대5개와 전체목록은 겹치지 않고 추가 글감을 보존한다', () => {
  const all = Array.from({ length: 8 }, (_, n) => model.normalizeTopicBrief(brief({ title: `글감 ${n}` }), n));
  const sections = model.partitionTopicBriefs(all);
  assert.equal(sections.recommended.length, 5);
  assert.equal(sections.remaining.length, 3);
  assert.equal(new Set([...sections.recommended, ...sections.remaining].map(item => item.id)).size, 8);
});
test('작성안 복사는 선택 제목과 독자·질문별답·근거·목차·추가확인을 함께 담는다', () => {
  const normalized = model.normalizeTopicBrief(brief());
  const copy = model.topicBriefCopy(normalized, normalized.titles[0].text);
  for (const expected of ['지원 대상은?', '창업을 준비하는 청년', '얼마를 지원하나요?', fact.link, '목차', '접근 각도', '추가 확인']) assert.ok(copy.includes(expected), expected);
});
test('10미만과 미측정은 구분하고 위험한 출처 URL은 연결하지 않는다', () => {
  assert.equal(model.searchVolumeLabel(null, true), '10 미만');
  assert.equal(model.searchVolumeLabel(null, false), '미측정');
  const normalized = model.normalizeTopicBrief(brief({ facts: [{ ...fact, link: 'javascript:alert(1)' }] }));
  assert.equal(normalized.sources.length, 0);
  assert.equal(normalized.recommended, false);
});
test('추가 확인과 검토 이슈가 남았거나 이슈 형식이 없으면 완료·추천을 표시하지 않는다', () => {
  for (const patch of [{missing:['신청 대상 미확인']},{review:{passed:true,issues:['사실 불일치']}},{review:{passed:true}},{review:{passed:true,issues:'없음'}},{missing:undefined}]) {
    const item=brief(); item.editorial={...item.editorial,...patch};
    const result=model.normalizeTopicBrief(item);
    assert.equal(result.status,'needs_research'); assert.equal(result.recommended,false);
    assert.ok(result.missing.length>0);
  }
});
test('발췌만 올바르고 답변은 다른 내용을 주장하면 답변과 추천을 차단한다', () => {
  const item=brief(); item.editorial.answers[0].answer='모든 신청자는 999만원을 받는다.';
  const result=model.normalizeTopicBrief(item);
  assert.equal(result.status,'needs_research'); assert.equal(result.recommended,false); assert.equal(result.answers.length,0);
  assert.doesNotMatch(model.topicBriefCopy(result),/999만원/);
});
test('원문 조건을 잘라낸 부분 인용과 확인되지 않은 요약을 사실로 표시하지 않는다', () => {
  const item=brief(); item.editorial.answers[0].answer='월 임차료의 70%를 지원받는다.'; item.editorial.answers[0].excerpts[0].text=item.editorial.answers[0].answer;
  item.editorial.summary='모두 999만원을 받는다.';
  const result=model.normalizeTopicBrief(item);
  assert.equal(result.answers.length,0); assert.equal(result.status,'needs_research'); assert.doesNotMatch(result.summary,/999만원/);
});
test('대안은 원검색어보다 실제로 길고 다섯 단어 이내여야 추천한다', () => {
  for(const target of ['청년창업월세지원','청년 창업 월세 지원 세부 조건 신청 안내']) {
    const result=model.normalizeTopicBrief(brief({recommendation:{keyword:target,reason:'추가 기준'},alternative:{keyword:target,serpFacing:1,searchVolume:400}}));
    assert.equal(result.recommended,false);
  }
  const target='청년 창업 월세 지원 조건';
  const result=model.normalizeTopicBrief(brief({recommendation:{keyword:target,reason:'세부 조건'},alternative:{keyword:target,serpFacing:1,searchVolume:400}}));
  assert.equal(result.recommended,true); assert.equal(result.recommendation.keyword,target);
});
