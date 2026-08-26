import { describe, it, expect } from 'vitest';
import { buildSourceFactChecklist } from '../content/sourceFactChecklist';
import { toFactToken, extractKoreanFactTokens } from '../content/koreanFactTokens';

/**
 * [2026-08-26 사장님 실측] URL 모드 글의 핵심 fact 보존율이 17%였다.
 * 지시는 있었다 — "원본의 모든 사실을 빠짐없이 포함하라". 4만 자 프롬프트 맨 앞의
 * 산문 한 줄이었고 모델은 흘렸다. 이 세션에서 해시태그·요약 표에서 확인한 것과 같은
 * 패턴이라(산문은 흘리고 구조화된 목록은 채운다) 목록으로 바꿨다.
 */
const ARTICLE = `옥상달빛 김윤주가 남편 십센치(10CM) 권정열과의 셀카를 공개했다.
김윤주는 8월 25일 자신의 인스타그램에 "꽤 친함"이라는 짧은 글과 함께 사진을 올렸다.
이를 본 네티즌들은 "공개 연애 축하한다"는 댓글을 남겼다.
김윤주는 8월 26일 "공개 연애 축하해 주셔서 감사합니다"라는 글을 남겼다.
두 사람은 2014년 결혼해 올해 13년 차 부부다. 권정열과 김윤주는 인디 음악계 대표 부부다.
옥상달빛은 2010년 데뷔한 여성 듀오로 김윤주와 박세진으로 구성됐다.
십센치는 2010년 '아메리카노'로 데뷔했으며 권정열이 리더를 맡고 있다. 박세진도 활동 중이다.
`.repeat(3);

describe('원본 사실 체크리스트', () => {
  const { facts, block } = buildSourceFactChecklist(ARTICLE);

  it('세 글자 인명을 모두 잡는다 — 예전 규칙은 통째로 놓쳤다', () => {
    // 이전: [가-힣]{4,12} 2회 이상 → "김윤주는"(조사째) 하나만 잡고 나머지 전멸.
    for (const name of ['김윤주', '권정열', '박세진']) {
      expect(facts).toContain(name);
    }
  });

  it('그룹·제품명도 잡는다', () => {
    for (const name of ['옥상달빛', '십센치', '아메리카노', '인스타그램', '10CM']) {
      expect(facts).toContain(name);
    }
  });

  it('날짜와 인용문을 원문 그대로 담는다', () => {
    expect(facts).toContain('8월');
    expect(facts).toContain('2014년');
    expect(facts.join(' ')).toMatch(/꽤 친함/);
    expect(facts.join(' ')).toMatch(/공개 연애 축하한다/);
  });

  it('조사 조각과 동사 활용형을 담지 않는다', () => {
    for (const junk of ['김윤주는', '권정열과', '글과', '글을', '이를', '남겼', '공개했', '주셔서', '구성됐', '듀오로']) {
      expect(facts).not.toContain(junk);
    }
  });

  it('지명·명사를 잃지 않는다', () => {
    for (const w of ['서울', '부산', '제주', '대구', '바다', '고기']) {
      expect(toFactToken(w)).toBe(w);
    }
  });

  it('두 글자 + 조사 끝소리는 버린다 — 의도한 맞교환', () => {
    // "글과"·"글을"·"이를" 같은 조각을 막으려고 두 글자 토큰의 조사 끝소리를 막았다.
    // 그 대가로 "사이"·"나이"처럼 진짜 단어도 몇 개 잃는다. 원본에서 지켜야 할
    // 핵심 사실로서의 가치가 낮아 받아들인 손실이다. 세 글자 이상은 영향받지 않는다.
    expect(toFactToken('글과')).toBeNull();
    expect(toFactToken('사이')).toBeNull();
    expect(toFactToken('사이값')).toBe('사이값');
  });

  it('지시가 아니라 목록으로 준다 — 분량이 아니라 목록 완료가 기준임을 밝힌다', () => {
    expect(block).toMatch(/반드시 본문에 들어가야 할 원본 사실/);
    expect(block).toMatch(/분량이 아니라/);
    expect(block).toMatch(/원문 그대로/);
    expect(block).toMatch(/1\. /);
  });

  it('원본이 짧으면 목록을 만들지 않는다 (검증기와 같은 500자 기준)', () => {
    expect(buildSourceFactChecklist('짧은 원문').facts).toHaveLength(0);
    expect(buildSourceFactChecklist('짧은 원문').block).toBe('');
  });

  it('한 번만 스친 말은 담지 않는다 — 그 글의 뼈대가 아니다', () => {
    const once = `${'가나다라마바사아자차카타파하'.repeat(40)} 일회용어치 `;
    expect(extractKoreanFactTokens(once, 10)).not.toContain('일회용어치');
  });
});
