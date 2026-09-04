// 사건/의혹 글 자동 검수 — 사장님 실측 10항 회귀 잠금.
import { describe, it, expect } from 'vitest';
import {
  auditIssueDiscipline,
  detectAmountConflation,
  detectUngroundedInterpretation,
  detectAuthorOpinion,
  detectProcedureOverstatement,
  detectRepeatedFacts,
  splitIssueSentences,
} from '../content/issueDisciplineRules.js';
import { applyIssueDisciplineAudit, isIssueDisciplineTarget } from '../content/issueDisciplineAudit.js';

describe('issueDisciplineRules', () => {
  it('금액 성격을 뭉갠 문장을 잡는다', () => {
    expect(detectAmountConflation('차용증에 적힌 1억 5천만 원을 포함해 총 8억 원의 피해액이 발생했다.')).toBe(true);
    expect(detectAmountConflation('A씨는 전체 피해액을 7~8억 원으로 주장했다.')).toBe(false);
    expect(detectAmountConflation('이번에 공개한 차용증에 적힌 금액은 1억 5천만 원이다.')).toBe(false);
  });

  it('출처 없는 해석 문장만 잡는다', () => {
    expect(detectUngroundedInterpretation('이 때문에 갈등이 길어질 것이라는 해석도 나온다.')).toBe(true);
    expect(detectUngroundedInterpretation('양측의 입장 차가 큰 것으로 보인다.')).toBe(true);
    expect(detectUngroundedInterpretation('A씨 측은 갈등이 길어질 것이라는 분석이다라고 밝혔다.')).toBe(false);
  });

  it('작성자 개인 의견 표현을 잡는다', () => {
    expect(detectAuthorOpinion('제 기준으로는 납득하기 어려운 대목입니다.')).toBe(true);
    expect(detectAuthorOpinion('아무튼 논란은 계속되고 있습니다.')).toBe(true);
    expect(detectAuthorOpinion('A씨는 입장문을 통해 반박했습니다.')).toBe(false);
  });

  it('절차 과장과 합의 확대, 시점 단정을 잡는다', () => {
    expect(detectProcedureOverstatement('사기죄와 횡령죄가 적용됐다.')).toBe(true);
    expect(detectProcedureOverstatement('양측이 합의할 가능성도 거론된다.')).toBe(true);
    expect(detectProcedureOverstatement('이번이 최초 폭로다.')).toBe(true);
    expect(detectProcedureOverstatement('A씨는 사기죄와 횡령죄를 거론하며 법적 대응 의사를 밝혔다.')).toBe(false);
  });

  it('같은 사실은 3회째부터 잡는다 (2회까지 허용)', () => {
    const twice = splitIssueSentences('피해는 8억 원이라고 했다. 다시 8억 원을 언급했다.');
    expect(detectRepeatedFacts(twice).size).toBe(0);

    const thrice = splitIssueSentences('8억 원이라고 했다. 또 8억 원을 언급했다. 마지막으로 8억 원을 반복했다.');
    const flagged = detectRepeatedFacts(thrice);
    expect(flagged.size).toBe(1);
    expect(flagged.has(2)).toBe(true);
  });

  it('확정형 범죄 표현은 실존인물 가드 판정을 그대로 쓴다', () => {
    const findings = auditIssueDiscipline('회삿돈을 빼돌린 횡령 정황이 드러났다.');
    expect(findings.some((f) => f.code === 'assertion')).toBe(true);
  });

  it('깨끗한 사건 글에는 아무것도 걸리지 않는다', () => {
    const clean = [
      'A씨는 이번 SNS 글에서 전체 피해액을 7~8억 원이라고 주장했다.',
      '이번에 공개한 차용증에 적힌 금액은 1억 5천만 원이다.',
      'A씨는 사기죄와 횡령죄를 거론하며 법적 대응 의사를 밝혔다.',
      'B씨 측은 아직 공식 입장을 내지 않았다.',
    ].join(' ');
    expect(auditIssueDiscipline(clean)).toEqual([]);
  });
});

describe('applyIssueDisciplineAudit', () => {
  const issueSource = { contentMode: 'seo', categoryHint: '연예' };

  it('이슈형 카테고리만 검수 대상이다', async () => {
    expect(await isIssueDisciplineTarget(issueSource)).toBe(true);
    expect(await isIssueDisciplineTarget({ contentMode: 'seo', categoryHint: '육아' })).toBe(false);
  });

  it('엔진이 없으면 원문을 그대로 두고 경고만 남긴다', async () => {
    const draft = { bodyPlain: '제 기준으로는 납득하기 어렵습니다.' };
    const result = await applyIssueDisciplineAudit(draft, issueSource, async () => null);
    expect(result.ran).toBe(true);
    expect(result.findingCount).toBe(1);
    expect(result.correctedCount).toBe(0);
    expect(draft.bodyPlain).toBe('제 기준으로는 납득하기 어렵습니다.');
  });

  it('교정문이 규칙에 다시 걸리면 그 치환을 버린다', async () => {
    const draft = { bodyPlain: '제 기준으로는 납득하기 어렵습니다.' };
    const result = await applyIssueDisciplineAudit(draft, issueSource, async () => ({
      engine: 'test',
      callModel: async () => '[{"index":1,"replacement":"제가 보기에는 납득하기 어렵습니다."}]',
    }));
    expect(result.correctedCount).toBe(0);
    expect(draft.bodyPlain).toBe('제 기준으로는 납득하기 어렵습니다.');
  });

  it('통과한 교정문은 bodyPlain 과 bodyHtml 양쪽에 반영한다', async () => {
    const bad = '제 기준으로는 납득하기 어렵습니다.';
    const good = 'A씨의 해명은 아직 받아들여지지 않았습니다.';
    const draft = { bodyPlain: bad, bodyHtml: `<p>${bad}</p>` };
    const result = await applyIssueDisciplineAudit(draft, issueSource, async () => ({
      engine: 'test',
      callModel: async () => JSON.stringify([{ index: 1, replacement: good }]),
    }));
    expect(result.correctedCount).toBe(1);
    expect(draft.bodyPlain).toBe(good);
    expect(draft.bodyHtml).toBe(`<p>${good}</p>`);
  });

  it('검수 대상이 아니면 모델을 아예 부르지 않는다', async () => {
    let called = false;
    const draft = { bodyPlain: '제 기준으로는 납득하기 어렵습니다.' };
    await applyIssueDisciplineAudit(draft, { contentMode: 'seo', categoryHint: '육아' }, async () => {
      called = true;
      return null;
    });
    expect(called).toBe(false);
  });
});
