/**
 * SPEC-BLUEPRINT-2026 Phase 1 — 설계도 모듈 계약.
 * 자료에 없는 인용·발췌는 버려지고, 설계도 실패는 예외 없이 null 로 끝나야 한다.
 */
import { describe, expect, it } from 'vitest';
import { buildBlueprintPrompt } from '../content/blueprint/buildBlueprintPrompt';
import { parseBlueprint } from '../content/blueprint/parseBlueprint';
import { generateBlueprint, BLUEPRINT_TIMEOUT_MS } from '../content/blueprint/generateBlueprint';
import { BLUEPRINT_LIMITS, BLUEPRINT_JSON_SCHEMA } from '../content/blueprint/blueprintSchema';

const MATERIAL = [
  '국토교통부는 2026년 9월 1일 청년월세지원 2차 접수를 시작한다고 밝혔다.',
  '지원 대상은 만 19세부터 34세까지 무주택 청년으로, 월 최대 20만원을 12개월간 지원한다.',
  '담당자는 "접수 첫 주에는 복지로 사이트 접속이 몰리니 오후 시간대를 권한다"고 말했다.',
  '한편 같은 날 국토부는 도심 공공주택 복합사업 후보지 3곳도 발표했다.',
  '신청은 복지로 누리집 또는 주민센터 방문으로 가능하며, 소득 기준은 중위소득 60% 이하다.',
].join('\n').repeat(2);

const RESPONSE = JSON.stringify({
  angle: '청년월세지원 2차, 나는 대상이고 어떻게 신청하나',
  readerSituation: '복지로에 들어갔는데 내가 대상인지, 서류가 뭔지 몰라 화면을 닫은 상황',
  quotes: [
    { text: '접수 첫 주에는 복지로 사이트 접속이 몰리니 오후 시간대를 권한다', speaker: '담당자' },
    { text: '이번 지원은 역대 최대 규모라고 자신한다', speaker: '장관' },
  ],
  facts: [
    { claim: '월 최대 20만원, 12개월', snippet: '월 최대 20만원을 12개월간 지원한다' },
    { claim: '소득 기준 중위소득 60% 이하', snippet: '소득 기준은 중위소득 60% 이하다' },
    { claim: '예산 1조원', snippet: '예산은 총 1조원이 편성됐다' },
  ],
  skeleton: ['지원 대상 조건', '지원 금액과 기간', '신청 방법과 접수처', '지원 대상 조건', '탈락하는 경우'],
  offTopic: ['도심 공공주택 복합사업 후보지 발표'],
});

describe('parseBlueprint — 자료 검증', () => {
  it('자료 원문에 없는 인용·발췌는 버리고 개수를 보고한다', () => {
    const parsed = parseBlueprint(RESPONSE, MATERIAL);
    expect(parsed).not.toBeNull();
    expect(parsed!.blueprint.quotes).toHaveLength(1);
    expect(parsed!.blueprint.quotes[0].speaker).toBe('담당자');
    expect(parsed!.blueprint.facts.map((f) => f.claim)).toEqual(['월 최대 20만원, 12개월', '소득 기준 중위소득 60% 이하']);
    expect(parsed!.dropped).toEqual({ quotes: 1, facts: 1, skeleton: 1 });
  });

  it('소제목 중복은 제거하고 제외 주제·상황·각도를 보존한다', () => {
    const parsed = parseBlueprint(RESPONSE, MATERIAL)!;
    expect(parsed.blueprint.skeleton).toEqual(['지원 대상 조건', '지원 금액과 기간', '신청 방법과 접수처', '탈락하는 경우']);
    expect(parsed.blueprint.offTopic).toEqual(['도심 공공주택 복합사업 후보지 발표']);
    expect(parsed.blueprint.readerSituation).toContain('복지로');
    expect(parsed.blueprint.angle.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.angleMaxChars);
  });

  it('코드펜스·설명이 섞인 응답에서도 JSON 을 찾고, 공백·따옴표 차이는 원문 일치로 본다', () => {
    const wrapped = '설계도입니다.\n```json\n' + JSON.stringify({
      angle: 'a', readerSituation: '', skeleton: [],
      quotes: [{ text: '"접수 첫 주에는  복지로 사이트 접속이 몰리니 오후 시간대를 권한다"', speaker: '' }],
      facts: [], offTopic: [],
    }) + '\n```';
    const parsed = parseBlueprint(wrapped, MATERIAL);
    expect(parsed?.blueprint.quotes).toHaveLength(1);
  });

  it('쓸 만한 것이 하나도 없으면 null', () => {
    expect(parseBlueprint('{"angle":"x","readerSituation":"","quotes":[],"facts":[{"claim":"c","snippet":"없는 문장입니다 정말"}],"skeleton":["둘"],"offTopic":[]}', MATERIAL)).toBeNull();
    expect(parseBlueprint('설계도를 만들 수 없습니다', MATERIAL)).toBeNull();
  });
});

describe('buildBlueprintPrompt', () => {
  it('키워드·한도·원문 복사 규칙·자료를 담고, 자료는 상한에서 자른다', () => {
    const prompt = buildBlueprintPrompt({ keyword: '청년월세지원', mode: 'homefeed', material: MATERIAL, materialMaxChars: 1_200 });
    expect(prompt).toContain('"청년월세지원"');
    expect(prompt).toContain('한 글자도 바꾸지 않고');
    expect(prompt).toContain(`최대 ${BLUEPRINT_LIMITS.quotesMax}개`);
    expect(prompt).toContain('피드에서 이 글을 만난다');
    expect(prompt).toContain('[자료]');
    expect(prompt.length).toBeLessThan(1_200 + 1_500);
    expect(buildBlueprintPrompt({ keyword: 'k', mode: 'seo', material: MATERIAL })).toContain('검색해서 들어온다');
  });

  it('JSON 스키마는 6개 필드를 모두 요구한다', () => {
    expect((BLUEPRINT_JSON_SCHEMA as any).required).toEqual(['angle', 'readerSituation', 'quotes', 'facts', 'skeleton', 'offTopic']);
  });
});

describe('generateBlueprint — 실패는 생략, 예외 없음', () => {
  it('정상 응답이면 설계도를 돌려주고 로그를 남긴다', async () => {
    const logs: string[] = [];
    const run = await generateBlueprint({ keyword: 'k', mode: 'seo', material: MATERIAL }, { complete: async () => RESPONSE, log: (m) => logs.push(m) });
    expect(run.reason).toBe('ok');
    expect(run.result?.blueprint.quotes).toHaveLength(1);
    expect(logs[0]).toMatch(/\[Blueprint\] ✅ 인용 1·사실 2·소제목 4/);
  });

  it('타임아웃·오류·해석 불가·자료 부족은 각각 이유를 달고 null', async () => {
    const never = () => new Promise<string>(() => undefined);
    const timeout = await generateBlueprint({ keyword: 'k', mode: 'seo', material: MATERIAL }, { complete: never, timeoutMs: 20 });
    expect(timeout).toMatchObject({ result: null, reason: 'timeout' });
    const error = await generateBlueprint({ keyword: 'k', mode: 'seo', material: MATERIAL }, { complete: async () => { throw new Error('boom'); } });
    expect(error).toMatchObject({ result: null, reason: 'error' });
    const unparsable = await generateBlueprint({ keyword: 'k', mode: 'seo', material: MATERIAL }, { complete: async () => 'no json here' });
    expect(unparsable).toMatchObject({ result: null, reason: 'unparsable' });
    const empty = await generateBlueprint({ keyword: 'k', mode: 'seo', material: '짧다' }, { complete: async () => RESPONSE });
    expect(empty).toMatchObject({ result: null, reason: 'empty-material' });
    expect(BLUEPRINT_TIMEOUT_MS).toBe(20_000);
  });
});

describe('parseBlueprint — 출력 상한에 잘린 JSON 복구', () => {
  it('배열 중간에서 끊긴 응답도 마지막 완전한 값까지 살린다', () => {
    const full = JSON.parse(RESPONSE);
    const text = JSON.stringify(full, null, 1);
    // facts 두 번째 항목 뒤, 세 번째 항목 중간에서 자른다.
    const cutAt = text.indexOf('예산 1조원') + 3;
    const truncated = text.slice(0, cutAt);
    const parsed = parseBlueprint(truncated, MATERIAL);
    expect(parsed).not.toBeNull();
    expect(parsed!.blueprint.quotes).toHaveLength(1);
    expect(parsed!.blueprint.facts.map((f) => f.claim)).toEqual(['월 최대 20만원, 12개월', '소득 기준 중위소득 60% 이하']);
    // skeleton 은 잘려 나간 뒤라 비어 있다 — 있는 것만 쓴다.
    expect(parsed!.blueprint.skeleton).toEqual([]);
  });

  it('문자열 안의 중괄호·이스케이프 따옴표에 속지 않는다', () => {
    const tricky = '{"angle":"a {b} c","readerSituation":"복지로에서 \\"대상\\" 확인","quotes":[],"facts":[],"skeleton":["지원 대상 조건","신청 방법과 접수처","탈락하는 경우"],"offTopic":["x"';
    const parsed = parseBlueprint(tricky, MATERIAL);
    expect(parsed?.blueprint.skeleton).toHaveLength(3);
    expect(parsed?.blueprint.readerSituation).toContain('대상');
  });
});

describe('generateBlueprint — 호출 옵션과 진단', () => {
  it('설계도 호출은 maxTokens 4096 을 요청하고, 해석 불가 시 응답 앞뒤를 로그에 남긴다', async () => {
    const seen: Array<{ prompt: string; options?: { maxTokens?: number } }> = [];
    const logs: string[] = [];
    const run = await generateBlueprint(
      { keyword: 'k', mode: 'seo', material: MATERIAL },
      { complete: async (prompt, options) => { seen.push({ prompt, options }); return '설계도를 만들 수 없습니다 ' + 'x'.repeat(400); }, log: (m) => logs.push(m) },
    );
    expect(run.reason).toBe('unparsable');
    expect(seen[0].options?.maxTokens).toBe(4096);
    expect(logs[0]).toContain('앞: 설계도를 만들 수 없습니다');
    expect(logs[0]).toContain('자)');
  });
});
