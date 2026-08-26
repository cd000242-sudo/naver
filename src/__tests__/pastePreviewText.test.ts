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
