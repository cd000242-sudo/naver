import { describe, it, expect, afterEach } from 'vitest';
import {
  isSemanticDistinctnessJudgeEnabled,
  buildDistinctnessPrompt,
  judgeSectionDistinctness,
} from '../content/sectionDistinctnessJudge';

const THREE_SECTIONS = {
  headings: [
    { title: '배터리', body: '5000밀리암페어 용량으로 하루 종일 버텼고 고속 충전 33와트를 지원한다 정말로요.' },
    { title: '카메라', body: '메인 센서는 5천만 화소로 야간 모드에서 노이즈가 적고 색 재현이 정확했다 정말로요.' },
    { title: '가격', body: '출고가 89만원으로 동급 대비 저렴하고 자급제 모델은 약정 없이 살 수 있다 정말로요.' },
  ],
};

const ENV_KEY = 'CONTENT_SEMANTIC_DISTINCTNESS_JUDGE';

describe('sectionDistinctnessJudge — isSemanticDistinctnessJudgeEnabled', () => {
  afterEach(() => { delete process.env[ENV_KEY]; });

  it('기본 OFF (미설정 시 추가 호출 0)', () => {
    delete process.env[ENV_KEY];
    expect(isSemanticDistinctnessJudgeEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'on', 'TRUE', ' On '])('truthy %s → ON', (v) => {
    process.env[ENV_KEY] = v;
    expect(isSemanticDistinctnessJudgeEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', '', 'yes'])('그 외 %s → OFF', (v) => {
    process.env[ENV_KEY] = v;
    expect(isSemanticDistinctnessJudgeEnabled()).toBe(false);
  });
});

describe('sectionDistinctnessJudge — buildDistinctnessPrompt', () => {
  it('섹션 3개 이상이면 제목·마커·JSON 스펙을 포함한 프롬프트 생성', () => {
    const p = buildDistinctnessPrompt(THREE_SECTIONS);
    expect(p).not.toBeNull();
    expect(p).toContain('배터리');
    expect(p).toContain('카메라');
    expect(p).toContain('[원본 텍스트]'); // provider system/user 분리 마커
    expect(p).toContain('"distinct"');
  });

  it('섹션 3개 미만이면 null (판정 불필요)', () => {
    const p = buildDistinctnessPrompt({
      headings: [
        { title: 'A', body: '본문이 충분히 긴 첫 번째 섹션입니다 정말로요.' },
        { title: 'B', body: '본문이 충분히 긴 두 번째 섹션입니다 정말로요.' },
      ],
    });
    expect(p).toBeNull();
  });
});

describe('sectionDistinctnessJudge — judgeSectionDistinctness (mock LLM)', () => {
  it('모델이 redundant 판정 → distinct=false, judged=true', async () => {
    const mock = async () =>
      '{"distinct": false, "redundantSections": [1,2,3], "reason": "같은 말 반복"}';
    const v = await judgeSectionDistinctness(THREE_SECTIONS, mock);
    expect(v.distinct).toBe(false);
    expect(v.judged).toBe(true);
    expect(v.redundantSections).toEqual([1, 2, 3]);
  });

  it('모델이 distinct 판정 → distinct=true, judged=true', async () => {
    const mock = async () => '잡담...\n{"distinct": true, "redundantSections": [], "reason": "모두 다름"}\n끝';
    const v = await judgeSectionDistinctness(THREE_SECTIONS, mock);
    expect(v.distinct).toBe(true);
    expect(v.judged).toBe(true);
  });

  it('깨진 JSON 응답 → fail-open(distinct=true, judged=false)', async () => {
    const mock = async () => '여기 distinct는 false 인데 JSON이 아닙니다';
    const v = await judgeSectionDistinctness(THREE_SECTIONS, mock);
    expect(v.distinct).toBe(true);
    expect(v.judged).toBe(false);
  });

  it('distinct 필드 누락(불완전 JSON) → fail-open', async () => {
    const mock = async () => '{"redundantSections": [1], "reason": "x"}';
    const v = await judgeSectionDistinctness(THREE_SECTIONS, mock);
    expect(v.distinct).toBe(true);
    expect(v.judged).toBe(false);
  });

  it('LLM 호출이 throw → fail-open (생성 차단 안 함)', async () => {
    const mock = async () => { throw new Error('timeout'); };
    const v = await judgeSectionDistinctness(THREE_SECTIONS, mock);
    expect(v.distinct).toBe(true);
    expect(v.judged).toBe(false);
    expect(v.reason).toContain('실패');
  });

  it('섹션 3개 미만 → 호출 없이 fail-open(생략)', async () => {
    let called = false;
    const mock = async () => { called = true; return '{"distinct": false}'; };
    const v = await judgeSectionDistinctness(
      { headings: [{ title: 'A', body: '충분히 긴 본문 하나입니다 정말로요.' }] },
      mock,
    );
    expect(called).toBe(false); // 프롬프트 자체가 null → 호출 안 함
    expect(v.distinct).toBe(true);
    expect(v.judged).toBe(false);
  });
});
