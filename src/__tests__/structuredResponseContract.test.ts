import { describe, expect, it } from 'vitest';

import {
  assertResponseComplete,
  BLUEPRINT_SCHEMA,
  describeCompleteness,
  STRUCTURED_CONTENT_SCHEMA,
  TITLE_RESULT_SCHEMA,
} from '../content/structuredResponseContract';

describe('structuredResponseContract', () => {
  describe('STRUCTURED_CONTENT_SCHEMA', () => {
    it('is complete with a title, one heading (title+content), and bodyPlain', () => {
      const obj = {
        selectedTitle: '제목',
        headings: [{ title: 'H1', content: '내용1' }],
        bodyPlain: '본문',
      };
      expect(assertResponseComplete(obj, STRUCTURED_CONTENT_SCHEMA)).toEqual({ complete: true });
    });

    it('is complete with introduction instead of bodyPlain', () => {
      const obj = {
        selectedTitle: '제목',
        headings: [{ title: 'H1', content: '내용1' }],
        introduction: '도입부',
      };
      expect(assertResponseComplete(obj, STRUCTURED_CONTENT_SCHEMA)).toEqual({ complete: true });
    });

    it('reports missing selectedTitle', () => {
      const obj = { headings: [{ title: 'H1', content: '내용1' }], bodyPlain: '본문' };
      const result = assertResponseComplete(obj, STRUCTURED_CONTENT_SCHEMA);
      expect(result.complete).toBe(false);
      if (!result.complete) {
        expect(result.reason).toBe('PARTIAL_RESPONSE');
        expect(result.missing).toContain('selectedTitle');
      }
    });

    // [2026-09-22] homefeed issue-story legitimately allows 0 headings; the body check proves the article exists.
    it('accepts an empty headings array when a body is present', () => {
      const obj = { selectedTitle: '제목', headings: [], bodyPlain: '본문' };
      const result = assertResponseComplete(obj, STRUCTURED_CONTENT_SCHEMA);
      expect(result.complete).toBe(true);
    });

    it('reports missing item fields with an indexed path (headings[N].field)', () => {
      const obj = {
        selectedTitle: '제목',
        headings: [
          { title: 'H1', content: '내용1' },
          { title: 'H2' }, // missing content
          { content: '내용3' }, // missing title
        ],
        bodyPlain: '본문',
      };
      const result = assertResponseComplete(obj, STRUCTURED_CONTENT_SCHEMA);
      expect(result.complete).toBe(false);
      if (!result.complete) {
        expect(result.missing).toContain('headings[1].content');
        expect(result.missing).toContain('headings[2].title');
      }
    });

    it('reports missing body when both introduction and bodyPlain are absent', () => {
      const obj = { selectedTitle: '제목', headings: [{ title: 'H1', content: '내용1' }] };
      const result = assertResponseComplete(obj, STRUCTURED_CONTENT_SCHEMA);
      expect(result.complete).toBe(false);
      if (!result.complete) expect(result.missing).toContain('introduction|bodyPlain');
    });

    it('treats blank-string fields as missing', () => {
      const obj = {
        selectedTitle: '   ',
        headings: [{ title: 'H1', content: '내용1' }],
        bodyPlain: '본문',
      };
      const result = assertResponseComplete(obj, STRUCTURED_CONTENT_SCHEMA);
      expect(result.complete).toBe(false);
      if (!result.complete) expect(result.missing).toContain('selectedTitle');
    });

    it('treats a 7th-stage partial-recovery object as incomplete', () => {
      const partial: Record<string, unknown> = { selectedTitle: '제목' };
      Object.defineProperty(partial, '__partial', { value: true, enumerable: false });
      Object.defineProperty(partial, '__recoveryStage', { value: 7, enumerable: false });

      const result = assertResponseComplete(partial, STRUCTURED_CONTENT_SCHEMA);
      expect(result.complete).toBe(false);
      if (!result.complete) expect(result.reason).toBe('PARTIAL_RESPONSE');
    });

    it('treats null/undefined as incomplete', () => {
      expect(assertResponseComplete(null, STRUCTURED_CONTENT_SCHEMA).complete).toBe(false);
      expect(assertResponseComplete(undefined, STRUCTURED_CONTENT_SCHEMA).complete).toBe(false);
    });
  });

  describe('TITLE_RESULT_SCHEMA', () => {
    it('is complete with a title and at least one candidate', () => {
      const obj = { selectedTitle: '제목', titleCandidates: ['A'] };
      expect(assertResponseComplete(obj, TITLE_RESULT_SCHEMA)).toEqual({ complete: true });
    });

    it('reports missing titleCandidates when absent', () => {
      const obj = { selectedTitle: '제목' };
      const result = assertResponseComplete(obj, TITLE_RESULT_SCHEMA);
      expect(result.complete).toBe(false);
      if (!result.complete) expect(result.missing).toContain('titleCandidates');
    });
  });

  describe('BLUEPRINT_SCHEMA', () => {
    it('is complete with an angle and a non-empty skeleton', () => {
      const obj = { angle: '앵글', skeleton: ['step1'] };
      expect(assertResponseComplete(obj, BLUEPRINT_SCHEMA)).toEqual({ complete: true });
    });

    it('reports missing angle and skeleton', () => {
      const obj = {};
      const result = assertResponseComplete(obj, BLUEPRINT_SCHEMA);
      expect(result.complete).toBe(false);
      if (!result.complete) {
        expect(result.missing).toContain('angle');
        expect(result.missing).toContain('skeleton');
      }
    });
  });

  describe('describeCompleteness', () => {
    it('describes a complete object', () => {
      const obj = { angle: '앵글', skeleton: ['step1'] };
      expect(describeCompleteness(obj, BLUEPRINT_SCHEMA)).toBe('Blueprint: complete');
    });

    it('describes an incomplete object with the missing fields', () => {
      const obj = {};
      const description = describeCompleteness(obj, BLUEPRINT_SCHEMA);
      expect(description).toContain('Blueprint: incomplete');
      expect(description).toContain('angle');
      expect(description).toContain('skeleton');
    });
  });
});
