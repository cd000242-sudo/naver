// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { collectReviewImageUrls, clickReviewTab, extractBrandProductInfo } from '../crawler/shopping/providers/brandStore/brandStoreDom.js';

describe('collectReviewImageUrls', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('collects images matched by alt="review_image"', () => {
        document.body.innerHTML =
            '<img alt="review_image" src="https://phinf.pstatic.net/review1.jpg">';
        expect(collectReviewImageUrls()).toEqual(['https://phinf.pstatic.net/review1.jpg']);
    });

    it('collects images matched by alt prefix "리뷰" and by review class containers', () => {
        document.body.innerHTML =
            '<img alt="리뷰사진" src="https://example.com/review2.png">' +
            '<div class="review"><img src="https://phinf.pstatic.net/review3.jpg"></div>';
        expect(collectReviewImageUrls()).toEqual([
            'https://example.com/review2.png',
            'https://phinf.pstatic.net/review3.jpg',
        ]);
    });

    it('falls back to data-src when src is absent', () => {
        document.body.innerHTML =
            '<img alt="review_image" data-src="https://phinf.pstatic.net/lazy.jpg">';
        expect(collectReviewImageUrls()).toEqual(['https://phinf.pstatic.net/lazy.jpg']);
    });

    it('excludes UI / avatar / animated assets', () => {
        document.body.innerHTML =
            '<img alt="review_image" src="https://phinf.pstatic.net/profile_user.jpg">' +
            '<img alt="review_image" src="https://phinf.pstatic.net/badge.png">' +
            '<img alt="review_image" src="https://phinf.pstatic.net/anim.gif">' +
            '<img alt="review_image" src="https://phinf.pstatic.net/vector.svg">';
        expect(collectReviewImageUrls()).toEqual([]);
    });

    it('excludes data URIs and non-image URLs', () => {
        document.body.innerHTML =
            '<img alt="review_image" src="data:image/png;base64,AAAA">' +
            '<img alt="review_image" src="https://example.com/page.txt">';
        expect(collectReviewImageUrls()).toEqual([]);
    });

    it('returns an empty array when no review images exist', () => {
        document.body.innerHTML = '<img src="https://phinf.pstatic.net/unrelated.jpg">';
        expect(collectReviewImageUrls()).toEqual([]);
    });
});

describe('clickReviewTab', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('finds and clicks a plain "리뷰" tab', () => {
        document.body.innerHTML = '<button>리뷰</button>';
        expect(clickReviewTab()).toEqual({ clicked: true, label: '리뷰' });
    });

    it('matches "리뷰 (N)" and "리뷰 N건" count patterns', () => {
        document.body.innerHTML = '<button>리뷰 (123)</button>';
        expect(clickReviewTab().clicked).toBe(true);
    });

    it('rejects "리뷰이벤트" — not a real review tab', () => {
        document.body.innerHTML = '<button>리뷰이벤트</button>';
        expect(clickReviewTab()).toEqual({ clicked: false });
    });

    it('rejects anchors navigating to a review-event page', () => {
        document.body.innerHTML = '<a href="/review-event/list">리뷰</a>';
        expect(clickReviewTab()).toEqual({ clicked: false });
    });

    it('rejects anchors with an absolute href (would navigate away)', () => {
        document.body.innerHTML = '<a href="https://other.example.com">리뷰</a>';
        expect(clickReviewTab()).toEqual({ clicked: false });
    });

    it('returns clicked:false when no review tab exists', () => {
        document.body.innerHTML = '<button>구매하기</button>';
        expect(clickReviewTab()).toEqual({ clicked: false });
    });
});

describe('extractBrandProductInfo', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('extracts name from og:title and price from a price element', () => {
        document.body.innerHTML =
            '<meta property="og:title" content="멋진 상품">' +
            '<div class="product_price">12,900원</div>';
        expect(extractBrandProductInfo()).toEqual({ name: '멋진 상품', price: '12,900원' });
    });

    it('returns empty strings when neither element is present', () => {
        expect(extractBrandProductInfo()).toEqual({ name: '', price: '' });
    });

    it('trims surrounding whitespace', () => {
        document.body.innerHTML =
            '<meta property="og:title" content="  상품명  ">' +
            '<div class="price">  9,000원  </div>';
        expect(extractBrandProductInfo()).toEqual({ name: '상품명', price: '9,000원' });
    });
});
