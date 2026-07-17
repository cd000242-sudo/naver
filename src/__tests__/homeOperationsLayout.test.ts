import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('homepage operations layout', () => {
  it('shows notices first and defaults to the deputy golden-keyword tab', () => {
    const source = readFileSync(
      join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'),
      'utf8',
    );
    const noticesIndex = source.indexOf('data-home-ops-notices');
    const tabsIndex = source.indexOf('aria-label="홈 키워드 보기 선택"');

    expect(source).toContain("type HomeOperationsTab = 'deputy' | 'realtime'");
    expect(source).toContain("useState<HomeOperationsTab>('deputy')");
    expect(source).toContain('data-home-ops-tab="deputy"');
    expect(source).toContain('data-home-ops-tab="realtime"');
    expect(source).toContain("activeTab === 'realtime' ? realtimePanel");
    expect(noticesIndex).toBeGreaterThan(-1);
    expect(tabsIndex).toBeGreaterThan(-1);
    expect(noticesIndex).toBeLessThan(tabsIndex);
  });

  it('keeps Korean copy readable and protects wide keyword rows from broken wrapping', () => {
    const source = readFileSync(
      join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'),
      'utf8',
    );

    expect(source).toContain('word-break: keep-all');
    expect(source).toContain('overflow-wrap: break-word');
    expect(source).toMatch(/\.home-ops-table\s*\{[^}]*min-width:\s*820px/s);
    expect(source).toMatch(/\.home-ops-table-shell\s*\{[^}]*max-height:\s*none/s);
    expect(source).toMatch(/\.home-ops-table tbody th\s*\{[^}]*font-size:\s*16px/s);
    expect(source).toMatch(/\.home-ops-notice\.featured > strong\s*\{[^}]*font-size:\s*21px/s);
    expect(source).toContain("featured={index === 0}");
    expect(source).toContain("featured ? (notice.body || notice.summary) : notice.summary");
  });

  it('prevents third-party embeds from widening the whole page on small screens', () => {
    const globalCss = readFileSync(
      join(process.cwd(), 'spa', 'src', 'styles', 'global.css'),
      'utf8',
    );

    expect(globalCss).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*(?:clip|hidden)/s);
  });

  it('places the operations board before the marketing hero and moves realtime content into it', () => {
    const source = readFileSync(join(process.cwd(), 'spa', 'src', 'pages', 'IndexPage.tsx'), 'utf8');
    const boardIndex = source.indexOf('<HomeOperationsBoard realtimePanel={(');
    const heroIndex = source.indexOf('<section className="home-hero"');

    expect(boardIndex).toBeGreaterThan(-1);
    expect(heroIndex).toBeGreaterThan(-1);
    expect(boardIndex).toBeLessThan(heroIndex);
    expect(source).toContain('<div className="hero-realtime-board" aria-label="실시간 검색어">');
    expect(source).toContain('const handleSourceTabKeyDown =');
    expect(source).toContain('onKeyDown={(event) => handleSourceTabKeyDown(event, lane.id)}');
  });
});

describe('admin homepage operations access', () => {
  it('provides an obvious home-operations entry and a direct keyword editor shortcut', () => {
    const admin = readFileSync(join(process.cwd(), 'admin', 'index.html'), 'utf8');

    expect(admin).toContain('<span>홈 운영</span>');
    expect(admin).toContain('id="home-ops-open-keyword-briefing"');
    expect(admin).toContain('function openKeywordBriefingEditor()');
    expect(admin).toContain('부방장 황금키워드 수정');
  });
});
