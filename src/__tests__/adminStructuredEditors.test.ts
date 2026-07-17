import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const adminSource = () => readFileSync(join(process.cwd(), 'admin', 'index.html'), 'utf8');

describe('admin structured editors', () => {
  it('uses a real four-column keyword table instead of a TSV textarea', () => {
    const admin = adminSource();

    expect(admin).toContain('id="keyword-briefing-table-body"');
    expect(admin).toContain('<th scope="col">키워드</th>');
    expect(admin).toContain('<th scope="col">검색량</th>');
    expect(admin).toContain('<th scope="col">블로그 문서수</th>');
    expect(admin).toContain('<th scope="col">기회지수</th>');
    expect(admin).toContain('id="keyword-briefing-add-row"');
    expect(admin).toContain('id="keyword-briefing-sort"');
    expect(admin).toContain('function renderKeywordBriefingTable()');
    expect(admin).toContain('function addKeywordBriefingRow()');
    expect(admin).toContain('function removeKeywordBriefingRow(');
    expect(admin).toContain('function moveKeywordBriefingRow(');
    expect(admin).not.toContain('<textarea id="keyword-briefing-rows"');
  });

  it('does not expose raw site JSON and routes editing through labeled buttons', () => {
    const admin = adminSource();

    expect(admin).not.toContain('id="admin-site-content-json"');
    expect(admin).not.toContain('id="edit-products-json"');
    expect(admin).not.toContain('id="edit-site-json-preview"');
    expect(admin).not.toContain('제품 상세 JSON 직접 편집');
    expect(admin).not.toContain('전체 저장 데이터 미리보기');
    expect(admin).not.toContain('<h4>디자인/고급 JSON</h4>');
    expect(admin).toContain('id="admin-site-content-summary"');
    expect(admin).toContain('data-content-editor-target="home"');
    expect(admin).toContain('data-content-editor-target="pricing"');
    expect(admin).toContain('data-content-editor-target="products"');
    expect(admin).toContain('data-content-editor-target="downloads"');
    expect(admin).toContain('data-content-editor-target="design"');
    expect(admin).toContain('function renderAdminContentSummary(');
    expect(admin).toContain('<script src="/admin/structured-editor-tools.js"></script>');
    expect(admin).toContain("{ id: 'all-in-one-monthly', label: '올인원 1개월'");
    expect(admin).not.toContain("{ id: 'disabled-license-bundle-monthly'");
    expect(admin).toContain('class="editor-subtabs" role="tablist"');
    expect(admin).toContain('role="tab" aria-selected="true" aria-controls="editor-sub-home"');
    expect(admin).toContain('role="tabpanel" aria-labelledby="editor-tab-home"');
    expect(admin).toContain('function installEditorSubtabKeyboard()');
  });

  it('uses row buttons for product guide, flow, and comparison data', () => {
    const admin = adminSource();

    expect(admin).toContain('data-structured-row-editor="guideCards"');
    expect(admin).toContain('data-structured-row-editor="suiteFlow"');
    expect(admin).toContain('data-structured-row-editor="comparison"');
    expect(admin).toContain('data-structured-row-add="guideCards"');
    expect(admin).toContain('function renderStructuredRowEditor(');
    expect(admin).toContain('function readStructuredEditorRows(');
    expect(admin).not.toContain('.slice(0, 40)');
    expect(admin).toContain('const futureColumns = source.slice(def.columns.length)');
    expect(admin).toMatch(/id="products-page-guide-cards"[^>]*hidden/);
    expect(admin).toMatch(/id="products-page-suite-flow"[^>]*hidden/);
    expect(admin).toMatch(/id="products-page-comparison"[^>]*hidden/);
  });

  it('replaces every remaining delimiter editor with labeled fields and row buttons', () => {
    const admin = adminSource();

    expect(admin).not.toContain('id="products-page-guide-copy"');
    expect(admin).not.toContain('id="products-page-final-copy"');
    expect(admin).toContain('id="products-page-guide-kicker"');
    expect(admin).toContain('id="products-page-guide-title"');
    expect(admin).toContain('id="products-page-guide-desc"');
    expect(admin).toContain('id="products-page-final-note"');
    expect(admin).toContain('id="products-page-final-primary-cta"');
    expect(admin).toContain('data-structured-row-editor="planFeatures:${plan.id}"');
    expect(admin).toContain('data-structured-row-editor="productMetrics:${product.id}"');
    expect(admin).toContain('data-structured-row-editor="productBullets:${product.id}"');
    expect(admin).toContain('data-structured-row-editor="productFit:${product.id}"');
    expect(admin).toContain('data-structured-row-add="productMetrics:${product.id}"');
    expect(admin).toContain('function getStructuredRowEditorDef(key)');
    expect(admin).toContain('function pruneEmptyStructuredEditorRows()');
    expect(admin).toContain('removedEmptyRowCount = pruneEmptyStructuredEditorRows()');
    expect(admin).toContain('>↑ 위로</button>');
    expect(admin).toContain('>↓ 아래로</button>');
    expect(admin).not.toContain('100건 | 일 최대 자동 발행');
  });

  it('blocks publishing while any keyword row needs review', () => {
    const admin = adminSource();

    expect(admin).toContain('keywordBriefingEditorState.invalidCount > 0');
    expect(admin).toContain('검수 필요 행을 모두 수정하거나 삭제한 뒤 저장하세요.');
    expect(admin).toContain('data-keyword-row-issue');
    expect(admin).toContain('기회지수 자동 계산');
    expect(admin).toMatch(/\.keyword-briefing-edit-table th\s*\{[^}]*font-size:\s*16px/s);
    expect(admin).toMatch(/\.keyword-briefing-edit-table input\s*\{[^}]*font-size:\s*16px/s);
  });

  it('uses sparse site patches and stable proof IDs to preserve concurrent and future fields', () => {
    const admin = adminSource();

    expect(admin).toContain('loadedSiteContentProjection');
    expect(admin).toContain('mergeTools.createChangedPatch(loadedSiteContentProjection, currentProjection)');
    expect(admin).toContain('mergeTools.findConflictingPaths(loadedSiteContentBase, latestBase, patch)');
    expect(admin).toContain('다른 탭에서 같은 항목이 먼저 수정되었습니다.');
    expect(admin).toContain("data-cms-proof-id=");
    expect(admin).toContain("id: (card.getAttribute('data-cms-proof-id') || '').trim()");
    expect(admin).toContain('proofs: getCmsProofEditorValues()');
    expect(admin).toContain('return tools.mergeContent(DEFAULT_SITE_CONTENT, normalized)');
    expect(admin).not.toContain("value === undefined || value === null || value === ''");
    expect(admin).not.toContain('proofs: textToProofs(getValue(\'edit-hero-proofs\'))');
  });
});
