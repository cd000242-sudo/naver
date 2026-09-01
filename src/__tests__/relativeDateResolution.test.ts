import { describe, expect, it } from 'vitest';

import { annotateRelativeDates } from '../content/relativeDateResolution';
import { withFreshnessLabel } from '../content/sourceFreshness';

/**
 * [2026-09-02] 자료의 상대 날짜를 모델이 복원하지 못해 그대로 실려 나갔다.
 *
 *   침구  자료 "2025 구스&울 페어 … 오는 17일부터"
 *         본문 "오는 17일부터 … 열리는 행사로 안내됐습니다"
 *         → 1년 전에 끝난 행사를 지금 열리는 것처럼 안내했다.
 *   베란다 자료 "지난 5일 오후 3시를 기점으로 화재 위험경보 상향"
 *         본문 그대로. 어느 달의 5일인지 알 수 없다.
 *
 * 두 장치가 이미 있었고 둘 다 통했어야 했다:
 *   sourceFreshness   자료마다 "[2026-03-06 작성]" 라벨을 붙인다
 *   dateBasis 스키마  "상대 표현을 그대로 옮기지 마라"(2026-09-02 추가)
 * 모델은 두 숫자를 다 갖고도 산수를 하지 않는다. 날짜 계산은 모델의 약점이다.
 *
 * 그래서 계산을 우리가 한다. 원문은 남기고 절대 날짜를 괄호로 덧붙인다 —
 * 통째로 바꾸면 우리 해석이 틀렸을 때 문장을 망가뜨린다.
 */

describe('실측 두 건', () => {
  it('침구: 지난해 행사의 "오는 17일" 이 그해 날짜로 풀린다', () => {
    const out = annotateRelativeDates(
      '2025 구스&울 페어는 오는 17일부터 다음 달 9일까지 전점에서 열립니다.',
      '2025-10-14',
    );
    expect(out).toContain('오는 17일(2025년 10월 17일)');
    expect(out).toContain('다음 달(2025년 11월)');
  });

  it('베란다: "지난 5일" 이 달까지 갖춘 날짜가 된다', () => {
    const out = annotateRelativeDates(
      '지난 5일 오후 3시를 기점으로 화재 위험경보가 심각으로 상향됐습니다.',
      '2026-03-06',
    );
    expect(out).toContain('지난 5일(2026년 3월 5일)');
  });
});

describe('달 경계', () => {
  it('지난 N일이 발행일보다 뒤면 저번 달로 간다', () => {
    expect(annotateRelativeDates('지난 28일에 마감됐습니다.', '2026-03-02'))
      .toContain('지난 28일(2026년 2월 28일)');
  });

  it('오는 N일이 발행일보다 앞이면 다음 달로 간다', () => {
    expect(annotateRelativeDates('오는 3일부터 재개됩니다.', '2026-03-05'))
      .toContain('오는 3일(2026년 4월 3일)');
  });

  it('해를 넘어도 맞는다', () => {
    expect(annotateRelativeDates('지난 30일에 있었습니다.', '2026-01-05'))
      .toContain('지난 30일(2025년 12월 30일)');
    expect(annotateRelativeDates('오는 2일에 시작합니다.', '2025-12-28'))
      .toContain('오는 2일(2026년 1월 2일)');
  });

  it('건너뛴 달을 지나 찾아간다 — 3월 1일의 "지난 31일" 은 2월이 아니라 1월이다', () => {
    expect(annotateRelativeDates('지난 31일 기준입니다.', '2026-03-01'))
      .toBe('지난 31일(2026년 1월 31일) 기준입니다.');
  });
});

describe('건드리면 안 되는 것', () => {
  it('발행일이 없으면 원문 그대로 — 틀린 주석은 없느니만 못하다', () => {
    const text = '오는 17일부터 시작됩니다.';
    expect(annotateRelativeDates(text, '')).toBe(text);
    expect(annotateRelativeDates(text, '알 수 없음')).toBe(text);
  });

  it('이미 괄호가 붙어 있으면 두 번 붙이지 않는다', () => {
    const text = '지난 5일(2026년 3월 5일) 상향됐습니다.';
    expect(annotateRelativeDates(text, '2026-03-06')).toBe(text);
  });

  it('상대 표현이 아닌 날짜는 놔둔다', () => {
    const text = '2026년 3월 5일에 상향됐습니다. 5일간 유지됩니다.';
    expect(annotateRelativeDates(text, '2026-03-06')).toBe(text);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(annotateRelativeDates('', '2026-03-06')).toBe('');
    expect(() => annotateRelativeDates(undefined as never, '2026-03-06')).not.toThrow();
  });
});

describe('배선: 두 수집 경로가 함께 고쳐진다', () => {
  /*
   * withFreshnessLabel 안에서 처리한다. sourceAssembler 의 호출처가 둘이라
   * (스니펫 :1615, 전문 :1765) 한쪽만 고치면 다른 쪽이 남는다 —
   * 지식iN 질의 좁힘에서 똑같이 겪었다.
   */
  const NOW = new Date('2026-09-02T12:00:00Z');

  it('라벨과 함께 상대 날짜도 풀린다', () => {
    const out = withFreshnessLabel('지난 5일에 상향됐습니다.', '2026-03-06', NOW);
    expect(out).toContain('2026-03-06 작성');
    expect(out).toContain('지난 5일(2026년 3월 5일)');
  });

  it('날짜가 없으면 라벨도 주석도 없이 원문 그대로다', () => {
    expect(withFreshnessLabel('오는 17일부터', '', NOW)).toBe('오는 17일부터');
  });
});
