import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('homepage operations layout', () => {
  it('renders four home sub-tabs with 부방장 선정 황금키워드 as the default and preloads income', () => {
    const source = readFileSync(
      join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'),
      'utf8',
    );

    // 4-tab contract in the order 공지사항 → 부방장 선정 황금키워드 → 실시간 검색어 → 수익 인증.
    expect(source).toContain("type HomeOperationsTab = 'notice' | 'deputy' | 'realtime' | 'income'");
    expect(source).toContain("HOME_OPS_TAB_ORDER: HomeOperationsTab[] = ['notice', 'deputy', 'realtime', 'income']");
    expect(source).toContain("useState<HomeOperationsTab>('deputy')"); // default = 부방장 선정 황금키워드
    expect(source).toContain('부방장 선정 황금키워드');
    expect(source).toContain('fetchCommunityIncomeProofs(3, { view: \'home\' })');

    // Left vertical side-nav tablist + four tab panels.
    expect(source).toContain('className="home-ops-sidenav"');
    expect(source).toContain('aria-label="홈 보기 선택"');
    expect(source).toContain('data-home-ops-tab={tab}');
    expect(source).toContain('id="home-ops-panel-notice"');
    expect(source).toContain('id="home-ops-panel-deputy"');
    expect(source).toContain('id="home-ops-panel-realtime"');
    expect(source).toContain('id="home-ops-panel-income"');

    // Income preloads (eager, mounted-while-hidden); realtime stays lazy.
    expect(source).toContain('loading="eager"');
    expect(source).toContain('preload="metadata"');
    expect(source).toContain("activeTab === 'realtime' ? realtimePanel");
    expect(source).not.toContain("activeTab === 'income' ?");
  });

  it('keeps Korean copy readable and protects wide keyword rows from broken wrapping', () => {
    const source = readFileSync(
      join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'),
      'utf8',
    );

    expect(source).toContain('word-break: keep-all');
    expect(source).toContain('overflow-wrap: break-word');
    expect(source).toMatch(/\.home-ops-table\s*\{[^}]*min-width:\s*980px/s);
    expect(source).toMatch(/\.home-ops-table-shell\s*\{[^}]*max-height:\s*none/s);
    expect(source).toMatch(/\.home-ops-table tbody th\s*\{[^}]*font-size:\s*16px/s);
    expect(source).toContain('function KeywordMobileCards');
    expect(source).toContain('className="home-ops-keyword-card"');
    expect(source).toContain("type KeywordSearchProvider = 'naver' | 'daum' | 'google'");
    expect(source).toContain('https://search.naver.com/search.naver?query=');
    expect(source).toContain('https://search.daum.net/search?w=tot&q=');
    expect(source).toContain('https://www.google.com/search?q=');
    expect(source).toContain('className="home-ops-keyword-link"');
    expect(source).toContain('className="home-ops-opportunity-link"');
    expect(source).toContain('className="home-ops-search-cell"><KeywordSearchLinks row={row} /></td>');
    expect(source).toContain('<KeywordSearchLinks row={row} compact />');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.home-ops-table-shell\s*\{[^}]*display:\s*none/s);
    expect(source).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.home-ops-keyword-cards\s*\{[^}]*display:\s*grid/s);
    expect(source).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.home-ops-realtime-panel \.hero-source-body,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s);
    expect(source).toMatch(/\.home-ops-layout\s*\{[^}]*grid-template-columns:\s*minmax\(210px,\s*250px\)\s+minmax\(0,\s*1fr\)/s);
    expect(source).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.home-ops-sidenav\s*\{[^}]*flex-direction:\s*row/s);
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

  it('keeps the operations board and removes the duplicate bottom income-proof carousel', () => {
    const source = readFileSync(join(process.cwd(), 'spa', 'src', 'pages', 'IndexPage.tsx'), 'utf8');
    const board = readFileSync(join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'), 'utf8');
    const boardIndex = source.indexOf('<HomeOperationsBoard managedProofs={siteContent?.hero?.proofs || []} realtimePanel={(');
    const actionsIndex = source.indexOf('<div className="hero-action-strip"');

    expect(boardIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(-1);
    expect(boardIndex).toBeLessThan(actionsIndex);
    expect(source).not.toContain('<div className="hero-proof-stage"');
    expect(source).not.toContain('ADSENSE_HERO_PROOFS');
    expect(source).not.toContain('DEFAULT_HERO_PROOFS');
    expect(source).not.toContain('activeProofIndex');
    expect(source).not.toContain('communityProofFallbacks');
    expect(board).not.toContain('proofFallbacks');
    expect(board).not.toContain('proofFallbackToIncomeProof');
    expect(board).toContain('managedProofs?: HomeManagedProof[]');
    expect(board).toContain('function managedProofToIncomeProof');
    expect(board).toContain('const displayIncomeProofs = incomeProofs.length > 0 ? incomeProofs : managedIncomeProofs;');
    expect(board).toContain('const usingManagedProofs = incomeProofs.length === 0 && managedIncomeProofs.length > 0;');
    expect(board).toContain("usingManagedProofs ? '관리자가 등록한 실제 인증 자료입니다.'");
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
    expect(admin).toContain('LEWORD API 서버 관리자 ID');
    expect(admin).toContain('관리자 페이지 로그인 아이디/비밀번호로 서버 저장권한을 자동 연결합니다');
    expect(admin).toContain('const serverSession = await requestLewordAdminSession(id, pw, { silent: true })');
    expect(admin).toContain('사이트 로그인 완료 · 서버 저장 권한 자동 연결됨');
    expect(admin).toContain('autocomplete="new-password"');
    expect(admin).toContain("apiIdInput.value = id");
    expect(admin).toContain("homeOpsApiIdInput.value = id");
  });
});
