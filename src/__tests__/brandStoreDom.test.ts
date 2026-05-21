// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { collectReviewImageUrls } from '../crawler/shopping/providers/brandStore/brandStoreDom.js';

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
