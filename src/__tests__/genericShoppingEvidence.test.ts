// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import { buildShoppingEvidenceSnapshot } from '../content/shoppingEvidenceSource.js';
import {
  buildReviewSamplingPageUrls,
  collectGenericReviewTextCandidates,
} from '../crawler/shopping/utils/genericReviewDom.js';

describe('collectGenericReviewTextCandidates', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects Cafe24 product-review article links instead of the review-tab label', () => {
    document.body.innerHTML = `
      <section class="xans-product-review">
        <a href="/article/상품-리뷰/4/991/"> 기존 환풍기 자리가 작아서 천정 타공을 넓히는 게 조금 힘들었지만 작동은 잘됩니다. </a>
        <a href="/article/상품-리뷰/4/992/"> 소리도 크지 않고 작동도 잘되고 겨울에도 따뜻할 것 같아요. </a>
      </section>
      <a href="#REVIEW">상품리뷰 293</a>
    `;

    expect(collectGenericReviewTextCandidates()).toEqual([
      expect.stringContaining('천정 타공'),
      expect.stringContaining('소리도 크지 않고'),
    ]);
  });

  it('collects modern review cards and deduplicates parent/child copies', () => {
    document.body.innerHTML = `
      <div data-review-id="one"><p data-review-content>샤워 뒤 10분 정도 돌리니 물기가 빨리 말라서 관리가 편했어요.</p></div>
      <div class="review-item"><div class="review-body">최고 단계는 소음이 생각보다 크지만 저단은 밤에도 괜찮았어요.</div></div>
    `;

    const result = collectGenericReviewTextCandidates();
    expect(result).toHaveLength(2);
    expect(result.join(' ')).toMatch(/물기가 빨리 말라|최고 단계/);
  });

  it('keeps short purchase motives before the shared review selector scores them', () => {
    document.body.innerHTML = `
      <div data-review-content>물때 때문에 샀어요</div>
      <div class="review-body">좋아요</div>
    `;

    expect(collectGenericReviewTextCandidates()).toContain('물때 때문에 샀어요');
  });

  it('collects current Cafe24 rv cards and ignores authorization placeholders', () => {
    document.body.innerHTML = `
      <div class="rv__item review_296">
        <div class="rv__subject rv-view">화장실 습기제거가 잘되어서 샤워 뒤 관리가 편해졌어요.</div>
        <div class="rv__summary rv-view">화장실 습기제거가 잘되어서 샤워 뒤 관리가 편해졌어요.</div>
      </div>
      <div class="_ReviewPageContent_rsqsi_1"><p class="_content_rsqsi_37">소리도 크지 않고 작동도 잘되며 겨울에 온풍으로 쓰기 좋았어요.</p></div>
      <div class="review-content">글읽기 권한이 없습니다.</div>
      <div class="review-body">19세 미만의 미성년자는 출입을 금합니다.</div>
      <div class="ReviewAidV2"><div class="_RecommendedItem_1mtvm_1"><p class="_title_1mtvm_12">이누스 세면기 설치 IL684E 세면대교체 시공</p></div></div>
    `;

    const result = collectGenericReviewTextCandidates();
    expect(result).toEqual([
      expect.stringContaining('습기제거'),
      expect.stringContaining('온풍으로 쓰기'),
    ]);
  });

  it('rejects seller notices, review events, and shipping/exchange guidance from generic review DOMs', () => {
    document.body.innerHTML = `
      <div class="review-body">판매자 공지: 포토 리뷰 이벤트 참여 시 적립금 5,000원을 지급합니다.</div>
      <div data-review-content>리뷰 작성 이벤트 당첨자는 매월 공지하며 사은품은 별도 배송됩니다.</div>
      <div class="review-content">배송은 결제 후 2~3일 걸리며 교환 및 반품은 고객센터로 문의해 주세요.</div>
      <div class="review-item"><p class="review-text">샤워 뒤 10분 정도 돌리니 욕실 물기가 빨리 말랐지만 최고 단계 소음은 크게 들렸어요.</p></div>
    `;

    expect(collectGenericReviewTextCandidates()).toEqual([
      '샤워 뒤 10분 정도 돌리니 욕실 물기가 빨리 말랐지만 최고 단계 소음은 크게 들렸어요.',
    ]);
  });

  it('rejects point, gift, and winner variants of seller review promotions', () => {
    document.body.innerHTML = `
      <div class="review-body">리뷰 이벤트 참여 시 포인트를 지급합니다.</div>
      <div data-review-content>포토 후기 작성하면 적립금을 지급합니다.</div>
      <div class="review-content">당첨자에게 사은품을 별도 증정합니다.</div>
      <div class="review-text">물때 때문에 샀는데 청소 횟수가 줄었어요.</div>
    `;

    expect(collectGenericReviewTextCandidates()).toEqual([
      '물때 때문에 샀는데 청소 횟수가 줄었어요.',
    ]);
  });
});

describe('buildReviewSamplingPageUrls', () => {
  it('samples recent, middle, and oldest Cafe24 review pages with a strict bound', () => {
    expect(buildReviewSamplingPageUrls(
      'https://shop.test/product/item/1/?page_4=1#use_review',
      60,
    )).toEqual([
      'https://shop.test/product/item/1/?page_4=2#use_review',
      'https://shop.test/product/item/1/?page_4=30#use_review',
      'https://shop.test/product/item/1/?page_4=60#use_review',
    ]);
  });

  it('deduplicates tiny review sets and never returns the current page', () => {
    expect(buildReviewSamplingPageUrls(
      'https://shop.test/product/item/1/?page_4=2#use_review',
      3,
    )).toEqual([
      'https://shop.test/product/item/1/?page_4=3#use_review',
    ]);
  });
});

describe('buildShoppingEvidenceSnapshot', () => {
  it('preserves decision-useful reviews as structured generation evidence', () => {
    const snapshot = buildShoppingEvidenceSnapshot({
      url: 'https://example-shop.test/product/hmf-j300/3085',
      title: '하츠 티오람미니 HMF-J300',
      price: '159,000원',
      description: '욕실용 환기·제습·온풍 복합 제품',
      reviews: [
        '기존 환풍기 자리가 작아서 천정 타공을 넓히는 게 조금 힘들었어요.',
        '소리도 크지 않고 작동도 잘되고 겨울에도 따뜻할 것 같아요.',
        '상품리뷰 전체보기 신고하기',
      ],
      images: ['https://example-shop.test/main.jpg'],
    });

    expect(snapshot.usable).toBe(true);
    expect(snapshot.productReviews).toHaveLength(2);
    expect(snapshot.rawText).toContain('=== 실제 구매자 후기 ===');
    expect(snapshot.rawText).toContain('천정 타공');
    expect(snapshot.productPrice).toBe('159,000원');
    expect(snapshot.evidenceMode).toBe('review_synthesis');
  });

  it('does not treat a generic article title alone as a product-evidence source', () => {
    const snapshot = buildShoppingEvidenceSnapshot({
      url: 'https://example.test/article',
      title: '욕실 환풍기 고르는 법',
      description: '짧은 글',
    });

    expect(snapshot.usable).toBe(false);
    expect(snapshot.productReviews).toEqual([]);
  });

  it('does not mistake a long generic editorial URL with a price-shaped value for a product page', () => {
    const snapshot = buildShoppingEvidenceSnapshot({
      url: 'https://example.test/blog/bathroom-fan-buying-guide',
      title: '욕실 환풍기 고르는 법과 설치 전 확인할 점',
      description: '욕실 환풍기의 제습과 온풍 기능을 비교하고 천장 규격, 전원, 환기 방식의 차이를 설명하는 일반 정보 글입니다.',
      price: '159,000원',
      images: ['https://example.test/editorial/bathroom-guide.jpg'],
    });

    expect(snapshot.usable).toBe(false);
    expect(snapshot.productReviews).toEqual([]);
    expect(snapshot.evidenceMode).toBe('spec_only');
  });

  it.each([
    'https://shop.test/shop/shopdetail.html?branduid=12345',
    'https://shop.test/shop/view.php?index_no=12345',
  ])('recognizes common commerce detail identity without requiring a review (%s)', url => {
    const snapshot = buildShoppingEvidenceSnapshot({
      url,
      title: '욕실 환풍기 HMF-J300',
      description: '천장 타공 규격과 정격 전원, 환기 방식을 포함한 판매 페이지 상품 설명입니다.',
    });

    expect(snapshot.usable).toBe(true);
  });
});
