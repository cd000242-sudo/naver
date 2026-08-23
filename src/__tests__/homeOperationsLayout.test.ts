import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('homepage operations layout', () => {
  it('renders three home sub-tabs with 실시간 as the default and preloads income', () => {
    const source = readFileSync(
      join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'),
      'utf8',
    );

    // [2026-07] deputy 탭 제거 후 3탭 계약: 실시간 검색어 → 공지사항 → 수익 인증.
    //   (기존 4탭 단언은 사이트 개편 커밋이 컴포넌트만 바꾸고 테스트를 미갱신해 드리프트)
    expect(source).toContain("type HomeOperationsTab = 'notice' | 'realtime' | 'income'");
    expect(source).toContain("HOME_OPS_TAB_ORDER: HomeOperationsTab[] = ['realtime', 'notice', 'income']");
    expect(source).toContain("useState<HomeOperationsTab>('realtime')"); // default = 실시간
    expect(source).toContain('fetchCommunityIncomeProofs(3, { view: \'home\' })');

    // Left vertical side-nav tablist + three tab panels.
    expect(source).toContain('className="home-ops-sidenav"');
    expect(source).toContain('aria-label="홈 보기 선택"');
    expect(source).toContain('data-home-ops-tab={tab}');
    expect(source).toContain('id="home-ops-panel-notice"');
    expect(source).toContain('id="home-ops-panel-realtime"');
    expect(source).toContain('id="home-ops-panel-income"');

    // Income preloads (eager, mounted-while-hidden); realtime stays lazy.
    // [2026-08-19] 고정 eager → 첫 장만 eager 인 조건부로 개선됐다. 계약은 "첫 장을 즉시 띄운다".
    expect(source).toContain("loading={eager ? 'eager' : 'lazy'}");
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
    // [2026-08-20] 바이트 고정 → 구조 단언: 원격(웹 세션)이 검색 셀에 추이 버튼을 넣으며
    // 한 줄 마크업이 여러 줄로 갈라졌다. 의도(검색 링크가 search-cell td 안에 있다)만 잠근다.
    expect(source).toMatch(/className="home-ops-search-cell">[\s\S]*?<KeywordSearchLinks row=\{row\} \/>[\s\S]*?<\/td>/);
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
    // [2026-08-23] 기본 탭이 '내 글 홍보'(posts)로 바뀜다 — CommunityPage.tsx:204 사장님 지시.
    //   이 단언은 바뀌기 전 기본값('income')을 박제하고 있어 소스가 아니라 테스트를 고친다.
    expect(community).toContain("useState<TabKey>('posts')");
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
    // [2026-08-19] siteOps.ts 로 옮기며 이름이 바뀌었다(managedHomeProofsToIncomeProofs).
    expect(board).toContain('managedHomeProofsToIncomeProofs');
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
    // [2026-08-19] 연동 UX 최종형에서 같은 뜻의 짧은 문구로 다듬어졌다.
    expect(admin).toContain('로그인하면 저장 권한이 자동으로 연결됩니다');
    // [2026-08-19] 변수·인자 이름이 바뀌었다. 계약은 "silent 세션으로 저장 권한을 자동 연결한다".
    expect(admin).toContain('requestLewordAdminSession(userId, password, { silent: true })');
    expect(admin).toContain('서버 저장 권한이 연결되었습니다');
    expect(admin).toContain('autocomplete="new-password"');
    // [2026-08-19] 로그인 세션의 userId 로 채우도록 바뀌었다(하드코딩 id 변수 → 세션 값).
    expect(admin).toContain('apiIdInput.value = existingServerSession.userId');
    expect(admin).toContain('homeOpsApiIdInput.value = existingServerSession.userId');
  });
});
