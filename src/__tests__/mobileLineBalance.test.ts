/**
 * [v2.11.204] Mobile orphan-tail regression.
 *
 * Source: 2026-08-21 user screenshots of a published 이슈 post on a 360dp Galaxy.
 * Lines that overflowed the viewport by one or two glyphs dropped only their tail
 * ("데," / "서" / "만,") onto the next row.
 */
import { describe, it, expect } from 'vitest';
import {
  balanceMobileLineBreaks,
  measureMobileLineWidth,
  simulateMobileWrap,
  MAX_MOBILE_LINE_WIDTH,
  ORPHAN_TAIL_WIDTH,
} from '../content/mobileLineBalance';
import { balanceContentMobileLines } from '../contentBodyTransforms';

/** Lines the screenshots proved render on a single row. */
const FITS = [
  '이건 계산 방식 차이로 보입니다.',
  '한다감은 1980년생이고, 스스로를',
  '갈리는 거라, 어느 한쪽이',
  '오보라고 보긴 어려운 상황이죠.',
  '문제는 나이 표기만 갈리는',
  '게 아니라는 점이에요.',
  '그 앞에 2~3년이 붙어 있어요.',
  '몸 관리에 공을 들였다고 밝혔거든요.',
  '반신욕과 쑥뜸을 챙기고, 전국의',
  '산을 다니며 순환에 신경 썼다고 해요.',
];

/** Lines the screenshots proved orphaned their tail. */
const ORPHANED = [
  '매체마다 46세와 47세가 섞여 나오는데,',
  '쉽게 말하면 만 나이로 세느냐 아니냐에서',
  "결과만 놓고 보면 '1차 시도 성공'이지만,",
];

describe('mobileLineBalance — width calibration', () => {
  it('실측으로 한 줄에 들어간 줄은 폭 상한 이내로 측정된다', () => {
    for (const line of FITS) {
      expect(measureMobileLineWidth(line)).toBeLessThanOrEqual(MAX_MOBILE_LINE_WIDTH);
    }
  });

  it('실측으로 꼬리가 떨어진 줄은 폭 상한을 넘고 꼬리가 stub으로 잡힌다', () => {
    for (const line of ORPHANED) {
      expect(measureMobileLineWidth(line)).toBeGreaterThan(MAX_MOBILE_LINE_WIDTH);
      const { visualLines, tailWidth } = simulateMobileWrap(line);
      expect(visualLines).toBe(2);
      expect(tailWidth).toBeLessThan(ORPHAN_TAIL_WIDTH);
    }
  });
});

describe('mobileLineBalance — balanceMobileLineBreaks', () => {
  it('꼬리 고아 줄은 어절 경계에서 두 줄로 나뉜다', () => {
    for (const line of ORPHANED) {
      const out = balanceMobileLineBreaks(line);
      const parts = out.split('\n');
      expect(parts.length).toBe(2);
      for (const part of parts) {
        expect(measureMobileLineWidth(part)).toBeLessThanOrEqual(MAX_MOBILE_LINE_WIDTH);
        // 어절이 쪼개지지 않는다 — 원문에 없던 공백/글자 유입 금지
        expect(line).toContain(part.trim());
      }
      // 글자는 하나도 잃지 않는다
      expect(out.replace(/\s+/g, '')).toBe(line.replace(/\s+/g, ''));
    }
  });

  it('나뉜 뒤에도 꼬리 stub이 남지 않는다', () => {
    for (const line of ORPHANED) {
      for (const part of balanceMobileLineBreaks(line).split('\n')) {
        const { visualLines, tailWidth } = simulateMobileWrap(part);
        expect(visualLines).toBe(1);
        expect(tailWidth).toBeGreaterThanOrEqual(ORPHAN_TAIL_WIDTH);
      }
    }
  });

  it('인용부호 앞에서 끊어 인용구가 쪼개지지 않는다', () => {
    expect(balanceMobileLineBreaks("결과만 놓고 보면 '1차 시도 성공'이지만,")).toBe(
      "결과만 놓고 보면\n'1차 시도 성공'이지만,",
    );
  });

  it('한 줄에 들어가는 줄은 바이트 단위로 그대로 둔다', () => {
    for (const line of FITS) {
      expect(balanceMobileLineBreaks(line)).toBe(line);
    }
  });

  it('깨끗하게 감싸지는 긴 단락은 건드리지 않는다', () => {
    const flowing = '한다감은 44세 무렵부터 아이를 갖고 싶다는 생각을 시작했고, 그때부터';
    expect(balanceMobileLineBreaks(flowing)).toBe(flowing);
  });

  it('리스트/소제목/인용/표/URL 줄은 폭을 넘겨도 구조를 유지한다', () => {
    const preserved = [
      '- 매체마다 46세와 47세가 섞여 나오는데, 계산 방식 차이입니다',
      '1. 매체마다 46세와 47세가 섞여 나오는데, 계산 방식 차이입니다',
      '## 매체마다 46세와 47세가 섞여 나오는데, 계산 방식 차이',
      '> 매체마다 46세와 47세가 섞여 나오는데, 계산 방식 차이입니다',
      '| 항목 | 매체마다 46세와 47세가 섞여 나오는데, 계산 차이 |',
      'https://blog.naver.com/leadernam/223456789012345678901234567890',
    ];
    for (const line of preserved) {
      expect(balanceMobileLineBreaks(line)).toBe(line);
    }
  });

  it('문단 구분(빈 줄)과 줄 순서는 보존된다', () => {
    const body = [
      '매체마다 46세와 47세가 섞여 나오는데,',
      '이건 계산 방식 차이로 보입니다.',
      '',
      '문제는 나이 표기만 갈리는',
    ].join('\n');
    expect(balanceMobileLineBreaks(body)).toBe(
      ['매체마다 46세와', '47세가 섞여 나오는데,', '이건 계산 방식 차이로 보입니다.', '', '문제는 나이 표기만 갈리는'].join('\n'),
    );
  });

  it('빈 입력/공백은 그대로 반환한다', () => {
    expect(balanceMobileLineBreaks('')).toBe('');
    expect(balanceMobileLineBreaks('\n\n')).toBe('\n\n');
  });

  it('공백 없는 초장문 한 덩어리는 쪼갤 수 없으므로 그대로 둔다', () => {
    const unbreakable = '가'.repeat(40);
    expect(balanceMobileLineBreaks(unbreakable)).toBe(unbreakable);
  });
});

describe('balanceContentMobileLines — StructuredContent 배선', () => {
  it('bodyPlain / introduction / conclusion / headings[].content 전부 보정된다', () => {
    const content: any = {
      bodyPlain: '매체마다 46세와 47세가 섞여 나오는데,',
      introduction: '쉽게 말하면 만 나이로 세느냐 아니냐에서',
      conclusion: "결과만 놓고 보면 '1차 시도 성공'이지만,",
      headings: [{ title: '나이 표기', content: '매체마다 46세와 47세가 섞여 나오는데,' }],
    };
    const out: any = balanceContentMobileLines(content);
    expect(out.bodyPlain).toBe('매체마다 46세와\n47세가 섞여 나오는데,');
    expect(out.introduction).toBe('쉽게 말하면 만 나이로\n세느냐 아니냐에서');
    expect(out.conclusion).toBe("결과만 놓고 보면\n'1차 시도 성공'이지만,");
    expect(out.headings[0].content).toBe('매체마다 46세와\n47세가 섞여 나오는데,');
    expect(out.headings[0].title).toBe('나이 표기');
  });

  it('bodyHtml은 손대지 않는다 (태그 폭 계산 불가)', () => {
    const html = '<p>매체마다 46세와 47세가 섞여 나오는데, 계산 방식 차이입니다</p>';
    const out: any = balanceContentMobileLines({ bodyHtml: html } as any);
    expect(out.bodyHtml).toBe(html);
  });
});
