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
