import { describe, expect, it } from 'vitest';
import {
  buildMobileRichHtml,
  pickRichArticleThemes,
  pickSoftHeadingTheme,
  pickSoftHighlightTheme,
  pickSoftTableTheme,
  SOFT_HEADING_THEMES,
  SOFT_HIGHLIGHT_THEMES,
  SOFT_TABLE_THEMES,
} from '../automation/richTextPaste';

describe('buildMobileRichHtml', () => {
  it('splits long prose into mobile-friendly centered paragraphs', () => {
    const result = buildMobileRichHtml(
      'Naver Mate selection becomes easier when the first paragraph shows the topic and conclusion clearly. The next paragraph should keep each sentence short enough for mobile readers, because long blocks are hard to scan on a phone.',
      { maxChunkChars: 54, highlight: false }
    );

    expect(result.paragraphCount).toBeGreaterThan(1);
    expect(result.html.match(/<p style=/g)?.length).toBe(result.paragraphCount);
    expect(result.html).toContain('text-align:center');
    expect(result.html).toContain('max-width:520px');
  });

  it('uses one soft highlight color theme only for important section sentences', () => {
    const theme = SOFT_HIGHLIGHT_THEMES[2];
    const result = buildMobileRichHtml(
      [
        '## Reader Trust',
        'This opener is useful but not the main point.',
        'The core result is that proof, comparison, and experience make the post easier to trust.',
        '',
        '## Selection Strategy',
        'A weak paragraph only repeats the topic.',
        'The most important action is to add a clear conclusion, review details, and a simple checklist.',
      ].join('\n'),
      { maxChunkChars: 120, highlight: true, maxHighlights: 6, highlightTheme: theme }
    );

    expect(result.highlightCount).toBe(2);
    expect(result.html.match(new RegExp(`background-color:${theme.background}`, 'g'))).toHaveLength(2);
    const openerIndex = result.html.indexOf('This opener is useful but not the main point.');
    const weakIndex = result.html.indexOf('A weak paragraph only repeats the topic.');
    expect(result.html.slice(Math.max(0, openerIndex - 120), openerIndex + 120)).not.toContain(`background-color:${theme.background}`);
    expect(result.html.slice(Math.max(0, weakIndex - 120), weakIndex + 120)).not.toContain(`background-color:${theme.background}`);
    expect(result.html).not.toContain('background-color:#fff3bf');
    expect(result.html).not.toContain('background-color:#fff7d6');
  });

  it('does not add a table of contents by default and keeps centered heading markers', () => {
    const result = buildMobileRichHtml(
      [
        '## First Section',
        'The core result belongs here.',
        '',
        '## Second Section',
        'The conclusion belongs here.',
      ].join('\n'),
      { maxChunkChars: 120, highlight: false, headingTheme: SOFT_HEADING_THEMES[0] }
    );

    expect(result.html).not.toContain('data-rich-toc="true"');
    expect(result.html).not.toContain('\uBAA9\uCC28');
    expect(result.html).toContain('id="naver-mate-section-1"');
    expect(result.html).toContain('data-rich-heading="true"');
    expect(result.html).toContain('text-align:center');
    expect(result.html).toContain('>01</span>');
    expect(result.html).toContain('border-bottom:2px solid');
  });

  it('can add a centered table of contents only when explicitly requested', () => {
    const result = buildMobileRichHtml(
      [
        '## First Section',
        'The core result belongs here.',
        '',
        '## Second Section',
        'The conclusion belongs here.',
      ].join('\n'),
      { toc: true, maxChunkChars: 120, highlight: false, headingTheme: SOFT_HEADING_THEMES[0] }
    );

    expect(result.html).toContain('data-rich-toc="true"');
    expect(result.html).toContain('href="#naver-mate-section-1"');
    expect(result.html).toContain('>01</span>');
  });

  it('keeps a long important sentence highlighted as one readable unit', () => {
    const theme = SOFT_HIGHLIGHT_THEMES[0];
    const importantSentence = 'The most important action is to highlight only one core sentence under each subheading so the reader can understand the point quickly.';
    const result = buildMobileRichHtml(
      [
        '## Highlight Scope',
        'This is plain supporting context.',
        importantSentence,
      ].join('\n'),
      { maxChunkChars: 42, highlight: true, maxHighlights: 3, highlightTheme: theme }
    );

    const highlighted = `<span style="background-color:${theme.background}`;
    expect(result.highlightCount).toBe(1);
    expect(result.html).toContain(`${highlighted}`);
    expect(result.html).toContain('The most important action is to highlight<br>');
    expect(result.html).toContain('the point quickly.</span>');
    expect(result.html).not.toContain('point quickly.</p>');
  });

  it('converts markdown tables into HTML tables for Naver rich paste', () => {
    const result = buildMobileRichHtml(
      [
        '| Item | Result |',
        '| --- | --- |',
        '| Price | OK |',
        '| Structure | Stable |',
      ].join('\n')
    );

    expect(result.tableCount).toBe(1);
    expect(result.html).toContain('<table ');
    expect(result.html).toContain('>Item</th>');
    expect(result.html).toContain('>OK</td>');
  });

  it('formats Q&A without standalone A labels and renders questions at 24px', () => {
    const result = buildMobileRichHtml(
      [
        'Q1. 제습기와 서큘레이터를 꼭 같이 써야 하나?',
        'A.',
        '꼭 필수는 아니지만, 함께 쓰면 건조 시간과 냄새 예방 효과가 확실히 높아진다.',
      ].join('\n'),
      { maxChunkChars: 38, highlight: false }
    );

    expect(result.html).toContain('font-size:24px');
    expect(result.html).toContain('제습기와 서큘레이터를 꼭 같이 써야 하나?');
    expect(result.html).not.toContain('>A.<');
    expect(result.plainText).not.toContain('\n\nA.');
  });

  it('removes inline A prefixes from Q&A answers', () => {
    const result = buildMobileRichHtml(
      [
        'Q1. 제습기와 서큘레이터를 꼭 같이 써야 하나?',
        'A. 꼭 필수는 아니지만, 함께 쓰면 건조 시간과 냄새 예방 효과가 확실히 높아진다.',
      ].join('\n'),
      { maxChunkChars: 38, highlight: false }
    );

    expect(result.html).toContain('font-size:24px');
    expect(result.html).toContain('제습기와 서큘레이터를 꼭 같이 써야 하나?');
    expect(result.html).not.toContain('>A.');
    expect(result.plainText).not.toContain('A. 꼭');
  });

  it('keeps Q numbers and converts answers to A-number colon labels', () => {
    const result = buildMobileRichHtml(
      [
        'Q1. Why does the smell remain?',
        'A.',
        'Moisture can stay inside the device after drying.',
        'Q2. Is fan-only drying enough? A2. It helps, but cleaning is still needed.',
      ].join('\n'),
      { maxChunkChars: 80, highlight: false }
    );

    expect(result.plainText).toContain('Q1. Why does the smell remain?');
    expect(result.plainText).toContain('A1: Moisture can stay inside the device after drying.');
    expect(result.plainText).toContain('Q2. Is fan-only drying enough?');
    expect(result.plainText).toContain('A2: It helps, but cleaning is still needed.');
    expect(result.plainText).not.toContain('\n\nA.\n\n');
  });

  it('normalizes inline numbered checklists into vertical mobile lines', () => {
    const result = buildMobileRichHtml(
      'Cleaning checklist includes 1) filter washing, 2) fan dust removal, 3) enough drying time.',
      { maxChunkChars: 120, highlight: false }
    );

    expect(result.plainText).toContain('Cleaning checklist includes');
    expect(result.plainText).toContain('\n\n1) filter washing,');
    expect(result.plainText).toContain('\n\n2) fan dust removal,');
    expect(result.plainText).toContain('\n\n3) enough drying time.');
  });

  it('normalizes inline dash lists so every dash starts on a new line', () => {
    const result = buildMobileRichHtml(
      'Use this order - run auto dry after cooling - clean the filter monthly - ventilate after cleaning.',
      { maxChunkChars: 120, highlight: false }
    );

    expect(result.plainText).toContain('\n\n- run auto dry after cooling');
    expect(result.plainText).toContain('\n\n- clean the filter monthly');
    expect(result.plainText).toContain('\n\n- ventilate after cleaning.');
  });

  it('collapses a dangling closing bracket into the verdict line', () => {
    const result = buildMobileRichHtml('[ One line verdict: automatic drying still needs cleaning.\n]');

    expect(result.plainText).toContain('[ One line verdict: automatic drying still needs cleaning. ]');
    expect(result.plainText).not.toMatch(/\n\]\s*$/);
  });

  it('removes Korean one-line verdict labels from Mate rich body text', () => {
    const result = buildMobileRichHtml('[ 한 줄 판정: 자동건조만으로 냄새를 모두 막기는 어렵습니다. ]', {
      highlight: false,
    });

    // 줄바꿈 정책(22자 모바일 폭)과 무관하게 라벨 제거만 검증 — 공백 무시 비교
    expect(result.plainText.replace(/\s+/g, ' ')).toContain('자동건조만으로 냄새를 모두 막기는 어렵습니다.');
    expect(result.plainText).not.toContain('한 줄 판정');
    expect(result.html).not.toContain('한 줄 판정');
  });

  it('uses wider paragraph spacing for two-enter mobile readability', () => {
    const result = buildMobileRichHtml('First sentence.\n\nSecond sentence.', { highlight: false });

    expect(result.html).toContain('margin:0 auto 30px');
    expect(result.plainText).toContain('First sentence.\n\nSecond sentence.');
  });

  it('keeps sentence-ending paragraphs separated by a real blank line in rich paste payloads', () => {
    const result = buildMobileRichHtml(
      [
        '광고에서는 벤딕트 휴대용 선풍기가 조용하게 작동한다고 하지만, 실제로는 소음이 상당하다.',
        '특히, 높은 풍속으로 설정하면 소음이 더욱 커져서 조용한 환경에서는 사용하기 어렵다.',
        '이 부분은 광고에서 전혀 언급되지 않았다.',
      ].join(' '),
      { maxChunkChars: 38, highlight: false }
    );

    expect(result.plainText).toContain('소음이 상당하다.\n\n특히,');
    expect(result.plainText).toContain('사용하기 어렵다.\n\n이 부분은');
    expect(result.html).toContain('data-rich-spacer="true"');
    expect(result.html).toContain('<br></p>');
  });

  it('splits long Korean sentences near a semantic midpoint for mobile reading', () => {
    const result = buildMobileRichHtml(
      '제습기와 서큘레이터를 같이 쓰면 2026년 장마철 기준으로 빨래 건조 시간이 확실히 단축되고, 냄새 예방 효과도 높아진다.',
      { maxChunkChars: 38, highlight: false }
    );

    expect(result.paragraphCount).toBe(1);
    expect(result.html).toContain('<br>');
    expect(result.plainText).toContain('제습기와 서큘레이터를 같이 쓰면 2026년 장마철 기준으로');
    expect(result.plainText).toContain('빨래 건조 시간이 확실히 단축되고');
  });

  it('applies one soft table color theme to table headers and cells', () => {
    const theme = SOFT_TABLE_THEMES[1];
    const result = buildMobileRichHtml(
      [
        '| Item | Result |',
        '| --- | --- |',
        '| Encoding | OK |',
        '| Table | Preserved |',
      ].join('\n'),
      { tableTheme: theme }
    );

    expect(result.html).toContain(`data-rich-table-theme="${theme.name}"`);
    expect(result.html).toContain(`border-top:3px solid ${theme.accent}`);
    expect(result.html).toContain(`background-color:${theme.headerBg}`);
    expect(result.html).toContain(`background-color:${theme.rowBg}`);
    expect(result.html).toContain(`background-color:${theme.altRowBg}`);
  });

  it('keeps the same table color theme across multiple tables in one article', () => {
    const theme = SOFT_TABLE_THEMES[2];
    const result = buildMobileRichHtml(
      [
        '| Item | Result |',
        '| --- | --- |',
        '| A | Good |',
        '',
        '| Check | Value |',
        '| --- | --- |',
        '| B | Stable |',
      ].join('\n'),
      { tableTheme: theme }
    );

    expect(result.tableCount).toBe(2);
    expect(result.html.match(new RegExp(`data-rich-table-theme="${theme.name}"`, 'g'))).toHaveLength(2);
    expect(result.html).not.toContain(`data-rich-table-theme="${SOFT_TABLE_THEMES[0].name}"`);
  });

  it('can pick deterministic random soft themes for each article', () => {
    expect(pickSoftTableTheme(() => 0)).toBe(SOFT_TABLE_THEMES[0]);
    expect(pickSoftTableTheme(() => 0.9999)).toBe(SOFT_TABLE_THEMES[SOFT_TABLE_THEMES.length - 1]);
    expect(pickSoftHighlightTheme(() => 0)).toBe(SOFT_HIGHLIGHT_THEMES[0]);
    expect(pickSoftHighlightTheme(() => 0.9999)).toBe(SOFT_HIGHLIGHT_THEMES[SOFT_HIGHLIGHT_THEMES.length - 1]);
    expect(pickSoftHeadingTheme(() => 0)).toBe(SOFT_HEADING_THEMES[0]);
    expect(pickSoftHeadingTheme(() => 0.9999)).toBe(SOFT_HEADING_THEMES[SOFT_HEADING_THEMES.length - 1]);
  });

  it('picks separate table, highlight, and heading theme roles for one article', () => {
    const themes = pickRichArticleThemes(() => 0.4);

    expect(themes.tableTheme).toBeTruthy();
    expect(themes.highlightTheme).toBeTruthy();
    expect(themes.headingTheme).toBeTruthy();
    expect(themes.tableTheme.headerBg).not.toBe(themes.highlightTheme.background);
    expect(themes.headingTheme.markerBg).not.toBe(themes.highlightTheme.background);
    expect(themes.headingTheme.markerBg).not.toBe(themes.tableTheme.headerBg);
  });

  it('escapes raw HTML before building the clipboard fragment', () => {
    const result = buildMobileRichHtml('<script>alert(1)</script> core test content.');

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;');
    expect(result.html).toContain('&gt;');
  });
});

// SPEC-STABILITY-2026 / 2026-06-11 사용자 가독성 보고:
// 발행물에서 ① 줄이 ", "로 시작 ② 단어 중간 절단("범/위에") ③ 빈 줄 낀
// 마크다운 표가 원문 그대로 노출. 사용자 수정본(라인 ~20-22자, 구절 경계
// 줄바꿈)을 기준 계약으로 잠근다.
describe('mobile line-break readability (2026-06-11)', () => {
  const SAMPLE =
    '이 글은 집 안 정리, 주방, 욕실처럼 자주 하는 청소 기준으로, 빠뜨리기 쉬운 항목까지 함께 확인하는 범위에 맞췄습니다.';

  it('never starts a line with punctuation (", 빠뜨리기" class)', () => {
    const result = buildMobileRichHtml(SAMPLE, { highlight: false });
    const lines = result.plainText.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      expect(line).not.toMatch(/^[,，、.!?…:;)\]]/);
    }
  });

  it('breaks at spaces instead of slicing inside a word when spaces exist', () => {
    const result = buildMobileRichHtml(SAMPLE, { highlight: false });
    const lines = result.plainText.split('\n').map((l) => l.trim()).filter(Boolean);
    // 원문을 공백 없이 이어붙인 뒤, 각 줄 경계가 원문의 공백/구두점 위치와
    // 일치하는지 검사: 줄 끝+다음 줄 시작을 붙였을 때 원문에 그대로 존재하면
    // 단어 중간 절단이다.
    for (let i = 0; i < lines.length - 1; i += 1) {
      const boundary = lines[i].slice(-1) + lines[i + 1].slice(0, 1);
      const midWordCut = SAMPLE.replace(/\s+/g, '').includes(boundary)
        && !/[\s,，、.!?…]/.test(lines[i].slice(-1))
        && SAMPLE.includes(lines[i].slice(-2) + lines[i + 1].slice(0, 2));
      expect(midWordCut, `단어 중간 절단: "${lines[i].slice(-4)}|${lines[i + 1].slice(0, 4)}"`).toBe(false);
    }
  });

  it('merges tiny orphan tails into the previous line', () => {
    const result = buildMobileRichHtml(SAMPLE, { highlight: false });
    const lines = result.plainText.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      expect(line.length, `외톨이 줄: "${line}"`).toBeGreaterThan(4);
    }
  });

  it('defaults to the ~22-char line width measured from the user reference', () => {
    const result = buildMobileRichHtml(SAMPLE, { highlight: false });
    const lines = result.plainText.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(22 + 13);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('detects markdown tables even when rows are separated by blank lines', () => {
    const brokenTable = [
      '| 항목 | 정리 |',
      '',
      '| --- | --- |',
      '',
      '| 기본 도구 | 걸레, 수세미, 장갑, 세제 |',
      '',
      '| 소모품 | 봉투, 휴지, 여분 행주 |',
    ].join('\n');
    const result = buildMobileRichHtml(brokenTable, { highlight: false });
    expect(result.tableCount).toBe(1);
    expect(result.html).toContain('<table');
    expect(result.html).not.toContain('---');
  });
});

// 2026-06-12 라이브 발행물: 표 본체는 정상 렌더링됐지만 표 뒤에 LLM이 붙인
// 단독 콜아웃 행("| 판단 | ... |", 헤더/구분자 없음)이 원문 파이프 그대로
// 노출. 파이프 문자는 어떤 경우에도 발행물에 노출되면 안 된다.
describe('orphan pipe-row handling (2026-06-12)', () => {
  it('renders a standalone pipe row as a readable sentence (no raw pipes)', () => {
    const result = buildMobileRichHtml(
      '| 판단 | 재질과 오염 정도가 맞을 때만 사용 |',
      { highlight: false }
    );
    expect(result.plainText).not.toContain('|');
    expect(result.plainText.replace(/\s+/g, ' ')).toContain('판단 — 재질과 오염 정도가 맞을 때만 사용');
  });

  it('drops a stray divider-only row silently', () => {
    const result = buildMobileRichHtml('본문 문장입니다.\n\n| --- | --- |\n\n다음 문장입니다.', { highlight: false });
    expect(result.plainText).not.toContain('---');
    expect(result.plainText).not.toContain('|');
  });

  it('does not affect real tables (header + divider)', () => {
    const result = buildMobileRichHtml(
      ['| 항목 | 정리 |', '| --- | --- |', '| 대상 | 세탁기 |'].join('\n'),
      { highlight: false }
    );
    expect(result.tableCount).toBe(1);
    expect(result.html).toContain('<table');
  });
});

// 2026-06-12 라이브 2차 실측: 블록 단위 검사로는 못 잡는 두 형태가 발행물에
// 파이프 원문으로 노출 — ① 산문 줄과 같은 블록에 붙은 고아 헤더 행,
// ② 행 마지막 파이프 뒤에 산문이 이어지는 줄. 줄 단위 정규화 계약.
describe('orphan pipe-line normalization (2026-06-12 live round 2)', () => {
  it('converts a pipe row that shares a block with prose lines', () => {
    const result = buildMobileRichHtml(
      '하나라도 비면 결과가 달라질 수 있습니다.\n| 판정 | 서류 확인이 먼저입니다 |',
      { highlight: false }
    );
    expect(result.plainText).not.toContain('|');
    expect(result.plainText.replace(/\s+/g, ' ')).toContain('판정 — 서류 확인이 먼저입니다');
    expect(result.plainText).toContain('하나라도 비면');
  });

  it('converts a pipe row with trailing prose after the last pipe', () => {
    const result = buildMobileRichHtml(
      '| 시기 확인 | 예산과 신청시기에 따라 안내가 달라질 수 있습니다 | 막상 이 표만 저장해두면 다시 보기 편하더라고요.',
      { highlight: false }
    );
    const flat = result.plainText.replace(/\s+/g, ' ');
    expect(result.plainText).not.toContain('|');
    expect(flat).toContain('시기 확인 — 예산과 신청시기에 따라 안내가 달라질 수 있습니다');
    expect(flat).toContain('막상 이 표만 저장해두면');
  });

  it('replaces inline pipes inside prose with a readable separator', () => {
    const result = buildMobileRichHtml('이 표 | 보기 편하게 정리했습니다.', { highlight: false });
    expect(result.plainText).not.toContain('|');
    expect(result.plainText).toContain('보기 편하게');
  });

  it('still renders a valid table next to an orphan content row', () => {
    const result = buildMobileRichHtml(
      [
        '| 신청 시기 | 상반기 공고를 먼저 봅니다 |',
        '',
        '| 인증 상태 | 정부24 로그인이 먼저입니다 |',
        '| --- | --- |',
        '| 가족 정보 | 맞춤안내 설정에서 추가합니다 |',
      ].join('\n'),
      { highlight: false }
    );
    expect(result.tableCount).toBe(1);
    expect(result.plainText).not.toContain('|');
    expect(result.plainText.replace(/\s+/g, ' ')).toContain('신청 시기 — 상반기 공고를 먼저 봅니다');
  });
});

// 2026-06-12 라이브 3차: LLM이 프롬프트의 형식 예시 "| 항목 | 정리 |"를
// 보일러플레이트로 복사해 표 밖에 단독 출력 → 정규화가 "· 항목 · 정리"
// 텍스트로 살림. 예시 헤더 잔재는 렌더링하지 말고 제거한다.
describe('boilerplate example-header drop (2026-06-12 live round 3)', () => {
  it('drops an orphan "| 항목 | 정리 |" example header outside a table', () => {
    const result = buildMobileRichHtml(
      [
        '계좌 명의와 심사 상태를 보는 순서가 맞습니다.',
        '',
        '| 항목 | 정리 |',
        '',
        '| 정기 신청 기간 | ARS에서 바로 변경 가능 |',
        '| --- | --- |',
        '| 반영 시점 | 다음 달 3~7일 이후 안내 |',
      ].join('\n'),
      { highlight: false }
    );
    expect(result.tableCount).toBe(1);
    expect(result.plainText).not.toMatch(/항목\s*[·—-]\s*정리/);
    expect(result.plainText).toContain('계좌 명의와 심사 상태');
  });

  it('keeps a real table whose header IS 항목/정리 (valid table path untouched)', () => {
    const result = buildMobileRichHtml(
      ['| 항목 | 정리 |', '| --- | --- |', '| 기준 | 본인 명의 계좌 |'].join('\n'),
      { highlight: false }
    );
    expect(result.tableCount).toBe(1);
    expect(result.html).toContain('항목');
  });
});
