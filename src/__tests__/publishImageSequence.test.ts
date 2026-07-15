import { describe, expect, it } from 'vitest';
import { normalizePublishImageSequence } from '../image/publishImageSequence.js';

const structuredContent = {
  headings: [
    { title: '첫 번째 소제목' },
    { title: '두 번째 소제목' },
    { title: '세 번째 소제목' },
    { title: '네 번째 소제목' },
  ],
};

describe('normalizePublishImageSequence', () => {
  it('places the representative thumbnail first and maps body images to heading order', () => {
    const input = [
      { heading: '두 번째 소제목', filePath: '/body-2.png', originalIndex: 1, headingIndex: 1 },
      { heading: '대표이미지', filePath: '/thumbnail.png', isThumbnail: true },
      { heading: '첫 번째 소제목', filePath: '/body-1.png', originalIndex: 0, headingIndex: 0 },
    ];

    const result = normalizePublishImageSequence(structuredContent, input);

    expect(result.map(image => image.filePath)).toEqual([
      '/thumbnail.png',
      '/body-1.png',
      '/body-2.png',
    ]);
    expect(result.map(image => image.originalIndex)).toEqual([0, 1, 2]);
    expect(result.slice(1).map(image => image.headingIndex)).toEqual([0, 1]);
  });

  it('uses the heading identity over stale slot metadata and rewrites both indices', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { heading: '대표이미지', filePath: '/thumbnail.png', isThumbnail: true },
      { heading: '두 번째 소제목', filePath: '/body-2.png', originalIndex: 99, headingIndex: 99 },
      { heading: '첫 번째 소제목', filePath: '/body-1.png', originalIndex: 77, headingIndex: 77 },
    ]);

    expect(result.slice(1)).toMatchObject([
      { heading: '첫 번째 소제목', filePath: '/body-1.png', originalIndex: 1, headingIndex: 0 },
      { heading: '두 번째 소제목', filePath: '/body-2.png', originalIndex: 2, headingIndex: 1 },
    ]);
  });

  it('preserves sparse heading slots for odd/even placement modes', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { heading: '네 번째 소제목', filePath: '/body-4.png', originalIndex: 3 },
      { heading: '대표이미지', filePath: '/thumbnail.png', isThumbnail: true },
      { heading: '두 번째 소제목', filePath: '/body-2.png', originalIndex: 1 },
    ]);

    expect(result.map(image => image.filePath)).toEqual([
      '/thumbnail.png',
      '/body-2.png',
      '/body-4.png',
    ]);
    expect(result.slice(1)).toMatchObject([
      { originalIndex: 2, headingIndex: 1 },
      { originalIndex: 4, headingIndex: 3 },
    ]);
  });

  it('recovers zero-based body slots when heading labels are unavailable', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { heading: '대표이미지', filePath: '/thumbnail.png', isThumbnail: true },
      { filePath: '/body-2.png', originalIndex: 1 },
      { filePath: '/body-1.png', originalIndex: 0 },
    ]);

    expect(result.map(image => image.filePath)).toEqual([
      '/thumbnail.png',
      '/body-1.png',
      '/body-2.png',
    ]);
    expect(result.slice(1).map(image => image.originalIndex)).toEqual([1, 2]);
  });

  it('keeps an already normalized one-based sequence stable without heading labels', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { heading: '대표이미지', filePath: '/thumbnail.png', isThumbnail: true, originalIndex: 0 },
      { filePath: '/body-2.png', originalIndex: 2 },
      { filePath: '/body-1.png', originalIndex: 1 },
    ]);

    expect(result.map(image => image.filePath)).toEqual([
      '/thumbnail.png',
      '/body-1.png',
      '/body-2.png',
    ]);
    expect(result.slice(1).map(image => image.originalIndex)).toEqual([1, 2]);
  });

  it('keeps body indices zero-based when there is no thumbnail slot', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { heading: '두 번째 소제목', filePath: '/body-2.png' },
      { heading: '첫 번째 소제목', filePath: '/body-1.png' },
    ]);

    expect(result.map(image => image.filePath)).toEqual(['/body-1.png', '/body-2.png']);
    expect(result.map(image => image.originalIndex)).toEqual([0, 1]);
  });

  it('recovers sparse one-based legacy slots when there is no thumbnail', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { filePath: '/body-3.png', originalIndex: 3 },
      { filePath: '/body-1.png', originalIndex: 1 },
    ]);

    expect(result.map(image => image.filePath)).toEqual(['/body-1.png', '/body-3.png']);
    expect(result.map(image => image.headingIndex)).toEqual([0, 2]);
    expect(result.map(image => image.originalIndex)).toEqual([0, 2]);
  });

  it('accepts an explicit zero-based compatibility signal for ambiguous sparse inputs', () => {
    const result = normalizePublishImageSequence(
      structuredContent,
      [
        { filePath: '/body-4.png', originalIndex: 3 },
        { filePath: '/body-2.png', originalIndex: 1 },
      ],
      { originalIndexBase: 0 },
    );

    expect(result.map(image => image.filePath)).toEqual(['/body-2.png', '/body-4.png']);
    expect(result.map(image => image.headingIndex)).toEqual([1, 3]);
    expect(result.map(image => image.originalIndex)).toEqual([1, 3]);
  });

  it('disambiguates duplicate heading titles with heading indices', () => {
    const duplicateHeadings = {
      headings: [{ title: 'Same heading' }, { title: 'Same heading' }, { title: 'Final heading' }],
    };
    const result = normalizePublishImageSequence(duplicateHeadings, [
      { heading: 'Same heading', headingIndex: 1, originalIndex: 2, filePath: '/same-2.png' },
      { heading: 'Same heading', headingIndex: 0, originalIndex: 1, filePath: '/same-1.png' },
    ]);

    expect(result.map(image => image.filePath)).toEqual(['/same-1.png', '/same-2.png']);
    expect(result.map(image => image.headingIndex)).toEqual([0, 1]);
  });

  it('preserves source order for multiple images assigned to one heading', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { headingIndex: 1, originalIndex: 2, filePath: '/heading-2-a.png' },
      { headingIndex: 0, originalIndex: 1, filePath: '/heading-1.png' },
      { headingIndex: 1, originalIndex: 2, filePath: '/heading-2-b.png' },
    ]);

    expect(result.map(image => image.filePath)).toEqual([
      '/heading-1.png',
      '/heading-2-a.png',
      '/heading-2-b.png',
    ]);
    expect(result.map(image => image.headingIndex)).toEqual([0, 1, 1]);
    expect(result.map(image => image.originalIndex)).toEqual([0, 1, 1]);
  });

  it('fills unresolved images into the remaining heading slots deterministically', () => {
    const result = normalizePublishImageSequence(structuredContent, [
      { filePath: '/unresolved-a.png' },
      { headingIndex: 1, filePath: '/assigned-2.png' },
      { filePath: '/unresolved-b.png' },
    ]);

    expect(result.map(image => image.filePath)).toEqual([
      '/unresolved-a.png',
      '/assigned-2.png',
      '/unresolved-b.png',
    ]);
    expect(result.map(image => image.headingIndex)).toEqual([0, 1, 2]);
  });

  it('uses duplicate heading occurrence order when no slot metadata exists', () => {
    const duplicateHeadings = {
      headings: [{ title: 'Same heading' }, { title: 'Same heading' }],
    };
    const result = normalizePublishImageSequence(duplicateHeadings, [
      { heading: 'Same heading', filePath: '/same-a.png' },
      { heading: 'Same heading', filePath: '/same-b.png' },
    ]);

    expect(result.map(image => image.filePath)).toEqual(['/same-a.png', '/same-b.png']);
    expect(result.map(image => image.headingIndex)).toEqual([0, 1]);
  });

  it('keeps thumbnail first when structured headings are unavailable', () => {
    const result = normalizePublishImageSequence(null, [
      { filePath: '/body-a.png' },
      { filePath: '/thumbnail.png', isShoppingRepresentativeThumbnail: true },
      { filePath: '/body-b.png' },
    ]);

    expect(result.map(image => image.filePath)).toEqual([
      '/thumbnail.png',
      '/body-a.png',
      '/body-b.png',
    ]);
    expect(result.map(image => image.originalIndex)).toEqual([0, 1, 2]);
  });

  it('adds an external thumbnail and reserves body slots when only thumbnailPath is supplied', () => {
    const result = normalizePublishImageSequence(
      structuredContent,
      [{ headingIndex: 0, originalIndex: 0, filePath: '/body-1.png' }],
      { thumbnailPath: '/external-thumbnail.png' },
    );

    expect(result).toMatchObject([
      { filePath: '/external-thumbnail.png', isThumbnail: true, originalIndex: 0 },
      { filePath: '/body-1.png', headingIndex: 0, originalIndex: 1 },
    ]);
  });

  it('marks a matching external thumbnail without duplicating it', () => {
    const result = normalizePublishImageSequence(
      structuredContent,
      [
        { filePath: 'C:\\images\\thumbnail.png' },
        { headingIndex: 0, originalIndex: 0, filePath: '/body-1.png' },
      ],
      { thumbnailPath: 'file:///C:/images/thumbnail.png' },
    );

    expect(result.map(image => image.filePath)).toEqual([
      'C:\\images\\thumbnail.png',
      '/body-1.png',
    ]);
    expect(result.filter(image => image.isThumbnail)).toHaveLength(1);
    expect(result.map(image => image.originalIndex)).toEqual([0, 1]);
  });

  it('matches a collected thumbnail by its local alias when a remote URL is also present', () => {
    const result = normalizePublishImageSequence(
      structuredContent,
      [
        {
          filePath: 'https://cdn.example.com/product.jpg',
          url: 'https://cdn.example.com/product.jpg',
          savedToLocal: 'C:\\images\\product.jpg',
        },
        { headingIndex: 0, originalIndex: 0, filePath: '/body-1.png' },
      ],
      { thumbnailPath: 'file:///C:/images/product.jpg' },
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      filePath: 'https://cdn.example.com/product.jpg',
      isThumbnail: true,
      originalIndex: 0,
    });
    expect(result[1]).toMatchObject({ filePath: '/body-1.png', originalIndex: 1 });
  });

  it('returns an empty sequence for missing images', () => {
    expect(normalizePublishImageSequence(structuredContent, undefined)).toEqual([]);
  });

  it('does not mutate source image metadata', () => {
    const input = [
      { heading: '대표이미지', filePath: '/thumbnail.png', isThumbnail: true },
      { heading: '첫 번째 소제목', filePath: '/body-1.png', originalIndex: 0, headingIndex: 8 },
    ];
    const snapshot = structuredClone(input);

    normalizePublishImageSequence(structuredContent, input);

    expect(input).toEqual(snapshot);
  });
});
