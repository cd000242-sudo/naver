// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';
import * as extractor from '../renderer/utils/semiAutoHeadingExtractor';

const source = readFileSync('src/renderer/modules/headingImageGen.ts', 'utf8');
const code = ts.transpileModule(source.slice(
  source.indexOf('function resolveStructuredContentForHeadingAnalysis('),
  source.indexOf('export function initHeadingImageGeneration('),
), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const harness = new Function(...Object.keys(extractor), `let currentStructuredContent = null;\n${code}\nreturn { resolve: resolveStructuredContentForHeadingAnalysis, current: () => currentStructuredContent };`)(...Object.values(extractor));
const resolveContent = harness.resolve;

describe('image analysis uses the current explicit body headings', () => {
  const titles = ['여행 준비', '이동 방법', '여행을 마무리하는 방법', '다음 일정'];
  const body = ['도입 문단입니다.', ...titles.map(title => `## ${title}\n${title}의 최신 본문입니다.`)].join('\n\n');
  beforeEach(() => {
    document.body.innerHTML = '<textarea id="unified-generated-content"></textarea><input id="unified-generated-title" value="여행 기록">';
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = body;
    (window as any).currentStructuredContent = null;
  });

  it('recovers the third heading from four marked sections without losing image metadata', () => {
    const headings = [titles[0], titles[1], titles[3]].map(title => Object.freeze({ title, content: '옛 본문', prompt: `saved ${title}`, imageKey: title }));
    const live = Object.freeze({ selectedTitle: '여행 기록', headings: Object.freeze(headings), conclusion: '옛 마무리' });
    (window as any).currentStructuredContent = live;
    const result = resolveContent();
    expect(result.headings.map((heading: any) => heading.title)).toEqual(titles);
    expect(result.headings[2].content).toContain('최신 본문');
    expect(result.headings[3]).toMatchObject({ prompt: `saved ${titles[3]}`, imageKey: titles[3] });
    expect(result.introduction).toBe('도입 문단입니다.');
    expect(result.conclusion).toBe('');
    expect(result.bodyPlain).toBe(body);
    expect((window as any).currentStructuredContent).toBe(result);
    expect(harness.current()).toBe(result);
    expect(live.headings).toHaveLength(3);
  });

  it('does not recover headings that the user explicitly unmarked', () => {
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = '여행 준비\n\n안내 본문입니다.';
    (window as any).currentStructuredContent = { headingsLockedByUser: true, headings: [{ title: '여행 준비' }] };
    expect(resolveContent().headings).toEqual([]);
  });

  it('preserves generated headings when plain-text heuristics cannot recognize one', () => {
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = body.replace(/## /g, '');
    const live = { headings: titles.map(title => ({ title })) };
    (window as any).currentStructuredContent = live;
    expect(resolveContent()).toBe(live);
  });

  it('recovers body headings when no structured article exists', () => {
    expect(resolveContent().headings.map((heading: any) => heading.title)).toEqual(titles);
  });

  it('returns null when no body or article exists', () => {
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = '';
    expect(resolveContent()).toBeNull();
  });
});
