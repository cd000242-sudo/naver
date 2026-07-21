/**
 * [v2.11.135] 홈판 이슈 스토리 골격 회귀 잠금.
 *
 * 실노출 메이트 글 20편 실측: 홈판 지배종은 "이야기형"(인용 훅 제목,
 * 타임라인 본문, 소제목 0~3, 초단문단)인데 기존 base 골격(실용 정보글,
 * 소제목 3~7)이 이를 억제했다. 이슈형 카테고리(연예·시사)에만 스토리
 * 골격을 마지막에 주입해 오버라이드하고, 실용 카테고리는 기존 유지.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildSystemPrompt, resolveCategory } from '../promptLoader';

const ROOT = path.resolve(__dirname, '..');

describe('issue-story 골격 파일', () => {
  const prompt = fs.readFileSync(path.join(ROOT, 'prompts/homefeed/issue-story.prompt'), 'utf-8');

  it('제목 3공식·도입 3유형·타임라인 본문·마무리 규칙을 담는다', () => {
    expect(prompt).toContain('[ISSUE-STORY]');
    expect(prompt).toContain('인용 훅형');
    expect(prompt).toContain('정체 숨김형');
    expect(prompt).toContain('추측 질문형');
    expect(prompt).toContain('뉴스 리드형');
    expect(prompt).toContain('타임라인 서사');
    expect(prompt).toContain('소제목은 0~3개');
    expect(prompt).toContain('문단은 1~2문장');
  });

  it('환각·명예훼손 가드를 골격보다 우선한다고 명시한다', () => {
    expect(prompt).toContain('자료에 실제로 있는 발언·문장만');
    expect(prompt).toContain('단정하거나 암시로 기정사실화하지 않는다');
    expect(prompt).toMatch(/\[SECTION -2\] 충실도.*언제나 이 골격보다 우선/);
  });

  it('정체 숨김 제목은 도입에서 반드시 공개하도록 강제한다 (낚시 금지)', () => {
    expect(prompt).toContain('도입 3~5줄 안에서 주체를 공개한다');
  });
});

describe('라우팅 — 이슈형만 스토리 골격, 실용형은 기존 유지', () => {
  it('homefeed + 연예/시사에는 issue-story가 주입된다', () => {
    expect(buildSystemPrompt('homefeed', 'entertainment')).toContain('[ISSUE-STORY]');
    expect(buildSystemPrompt('homefeed', 'society')).toContain('[ISSUE-STORY]');
  });

  it('homefeed 실용 카테고리(tips/health/general)에는 주입되지 않는다', () => {
    expect(buildSystemPrompt('homefeed', 'tips')).not.toContain('[ISSUE-STORY]');
    expect(buildSystemPrompt('homefeed', 'health')).not.toContain('[ISSUE-STORY]');
    expect(buildSystemPrompt('homefeed', 'general')).not.toContain('[ISSUE-STORY]');
  });

  it('seo/mate 모드는 영향받지 않는다', () => {
    expect(buildSystemPrompt('seo', 'entertainment')).not.toContain('[ISSUE-STORY]');
    expect(buildSystemPrompt('mate', 'entertainment')).not.toContain('[ISSUE-STORY]');
  });

  it('스토리 골격은 base·90+ 계약보다 뒤에 놓여 오버라이드 우선권을 가진다', () => {
    const composed = buildSystemPrompt('homefeed', 'entertainment');
    const skeletonAt = composed.indexOf('[ISSUE-STORY]');
    expect(skeletonAt).toBeGreaterThan(composed.indexOf('[HOMEFEED BASE PROMPT'));
    expect(skeletonAt).toBeGreaterThan(composed.indexOf('HOMEFEED 90+ QUALITY CONTRACT'));
  });

  it('스포츠/경제 힌트가 이슈형 카테고리로 해석된다', () => {
    expect(resolveCategory('스포츠')).toBe('entertainment');
    expect(resolveCategory('경제')).toBe('society');
    expect(resolveCategory('연예')).toBe('entertainment');
  });
});
