import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('../renderer/modules/contentGeneration.ts', import.meta.url), 'utf8');

describe('paraphrase preview and semi-auto sync', () => {
  it('marks paraphrased content as body-first before post processing', () => {
    expect(source).toContain("structuredContent._source = 'paraphrase'");
    expect(source).toContain('structuredContent._paraphrased = true');
    expect(source).toContain('structuredContent._preferBodyPlain = true');
    expect(source).toContain('structuredContent._bodyManuallyEdited = true');
  });

  it('rebuilds preview headings from the paraphrased body instead of stale original headings', () => {
    expect(source).toContain("import { extractSemiAutoHeadingsFromBody } from '../utils/semiAutoHeadingExtractor.js'");
    expect(source).toMatch(/function\s+rebuildHeadingsFromPreferredBody/);
    expect(source).toMatch(/const\s+extracted\s*=\s*extractSemiAutoHeadingsFromBody\(body\)/);
    // [2026-08-23] 이 단언은 원래 `headings = extracted.length > 0 ? ... : []` 를 요구했다.
    // 그 형태가 곧 버그였다: 추출이 실패하면 AI가 준 소제목을 빈 배열로 덮어써서 미리보기와
    // 소제목 분석이 한꺼번에 죽었다. 되살아나지 못하게 잠근다.
    expect(source).not.toMatch(/structuredContent\.headings\s*=\s*extracted\.length\s*>\s*0/);
    expect(source).toMatch(/if\s*\(extracted\.length === 0\)\s*return;/);
    expect(source).toMatch(/aiTitles\.every/);

    const rebuildIndex = source.indexOf('rebuildHeadingsFromPreferredBody(structuredContent)');
    const postProcessIndex = source.indexOf("await applyContentPostProcessing(structuredContent, { source: 'paraphrase', forceNew: true })");

    expect(rebuildIndex).toBeGreaterThan(-1);
    expect(postProcessIndex).toBeGreaterThan(rebuildIndex);
  });

  it('does not reconstruct semi-auto textarea from headings when bodyPlain is preferred', () => {
    expect(source).toMatch(/const\s+preferBodyPlain\s*=/);
    expect(source).toMatch(/structuredContent\._source\s*===\s*'paraphrase'/);
    expect(source).toMatch(/if\s*\(!preferBodyPlain\s*&&\s*structuredContent\.headings\s*&&\s*structuredContent\.headings\.length\s*>\s*0\)/);
  });
});
