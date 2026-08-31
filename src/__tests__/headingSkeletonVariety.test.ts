import { describe, expect, it } from 'vitest';

import {
  analyzeHeadingSkeletons,
  describeHeadingSkeletonWarnings,
} from '../content/headingSkeletonVariety';

/**
 * [2026-09-01 사장님 실측] 가을 환절기 비염 글의 소제목 6개가 전부 같은 골격이었다.
 *
 *   가을철 실내 습도 45~60%,        숫자가 갈리는 구간과 겹치는 구간
 *   가을철 체온 1도와 면역력 30%,    가을에 유독 심해지는 이유
 *   맑은 콧물 1~2달과 끈끈한 콧물 1주, 감기와 갈리는 지점
 *   하루 3회 10분 환기와 손 씻기,    습도 다음에 붙일 조건
 *   65세 이상·아이·천식·산모,        조심할 조건이 달라지는 사람
 *   성인 10~30%·소아 40%,           유병률이 알려주는 관리의 길이
 *   └ 수치 나열 ┘  쉼표  └ 명사형 설명구 ┘
 *
 * 6개 중 6개. 하나도 예외가 없다. 사람은 이렇게 규칙적으로 쓰지 못한다.
 * 사장님 말로 "누가 봐도 AI가 적었구나" 가 나는 지점이 여기다.
 * 네이버가 명시한 남용 사례 중 "동일 · 유사 콘텐츠 대량 생성" 판정의 재료가 된다.
 *
 * headings-seo.prompt:34 는 이미 "소제목 전부를 같은 문형으로 맞추는 것" 을 금지하고 있었다.
 * 그런데도 6/6 이 같았다 — 이 코드베이스에서 반복 확인된 것과 같다.
 * 산문 지시는 흘리고, 재는 장치가 있어야 지켜진다.
 *
 * 경고만 낸다. 소제목을 고쳐 쓰지 않고 발행도 막지 않는다.
 */
const REAL_CASE = [
  '가을철 실내 습도 45~60%, 숫자가 갈리는 구간과 겹치는 구간',
  '가을철 체온 1도와 면역력 30%, 가을에 유독 심해지는 이유',
  '맑은 콧물 1~2달과 끈끈한 콧물 1주, 감기와 갈리는 지점',
  '하루 3회 10분 환기와 손 씻기, 습도 다음에 붙일 조건',
  '65세 이상·아이·천식·산모, 조심할 조건이 달라지는 사람',
  '성인 10~30%·소아 40%, 유병률이 알려주는 관리의 길이',
];

describe('실측 사례를 잡는다', () => {
  it('쉼표 골격이 전부 같으면 걸린다', () => {
    const report = analyzeHeadingSkeletons(REAL_CASE);
    expect(report.uniformComma).toBe(true);
  });

  it('종결이 전부 명사형이면 걸린다', () => {
    expect(analyzeHeadingSkeletons(REAL_CASE).uniformEnding).toBe(true);
  });

  it('경고 문구가 무엇이 같은지 말해준다', () => {
    const lines = describeHeadingSkeletonWarnings(analyzeHeadingSkeletons(REAL_CASE));
    expect(lines.join(' ')).toMatch(/쉼표/);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('섞여 있으면 통과한다 — 정상을 괴롭히지 않는다', () => {
  const VARIED = [
    '실내 습도는 45~60% 사이에 두면 됩니다',
    '왜 자료마다 권장 습도가 다를까',
    '감기와 비염을 가르는 기간 기준',
    '습도를 맞췄는데도 코가 막힌다면 환기를 보세요',
    '65세 이상·천식·산모는 조건이 다릅니다',
  ];

  it('문형이 섞이면 걸리지 않는다', () => {
    const report = analyzeHeadingSkeletons(VARIED);
    expect(report.uniformComma).toBe(false);
    expect(report.uniformEnding).toBe(false);
    expect(describeHeadingSkeletonWarnings(report)).toHaveLength(0);
  });

  it('소제목이 적으면 판정하지 않는다 — 2~3개는 우연히 같을 수 있다', () => {
    const report = analyzeHeadingSkeletons(['수치 A, 설명 구간', '수치 B, 설명 지점']);
    expect(report.checked).toBe(0);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(() => analyzeHeadingSkeletons([])).not.toThrow();
    expect(analyzeHeadingSkeletons(undefined as never).checked).toBe(0);
  });
});

describe('한 개라도 예외가 있으면 봐준다 — 완전 균일만 잡는다', () => {
  it('여섯 중 하나가 질문형이면 종결 균일이 아니다', () => {
    const mixed = [...REAL_CASE.slice(0, 5), '습도를 맞췄는데도 코가 막히는 이유는 뭘까'];
    expect(analyzeHeadingSkeletons(mixed).uniformEnding).toBe(false);
  });

  it('여섯 중 하나에 쉼표가 없으면 쉼표 균일이 아니다', () => {
    const mixed = [...REAL_CASE.slice(0, 5), '유병률이 알려주는 관리의 길이'];
    expect(analyzeHeadingSkeletons(mixed).uniformComma).toBe(false);
  });
});
