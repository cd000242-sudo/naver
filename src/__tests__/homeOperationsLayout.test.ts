import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('homepage operations layout', () => {
  it('shows notices and income proofs together before the keyword tabs', () => {
    const source = readFileSync(
      join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'),
      'utf8',
    );
    const overviewIndex = source.indexOf('data-home-ops-community');
    const noticesIndex = source.indexOf('data-home-ops-notices');
    const incomeIndex = source.indexOf('data-home-ops-income');
    const tabsIndex = source.indexOf('aria-label="홈 키워드 보기 선택"');

    expect(source).toContain("type HomeOperationsTab = 'deputy' | 'realtime'");
    expect(source).toContain("useState<HomeOperationsTab>('deputy')");
    expect(source).toContain('fetchCommunityIncomeProofs(3, { view: \'home\' })');
    expect(source).toContain('className="home-ops-community-grid"');
    expect(source).toContain('data-home-ops-tab="deputy"');
    expect(source).toContain('data-home-ops-tab="realtime"');
    expect(source).toContain("activeTab === 'realtime' ? realtimePanel");
    expect(overviewIndex).toBeGreaterThan(-1);
    expect(noticesIndex).toBeGreaterThan(-1);
    expect(incomeIndex).toBeGreaterThan(-1);
    expect(tabsIndex).toBeGreaterThan(-1);
    expect(overviewIndex).toBeLessThan(noticesIndex);
    expect(noticesIndex).toBeLessThan(incomeIndex);
    expect(incomeIndex).toBeLessThan(tabsIndex);
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
    expect(source).toContain('function KeywordMobileCards');
    expect(source).toContain('className="home-ops-keyword-card"');
    expect(source).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.home-ops-table-shell\s*\{[^}]*display:\s*none/s);
    expect(source).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.home-ops-keyword-cards\s*\{[^}]*display:\s*grid/s);
    expect(source).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.home-ops-realtime-panel \.hero-source-body,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s);
    expect(source).toMatch(/\.home-ops-community-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(360px,\s*0\.85fr\)/s);
    expect(source).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.home-ops-community-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(source).toMatch(/\.home-ops-notice-toggle\s*\{[^}]*min-height:\s*48px/s);
    expect(source).toContain('aria-expanded={open}');
    expect(source).toContain('aria-controls={contentId}');
    expect(source).toContain('hidden={!open}');
    expect(source).toContain('role="region"');
    expect(source).toContain("incomeResult?.source === 'unavailable'");
    expect(source).toContain('const [noticeLoading, setNoticeLoading] = useState(true)');
    expect(source).not.toContain('Promise.allSettled([');
    expect(source).toMatch(/\.home-ops-income-visual img,[\s\S]*?object-fit:\s*contain/s);
    expect(source).toMatch(/\.home-ops-panel-head small\s*\{[^}]*font-size:\s*16px/s);
    expect(source).toMatch(/\.home-ops-income-copy small\s*\{[^}]*font-size:\s*16px/s);
  });

  it('moves notices out of the community tabs and keeps income plus tips there', () => {
    const community = readFileSync(join(process.cwd(), 'spa', 'src', 'pages', 'CommunityPage.tsx'), 'utf8');

    expect(community).toContain("type TabKey = 'income' | 'tips'");
    expect(community).toContain("useState<TabKey>('income')");
    expect(community).toContain("fetchCommunityIncomeProofs(80, { view: 'community', signal: controller.signal })");
    expect(community).toContain('공지사항은 홈에서 바로 확인할 수 있습니다.');
    expect(community).toContain('const COMMUNITY_CACHE_TTL_MS = 15 * 60 * 1000');
    expect(community).toContain("const unavailable = incomeResult.value.source === 'unavailable'");
    expect(community).toContain('if (!unavailable) setIncome(incomeResult.value.items)');
    expect(community).not.toContain('setIncome([])');
    expect(community).not.toContain("['notices', '공지사항']");
    expect(community).not.toContain('function NoticesPanel(');
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
    const boardIndex = source.indexOf('<HomeOperationsBoard proofFallbacks={communityProofFallbacks} realtimePanel={(');
    const heroIndex = source.indexOf('<section className="home-hero"');

    expect(boardIndex).toBeGreaterThan(-1);
    expect(heroIndex).toBeGreaterThan(-1);
    expect(boardIndex).toBeLessThan(heroIndex);
    expect(source).toContain('const communityProofFallbacks = useMemo');
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
