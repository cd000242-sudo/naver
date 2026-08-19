// 노출 글 "구조만 학습" 잠금.
//
// 핵심 안전선: 이 블록에 원문 문장·고유명사·사실이 들어가면 베끼기가 되고, 지금 겪는
// 유사문서·누락 문제를 도구가 직접 만들어내게 된다. 숫자와 유형만 나가야 한다.

import { describe, it, expect } from 'vitest';
import {
  analyzePostStructure,
  buildStructureGuideBlock,
  classifyEnding,
  classifyTitleAngle,
  splitParagraphs,
} from '../content/exposedPostStructure';

const SAMPLE = {
  title: '한다감 임신 9월 출산 앞둔, 남편이 화장실로 들어간 이유',
  body: [
    '9월 출산을 앞둔 한다감 소식이 요즘 계속 올라오는데요.',
    '시험관 시술로 임신에 성공했다는 사실을 알게 된 순간의 반응이었습니다.',
    '크림 화이트 슬리브리스 원피스에 피셔맨 샌들',
    '무엇이 본인이 직접 밝힌 내용이고 어디부터 갈리는지 정리했습니다.',
  ].join('​'),
  headings: ['화장실 문 뒤에서 나온 반응', '46세와 47세, 표기가 계속 엇갈리는 지점'],
  imageCount: 6,
};

describe('구조 추출', () => {
  it('문단을 zero-width space 기준으로 나눈다 (네이버 에디터 구조)', () => {
    expect(splitParagraphs(SAMPLE.body)).toHaveLength(4);
  });

  it('zero-width space 가 없으면 빈 줄 기준으로 나눈다', () => {
    expect(splitParagraphs('첫 문단입니다.\n\n둘째 문단입니다.')).toHaveLength(2);
  });

  it('종결 형태를 구분한다', () => {
    expect(classifyEnding('사실이었습니다.')).toBe('closed');
    expect(classifyEnding('올라오는데요')).toBe('closed');
    expect(classifyEnding('피셔맨 샌들')).toBe('noun');
    // 말줄임표가 붙어도 종결어미가 있으면 완결서술이다 — 구두점 종결은 어미가 없는 경우다.
    expect(classifyEnding('그런데 말이죠...')).toBe('closed');
    expect(classifyEnding('조용한 결혼식...')).toBe('punctuation');
  });

  it('제목 각도를 유형으로만 분류한다', () => {
    expect(classifyTitleAngle('재벌형사2 방송날짜 언제일까?')).toBe('question');
    expect(classifyTitleAngle('이적료 656억 확정')).toBe('number');
    expect(classifyTitleAngle('남편이 화장실로 들어간 이유')).toBe('reason');
    expect(classifyTitleAngle('아이폰 vs 갤럭시 차이')).toBe('comparison');
    expect(classifyTitleAngle('한다감 근황 정리')).toBe('statement');
  });

  it('구조 수치를 뽑는다', () => {
    const p = analyzePostStructure(SAMPLE);
    expect(p.paragraphCount).toBe(4);
    expect(p.headingCount).toBe(2);
    expect(p.imageCount).toBe(6);
    expect(p.imagesPerHeading).toBe(3);
    expect(p.endings.closed + p.endings.noun + p.endings.punctuation).toBeGreaterThan(90);
    expect(p.endings.noun).toBeGreaterThan(0); // '피셔맨 샌들'
  });

  it('빈 입력에도 던지지 않는다', () => {
    const p = analyzePostStructure({ title: '', body: '' });
    expect(p.paragraphCount).toBe(0);
    expect(p.imagesPerHeading).toBe(0);
    expect(() => buildStructureGuideBlock(p)).not.toThrow();
  });
});

describe('프롬프트 블록 — 베끼기가 구조적으로 불가능해야 한다', () => {
  const block = buildStructureGuideBlock(analyzePostStructure(SAMPLE));

  it('원문 문장이 한 줄도 들어가지 않는다', () => {
    for (const sentence of SAMPLE.body.split('​')) {
      expect(block).not.toContain(sentence.trim());
    }
  });

  it('원문 제목과 소제목이 들어가지 않는다', () => {
    expect(block).not.toContain(SAMPLE.title);
    for (const h of SAMPLE.headings) expect(block).not.toContain(h);
  });

  it('고유명사가 들어가지 않는다', () => {
    for (const word of ['한다감', '피셔맨', '시험관', '크림 화이트']) {
      expect(block).not.toContain(word);
    }
  });

  it('숫자·유형 지침은 들어간다', () => {
    expect(block).toContain('이유 설명형');
    expect(block).toContain('문단 종결');
    expect(block).toContain('소제목');
  });

  it('원문을 따라 쓰지 말라는 경고가 들어간다', () => {
    expect(block).toContain('유사문서');
    expect(block).toMatch(/원문의 문장·표현·고유명사를 가져오지 않는다/);
  });

  it('이미지가 없으면 없다고 쓴다 (없는 수치를 지어내지 않는다)', () => {
    const noImage = buildStructureGuideBlock(analyzePostStructure({ ...SAMPLE, imageCount: 0 }));
    expect(noImage).toContain('원문 기준 없음');
  });
});
