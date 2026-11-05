/**
 * [2026-11-05] 업체 홍보 남은 문제 정리 (사장님 "남겨준 것 다 처리해").
 *
 * 1. "홈페이지 주소는 문의하실 때 확인해 주세요": every empty field was listed as "입력 안 됨 → 문의 시 확인",
 *    so writer-side fields (homepage, industry, career, FAQ) turned into odd lines telling readers to ask.
 * 2. A thin-input post put platform news ("네이버 지도 AI 질문창 11월 12일") in its table and a heading.
 * 3. "수원 영통 욕실 시공 문의 안내" → "시공 문의 안내": the non-review title-prefix strip guessed the
 *    region + service phrase as a product name and removed the search phrase the prompt asks for.
 * 4. The quality gate flagged the business's own numbers (덧방 2~3일, 보증 2년, 실측 30분, 경력 12년) as
 *    unsupported → safety 35 → regenerate, because its grounding text never included the business info.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBusinessInfoBlock } from '../content/businessInfoPromptBlock';
import { buildQualityGateGroundingText } from '../content/qualityGateGrounding';
import { collectUnsupportedConcreteClaims } from '../content/evidenceIntegrity';
import { validateStructuredContent } from '../contentStructuredValidator';

const SRC = path.join(__dirname, '..');
const base = { name: '새봄욕실디자인', phone: '010-0000-0201', region: '수원 영통', serviceArea: 'regional' as const };

describe('empty business fields', () => {
  it('lists only reader-facing fields under 입력 안 됨 and tells the model not to mention the rest', () => {
    const block = buildBusinessInfoBlock({ ...base, address: '경기 수원시 영통구 봉영로 0000', hours: '평일 09:00~18:00' });
    expect(block).not.toMatch(/📭 입력 안 됨:.*홈페이지/u);
    expect(block).toMatch(/🔇 비어 있는 칸: .*홈페이지.*→ 글에 쓰지 마라/u);
  });

  it('keeps 주소 · 영업시간 as 문의 시 확인 items (control)', () => {
    const block = buildBusinessInfoBlock(base);
    expect(block).toMatch(/📭 입력 안 됨: 주소, 영업시간 → 지어내지 말고 마지막 소제목 '문의 시 확인'으로만/u);
  });

  it('prints no mute line when every writer-side field is filled', () => {
    const block = buildBusinessInfoBlock({
      ...base, researchUrl: 'https://example.com', industry: '욕실 리모델링', extra: '경력 12년', faq: '견적은 무료인가요?',
    });
    expect(block).not.toContain('🔇');
  });
});

describe('business prompt', () => {
  const prompt = readFileSync(path.join(SRC, 'prompts', 'business', 'base.prompt'), 'utf8');

  it('forbids unrelated news and platform announcements from the collected material', () => {
    const fidelity = prompt.slice(prompt.indexOf('[SECTION -2]'), prompt.indexOf('[AD-RULES]'));
    expect(fidelity).toMatch(/업종·서비스와 관련 없는 뉴스·플랫폼 소식/u);
  });

  it('next-step section keeps muted fields out of the post', () => {
    const nextStep = prompt.slice(prompt.indexOf('[NEXT STEP]'), prompt.indexOf('[NAMING]'));
    expect(nextStep).toContain("'비어 있는 칸'(🔇)은 어디에도 쓰지 않는다");
  });
});

describe('title-prefix strip keeps the region phrase in business headings', () => {
  const make = () => ({
    selectedTitle: '수원 영통 욕실 리모델링, 덧방 2~3일 철거 4~5일 갈리는 기준',
    introduction: '도입',
    headings: [
      { title: '공사 중 욕실을 못 쓰는 기간은 며칠인가요?', content: '본문 하나' },
      { title: '수원 영통 욕실 시공 문의 안내', content: '본문 둘' },
    ],
    hashtags: [],
  }) as any;

  it('business mode keeps "수원 영통 욕실 시공 문의 안내"', () => {
    const content = make();
    validateStructuredContent(content, { contentMode: 'business', articleType: 'interior', metadata: { keywords: ['수원 욕실 리모델링'] } } as any);
    expect(content.headings.map((h: any) => h.title)).toContain('수원 영통 욕실 시공 문의 안내');
  });
});

describe('quality gate grounding includes the business info', () => {
  const source: any = {
    contentMode: 'business', title: '수원 욕실 리모델링', rawText: '욕실 공사 일반 자료',
    businessInfo: { ...base, extra: '하자 보증 2년, 현장 실측 약 30분, 경력 12년', faq: '공사 기간은 덧방 2~3일인가요?' },
  };

  it('treats numbers from the business form as supported', () => {
    const body = '하자 보증 2년이 붙고, 현장 실측은 약 30분입니다. 경력 12년 대표가 관리합니다.';
    expect(collectUnsupportedConcreteClaims(body, buildQualityGateGroundingText(source))).toEqual([]);
  });

  it('still flags a number nobody gave', () => {
    expect(collectUnsupportedConcreteClaims('시공 후기 300건', buildQualityGateGroundingText(source)).length).toBeGreaterThan(0);
  });

  it('other modes keep their grounding (title, material, personal experience) plus the reference date', () => {
    const seo = { ...source, contentMode: 'seo', personalExperience: '직접 써 봄' };
    expect(buildQualityGateGroundingText(seo, new Date(2026, 10, 5)))
      .toBe(['수원 욕실 리모델링', '욕실 공사 일반 자료', '직접 써 봄', '기준일 2026년 11월 5일 (2026-11-05)'].join('\n'));
  });

  // [2026-11-05 after4 meat-thin] "| 기준일 | 2026년 11월 5일 |" → "5일" unsupported → safety 35 → regenerate.
  it('treats the reference date the app gave the model as supported', () => {
    const body = '| 기준일 | 2026년 11월 5일 |';
    expect(collectUnsupportedConcreteClaims(body, buildQualityGateGroundingText(source, new Date(2026, 10, 5)))).toEqual([]);
  });

  it('still flags a different date (control)', () => {
    const body = '신청은 11월 30일까지입니다';
    expect(collectUnsupportedConcreteClaims(body, buildQualityGateGroundingText(source, new Date(2026, 10, 5)))).toEqual(['30일']);
  });

  it('contentGenerator uses the helper for both gate calls', () => {
    const generator = readFileSync(path.join(SRC, 'contentGenerator.ts'), 'utf8');
    expect(generator.split('groundingText: buildQualityGateGroundingText(source)').length - 1).toBe(2);
  });
});
