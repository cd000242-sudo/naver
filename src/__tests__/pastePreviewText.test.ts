import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildPastePreviewText, buildPastePreviewHtml } from '../automation/richTextPaste';

/**
 * [2026-08-26 사장님 지시] "타이핑할 때 리치 복붙을 하잖아. 줄바꿈이랑 문단 정리가
 * 모바일 전용으로 되어 있는데 그걸 그대로 보여줘야 사용자가 보고 정확하게 줄바꿈이나
 * 문단 정리를 했는지 알 수 있지 않니. 지금은 실컷 수정해도 줄바꿈이 이상하면 다시
 * 블로그 가서 수정해야 돼. 발행해놓고 수정하면 그것도 안 좋다고."
 */
describe('미리보기는 붙여넣기와 같은 줄바꿈을 보여준다', () => {
  it('긴 문장을 모바일 폭으로 나눈다 — 원문 한 줄이 아니다', () => {
    const long = '옥상달빛 김윤주가 십센치 권정열과 함께 찍은 사진을 올린 뒤 팬들과 유쾌한 소통을 이어가 눈길을 끌었습니다.';
    const out = buildPastePreviewText(long);
    expect(out.split('\n').length).toBeGreaterThan(1);
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
  });

  it('표 행은 문장으로 쪼개지 않는다 — 쪼개면 표가 아니게 된다', () => {
    const table = ['| 구분 | 내용 |', '| --- | --- |', '| 기준일 | 2026년 8월 26일 |'].join('\n');
    expect(buildPastePreviewText(table)).toBe(table);
  });

  it('목록·인용·소제목 마커도 건드리지 않는다', () => {
    for (const block of ['- 관계 확인: 2014년 6월 결혼한 정식 부부', '> 인용문입니다', '## 소제목']) {
      expect(buildPastePreviewText(block)).toBe(block);
    }
  });

  it('빈 입력은 빈 문자열', () => {
    expect(buildPastePreviewText('')).toBe('');
    expect(buildPastePreviewText('   ')).toBe('');
  });

  it('문단 사이 빈 줄은 하나로 유지한다', () => {
    const out = buildPastePreviewText('첫 문단입니다.\n\n\n\n둘째 문단입니다.');
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).toMatch(/\n\n/);
  });
});

describe('미리보기가 글을 끝까지 보여준다', () => {
  const flow = readFileSync(
    join(__dirname, '..', 'renderer', 'modules', 'fullAutoFlow.ts'),
    'utf-8',
  );

  it('마무리와 해시태그 블록이 있다 — 예전에는 소제목에서 끝났다', () => {
    expect(flow).toMatch(/🏁 마무리/);
    expect(flow).toMatch(/🏷️ 해시태그/);
    expect(flow).toMatch(/headerHtml \+ \(integratedHtml \|\| emptyHeadingsHtml\) \+ footerHtml/);
  });

  it('도입부·본문을 잘라내지 않는다 — 잘린 뒤는 검수할 방법이 없다', () => {
    expect(flow).not.toMatch(/introductionText\.substring\(0, 600\)/);
    expect(flow).not.toMatch(/headingContent\.substring\(0, 400\)/);
  });

  it('미리보기 텍스트는 붙여넣기와 같은 함수를 지난다', () => {
    // 화면은 HTML 변형을 쓴다 — 붙여넣기와 같은 buildMobileRichHtml 을 지나므로
    // 표가 마크다운 원문이 아니라 실제 표로 그려진다(사장님 실측 "도입부에 표부터
    // 시작하네...?? 이게 맞니?"). 줄바꿈 계약은 아래 buildPastePreviewText 테스트가 지킨다.
    expect(flow).toMatch(/buildPastePreviewHtml\(introductionText\)/);
    expect(flow).toMatch(/buildPastePreviewHtml\(headingContent\)/);
    expect(flow).toMatch(/buildPastePreviewHtml\(conclusionText\)/);
  });
});

describe('문장이 표 앞에 붙은 줄 (2026-08-26 사장님 실측 화면)', () => {
  const rows = (t: string) => {
    const html = buildPastePreviewHtml(t);
    return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
      [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
        .map((c) => c[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')));
  };

  const INLINE = `이후 별도 "촬영 지원·협찬 없었다"는 공식 입장이 전해졌습니다.| 구분 | MBC 측 입장 |
| --- | --- |
| 의혹 확산 직후 | "확인 중" |
| 이후 공식 입장 | "촬영 지원·협찬 없었다" |`;

  it('앞 문장이 헤더 칸으로 흡수되지 않는다', () => {
    // 실측: 2열 표가 3열이 되고 마지막 열이 통째로 빈 칸으로 발행됐다.
    const r = rows(INLINE);
    expect(r[0]).toEqual(['구분', 'MBC 측 입장']);
    for (const row of r) expect(row.length).toBe(2);
  });

  it('떼어낸 문장은 사라지지 않고 본문에 남는다', () => {
    expect(buildPastePreviewHtml(INLINE)).toMatch(/공식 입장이 전해졌습니다/);
  });

  it('정상 표와 "행 뒤 문장" 케이스는 그대로 동작한다', () => {
    const normal = ['| 구분 | 내용 |', '| --- | --- |', '| 기준일 | 2026년 8월 25일 |'].join('\n');
    expect(rows(normal)[0]).toEqual(['구분', '내용']);
    const trailing = `${normal} 그리고 뒤 문장이 붙었습니다.`;
    expect(rows(trailing)[0]).toEqual(['구분', '내용']);
    expect(buildPastePreviewHtml(trailing)).toMatch(/그리고 뒤 문장이 붙었습니다/);
  });
});

describe('표 폭과 줄바꿈 (2026-08-26 사장님 지적)', () => {
  // "표가 크기가 넓을 필요가 있을까 싶네. 표 내용이 짤린 것도 있구요."
  const TWO_COL = ['| 구분 | 내용 |', '| --- | --- |',
    '| 기준일 | 2026년 8월 25일 |',
    '| 주요 이슈 | SNS 커플 사진 공개 후 팬들의 장난스런 공개 연애 축하 소동 |'].join('\n');
  const THREE_COL = ['| 구분 | MBC 입장 | 시점 |', '| --- | --- | --- |',
    '| 의혹 직후 | "확인 중" | 8월 24일 |'].join('\n');

  const tableStyleOf = (html: string) =>
    (html.match(/<table[^>]*style="([^"]*)"/) || [])[1] || '';

  it('표도 본문과 같은 520px 폭을 지킨다', () => {
    // 문단·목록·소제목은 모두 max-width:520px 인데 표만 빠져 있어 혼자 넓게 퍼졌다.
    const style = tableStyleOf(buildPastePreviewHtml(TWO_COL));
    expect(style).toMatch(/max-width:520px/);
    expect(style).toMatch(/margin:10px auto/);
  });

  it('가장 긴 셀이 열 폭을 흔들지 못하게 고정 레이아웃을 쓴다', () => {
    expect(tableStyleOf(buildPastePreviewHtml(TWO_COL))).toMatch(/table-layout:fixed/);
  });

  it('셀 내용이 잘리지 않고 줄바꿈된다', () => {
    // 고정 레이아웃에서 줄바꿈 속성이 없으면 넘친 글자가 잘려 보인다.
    const html = buildPastePreviewHtml(TWO_COL);
    expect(html).toMatch(/word-break:keep-all/);
    expect(html).toMatch(/overflow-wrap:break-word/);
    expect(html).toMatch(/장난스런 공개 연애 축하 소동/); // 내용이 통째로 살아 있다
  });

  it('두 열이면 라벨 칸을 좁게 잡는다 — 50:50은 내용 칸을 좁힌다', () => {
    const html = buildPastePreviewHtml(TWO_COL);
    expect(html).toMatch(/<colgroup>/);
    expect(html).toMatch(/width:32%/);
    expect(html).toMatch(/width:68%/);
  });

  it('세 열 이상은 균등 분할로 둔다', () => {
    expect(buildPastePreviewHtml(THREE_COL)).not.toMatch(/<colgroup>/);
  });
});

describe('화살표 순서 표기 (2026-08-26 사장님 실측)', () => {
  // 발행본: "1. 탑승 → 2." / "딸의 울음 지속 → 3." — 다음 단계 번호만 앞줄 끝에 매달리고
  // 내용은 아래로 떨어졌다. 게다가 단계마다 문단이 갈려 사이에 빈 문단이 끼었다.
  const CHAIN = '1. 탑승 → 2. 딸의 울음 지속 → 3. 자발적 하기 요청 → 4. 수화물 하역 작업 → 5. 울음 그침 → 6. 재탑승';

  it('번호 뒤 마침표에서 끊지 않는다 — 번호가 줄 끝에 매달리지 않는다', () => {
    for (const line of buildPastePreviewText(CHAIN).split('\n')) {
      expect(line.trim()).not.toMatch(/→\s*\d{1,2}\.$/);
      expect(line.trim()).not.toMatch(/\d{1,2}\.$/);
    }
  });

  it('화살표가 다음 줄 머리에 온다 — 항목이 통째로 읽힌다', () => {
    const lines = buildPastePreviewText(CHAIN).split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).some((l) => l.trim().startsWith('→'))).toBe(true);
  });

  it('순서 전체가 한 문단이다 — 단계마다 빈 문단이 끼지 않는다', () => {
    const html = buildPastePreviewHtml(CHAIN);
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]).toMatch(/탑승/);
    expect(paragraphs[0]).toMatch(/재탑승/);
  });

  it('화살표가 없는 번호 목록은 종전대로 문단을 나눈다', () => {
    const list = '준비물은 이렇습니다. 1. 신분증 2. 통장 사본 3. 도장';
    const html = buildPastePreviewHtml(list);
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    expect(paragraphs.length).toBeGreaterThan(1);
  });

  it('미리보기는 흰 종이 위에 올린다 — 붙여넣기 스타일이 흰 본문을 전제한다', () => {
    expect(buildPastePreviewHtml('아무 문장입니다.')).toMatch(/^<div style="background:#ffffff/);
  });
});

describe('빈 문단은 문단 경계에만 (2026-08-26 사장님 실측)', () => {
  // "빈칸 줄바꿈은 한 번만 해도 되는데 4~5번은 한 것 같네."
  // 예전에는 문장마다 스페이서가 붙어 원본 2문단이 문단 4개 + 빈칸 4개로 나갔다.
  const TWO_PARAS = [
    "'비행기에서 내렸다가 다시 탔다.' 초반에 가장 크게 돈 문장이 이거였어요.",
    '짧고 강해서 여론이 한쪽으로 확 기울었죠. 그런데 이후 공개된 내용은 좀 달랐습니다.',
  ].join('\n\n');

  const spacerCount = (html: string) => (html.match(/data-rich-spacer/g) || []).length;

  it('원본 문단 수만큼만 빈 문단이 생긴다', () => {
    // 문단 2개 → 스페이서 2개(각 문단 끝). 문장 4개마다 붙지 않는다.
    expect(spacerCount(buildPastePreviewHtml(TWO_PARAS))).toBe(2);
  });

  it('한 문단 안의 문장 사이에는 빈 문단을 넣지 않는다', () => {
    const oneParaTwoSentences = '첫 문장입니다. 두 번째 문장도 같은 문단입니다.';
    expect(spacerCount(buildPastePreviewHtml(oneParaTwoSentences))).toBe(1);
  });

  it('문단 끝 표시가 있는 문단에만 빈 문단이 따라붙는다', () => {
    const html = buildPastePreviewHtml(TWO_PARAS);
    const paraEnds = (html.match(/data-rich-para-end="true"/g) || []).length;
    expect(paraEnds).toBe(2);
  });
});
