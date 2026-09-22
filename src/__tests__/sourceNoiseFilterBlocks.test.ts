import { describe, it, expect, vi, afterEach } from 'vitest';

import { stripSourceNoise, stripSourceNoiseFromBody } from '../content/sourceNoiseFilter';

/**
 * [2026-09-22 감사 실측] SUPPLEMENT_BOUNDARY 가 옛 표제("=== 상위 노출 글 본문 발췌")만
 * 알아서, 실제 묶음("=== 사실 자료 ===" ... "[자료 N — 제목]" ... "=== 검색 결과
 * 스니펫 ===")을 하나의 덩어리로 봤다. cutTrailingChrome 이 첫 자료의 "관련 기사"를
 * 찾아 그 뒤 자료 2~8을 통째로 날렸다(29,099자 → 7,992자). 이 파일은 자료마다 따로
 * 잘리는지, 다른 자료가 살아남는지를 확인한다.
 */

function buildDoc(num: number, title: string, body: string): string {
  return `[자료 ${num} — ${title}]\n${body}`;
}

function buildBundle(docs: string[], opts: { snippet?: string | false } = {}): string {
  const header = '=== 사실 자료 (수치·조건·절차는 이 범위에서만 사용) ===\n'
    + '※ 이 묶음의 이름과 번호표는 내부 표기다. 본문에 옮겨 적지 마라.\n'
    + '※ 대괄호 안의 글 제목은 다른 사람이 쓴 글의 이름이다.';
  const snippet = opts.snippet === false
    ? ''
    : `\n\n=== 검색 결과 스니펫 (맥락 참고용) ===\n${opts.snippet ?? '【관련 스니펫】 짧은 요약 텍스트입니다.'}`;
  return `${header}\n${docs.join('\n\n')}${snippet}`;
}

describe('묶음 자료 — 자료마다 따로 자른다', () => {
  it('5개 자료 중 하나에만 있는 꼬리 껍데기만 걷어내고 5개 다 남긴다', () => {
    const realContent1 = '국토교통부는 청약통장 금리를 인상한다고 밝혔다. '.repeat(20);
    const chrome1 = '<저작권자 ⓒ 연합뉴스, 무단전재 및 재배포 금지>관련 기사 목록이 이어졌습니다. '.repeat(6);
    const doc1 = buildDoc(1, '청약통장 금리 인상', realContent1 + chrome1);
    const doc2 = buildDoc(2, '청약통장 가입 조건', '만 19세 이상 무주택 세대주가 대상이다. '.repeat(10));
    const doc3 = buildDoc(3, '청약통장 한도', '월 최대 25만원까지 인정된다. '.repeat(10));
    const doc4 = buildDoc(4, '청약통장 신청 방법', '은행 창구나 앱에서 신청할 수 있다. '.repeat(10));
    const doc5 = buildDoc(5, '청약통장 해지 안내', '중도 해지 시 불이익이 있을 수 있다. '.repeat(10));

    const bundle = buildBundle([doc1, doc2, doc3, doc4, doc5]);
    const result = stripSourceNoise(bundle);

    expect(result.documents?.total).toBe(5);
    expect(result.documents?.kept).toBe(5);

    // 자료 1의 진짜 본문은 남고 껍데기만 사라진다.
    expect(result.text).toContain('국토교통부는 청약통장 금리를 인상한다고 밝혔다');
    expect(result.text).not.toContain('저작권자');
    expect(result.text).not.toContain('무단전재');
    expect(result.text).not.toContain('관련 기사');

    // 자료 2~5는 온전히 남는다 — 이전 버그는 이 넷을 통째로 날렸다.
    expect(result.text).toContain('만 19세 이상 무주택 세대주가 대상이다');
    expect(result.text).toContain('월 최대 25만원까지 인정된다');
    expect(result.text).toContain('은행 창구나 앱에서 신청할 수 있다');
    expect(result.text).toContain('중도 해지 시 불이익이 있을 수 있다');

    // 안내문·표제도 그대로 남아 있어야 한다.
    expect(result.text).toContain('=== 사실 자료');
    expect(result.text).toContain('=== 검색 결과 스니펫');
  });

  it('29,000자 규모 8개 자료 묶음 — 첫 자료 꼬리만 잘리고 전체 90% 이상 남는다', () => {
    const realUnit = '실제 기사 본문 문장입니다. ';
    const makeReal = (targetChars: number): string => realUnit.repeat(Math.ceil(targetChars / realUnit.length));

    const doc1Real = makeReal(4500);
    const chrome1 = '<저작권자 ⓒ 연합뉴스, 무단전재 및 재배포 금지>인기 급상승 뉴스 목록이 이어졌습니다. '.repeat(15);
    const docs = [buildDoc(1, '자료 1', doc1Real + chrome1)];
    for (let i = 2; i <= 8; i += 1) {
      docs.push(buildDoc(i, `자료 ${i}`, makeReal(3400)));
    }
    const bundle = buildBundle(docs);
    expect(bundle.length).toBeGreaterThan(25000); // ~29,000자 규모임을 확인

    const result = stripSourceNoise(bundle);

    expect(result.documents?.total).toBe(8);
    expect(result.text.length).toBeGreaterThanOrEqual(bundle.length * 0.9);
    expect(result.text).not.toContain('저작권자');
    expect(result.text).not.toContain('인기 급상승 뉴스');
  });
});

describe('stripSourceNoiseFromBody — 자료 하나 단위 정리', () => {
  it('문장 속에 섞인 "무단 전재" 조각만 지운다 — 문장 전체를 지우지 않는다', () => {
    const body = '배우 하영의 소속사가 입장을 밝혔다. 무단 전재 및 재배포 금지라는 문구가 기사 하단에 있었다고 전했다.';
    const { text } = stripSourceNoiseFromBody(body);
    expect(text).not.toMatch(/무단\s*전재/);
    expect(text).toContain('배우 하영의 소속사가 입장을 밝혔다');
    expect(text).toContain('라는 문구가 기사 하단에 있었다고 전했다');
  });

  it('꼬리 절단이 본문의 60%를 넘으면 절단을 건너뛴다', () => {
    const real = '실제 발표 내용을 전한다. '.repeat(35); // >= 400자
    const chrome = '관련 기사 목록이 계속 이어졌습니다. '.repeat(60); // 실제 내용보다 훨씬 크다
    expect(chrome.length / (real.length + chrome.length)).toBeGreaterThan(0.6); // 전제 확인

    const body = real + chrome;
    const { text, removedTailChars } = stripSourceNoiseFromBody(body);

    expect(removedTailChars).toBe(0);
    expect(text).toBe(body.trim());
    expect(text).toContain('관련 기사 목록이 계속 이어졌습니다'); // 절단이 아예 안 걸렸다
  });

  it('꼬리 절단이 60% 이하면 평소대로 자른다', () => {
    const real = '실제 발표 내용을 전한다. '.repeat(35);
    const chrome = '관련 기사 목록이 이어졌습니다. '.repeat(10);
    expect(chrome.length / (real.length + chrome.length)).toBeLessThan(0.6); // 전제 확인

    const body = real + chrome;
    const { text, removedTailChars } = stripSourceNoiseFromBody(body);

    expect(removedTailChars).toBeGreaterThan(0);
    expect(text).not.toContain('관련 기사 목록이 이어졌습니다');
    expect(text).toContain('실제 발표 내용을 전한다');
  });
});

describe('레거시(묶음 아닌) 텍스트는 예전과 같이 정리된다', () => {
  it('"[자료 N" 표제가 없는 일반 텍스트는 block-aware 경로를 타지 않는다', () => {
    const src = ['입력 2026.08.26. 오전 7:27', '김윤주가 셀카를 공개했다.'].join('\n');
    const result = stripSourceNoise(src);
    expect(result.documents).toBeUndefined();
    expect(result.text).toBe('김윤주가 셀카를 공개했다.');
  });
});

describe('로그 한 줄 — removed_ratio 와 경고 등급', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('30~50% 구간은 WARNING, 50% 초과는 QUALITY_GATE_WEAK 를 접두한다', () => {
    // A large real body keeps the fixed preamble/header overhead a small
    // fraction of the total, so the per-document cut ratio and the
    // whole-bundle removed_ratio stay close together — that leaves enough
    // margin to target a bundle-level band without brushing the per-doc 60%
    // skip cap.
    const realUnit = '기사 본문 문장입니다. ';
    const real = realUnit.repeat(100);
    expect(real.length).toBeGreaterThanOrEqual(400);

    const chromeUnit = '<저작권자 ⓒ 매체, 무단전재 및 재배포 금지>관련 기사 목록이 이어졌다. ';
    const chromeOfDocRatio = (targetDocRatio: number): string => {
      const targetLen = Math.round((targetDocRatio * real.length) / (1 - targetDocRatio));
      const reps = Math.max(1, Math.round(targetLen / chromeUnit.length));
      return chromeUnit.repeat(reps);
    };

    const runAndGetSummaryLine = (bundle: string): string => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      stripSourceNoise(bundle);
      const line = logSpy.mock.calls
        .map((call) => String(call[0]))
        .find((entry) => entry.includes('docs=') && entry.includes('removed_ratio='));
      logSpy.mockRestore();
      expect(line).toBeTruthy();
      return line as string;
    };

    // WARNING band: doc-level chrome ratio ~40%, comfortably under the 60% skip cap.
    const warningBundle = buildBundle([buildDoc(1, '자료', real + chromeOfDocRatio(0.40))], { snippet: false });
    const warningLine = runAndGetSummaryLine(warningBundle);
    const warningRatio = Number(warningLine.match(/removed_ratio=([\d.]+)%/)?.[1]);
    expect(warningRatio).toBeGreaterThan(30);
    expect(warningRatio).toBeLessThanOrEqual(50);
    expect(warningLine).toContain('WARNING');
    expect(warningLine).not.toContain('QUALITY_GATE_WEAK');

    // QUALITY_GATE_WEAK band: doc-level chrome ratio ~55%, still under the 60% skip cap.
    const severeBundle = buildBundle([buildDoc(1, '자료', real + chromeOfDocRatio(0.55))], { snippet: false });
    const severeLine = runAndGetSummaryLine(severeBundle);
    const severeRatio = Number(severeLine.match(/removed_ratio=([\d.]+)%/)?.[1]);
    expect(severeRatio).toBeGreaterThan(50);
    expect(severeLine).toContain('QUALITY_GATE_WEAK');
  });
});
