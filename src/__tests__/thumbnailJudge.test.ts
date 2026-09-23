import { describe, expect, it, vi } from 'vitest';

import {
  buildThumbnailJudgePrompt,
  judgeThumbnailCandidates,
  parseThumbnailJudgeResponse,
  pickThumbnailCandidate,
  ThumbnailJudgeCandidate,
  ThumbnailJudgeContext,
  ThumbnailJudgeScore,
} from '../image/director/thumbnailJudge';

const CTX: ThumbnailJudgeContext = { title: '여름철 냉방비 아끼는 법', cardPromise: '에어컨 없이도 시원하게 지내는 방법', titleBandPlanned: false };

const CANDIDATES: ThumbnailJudgeCandidate[] = [
  { label: 'AI 장면', hasBakedText: false },
  { label: 'AI 장면(가까이)', hasBakedText: false },
  { label: '숫자 강조 카드', hasBakedText: true },
];

function score(overrides: Partial<ThumbnailJudgeScore> = {}): ThumbnailJudgeScore {
  return { meaning: 3, subject: 3, legibility: 3, natural: 3, clean: 3, immediacy: 3, textOk: true, note: '', ...overrides };
}

describe('buildThumbnailJudgePrompt', () => {
  it('후보 수(N)와 각 라벨을 포함한다', () => {
    const prompt = buildThumbnailJudgePrompt(CTX, CANDIDATES);
    expect(prompt).toContain('3장');
    for (const c of CANDIDATES) expect(prompt).toContain(c.label);
  });

  it('제목과 카드 약속을 DATA로 인용한다', () => {
    const prompt = buildThumbnailJudgePrompt(CTX, CANDIDATES);
    expect(prompt).toContain(`"${CTX.title}"`);
    expect(prompt).toContain(`"${CTX.cardPromise}"`);
  });

  it('큰따옴표가 포함된 제목/카드 약속은 새니타이즈되어 들어간다', () => {
    const ctx: ThumbnailJudgeContext = { title: '이것은 "특별한" 제목', cardPromise: '이것도 "약속"이다', titleBandPlanned: false };
    const prompt = buildThumbnailJudgePrompt(ctx, CANDIDATES);
    expect(prompt).not.toContain('이것은 "특별한" 제목');
    expect(prompt).toContain("이것은 '특별한' 제목");
    expect(prompt).toContain("이것도 '약속'이다");
  });

  it('공백을 접고 200자로 자른다', () => {
    const ctx: ThumbnailJudgeContext = { title: 'a'.repeat(250), cardPromise: '   여러   공백   ', titleBandPlanned: false };
    const prompt = buildThumbnailJudgePrompt(ctx, CANDIDATES);
    expect(prompt).toContain(`"${'a'.repeat(200)}"`);
    expect(prompt).not.toContain('a'.repeat(201));
    expect(prompt).toContain('"여러 공백"');
  });

  it('titleBandPlanned=true일 때만 하단 1/3 안내 문장이 들어간다', () => {
    const withBand = buildThumbnailJudgePrompt({ ...CTX, titleBandPlanned: true }, CANDIDATES);
    const withoutBand = buildThumbnailJudgePrompt({ ...CTX, titleBandPlanned: false }, CANDIDATES);
    expect(withBand).toContain('하단 1/3');
    expect(withoutBand).not.toContain('하단 1/3');
  });

  it('3후보 기준으로 약 1400자 이하를 유지한다', () => {
    expect(buildThumbnailJudgePrompt({ ...CTX, titleBandPlanned: true }, CANDIDATES).length).toBeLessThan(1400);
  });
});

describe('parseThumbnailJudgeResponse', () => {
  const okJson = JSON.stringify({ best: 2, candidates: [
    { index: 1, meaning: 3, subject: 3, legibility: 3, natural: 3, clean: 3, immediacy: 3, textOk: true, note: 'a' },
    { index: 2, meaning: 5, subject: 5, legibility: 5, natural: 5, clean: 5, immediacy: 5, textOk: true, note: 'b' },
    { index: 3, meaning: 2, subject: 2, legibility: 2, natural: 2, clean: 2, immediacy: 2, textOk: true, note: 'c' },
  ], reason: 'test' });

  it('평문 JSON을 파싱한다', () => {
    const result = parseThumbnailJudgeResponse(okJson, 3);
    expect(result).not.toBeNull();
    expect(result?.best).toBe(1); // 1-based "2" -> 0-based index 1
    expect(result?.scores).toHaveLength(3);
    expect(result?.scores[1]?.meaning).toBe(5);
    expect(result?.reason).toBe('test');
  });

  it('코드펜스로 감싼 JSON을 파싱한다', () => {
    expect(parseThumbnailJudgeResponse('```json\n' + okJson + '\n```', 3)?.best).toBe(1);
  });

  it('JSON 앞뒤에 설명문이 있어도 파싱한다', () => {
    expect(parseThumbnailJudgeResponse(`여기 결과입니다.\n${okJson}\n이상입니다.`, 3)?.best).toBe(1);
  });

  it('숫자를 문자열("4")로 줘도 파싱한다', () => {
    const raw = JSON.stringify({ best: '1', candidates: [
      { index: '1', meaning: '4', subject: '4', legibility: '4', natural: '4', clean: '4', immediacy: '4', textOk: 'true', note: 'x' },
    ], reason: 'r' });
    const result = parseThumbnailJudgeResponse(raw, 1);
    expect(result?.best).toBe(0);
    expect(result?.scores[0]?.meaning).toBe(4);
    expect(result?.scores[0]?.textOk).toBe(true);
  });

  it('점수를 1..5로 클램프한다 (0 -> 1, 9 -> 5)', () => {
    const raw = JSON.stringify({ best: 1, candidates: [
      { index: 1, meaning: 0, subject: 9, legibility: 3, natural: 3, clean: 3, immediacy: 3, textOk: true, note: '' },
    ], reason: '' });
    const result = parseThumbnailJudgeResponse(raw, 1);
    expect(result?.scores[0]?.meaning).toBe(1);
    expect(result?.scores[0]?.subject).toBe(5);
  });

  it('candidates가 순서 없이 와도 index로 매칭한다', () => {
    const raw = JSON.stringify({ best: 1, candidates: [
      { index: 2, meaning: 5, subject: 5, legibility: 5, natural: 5, clean: 5, immediacy: 5, textOk: true, note: 'second' },
      { index: 1, meaning: 1, subject: 1, legibility: 1, natural: 1, clean: 1, immediacy: 1, textOk: true, note: 'first' },
    ], reason: '' });
    const result = parseThumbnailJudgeResponse(raw, 2);
    expect(result?.scores[0]?.note).toBe('first');
    expect(result?.scores[1]?.note).toBe('second');
  });

  it('textOk의 다양한 표기("false"/false/"no")를 false로 해석한다', () => {
    const raw = JSON.stringify({ best: 1, candidates: [
      { index: 1, meaning: 3, subject: 3, legibility: 3, natural: 3, clean: 3, immediacy: 3, textOk: 'false', note: '' },
      { index: 2, meaning: 3, subject: 3, legibility: 3, natural: 3, clean: 3, immediacy: 3, textOk: false, note: '' },
      { index: 3, meaning: 3, subject: 3, legibility: 3, natural: 3, clean: 3, immediacy: 3, textOk: 'no', note: '' },
    ], reason: '' });
    const result = parseThumbnailJudgeResponse(raw, 3);
    expect(result?.scores[0]?.textOk).toBe(false);
    expect(result?.scores[1]?.textOk).toBe(false);
    expect(result?.scores[2]?.textOk).toBe(false);
  });

  it('필수 숫자 필드가 빠지면 해당 후보는 null', () => {
    const raw = JSON.stringify({ best: 1, candidates: [
      { index: 1, meaning: 3, subject: 3, legibility: 3, natural: 3, clean: 3, note: '' }, // immediacy missing
    ], reason: '' });
    expect(parseThumbnailJudgeResponse(raw, 1)?.scores[0]).toBeNull();
  });

  it('best가 범위를 벗어나면 null', () => {
    expect(parseThumbnailJudgeResponse(JSON.stringify({ best: 5, candidates: [], reason: '' }), 3)?.best).toBeNull();
  });

  it('JSON을 전혀 파싱할 수 없으면 null을 반환한다', () => {
    expect(parseThumbnailJudgeResponse('죄송합니다, 답변할 수 없습니다.', 3)).toBeNull();
    expect(parseThumbnailJudgeResponse('{이것은 유효한 json이 아님}', 3)).toBeNull();
    expect(parseThumbnailJudgeResponse('', 3)).toBeNull();
  });
});

describe('pickThumbnailCandidate', () => {
  it('best가 유효하고 실격이 아니면 그대로 선택한다', () => {
    const parsed = { best: 0, scores: [score({ meaning: 1 }), score({ meaning: 5 })], reason: '' };
    expect(pickThumbnailCandidate(parsed, 2)).toEqual({ pickIndex: 0, source: 'judge', reason: 'judge-best' });
  });

  it('best가 textOk=false면 총점이 가장 높은 유효 후보로 대체한다', () => {
    const parsed = { best: 0, scores: [score({ textOk: false, meaning: 5 }), score({ meaning: 4 }), score({ meaning: 2 })], reason: '' };
    const result = pickThumbnailCandidate(parsed, 3);
    expect(result.pickIndex).toBe(1);
    expect(result.source).toBe('judge');
  });

  it('모든 후보가 textOk=false면 실격 규칙 자체를 무시한다', () => {
    const parsed = { best: null, scores: [score({ textOk: false, meaning: 2 }), score({ textOk: false, meaning: 5 })], reason: '' };
    const result = pickThumbnailCandidate(parsed, 2);
    expect(result.pickIndex).toBe(1);
    expect(result.source).toBe('judge');
  });

  it('총점이 동점이면 더 낮은 인덱스를 선택한다', () => {
    expect(pickThumbnailCandidate({ best: null, scores: [score(), score()], reason: '' }, 2).pickIndex).toBe(0);
  });

  it('parsed가 null이면 fallback 0', () => {
    expect(pickThumbnailCandidate(null, 3)).toEqual({ pickIndex: 0, source: 'fallback', reason: 'no-parse' });
  });

  it('아무 것도 스코어링되지 않으면 fallback 0', () => {
    const result = pickThumbnailCandidate({ best: null, scores: [null, null, null], reason: '' }, 3);
    expect(result.pickIndex).toBe(0);
    expect(result.source).toBe('fallback');
  });
});

describe('judgeThumbnailCandidates', () => {
  const images = [{ base64: 'a' }, { base64: 'b' }, { base64: 'c' }];

  it('후보가 1개면 judge를 호출하지 않고 fallback 0', async () => {
    const judge = vi.fn();
    const result = await judgeThumbnailCandidates([images[0]], CTX, [CANDIDATES[0]], judge);
    expect(judge).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pickIndex: 0, source: 'fallback', reason: 'single-candidate' });
  });

  it('judge가 null이면 fallback 0', async () => {
    const result = await judgeThumbnailCandidates(images, CTX, CANDIDATES, null);
    expect(result).toMatchObject({ pickIndex: 0, source: 'fallback', reason: 'no-route' });
  });

  it('judge가 예외를 던지면 fallback 0 + 에러 메시지를 reason에 담는다', async () => {
    const judge = vi.fn().mockRejectedValue(new Error('vision api down'));
    const result = await judgeThumbnailCandidates(images, CTX, CANDIDATES, judge);
    expect(result).toMatchObject({ pickIndex: 0, source: 'fallback', reason: 'vision api down' });
  });

  it('이미지 개수와 후보 개수가 다르면 judge를 호출하지 않고 fallback 0', async () => {
    const judge = vi.fn();
    const result = await judgeThumbnailCandidates([images[0]], CTX, CANDIDATES, judge);
    expect(judge).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pickIndex: 0, source: 'fallback', reason: 'image-count-mismatch' });
  });

  it('정상 경로: judge 결과에 따라 선택하고 source=judge를 반환한다', async () => {
    const raw = JSON.stringify({ best: 2, candidates: CANDIDATES.map((_, i) => ({
      index: i + 1, meaning: i === 1 ? 5 : 3, subject: 3, legibility: 3, natural: 3, clean: 3, immediacy: 3, textOk: true, note: '',
    })), reason: '2번이 가장 명확함' });
    const judge = vi.fn().mockResolvedValue(raw);
    const result = await judgeThumbnailCandidates(images, CTX, CANDIDATES, judge);
    expect(result).toMatchObject({ source: 'judge', pickIndex: 1, reason: '2번이 가장 명확함' });
  });

  it('judge는 이미지와 빌드된 프롬프트를 그대로 전달받는다', async () => {
    const judge = vi.fn().mockResolvedValue(JSON.stringify({ best: 1, candidates: [], reason: '' }));
    await judgeThumbnailCandidates(images, CTX, CANDIDATES, judge);
    expect(judge).toHaveBeenCalledWith(images, buildThumbnailJudgePrompt(CTX, CANDIDATES));
  });

  it('로그 콜백에 결과를 한 줄 남긴다', async () => {
    const judge = vi.fn().mockResolvedValue(JSON.stringify({ best: 1, candidates: [], reason: '' }));
    const log = vi.fn();
    await judgeThumbnailCandidates(images, CTX, CANDIDATES, judge, log);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('[ThumbnailJudge]');
  });
});
