import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

/**
 * [2026-08-27 사장님 실측 2차] 티파니 글에 지예은·김동준·코레일·아이유가 한 소제목으로
 * 통째로 들어왔다. 조각 규칙을 아무리 늘려도 못 막았다 — 원본을 다시 긁어 보니 이유가 나왔다.
 *
 * 스타뉴스 크롤 결과 1,932자, 줄바꿈 0개(한 덩어리). 그중 뒤 640자(전체의 1/3)가
 * 사이드바였다: 브리핑 · 추천 기사 · 인기 급상승 뉴스 · 최신 뉴스 · AD.
 * 모델은 재료를 다 쓰라는 지시를 따라 그 640자로 소제목을 하나 만들었다.
 *
 * 조각을 쫓는 대신 구조를 쓴다 — 저작권 표시가 기사 본문의 끝이다.
 * 그 뒤는 전부 사이트 껍데기다.
 */
describe('본문 뒤 껍데기 잘라내기', () => {
  // 실제 크롤 결과와 같은 규모로 둔다 — 하한(200자)은 앞머리 표지에 본문을 내주지
  // 않기 위한 것이라, 시료가 짧으면 절단 자체가 일어나지 않는다.
  const BODY =
    '그룹 소녀시대 티파니가 유리의 눈웃음에 대해 말했다. 26일 유튜브 채널 효연의 레벨업에는 '
    + '금쪽이들아 화해할래 아니면 나한테 꿀밤 맞을래라는 제목의 영상이 게재됐다. '
    + '공개된 영상에서는 효리수의 불화를 중재하기 위해 나선 티파니의 모습이 그려졌다. '
    + '티파니는 효리수 멤버들에게 "해체할 거였으면 진작 했어야 했고 이미 늦었다"라며 다독였다. '
    + '하지만 수영은 "해체할 거였으면 나갈 사람은 나다"라고 말했고, 효연은 "나는 이미 나갔다"라며 맞섰다. '
    + '티파니는 소녀시대의 합숙 시절을 살려 응원봉을 준비했고 "쌓이면 안 된다. '
    + '쌓여서 무대에 올라가지 말자가 우리의 약간 그 주제였다"라고 설명했다. '
    + '유리는 "내가 티파니의 눈웃음 띄워준 건데 몰랐다"라며 천연덕스러운 모습을 보였다. '
    // 절단 하한(400자)을 넘겨야 검사가 돈다 — 실제 기사는 1,000자를 넘는다.
    + '티파니는 "뭔가 다른 인상이 생길 것 같아서 걱정됐다"라고 토로했다. '
    + '효리수 멤버들은 티파니의 말에 각자 다른 반응을 보이며 대립을 이어갔다. '
    + '이날 방송에서는 소녀시대 데뷔 초의 대화 방식이 여러 차례 언급됐다. '
    + '티파니는 쌓인 감정을 무대까지 가져가지 말자는 것이 팀의 원칙이었다고 설명했다.';
  const TAIL =
    '<저작권자 © 스타뉴스, 무단전재 및 재배포 금지>브리핑티파니는 오분 토크를 언급했다.'
    + '추천 기사지예은, ♥바타와 결혼까지?.."책임 못 질거면 왜 만나"[미우새]'
    + '김동준, 제아 재결합 언급 "좋은 기회 있다면" [윤주모]'
    + '최진실 기자기자홈좋아요연예-방송의 인기 급상승 뉴스'
    + '01박수홍, 딸 울어서 내렸다가 재탑승[스타이슈]02카자흐스탄 정부가 거짓말?[스타이슈]'
    + '연예-방송의 최신 뉴스"누나보다 돈 많이 벌고파"...아이유, 남동생 소원에이슈 보러가기AD';

  it('저작권 표시 뒤의 사이드바를 통째로 걷어낸다', () => {
    const r = stripSourceNoise(BODY + TAIL);
    expect(r.text).toContain('티파니가 유리의 눈웃음');
    expect(r.text).not.toContain('지예은');
    expect(r.text).not.toContain('01박수홍');
    expect(r.text).not.toContain('아이유');
    expect(r.text).not.toContain('이슈 보러가기');
  });

  it('본문은 한 글자도 잃지 않는다', () => {
    expect(stripSourceNoise(BODY + TAIL).text.trim()).toBe(BODY.trim());
  });

  it('저작권 표시가 없으면 다른 껍데기 표지를 쓴다', () => {
    const r = stripSourceNoise(`${BODY}추천 기사지예은, 결혼까지?김동준, 제아 재결합 언급`);
    expect(r.text).not.toContain('지예은');
    expect(r.text).toContain('티파니가 유리의 눈웃음');
  });

  it('앞머리에 표지가 오면 자르지 않는다 — 본문을 통째로 잃는다', () => {
    const early = `<저작권자 © 스타뉴스, 무단전재 및 재배포 금지>${BODY}`;
    const r = stripSourceNoise(early);
    expect(r.text).toContain('티파니가 유리의 눈웃음');
    expect(r.text.length).toBeGreaterThan(BODY.length * 0.9);
  });

  it('표지가 없는 자료는 그대로 둔다', () => {
    expect(stripSourceNoise(BODY).text.trim()).toBe(BODY.trim());
  });
});

/**
 * [2026-08-27] 꼬리를 자르고 남은 앞머리 껍데기.
 *   "…[레벨업]발행 : 2026.08.26 ・ 22:55조회수 :최진실 기자Google 검색 선호 출처로 추가"
 * 생성된 글에 "22:55조회수 집계와 함께"로 새어 나온 자리다. 기존 규칙은 조회수 뒤에
 * 숫자를 기대해 콜론만 붙은 이 형태를 놓쳤다.
 */
describe('기사 앞머리 껍데기', () => {
  const HEAD = '발행 : 2026.08.26 ・ 22:55조회수 :최진실 기자Google 검색 선호 출처로 추가';
  const BODY = '그룹 소녀시대 티파니가 유리의 눈웃음에 대해 말했다. '.repeat(8);

  it('발행시각을 걷어낸다', () => {
    expect(stripSourceNoise(HEAD + BODY).text).not.toContain('22:55');
    expect(stripSourceNoise(HEAD + BODY).text).not.toContain('2026.08.26');
  });

  it('숫자 없는 조회수 라벨도 걷어낸다', () => {
    expect(stripSourceNoise(HEAD + BODY).text).not.toContain('조회수');
  });

  it('검색 출처 안내 문구를 걷어낸다', () => {
    expect(stripSourceNoise(HEAD + BODY).text).not.toContain('Google 검색 선호 출처');
  });

  it('본문은 그대로 남는다', () => {
    expect(stripSourceNoise(HEAD + BODY).text).toContain('티파니가 유리의 눈웃음에 대해 말했다');
  });

  it('본문 속 정상 시각 표기는 건드리지 않는다', () => {
    const text = `${BODY}오후 10시 55분에 공개됐습니다.`;
    expect(stripSourceNoise(text).text).toContain('10시 55분');
  });
});

/**
 * [2026-08-27 사장님 지적] "그냥 26일 해버리면 이슈성이니 상관은 없다만 월이 빠져도 되는 거니?"
 *
 * 맞는 지적이고, 원인은 내가 만들었다. 기사 본문은 "26일 유튜브 채널에는…" 처럼 일만
 * 적는다 — 발행일이 머리에 있으니 독자가 달을 안다. 그 발행일이 앞머리 껍데기
 * ("발행 : 2026.08.26 ・ 22:55조회수 :") 안에 있었는데, 껍데기를 지우면서 연·월까지
 * 함께 날렸다. 요약 표의 "기준일" 은 "자료에 있는 날짜" 를 쓰므로 26일밖에 못 쓴다.
 *
 * 껍데기의 형식은 지우되 날짜라는 사실은 남긴다 — 한국어 표기로 바꿔 제자리에 둔다.
 */
describe('발행일은 지우지 않고 살린다', () => {
  const BODY = ' 그룹 소녀시대 티파니가 26일 공개된 영상에서 눈웃음에 대해 말했다. '.repeat(6);

  it('연·월·일이 남는다', () => {
    const { text } = stripSourceNoise(`발행 : 2026.08.26 ・ 22:55조회수 :${BODY}`);
    expect(text).toContain('2026년 8월 26일');
  });

  it('시각과 조회수 라벨은 사라진다', () => {
    const { text } = stripSourceNoise(`발행 : 2026.08.26 ・ 22:55조회수 :${BODY}`);
    expect(text).not.toContain('22:55');
    expect(text).not.toContain('조회수');
    expect(text).not.toContain('발행 :');
  });

  it('입력·수정 표기도 같은 규칙을 받는다', () => {
    expect(stripSourceNoise(`입력 : 2026.08.26 ・ 07:27${BODY}`).text).toContain('2026년 8월 26일');
  });

  it('본문 속 날짜 표현은 건드리지 않는다', () => {
    const text = '두 사람은 2014년 6월에 결혼했다. 2026.08.26 기준 자료다.';
    expect(stripSourceNoise(text).text).toBe(text);
  });
});

/**
 * [2026-08-27 회귀 — 내가 만든 것] 껍데기를 잘라놓고 버리던 버그.
 *
 * 네이트 기사 실측 로그:
 *   [SourceNoise] 본문 뒤 사이트 껍데기 3028자 절단
 *   [ContentGenerator] rawText=5327자        ← 자르기 전 크기 그대로
 *
 * 호출부는 removedLines/removedFragments 가 0보다 클 때만 정리된 텍스트를 쓴다.
 * 꼬리 절단은 두 카운터를 하나도 올리지 않으므로, 3,028자를 잘라내고도 조건이
 * 거짓이 되어 원문이 그대로 넘어갔다. 광고 CSS·관련기사 목록·반응 수치가
 * 본문에 그대로 실린 이유다.
 *
 * 결과가 원문과 다르면 무언가 지운 것이다 — 카운터가 아니라 그 사실을 알려야 한다.
 */
describe('잘라낸 결과가 버려지지 않는다', () => {
  const BODY = '배우 하영의 소속사가 입장을 밝혔다. 넷플릭스는 후속편 논의 중이라고 전했다. '.repeat(12);
  const TAIL = '<저작권자 © 뉴스, 무단전재 및 재배포 금지>관련기사 로제의 사진 지수의 인터뷰 한보름 기사 비비 기사';

  it('꼬리만 잘라도 절단량을 보고한다', () => {
    const r = stripSourceNoise(BODY + TAIL);
    expect(r.removedTailChars).toBeGreaterThan(0);
  });

  it('무언가 지웠으면 changed 가 참이다 — 호출부가 이걸 본다', () => {
    expect(stripSourceNoise(BODY + TAIL).changed).toBe(true);
  });

  it('지운 게 없으면 changed 가 거짓이다', () => {
    expect(stripSourceNoise(BODY).changed).toBe(false);
  });

  it('꼬리 절단 결과가 실제로 반영된다', () => {
    const r = stripSourceNoise(BODY + TAIL);
    expect(r.text).not.toContain('관련기사');
    expect(r.text.length).toBeLessThan((BODY + TAIL).length);
  });
});

describe('호출부가 결과를 쓴다', () => {
  it('카운터가 아니라 changed 로 판단한다', () => {
    const src = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf-8');
    const codeOnly = src.split('\n')
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
      .join('\n');
    expect(codeOnly).not.toMatch(/sourceNoise\.removedLines > 0 \|\| sourceNoise\.removedFragments > 0/);
    expect(codeOnly).toMatch(/sourceNoise\.changed/);
  });
});

/**
 * [2026-08-27 사장님 실측 3차 — 네이트] 광고 CSS 와 감정 위젯 수치가 본문에 실렸다.
 *
 *   "코드에는 width:300px, left:0px, height:18px 같은 표시값이 들어가 있고,
 *    광고 상태가 unfilled일 때의 문구도 보이는데요."
 *   "최고예요 9, 훈훈해요 5, 어이없어요 107, 속상해요 0, 화나요 882"
 *
 * 크롤 결과 구조를 보니 두 가지가 겹쳤다.
 *   1. 본문이 전체의 43%였다. 절단 하한이 40%라 아슬아슬하게 통과했다가, 크롤 길이가
 *      조금 흔들리는 날엔 못 넘겨 껍데기가 통째로 남았다.
 *   2. 광고 CSS 는 본문 **중간**에 끼어 있어 꼬리 절단이 닿지 않는다.
 *
 * 한국어 기사에서 한글 없이 중괄호·세미콜론이 이어지는 구간은 본문이 아니다.
 */
describe('코드 조각 제거', () => {
  const BODY = '배우 하영의 소속사가 입장을 밝혔다. 넷플릭스는 후속편을 논의 중이라고 전했다. '.repeat(10);

  it('광고 CSS 블록을 걷어낸다', () => {
    const css = 'div.news_view div.view_cont #ad_innerView {margin:0 auto;} #ad_innerView{width:320px;height:auto;text-align:center;}';
    const { text } = stripSourceNoise(`${BODY}${css}${BODY}`);
    expect(text).not.toContain('width:320px');
    expect(text).not.toContain('ad_innerView');
    expect(text).toContain('넷플릭스는 후속편을 논의 중');
  });

  it('자바스크립트 조각을 걷어낸다', () => {
    const js = 'jQuery("#md-emotion-view .md-emotion").css({ "pointer-events": "none" });';
    expect(stripSourceNoise(`${BODY}${js}`).text).not.toContain('jQuery');
  });

  it('영문 인용은 건드리지 않는다 — 코드가 아니다', () => {
    const text = `${BODY}신부는 "Love youuuu"라는 댓글을 남겼다.`;
    expect(stripSourceNoise(text).text).toContain('Love youuuu');
  });

  it('이메일·URL 은 건드리지 않는다', () => {
    const text = `${BODY}문의는 elnino8919@osen.co.kr 로 하면 된다.`;
    expect(stripSourceNoise(text).text).toContain('elnino8919@osen.co.kr');
  });
});

describe('감정 반응 위젯', () => {
  const BODY = '배우 하영의 소속사가 입장을 밝혔다. 넷플릭스는 후속편을 논의 중이라고 전했다. '.repeat(10);

  it('붙어 나온 반응 수치를 걷어낸다', () => {
    const { text } = stripSourceNoise(`${BODY}최고예요9훈훈해요5어이없어요107속상해요0화나요883`);
    expect(text).not.toContain('화나요');
    expect(text).not.toContain('어이없어요');
  });

  it('본문 속 "화나요" 같은 말은 건드리지 않는다', () => {
    const text = `${BODY}팬들은 화나요라고 말하지 않았다.`;
    expect(stripSourceNoise(text).text).toContain('화나요라고');
  });
});

describe('본문이 절반이 안 되는 페이지도 자른다', () => {
  it('본문 43%짜리(네이트 실측 비율)를 자른다', () => {
    const body = '배우 하영과 넷플릭스가 후속편을 논의 중이라고 전했다. '.repeat(20); // 약 560자
    const chrome = '[관련기사]☞ 장동윤 결혼한다 ☞ 유깻잎 근황 ☞ 로제 사진 ☞ 한보름 비키니 '.repeat(12);
    const r = stripSourceNoise(body + chrome);
    expect(r.removedTailChars).toBeGreaterThan(0);
    expect(r.text).not.toContain('장동윤');
    expect(r.text).toContain('넷플릭스가 후속편을 논의');
  });

  it('앞머리에 표지가 오면 여전히 자르지 않는다', () => {
    const body = '배우 하영과 넷플릭스가 후속편을 논의 중이라고 전했다. '.repeat(20);
    const r = stripSourceNoise(`관련기사 안내${body}`);
    expect(r.text).toContain('넷플릭스가 후속편을 논의');
  });
});
