import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXPERIENCE_CATEGORY_HINTS,
  buildKinAnswerBlock,
  collectKinExperienceAnswers,
  isExperienceCategory,
  parseKinAnswers,
} from '../content/kinExperienceMaterial.js';

const searchKinMock = vi.fn();

vi.mock('../naverSearchApi.js', () => ({
  searchKin: (...args: unknown[]) => searchKinMock(...args),
}));

const LONG_ANSWER_A =
  '벽걸이로 설치하실 거면 브라켓이 기본 구성에 없어서 따로 구매하셔야 합니다. 저희 집은 석고보드 벽이라 앙카 작업까지 필요했고 설치 전에 벽 재질을 확인해두시는 게 좋습니다.';
const LONG_ANSWER_B =
  '침실에 두려고 하시면 소음을 꼭 확인하세요. 스펙표 데시벨보다 밤에는 크게 느껴져서 거실로 옮기는 경우가 많습니다. 매장에서 최대 모드로 켜보고 결정하시는 걸 추천합니다.';

const MODERN_HTML = `<html><body>
  <div class="answer-content__item">
    <div class="se-main-container">${LONG_ANSWER_A}</div>
  </div>
  <div class="answer-content__item">
    <div class="se-main-container">질문자 채택\n${LONG_ANSWER_B}\n광고입니다</div>
  </div>
</body></html>`;

const LEGACY_HTML = `<html><body>
  <div class="_endContents">${LONG_ANSWER_A}</div>
</body></html>`;

const NO_ANSWER_HTML = '<html><body><div class="question-content">질문만 있는 페이지</div></body></html>';

function stubFetchHtml(html: string): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => html })));
}

describe('isExperienceCategory — 경험군 게이트', () => {
  it.each(EXPERIENCE_CATEGORY_HINTS.map((hint) => [hint]))('경험군 힌트 "%s" → true', (hint) => {
    expect(isExperienceCategory(hint)).toBe(true);
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(isExperienceCategory(' 리빙 ')).toBe(true);
  });

  it.each([['IT'], ['연예'], ['사회'], ['경제'], ['스포츠'], ['건강'], ['쇼핑'], ['영화'], ['드라마'], ['자동차'], ['general']])(
    '뉴스·스펙·YMYL 카테고리 "%s" → false',
    (hint) => {
      expect(isExperienceCategory(hint)).toBe(false);
    },
  );

  it('빈 값·undefined·null → false', () => {
    expect(isExperienceCategory('')).toBe(false);
    expect(isExperienceCategory('   ')).toBe(false);
    expect(isExperienceCategory(undefined)).toBe(false);
    expect(isExperienceCategory(null)).toBe(false);
  });
});

describe('parseKinAnswers — 답변 추출', () => {
  it('SmartEditor 레이아웃(.answer-content__item + .se-main-container)에서 답변을 추출한다', async () => {
    const answers = await parseKinAnswers(MODERN_HTML);
    expect(answers).toHaveLength(2);
    expect(answers[0]).toContain('브라켓');
    expect(answers[1]).toContain('소음');
  });

  it('레거시 레이아웃(._endContents 단독)도 폴백으로 추출한다', async () => {
    const answers = await parseKinAnswers(LEGACY_HTML);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toContain('브라켓');
  });

  it('보일러플레이트 줄(질문자 채택, 광고입니다)을 제거하고 본문은 유지한다', async () => {
    const answers = await parseKinAnswers(MODERN_HTML);
    const merged = answers.join('\n');
    expect(merged).not.toContain('질문자 채택');
    expect(merged).not.toContain('광고입니다');
    expect(merged).toContain('소음');
  });

  it('60자 미만 답변은 버린다', async () => {
    const html = '<div class="answer-content__item"><div class="se-main-container">너무 짧은 답변</div></div>';
    expect(await parseKinAnswers(html)).toHaveLength(0);
  });

  it('답변당 600자로 캡한다', async () => {
    const longText = '설치 조건을 확인하세요. '.repeat(100);
    const html = `<div class="answer-content__item"><div class="se-main-container">${longText}</div></div>`;
    const answers = await parseKinAnswers(html);
    expect(answers).toHaveLength(1);
    expect(answers[0].length).toBeLessThanOrEqual(600);
  });

  it('동일 답변은 중복 제거한다', async () => {
    const html = `
      <div class="answer-content__item"><div class="se-main-container">${LONG_ANSWER_A}</div></div>
      <div class="answer-content__item"><div class="se-main-container">${LONG_ANSWER_A}</div></div>`;
    expect(await parseKinAnswers(html)).toHaveLength(1);
  });

  it('maxAnswers 상한을 지킨다', async () => {
    const answers = await parseKinAnswers(MODERN_HTML, 1);
    expect(answers).toHaveLength(1);
  });

  it('빈 HTML → 빈 배열', async () => {
    expect(await parseKinAnswers('')).toHaveLength(0);
    expect(await parseKinAnswers(NO_ANSWER_HTML)).toHaveLength(0);
  });
});

describe('buildKinAnswerBlock — 재료 블록 계약', () => {
  it('헤더·조언형 가드·번호 매김을 포함한다', () => {
    const block = buildKinAnswerBlock([LONG_ANSWER_A, LONG_ANSWER_B]);
    expect(block).toContain('겪은 사람들의 말');
    expect(block).toContain('지식iN 답변');
    expect(block).toContain('조언형');
    expect(block).toContain('출처를 밝힌 전달형');
    expect(block).toContain('[답변 1]');
    expect(block).toContain('[답변 2]');
  });

  it('1인칭 위장 금지 가드가 헤더에 박혀 있다 (SPEC-REVIEW-001 정합)', () => {
    const block = buildKinAnswerBlock([LONG_ANSWER_A]);
    expect(block).toContain('1인칭 경험으로 바꾸');
    expect(block).toContain('답변에 없는 수치·기간·결과');
  });

  it('빈 배열·짧은 답변만 있으면 빈 문자열', () => {
    expect(buildKinAnswerBlock([])).toBe('');
    expect(buildKinAnswerBlock(['짧음'])).toBe('');
  });
});

describe('collectKinExperienceAnswers — 수집 실패 사유 코드', () => {
  beforeEach(() => {
    searchKinMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('키워드 없음 → no-keyword (API 호출 자체를 안 한다)', async () => {
    const result = await collectKinExperienceAnswers('');
    expect(result.reason).toBe('no-keyword');
    expect(result.block).toBe('');
    expect(searchKinMock).not.toHaveBeenCalled();
  });

  it('네이버 API 키 미설정 → no-api-key', async () => {
    searchKinMock.mockRejectedValue(new Error('네이버 검색 API 키가 설정되지 않았습니다.'));
    const result = await collectKinExperienceAnswers('제습기');
    expect(result.reason).toBe('no-api-key');
    expect(result.block).toBe('');
  });

  it('검색 결과 0건 → no-results', async () => {
    searchKinMock.mockResolvedValue({ items: [] });
    const result = await collectKinExperienceAnswers('제습기');
    expect(result.reason).toBe('no-results');
  });

  it('링크가 http가 아니면 결과로 치지 않는다 → no-results', async () => {
    searchKinMock.mockResolvedValue({ items: [{ title: 't', link: 'javascript:void(0)', description: 'd' }] });
    const result = await collectKinExperienceAnswers('제습기');
    expect(result.reason).toBe('no-results');
  });

  it('페이지에 답변이 없으면 → no-answers', async () => {
    searchKinMock.mockResolvedValue({ items: [{ title: 't', link: 'https://kin.naver.com/qna/detail.naver?docId=1', description: 'd' }] });
    stubFetchHtml(NO_ANSWER_HTML);
    const result = await collectKinExperienceAnswers('제습기');
    expect(result.reason).toBe('no-answers');
  });

  it('페이지 크롤 실패(네트워크)는 무시하고 → no-answers', async () => {
    searchKinMock.mockResolvedValue({ items: [{ title: 't', link: 'https://kin.naver.com/qna/detail.naver?docId=1', description: 'd' }] });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    const result = await collectKinExperienceAnswers('제습기');
    expect(result.reason).toBe('no-answers');
  });

  it('정상 수집 → ok + 가드 헤더 포함 블록', async () => {
    searchKinMock.mockResolvedValue({ items: [{ title: 't', link: 'https://kin.naver.com/qna/detail.naver?docId=1', description: 'd' }] });
    stubFetchHtml(MODERN_HTML);
    const result = await collectKinExperienceAnswers('제습기');
    expect(result.reason).toBe('ok');
    expect(result.answerCount).toBe(2);
    expect(result.block).toContain('겪은 사람들의 말');
    expect(result.block).toContain('[답변 1]');
    expect(result.block).toContain('1인칭 경험으로 바꾸');
  });

  it('총 답변 상한(maxTotalAnswers)을 지킨다', async () => {
    searchKinMock.mockResolvedValue({
      items: [
        { title: 't1', link: 'https://kin.naver.com/1', description: 'd' },
        { title: 't2', link: 'https://kin.naver.com/2', description: 'd' },
      ],
    });
    stubFetchHtml(MODERN_HTML);
    const result = await collectKinExperienceAnswers('제습기', 1);
    expect(result.answerCount).toBe(1);
  });

  it('검색 자체가 일반 오류로 죽어도 throw하지 않는다 → error', async () => {
    searchKinMock.mockRejectedValue(new Error('boom'));
    const result = await collectKinExperienceAnswers('제습기');
    expect(result.reason).toBe('error');
    expect(result.block).toBe('');
  });
});
