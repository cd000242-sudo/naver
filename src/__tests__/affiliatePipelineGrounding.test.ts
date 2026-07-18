import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { computeAffiliateTitleCriticalIssues } from '../contentTitleValidators';
import { evaluateTitleQuality } from '../contentTitleEvaluator';
import { buildModeBasedPrompt } from '../contentGenerator';
import { buildSystemPromptFromHint } from '../promptLoader';

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('affiliate pipeline grounding', () => {
  it('상품 수집 원문에 확인되지 않은 인기·만족 문장을 사실처럼 넣지 않는다', () => {
    const source = read('sourceAssembler.ts');
    expect(source).not.toContain('많은 고객들에게 사랑받고 있습니다');
    expect(source).not.toContain('판매하는 인기 상품입니다');
    expect(source).not.toContain('품질과 가격 대비 만족도가 높은 것으로 알려져 있습니다');
  });

  it('재시도 지시가 실제 모델 프롬프트에 연결돼 있다', () => {
    const source = read('contentGenerator.ts');
    expect(source).toContain('[RUNTIME RETRY AND CONTEXT INSTRUCTIONS]');
    expect(source).toContain('${extraInstruction.trim()}');
  });

  it('단일 쇼핑 생성 UI에서 실제 사용 메모를 받아 메인 생성 소스까지 전달한다', () => {
    const html = read('../public/index.html');
    const renderer = read('renderer/modules/contentGeneration.ts');
    const main = read('main.ts');

    expect(html).toContain('shopping-connect-personal-experience');
    expect(renderer).toContain("document.getElementById('shopping-connect-personal-experience')");
    expect(renderer).toContain('personalExperience,');
    expect(main).toContain('source.personalExperience = personalExperience');
  });

  it('같은 제휴 링크를 모든 상품 이미지에 반복 삽입하지 않는다', () => {
    const html = read('../public/index.html');
    const imageHelpers = read('automation/imageHelpers.ts');

    expect(html).not.toContain('모든 이미지에 이 링크가 자동으로 삽입됩니다.');
    expect(imageHelpers).toContain('__affiliateProductImageLinkAttached');
    expect(imageHelpers).toContain('대표 상품 이미지 1장에만');
  });

  it('하단 CTA 배너 이미지와 링크 카드에 같은 URL을 이중 연결하지 않는다', () => {
    const ctaHelpers = read('automation/ctaHelpers.ts');
    expect(ctaHelpers).not.toContain('await self.attachLinkToLastImage(url);');
    expect(ctaHelpers).toContain('배너는 시각 안내만 담당');
  });

  it('JSON 출력 직전 규칙도 쇼핑 글을 일반 SEO 체험형으로 되돌리지 않는다', () => {
    const jsonPrompt = read('contentJsonPromptFormat.ts');
    expect(jsonPrompt).toContain('[쇼핑커넥트 최종 출력 규칙]');
    expect(jsonPrompt).toContain('구매자 리뷰를 작성자 경험으로 바꾸지 않는다');
  });

  it('쇼핑 생성은 장문의 일반 SEO base 대신 전용 affiliate voice를 사용한다', () => {
    const generator = read('contentGenerator.ts');
    expect(generator).toContain("buildFullPrompt('affiliate'");
    expect(generator).not.toContain("systemPromptResult = buildFullPrompt('seo', source.categoryHint");

    const affiliateBase = buildSystemPromptFromHint('affiliate');
    expect(affiliateBase).toContain('[AFFILIATE BASE — 근거 기반 구매 동행]');
    expect(affiliateBase).not.toContain('10년 경력의 전문 블로그 콘텐츠 크리에이터');
    expect(affiliateBase).toContain('모델은 공정위 문구를 생성·요약·수정·번역·반복하거나');
  });

  it('근거 검증을 마친 쇼핑 제목을 렌더러가 자동완성 제목으로 다시 덮지 않는다', () => {
    const single = read('renderer/modules/contentGeneration.ts');
    const publishing = read('renderer/modules/publishingHandlers.ts');
    const multi = read('renderer/modules/multiAccountManager.ts');

    expect(single).toContain('if (!hasEvidenceBoundTitle && productName');
    expect(single).toContain('coreKeyword && !isShoppingConnectModeActive()');
    expect(publishing).toContain('if (!hasEvidenceBoundTitle && productName');
    expect(multi).toContain('if (!hasEvidenceBoundTitle && productName');
  });

  it('실제 사용 메모가 있으면 리뷰 0건이어도 spec 전용으로 잘못 강등하지 않는다', () => {
    const prompt = buildModeBasedPrompt({
      sourceType: 'custom_text',
      rawText: '상품명: 모노팬 F3\n스펙: 3단 풍속',
      title: '모노팬 F3',
      contentMode: 'affiliate',
      articleType: 'shopping_review',
      isReviewType: true,
      personalExperience: '침실에서 열흘 사용했고, 1단은 괜찮았지만 3단 소리는 크게 느껴졌어요.',
      productSpec: '3단 풍속',
    }, 'affiliate', undefined, 1800);

    expect(prompt).toContain('AFFILIATE AUTHENTICITY CONTRACT — FIRST_PARTY');
    expect(prompt).not.toContain('[P0 리뷰 데이터 부재 가드');
    expect(prompt).not.toContain('SPEC_ONLY — 제품 정보 기반 구매 동행');
  });

  it('실제 구매자 후기가 있으면 검색 의도·문제 해결 계약을 최종 프롬프트에 연결한다', () => {
    const prompt = buildModeBasedPrompt({
      sourceType: 'custom_text',
      rawText: '상품명: 하츠 티오람미니 HMF-J300\n가격: 159,000원',
      title: '하츠 티오람미니 HMF-J300',
      contentMode: 'affiliate',
      articleType: 'shopping_review',
      isReviewType: true,
      toneStyle: 'expert_review',
      productReviews: [
        '기존 환풍기 자리가 작아서 천장 타공을 넓히는 과정이 조금 힘들었어요.',
        '씻기 10분 전에 켜두니 욕실 한기가 덜했고 사용 후 물기도 빨리 말랐습니다.',
      ],
    }, 'affiliate', undefined, 1800);

    expect(prompt).toContain('REVIEW SEARCH INTENT');
    expect(prompt).toContain('천장 타공을 넓히는 과정');
    expect(prompt).toContain('10분 전에 켜두니');
    expect(prompt).toContain('반복되는 불편');
    expect(prompt).not.toContain('[구매 전 제품 분석 가이드]');
  });

  it('실사용 근거 없는 쇼핑 제목의 체험 표현을 치명 이슈로 잡는다', () => {
    const source = {
      sourceType: 'custom_text' as const,
      rawText: '상품명: 모노팬 F3\n스펙: 3단 풍속',
      title: '모노팬 F3',
      contentMode: 'affiliate' as const,
      productReviews: ['저속은 조용하다는 구매자 후기'],
    };

    expect(computeAffiliateTitleCriticalIssues('모노팬 F3 한 달 써보니 달랐던 점', source))
      .toContain('작성자 실사용 근거 없는 체험형 제목');
    expect(computeAffiliateTitleCriticalIssues('모노팬 F3 소음이 걱정이라면 볼 부분', source))
      .not.toContain('작성자 실사용 근거 없는 체험형 제목');
  });

  it('쇼핑 제목 점수는 긴급·압박 후킹보다 구체 판단 기준을 높게 평가한다', () => {
    const pressure = evaluateTitleQuality('모노팬 F3 오늘만 최저가 놓치면 후회', '모노팬 F3', 'affiliate');
    const concrete = evaluateTitleQuality('모노팬 F3 소음이 걱정이라면 볼 부분', '모노팬 F3', 'affiliate');

    expect(pressure.score).toBeLessThan(concrete.score);
    expect(pressure.issues.some(issue => issue.includes('판매 압박'))).toBe(true);
  });

  it('상품명과 가격만 수집된 쇼핑 글은 장황한 확인문 대신 짧은 구매 판단 글을 요구한다', () => {
    const prompt = buildModeBasedPrompt({
      sourceType: 'custom_text',
      rawText: '상품명: 고요아 냉풍기 에어쿨러 이동식 에어컨\n가격: 239,000원',
      title: '고요아 냉풍기 에어쿨러 이동식 에어컨',
      contentMode: 'affiliate',
      articleType: 'shopping_review',
      isReviewType: true,
      productPrice: '239,000원',
    }, 'affiliate', undefined, 2500);

    expect(prompt).toContain('[쇼핑 구매전환 품질 계약 — SPARSE_DECISION_BRIEF]');
    expect(prompt).toContain('근거가 3개 미만이면 최소 글자 수보다');
    expect(prompt).toContain('근거 → 생활상 이점 → 잘 맞는 사람');
    expect(prompt).toContain('전체 문장의 70% 이상');
    expect(prompt).toContain('확인·상세페이지·단정 계열 표현은 글 전체에서 합계 2문장 이하');
  });
});
