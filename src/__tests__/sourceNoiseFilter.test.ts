import { describe, it, expect } from 'vitest';
import { stripSourceNoise } from '../content/sourceNoiseFilter';

/**
 * [2026-08-26 사장님 실측] 발행된 글 본문에 이 문장이 들어갔다.
 *   "발행 시각 07:27조회수를 기록한 관련 소식에 따르면, 두 사람은 2014년 6월에…"
 * 원본 기사의 발행 시각·조회수가 재료로 흘러들어가 모델이 사실인 양 엮었다.
 */
describe('기사 껍데기 제거', () => {
  it('실측 사례의 발행 시각·조회수를 걷어낸다', () => {
    const { text } = stripSourceNoise('발행 시각 07:27 조회수 1,234회 를 기록한 관련 소식에 따르면 두 사람은 2014년 6월에 결혼했다.');
    expect(text).not.toMatch(/발행 시각/);
    expect(text).not.toMatch(/조회수 1,234/);
    expect(text).toMatch(/두 사람은 2014년 6월에 결혼했다/);
  });

  it('입력·수정 시각 줄을 지운다', () => {
    const src = ['입력 2026.08.26. 오전 7:27', '수정 2026.08.26. 오전 8:10', '김윤주가 셀카를 공개했다.'].join('\n');
    const { text, removedLines } = stripSourceNoise(src);
    expect(removedLines).toBe(2);
    expect(text).toBe('김윤주가 셀카를 공개했다.');
  });

  it('저작권 고지와 기자 바이라인을 지운다', () => {
    const src = ['홍길동 기자', 'hong@news.com', '본문 내용입니다.', '저작권자 ⓒ 뉴스1 무단 전재 및 재배포 금지'].join('\n');
    const { text } = stripSourceNoise(src);
    expect(text).toBe('본문 내용입니다.');
  });

  it('사진 캡션과 관련기사 유도를 지운다', () => {
    const src = ['[사진=연합뉴스]', '본문입니다.', '▶ 관련기사 더보기'].join('\n');
    expect(stripSourceNoise(src).text).toBe('본문입니다.');
  });

  it('본문 속 날짜·숫자는 지키다 — 지우면 사실을 잃는다', () => {
    const src = '두 사람은 2014년 6월에 결혼해 13년차 부부다. 청약 금리는 2.8%로 올랐고 한도는 25만원이다.';
    expect(stripSourceNoise(src).text).toBe(src);
  });

  it('빈 입력은 그대로', () => {
    expect(stripSourceNoise('').text).toBe('');
    expect(stripSourceNoise(null).removedLines).toBe(0);
  });
});

describe('긴 줄은 통째로 지우지 않는다 (개발 중 실측한 함정)', () => {
  it('껍데기가 앞머리에만 있으면 그 조각만 뺀다', () => {
    const line = '발행 시각 07:27 조회수 1,234회 를 기록한 관련 소식에 따르면 두 사람은 2014년 6월에 결혼했다고 한다.';
    const { text, removedLines } = stripSourceNoise(line);
    expect(removedLines).toBe(0);
    expect(text).toMatch(/두 사람은 2014년 6월에 결혼했다고 한다/);
  });

  it('긴 줄의 저작권 고지는 그 조각만 뺀다 — 줄을 통째로 지우지 않는다', () => {
    // [2026-08-26] 예전에는 이 줄이 통째로 사라지는 것을 단언했다. 그 동작이
    // 라이브에서 기사 한 편을 통째로 날렸다("원본 텍스트가 비어 있습니다").
    // 한 덩어리 본문의 끝에 고지가 붙는 형태와 구분할 방법이 없기 때문이다.
    // 이제 긴 줄에서는 고지 조각만 빼고 나머지는 남긴다.
    const long = '저작권자 ⓒ 뉴스1 무단 전재 및 재배포 금지 — 본 기사는 뉴스1의 사전 동의 없이 어떠한 형태로도 사용할 수 없습니다.';
    const { text } = stripSourceNoise(long);
    expect(text).not.toMatch(/저작권자|무단 전재/);
    expect(text).toMatch(/본 기사는 뉴스1의 사전 동의 없이/);
  });
});

describe('한 덩어리 본문을 통째로 지우지 않는다 (2026-08-26 라이브 회귀)', () => {
  // 사용자 실측: "❌ 오류: 원본 텍스트가 비어 있습니다."
  // 크롤러는 textContent 로 본문을 뽑아 줄바꿈이 거의 없는 한 덩어리를 만든다.
  // 길이 제한 없이 "무단 전재"를 줄 단위로 지우게 뒀더니 기사 한 편이 통째로 날아갔다.
  const ONE_LINE =
    '스타뉴스 김윤주가 권정열과 셀카를 공개했다. 두 사람은 2014년 6월에 결혼했다. '
    + '옥상달빛은 2010년 데뷔했다. <저작권자 ⓒ 스타뉴스, 무단전재 및 재배포 금지>';

  it('저작권 고지만 빠지고 본문은 남는다', () => {
    const { text } = stripSourceNoise(ONE_LINE);
    expect(text).not.toBe('');
    expect(text).toMatch(/2014년 6월에 결혼했다/);
    expect(text).toMatch(/옥상달빛은 2010년 데뷔했다/);
    expect(text).not.toMatch(/저작권자|무단전재|재배포/);
  });

  it('고지 뒤 닫는 괄호가 꼬리로 남지 않는다', () => {
    // 종료어에 "재배포"를 넣으면 non-greedy 가 거기서 멈춰 " 금지>" 가 남았다(실측).
    expect(stripSourceNoise(ONE_LINE).text).not.toMatch(/금지|[>)\]]\s*$/);
  });

  it('괄호형·맨몸형 고지도 같이 걷어낸다', () => {
    for (const notice of [
      '(저작권자 ⓒ 뉴스1 무단전재 및 재배포 금합니다)',
      '무단전재 및 재배포 금지',
    ]) {
      const { text } = stripSourceNoise(`본문입니다. 십센치 권정열이 리더다. ${notice}`);
      expect(text).toMatch(/십센치 권정열이 리더다/);
      expect(text).not.toMatch(/저작권자|무단전재/);
    }
  });

  it('"금지"가 들어간 평범한 문장은 건드리지 않는다', () => {
    const normal = '김윤주와 권정열은 2014년 6월에 결혼했다. 금지된 구역은 아니다.';
    expect(stripSourceNoise(normal).text).toBe(normal);
  });

  it('안전망: 필터가 전부 지우면 원문을 그대로 돌려준다', () => {
    // 어떤 패턴이 새로 잘못 들어와도 기사를 통째로 잃지는 않게 한다.
    const onlyNotice = '무단전재 및 재배포 금지';
    const { text } = stripSourceNoise(onlyNotice);
    expect(text).toBe(onlyNotice);
  });
});

/**
 * [2026-08-27 사장님 실측] 전현무 조작설 글에 박수홍 비행기 지연이 섞여 나왔다.
 *
 *   "2026. 08. 26 06:00조회수 집계가 시작된 스타뉴스 보도 등에서도 다뤄졌듯, …
 *    포털 연예-방송 인기 급상승 뉴스 코너의 01박수홍 비행기 지연 이슈,
 *    02카자흐스탄 정부 발표 논란, 03박수홍 추가 소식 등이 나란히 주목을 받았습니다."
 *
 * 두 가지가 함께 새어 들어왔다.
 *   1. 발행시각+조회수 — "입력/수정" 접두가 없고 조회수 뒤가 숫자가 아니라 기존 규칙이 못 잡았다.
 *   2. 인기순위 위젯 — "01제목 02제목 03제목" 은 뉴스 사이트 사이드바 자국이다. 규칙이 없었다.
 *
 * 지난번 "같은 날 함께 걸린 소식들" 지적과 같은 뿌리인데, 이번엔 줄이 아니라
 * 문장 안에 녹아 있어 줄 단위 삭제로는 닿지 않았다.
 */
describe('뉴스 사이트 위젯 자국', () => {
  it('접두 없는 발행시각+조회수 조각을 걷어낸다', () => {
    const r = stripSourceNoise('2026. 08. 26 06:00조회수 집계가 시작된 스타뉴스 보도에서도 다뤄졌습니다.');
    expect(r.text).not.toContain('06:00');
    expect(r.text).not.toContain('조회수 집계');
    expect(r.text).toContain('스타뉴스 보도에서도 다뤄졌습니다');
  });

  it('인기순위 위젯 나열을 걷어낸다', () => {
    const r = stripSourceNoise(
      '당시 연예계에서는 01박수홍 비행기 지연 이슈, 02카자흐스탄 정부 발표 논란, 03박수홍 추가 소식 등이 주목받았습니다.',
    );
    expect(r.text).not.toContain('01박수홍');
    expect(r.text).not.toContain('02카자흐스탄');
    expect(r.removedFragments).toBeGreaterThan(0);
  });

  it('두 개짜리 나열은 건드리지 않는다 — 위젯이라 단정할 수 없다', () => {
    const text = '경기 결과는 01김철수 승, 02이영희 승으로 갈렸습니다.';
    expect(stripSourceNoise(text).text).toContain('01김철수');
  });

  it('정상 문장의 숫자를 건드리지 않는다', () => {
    const text = '29시간 즉흥 여행이었고 30분 만에 표를 구했습니다. 2026년 8월 26일 기준입니다.';
    expect(stripSourceNoise(text).text).toBe(text);
  });

  it('위젯만 있는 자료를 통째로 비우지 않는다 — 페일오픈', () => {
    const only = '01박수홍 이슈, 02카자흐스탄 논란, 03박수홍 소식';
    expect(stripSourceNoise(only).text.trim().length).toBeGreaterThan(0);
  });
});

describe('위젯 라벨', () => {
  it('항목을 지운 뒤 남는 라벨도 걷어낸다', () => {
    const r = stripSourceNoise('함께 포털 연예-방송 인기 급상승 뉴스 코너의 소식이 걸렸습니다.');
    expect(r.text).not.toContain('인기 급상승 뉴스');
  });

  it('"많이 본 뉴스" / "실시간 인기 뉴스" 도 같다', () => {
    // 문장 안에 있을 때를 본다 — 문자열 전체가 노이즈면 페일오픈이 원본을 지킨다.
    expect(stripSourceNoise('그날 많이 본 뉴스 코너에도 이 소식이 걸렸습니다.').text)
      .not.toContain('많이 본 뉴스');
    expect(stripSourceNoise('실시간 인기 뉴스 섹션에서도 상위에 올랐습니다.').text)
      .not.toContain('실시간 인기 뉴스');
  });

  it('보통 문장의 "뉴스"는 건드리지 않는다', () => {
    const text = '이 뉴스가 전해진 뒤 반응이 갈렸습니다. 관련 뉴스를 찾아봤습니다.';
    expect(stripSourceNoise(text).text).toBe(text);
  });
});
