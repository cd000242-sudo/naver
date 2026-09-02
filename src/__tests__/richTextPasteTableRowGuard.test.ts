import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml } from '../automation/richTextPaste';
import { normalizeSummaryRows, renderSummaryTable } from '../content/summaryTable';

/**
 * [2026-09-02 사장님 화면 — 닥터웰 발행글] 요약 표 "규격" 행이 셀 1개(폭 100%)로 들어가 1열이 통째로 밀리고
 * 2열이 한 글자 폭으로 눌렸다. 나머지 행(전원·출시연월·KC 인증정보)은 "라벨 ㅡ 값" 문단으로 표 밖에 찍혔다.
 *
 * dist 로 재현: 변환 계층(문단 후처리·옵티마이저·옛 문장분리기) 전부 무관, buildMobileRichHtml 단독으로 재현.
 * 뿌리는 인라인 번호 목록 확장기 — 행 안의 "1. 5kg" 을 목록으로 보고 앞에 빈 줄을 넣어 행을 두 동강 냈다.
 * 표 행은 번호·대시·Q/A 어떤 확장기도 건드리지 않는다.
 */
const ROWS = [
  { label: '구성', value: '(그레이)본체+다리' },
  { label: '모드와 단계', value: '모드 3개, 3단 사용 의견' },
  { label: '규격', value: '210x256x277(mm) / 1. 5kg' },
  { label: '전원', value: '220, 60Hz / 23W' },
  { label: '출시연월', value: '2019년 11월' },
  { label: 'KC 인증정보', value: 'HU071627-18006F, HU072737-20002C / R-REI-DrW-DR-5200, R-R-DrW-DR-5400' },
];

function tableShape(html: string) {
  const tables = (html.match(/<table/g) || []).length;
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  return { tables, cellsPerRow: rows.map((tr) => (tr.match(/<t[dh]/g) || []).length) };
}

describe('표 행은 인라인 목록 확장기에 잘리지 않는다', () => {
  it('실측 표: "1. 5kg" 가 든 규격 행 포함 6행 전부 2셀로 살아남고, 밖으로 새는 행이 없다', () => {
    const text = `${renderSummaryTable(ROWS)}\n\n종아리 압박을 기대했는데 허벅지 쪽이 더 잘 들어갈 수 있다는 구매자 의견이 있어요.`;
    const { html } = buildMobileRichHtml(text);
    expect(tableShape(html)).toEqual({ tables: 1, cellsPerRow: [2, 2, 2, 2, 2, 2, 2] });
    expect(html).not.toMatch(/전원\s*[ㅡ—]\s*220/u);
    expect(html).not.toMatch(/출시연월\s*[ㅡ—]/u);
  });

  it('대시(" - ")·Q/A 마커가 든 행도 그대로다', () => {
    const rows = [
      { label: '주의', value: '세척 - 분리 후 건조 - 직사광선 금지' },
      { label: '문의', value: 'Q. 소음은? A. 거의 없음' },
      { label: '기타', value: '2. 단계부터 3. 단계까지' },
    ];
    const { html } = buildMobileRichHtml(renderSummaryTable(rows));
    expect(tableShape(html)).toEqual({ tables: 1, cellsPerRow: [2, 2, 2, 2] });
  });

  it('표 밖 문단의 인라인 번호 목록은 여전히 펼친다 — 가드는 표 행에만', () => {
    const { html } = buildMobileRichHtml('준비물은 셋입니다. 1. 습도계 2. 타이머 3. 수건');
    expect((html.match(/<p/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('요약 표 값의 소수점 공백은 붙인다', () => {
  it('"1. 5kg" → "1.5kg", "45. 5%" → "45.5%" — 표는 문장을 담지 않는다', () => {
    const rows = normalizeSummaryRows([
      { label: '무게', value: '1. 5kg' },
      { label: '습도', value: '45. 5% 권장' },
      { label: '크기', value: '210x256x277(mm)' },
    ]);
    expect(rows.map((r) => r.value)).toEqual(['1.5kg', '45.5% 권장', '210x256x277(mm)']);
  });
});
