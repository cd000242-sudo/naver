import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06 배치 5] living·parenting·tips 양모드 신규격 계약.
 *
 * 구판 6파일은 전부 8줄 무보정 수준이었다. 초안 → 적대검증 → 재대조 통과본.
 * 핵심 공격 지점: parenting 의 아동 식별정보·의학 단정·발달 조급함,
 * tips 의 절약액 날조·만능 보장, living 의 평수 역산·비용표 추정 채움.
 */

const read = (rel: string): string =>
  readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');

const seoLiving = read('seo/living.prompt');
const seoParenting = read('seo/parenting.prompt');
const seoTips = read('seo/tips.prompt');
const hfLiving = read('homefeed/living.prompt');
const hfParenting = read('homefeed/parenting.prompt');
const hfTips = read('homefeed/tips.prompt');

const SEO_ALL: Array<[string, string]> = [
  ['living', seoLiving], ['parenting', seoParenting], ['tips', seoTips],
];
const HF_ALL: Array<[string, string]> = [
  ['living', hfLiving], ['parenting', hfParenting], ['tips', hfTips],
];

describe('배치 5 SEO 공통 — 우선 선언·조건부·변환 의무 부재', () => {
  it.each(SEO_ALL)('%s: ★ SECTION -2 우선 선언 (3a/4a 규격)', (_n, p) => {
    expect(p).toMatch(/★[\s\S]{0,80}\[SECTION -2\][\s\S]{0,160}(?:우선|항상 위)/);
    expect(p).toContain('"입력에 그 값이 있을 때"만 발동한다 — 없는 값을 채우라는 뜻으로 읽히면 무효다.');
  });

  it.each(SEO_ALL)('%s: 압력 꼬리·변환 의무 부재', (_n, p) => {
    const bulletLines = p.split('\n').filter((l) => /^\s*[-⛔·]/.test(l)).join('\n');
    expect(bulletLines).not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    expect(p).not.toContain('필수 경험 표현');
    expect(p).not.toMatch(/없으면[^\n]*(로 안내한다|로 대체한다|로 채운다|채워 넣는다)/);
  });
});

describe('배치 5 홈판 공통 — food/travel 축자 규격', () => {
  it.each(HF_ALL)('%s: ★ 선언 축자 + LF + 분량 대역', (_n, p) => {
    expect(p).toMatch(/★ base\.prompt \[SECTION -2\] 자료 외 사실 금지·경험 권한이 이 파일보다 항상 우선한다\./);
    expect(p).toMatch(/아래 지시는 전부 "입력에 그 재료가 있을 때"만 발동하며, 재료가 없으면 그 대목을 비운다\./);
    expect(p).not.toMatch(/\r/);
    expect(p.split('\n').length).toBeLessThanOrEqual(62);
  });

  it.each(HF_ALL)('%s: 첫 화면 즉답 + base 분기 폴백 + 금지 패턴 부재', (_n, p) => {
    expect(p).toMatch(/세운 질문에는 첫 화면 안에서 바로 답한다\./);
    expect(p).toMatch(/분기하지 않고 base 구조를 그대로 따른다\./);
    expect(p).not.toMatch(/첫 화면에는/);
    expect(p).not.toMatch(/반드시/);
    expect(p).not.toMatch(/없으면[^\n]*(로 안내한다|로 대체한다|로 채운다|채워 넣는다)/);
  });

  it.each([['living', hfLiving], ['parenting', hfParenting]] as Array<[string, string]>)(
    '%s: 제3자 후기 attribution 골격', (_n, p) => {
      expect(p).toMatch(/"후기에서\s*반복된 얘기는 ○○"처럼 누구의 경험인지 밝혀 옮길 수 있다\./);
    });
});

describe('배치 5 — living 고유 계약', () => {
  it('SEO: 평수 역산·산술 단정 차단 + 부분 결손 처리', () => {
    expect(seoLiving).toMatch(/배치 가능 여부를 역산해 단정하지 않는다/);
    expect(seoLiving).toMatch(/둘 다 입력에 있을 때만/);
    expect(seoLiving).toMatch(/한 항목이라도 비면 표 형태로[\s\S]{0,4}만들지 않는다/);
    expect(seoLiving).toMatch(/임의로 환산하거나 어림하지 않는다/);
    expect(seoLiving).toMatch(/균형을 맞추려고 만들지 않는다/);
    expect(seoLiving).toMatch(/쉽다·어렵다·간단하다로 요약하지 않는다/);
  });

  it('SEO: 총비용 합산 금지·분기 폴백·업체 명예훼손 가드 (축자 공유)', () => {
    expect(seoLiving).toMatch(/일부 금액을 총비용이라고 부르지 않는다/);
    expect(seoLiving).toMatch(/판별 근거가 입력에[\s\S]{0,4}없으면 분기하지 말고 base 구조를 그대로 따른다/);
    expect(seoLiving).toMatch(/특정 업체에[\s\S]{0,4}대한 무근거 부정 서술은 어떤 구성 요구보다 먼저 차단된다/);
  });

  it('홈판: 멈춤 훅 + 치수 단정·before/after 날조 차단', () => {
    expect(hfLiving).toMatch(/"우리 집도 이 문제\s*있는데"/);
    expect(hfLiving).toMatch(/치수 궁합을 계산으로 단정하지 않는다\./);
    expect(hfLiving).toMatch(/"들어간다\/안 들어간다" 판정을\s*만들지 않고/);
    expect(hfLiving).toMatch(/before\/after를 날조하지 않는다\./);
    expect(hfLiving).toMatch(/한 항목이라도 비면 확인된 것만\s*문장으로 쓴다\./);
    expect(hfLiving).toMatch(/빈 항목을 추정값으로 메우지 않는다\./);
    expect(hfLiving).toMatch(/전기·가스·타공·구조 변경처럼 안전과 직결된 작업 조건은 입력에 표기된 그대로만 옮기고,/);
  });
});

describe('배치 5 — parenting 고유 계약 (YMYL·아동 보호)', () => {
  it('SEO: 값 지정 금지 + 확인처 폴백 + 아동 식별정보 차단', () => {
    expect(seoParenting).toMatch(/아이에게 맞는 값을 정해주지 않는다/);
    expect(seoParenting).toMatch(/대상·조건과 같은 문장에서만/);
    expect(seoParenting).toMatch(/없으면 "공식 안내에서 확인"을 넘는 구체 확인처를 만들지 않는다/);
    expect(seoParenting).toMatch(/아이 이름, 생년월일, 어린이집·유치원·학교명/);
    expect(seoParenting).toMatch(/진단명·치료 이력·발달 지연 여부/);
    expect(seoParenting).toMatch(/이름·기관·반으로 특정되는 타인의/);
  });

  it('SEO: 발달 조급함·시기 단정 금지 + 봇단어 금지', () => {
    expect(seoParenting).toMatch(/부모의 선택과 아이의 미래를 인과로 잇지 않/);
    expect(seoParenting).toMatch(/"지금이 골든타임"/);
    expect(seoParenting).toMatch(/시기를 특정하지 말고 자료에 적힌 범위만 쓴다/);
    expect(seoParenting).toMatch(/정답 시기로 좁히지 않는다/);
    expect(seoParenting).toMatch(/이 배치는 이 파일의[\s\S]{0,4}다른 우선 배치보다 위다/);
    expect(seoParenting).toMatch(/"국민템", "필수템", "리얼후기"/);
  });

  it('홈판: 멈춤 훅 + 아이 장면 날조 차단 + 진단·불안 후킹 금지', () => {
    expect(hfParenting).toMatch(/"우리 애도 그런데"/);
    expect(hfParenting).toMatch(/아이의 장면·말·사진 정황을 날조하지 않는다\./);
    expect(hfParenting).toMatch(/없으면 장면 없이 상황과 판단으로 쓴다\./);
    expect(hfParenting).toMatch(/작성자 직접 양육 메모가 있을\s*때만 1인칭으로 쓴다\./);
    expect(hfParenting).toMatch(/진단하지 않는다\./);
    expect(hfParenting).toMatch(/정상과 이상을 가르는 단정으로 바꾸지 않는다\./);
    expect(hfParenting).toMatch(/"지금 안 하면 늦는다", "이거 모르면 아이만 손해",\s*"다른 애들은 벌써"/);
  });
});

describe('배치 5 — tips 고유 계약 (절약액·만능 보장 차단)', () => {
  it('SEO: 절약액 날조 3중 잠금 + 안전 수치·기한 배치', () => {
    expect(seoTips).toMatch(/사례 하나를 평균처럼 넓히지 않고/);
    expect(seoTips).toMatch(/여러 값을 합산해 "연간 ○○원" 식의[\s\S]{0,4}새 수치를 만들지 않는다/);
    expect(seoTips).toMatch(/임의로 환산하거나 어림하지 않는다/);
    expect(seoTips).toMatch(/혼합 금지·환기/);
    expect(seoTips).toMatch(/기한·마감·처리 소요일이 입력에 있으면 절차 설명보다 먼저 알린다/);
    expect(seoTips).toMatch(/되돌릴 수 없는[\s\S]{0,6}작업이라고 입력에 적혀 있으면/);
  });

  it('SEO: 보장 반전·확장 금지·attribution·분기 폴백', () => {
    expect(seoTips).toMatch(/입력에 있어도 보장으로 옮기지 않고/);
    expect(seoTips).toMatch(/서두르라는 취지의 문장 자체를 만들지 않는다/);
    expect(seoTips).toMatch(/"어디에나 된다"로 확장하지 않고/);
    expect(seoTips).toMatch(/"후기에서 반복된 얘기는 ○○"처럼 누구의 경험인지 밝혀 옮길 수 있다/);
    expect(seoTips).toMatch(/분기하지 않고 base 구조를 그대로 따른다/);
  });

  it('홈판: 멈춤 훅 + 만능 보장·집단 단정 금지 + 원리 날조 차단', () => {
    expect(hfTips).toMatch(/"이거 나만 몰랐나 \/ 여태\s*헛수고한 건가"/);
    expect(hfTips).toMatch(/어느 축도 아니면\(생활 소식·시즌 이슈 등\)\s*분기하지 않고 base 구조를 그대로 따른다\./);
    expect(hfTips).toMatch(/"무조건 된다", "100% 효과", "이것만 하면 끝"/);
    expect(hfTips).toMatch(/근거가 모자라면 항목 수를 줄인다\./);
    expect(hfTips).toMatch(/"다들 잘못 쓰고 있다", "99%는 모른다"/);
    expect(hfTips).toMatch(/설득력을 채우려고 없는 원리나 주의점을 만들지 않는다\./);
    expect(hfTips).toMatch(/임의로 혼합하거나 다른 대상으로 넓혀 권하지 않는다\./);
  });
});
