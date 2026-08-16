// src/__tests__/issueSourcesNewsDc.test.ts
// Pure-function tests for the news og:image and DCinside source adapters.
// No network calls — only the parsing helpers are exercised.

import { describe, it, expect } from 'vitest';
import { extractOgImage } from '../crawler/issueHarness/sources/newsOgImageSource.js';
import {
  extractDcPostLinks,
  extractDcImageUrls,
} from '../crawler/issueHarness/sources/dcinsideSource.js';

describe('extractOgImage', () => {
  it('extracts og:image from double-quote attribute variant', () => {
    const html = '<html><head><meta property="og:image" content="https://img.example.com/a.jpg"></head></html>';
    expect(extractOgImage(html)).toBe('https://img.example.com/a.jpg');
  });

  it('extracts og:image from single-quote attribute variant', () => {
    const html = "<html><head><meta property='og:image' content='https://img.example.com/b.jpg'></head></html>";
    expect(extractOgImage(html)).toBe('https://img.example.com/b.jpg');
  });

  it('extracts og:image when content attribute appears before property', () => {
    const html = '<meta content="https://img.example.com/c.jpg" property="og:image">';
    expect(extractOgImage(html)).toBe('https://img.example.com/c.jpg');
  });

  it('returns null when no og:image meta tag is present', () => {
    const html = '<html><head><title>no image here</title></head></html>';
    expect(extractOgImage(html)).toBeNull();
  });

  it('returns null for empty html', () => {
    expect(extractOgImage('')).toBeNull();
  });

  it('unescapes &amp; in the extracted URL', () => {
    const html = '<meta property="og:image" content="https://img.example.com/d.jpg?a=1&amp;b=2">';
    expect(extractOgImage(html)).toBe('https://img.example.com/d.jpg?a=1&b=2');
  });
});

describe('extractDcPostLinks', () => {
  const html = `
    <a href="https://gall.dcinside.com/board/view/?id=test&no=1">post1</a>
    <a href="https://gall.dcinside.com/mgallery/board/view/?id=test&no=2">post2</a>
    <a href="https://gall.dcinside.com/mini/board/view/?id=test&no=3">post3</a>
    <a href="https://gall.dcinside.com/board/view/?id=test&no=1">dup of post1</a>
    <a href="https://gall.dcinside.com/board/lists/?id=test">not a view link</a>
  `;

  it('extracts unique post view links (dedupe)', () => {
    const links = extractDcPostLinks(html, 10);
    expect(links).toHaveLength(3);
    expect(links[0]).toContain('no=1');
    expect(links.some((l) => l.includes('mgallery'))).toBe(true);
    expect(links.some((l) => l.includes('mini'))).toBe(true);
  });

  it('caps the number of links returned', () => {
    const links = extractDcPostLinks(html, 2);
    expect(links).toHaveLength(2);
  });

  it('returns empty array for empty html', () => {
    expect(extractDcPostLinks('', 10)).toEqual([]);
  });
});

describe('extractDcImageUrls', () => {
  it('extracts viewimage.php URLs from post html', () => {
    const html = `
      <img src="https://dcimg1.dcinside.com/viewimage.php?id=abc&no=1" />
      <img src="https://dcimg2.dcinside.co.kr/viewimage.php?id=abc&no=2" />
    `;
    const urls = extractDcImageUrls(html);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('dcimg1.dcinside.com/viewimage.php');
    expect(urls[1]).toContain('dcimg2.dcinside.co.kr/viewimage.php');
  });

  it('dedupes identical image urls', () => {
    const html = `
      <img src="https://dcimg1.dcinside.com/viewimage.php?id=abc&no=1" />
      <img src="https://dcimg1.dcinside.com/viewimage.php?id=abc&no=1" />
    `;
    expect(extractDcImageUrls(html)).toHaveLength(1);
  });

  it('unescapes &amp; in extracted image urls', () => {
    const html = '<img src="https://dcimg1.dcinside.com/viewimage.php?id=abc&amp;no=1" />';
    expect(extractDcImageUrls(html)[0]).toBe('https://dcimg1.dcinside.com/viewimage.php?id=abc&no=1');
  });

  it('returns empty array when no viewimage urls present', () => {
    expect(extractDcImageUrls('<div>no images here</div>')).toEqual([]);
  });
});
