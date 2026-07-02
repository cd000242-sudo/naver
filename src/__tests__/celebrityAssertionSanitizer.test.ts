/**
 * celebrityAssertionSanitizer.test.ts
 *
 * SPEC-DEFAMATION-2026 P0 — 실존인물 미확인 단정 가드.
 * 법률 리서치 결론(완화 무효 → 차단)에 맞춰 '탐지→danger 플래그'를 검증하고,
 * 오탐 방지(극중/무죄확정/일반 단정/위험명사 없음)를 .toBe(false)로 잠근다.
 */
import { describe, it, expect } from 'vitest';
import {
  isRiskyAssertionSentence,
  detectCelebrityAssertionRisk,
  isCelebrityContext,
  isCelebrityFactGuardEnabled,
  buildCelebrityFactGuardBlock,
} from '../content/celebrityAssertionSanitizer';

describe('실존인물 미확인 단정 탐지 (차단 게이트)', () => {
  it('위험명사 + 단정어미가 같은 문장이면 위험으로 탐지한다', () => {
    expect(isRiskyAssertionSentence('결국 그가 학폭을 저질렀다는 게 드러났다')).toBe(true);
    expect(isRiskyAssertionSentence('두 사람의 열애가 사실로 확인됐다')).toBe(true);
    expect(isRiskyAssertionSentence('탈세를 한 것으로 드러났다')).toBe(true);
  });

  // [검토 M3] 전언/유죄확정 종결형 — 기존 렉시콘이 14개 중 13개 놓치던 것 확장 잠금
  it('전언·유죄확정 종결형도 탐지한다 (전해졌다/구속/시인/인정/포착)', () => {
    expect(isRiskyAssertionSentence('그가 마약을 했다는 사실이 뒤늦게 전해졌다')).toBe(true);
    expect(isRiskyAssertionSentence('학폭 가해자였던 것으로 전해졌다')).toBe(true);
    expect(isRiskyAssertionSentence('두 사람의 열애가 포착됐다')).toBe(true);
    expect(isRiskyAssertionSentence('탈세 혐의가 인정됐다')).toBe(true);
    expect(isRiskyAssertionSentence('사기 혐의로 구속됐다')).toBe(true);
    expect(isRiskyAssertionSentence('폭행을 시인했다')).toBe(true);
    expect(isRiskyAssertionSentence('불륜을 인정했다')).toBe(true);
  });

  // [검토 M1] 정상 정보글/해명/확정사실 오탐 차단 — 검토가 실측 재현한 11건 계열
  it('오탐 방지 — 정책/정보 주제어(사기예방법·특별법·처벌기준·예방교육)는 미탐지', () => {
    expect(isRiskyAssertionSentence('전세사기 특별법 통과가 확정됐다')).toBe(false);
    expect(isRiskyAssertionSentence('음주운전 처벌 기준이 강화된 것으로 드러났다')).toBe(false);
    expect(isRiskyAssertionSentence('학폭 예방 교육이 의무화된 것으로 밝혀졌다')).toBe(false);
    expect(isRiskyAssertionSentence('보이스피싱 사기 예방법이 새로 나온 것으로 드러났다')).toBe(false);
    expect(isRiskyAssertionSentence('비위생적인 조리 환경이 드러났다')).toBe(false); // 비위⊂비위생 부분매칭 제거
  });

  it('오탐 방지 — 해명/무죄/공식확정(명예 보호·확정사실)은 미탐지', () => {
    expect(isRiskyAssertionSentence('해당 폭행 사건은 사실무근으로 드러났다')).toBe(false);
    expect(isRiskyAssertionSentence('갑질 의혹은 오해였던 것으로 드러났다')).toBe(false);
    expect(isRiskyAssertionSentence('학폭 논란은 거짓으로 드러났다')).toBe(false);
    expect(isRiskyAssertionSentence('음주운전으로 벌금형이 확정됐다')).toBe(false); // 판결 확정
    expect(isRiskyAssertionSentence('소속사가 열애를 공식 인정했다')).toBe(false); // 공식 인정
  });

  it('오탐 방지 — 사기 士氣(morale)/일반 확정은 미탐지', () => {
    expect(isRiskyAssertionSentence('선수들의 사기가 높아진 것으로 드러났다')).toBe(false);
    expect(isRiskyAssertionSentence('이적이 확정됐다')).toBe(false);
  });

  // [검토 M4] 제목 스캔 + 인접문장 분할 회피
  it('제목(selectedTitle)의 위험 단정을 잡고, 두 문장으로 쪼갠 회피도 잡는다', () => {
    expect(detectCelebrityAssertionRisk({ selectedTitle: 'OO, 결국 마약을 한 것으로 드러났다' }).risky).toBe(true);
    expect(detectCelebrityAssertionRisk({ viralHooks: ['충격, 학폭을 저질렀다는 게 드러났다'] }).risky).toBe(true);
    // 문장분할 회피: 위험명사와 단정어미를 인접 문장으로 나눔 → 슬라이딩 윈도우로 포착
    expect(detectCelebrityAssertionRisk({ bodyPlain: '그의 마약 사실. 결국 모두 드러났다.' }).risky).toBe(true);
  });

  it('오탐 방지 — 극중/픽션 문맥은 위험명사+단정이 있어도 제외', () => {
    expect(isRiskyAssertionSentence('드라마 극중에서 불륜을 저질렀다')).toBe(false);
    expect(isRiskyAssertionSentence('영화에서 마약 중독자를 연기했다')).toBe(false);
  });

  it('오탐 방지 — 위험명사 없는 일반 단정은 불변(무죄확정/일정 등)', () => {
    expect(isRiskyAssertionSentence('재판에서 무죄가 확정됐다')).toBe(false);
    expect(isRiskyAssertionSentence('콘서트 일정이 확정됐다')).toBe(false);
    expect(isRiskyAssertionSentence('티켓 예매가 사실로 확인됐다')).toBe(false);
  });

  it('오탐 방지 — 위험명사만 있고 단정어미 없으면(의혹 제기 등) 미탐지', () => {
    // P0는 최악의 '단정'만 danger로 잡는다. 의혹 제기 톤은 프롬프트 억제가 담당.
    expect(isRiskyAssertionSentence('학폭 의혹이 제기됐으나 확인되지 않았다')).toBe(false);
  });

  it('detectCelebrityAssertionRisk — heading.content의 위험 단정을 잡고, bodyHtml은 스캔 제외', () => {
    const risky = detectCelebrityAssertionRisk({
      headings: [{ title: '결국 남는 질문', content: '그가 마약을 한 것으로 드러났다.' }],
    });
    expect(risky.risky).toBe(true);
    expect(risky.samples.length).toBeGreaterThan(0);

    // bodyHtml에만 위험이 있으면 스캔 대상 아님(HTML/URL 파괴 방지) → 미탐지
    const htmlOnly = detectCelebrityAssertionRisk({
      bodyHtml: '<p>그가 불륜을 저질렀다는 게 드러났다</p>',
    });
    expect(htmlOnly.risky).toBe(false);

    // 깨끗한 콘텐츠는 미탐지
    const clean = detectCelebrityAssertionRisk({
      headings: [{ title: '신곡 발매 소식', content: '이번 앨범이 공식 발표됐다.' }],
    });
    expect(clean.risky).toBe(false);
  });

  it('게이트/플래그 — homefeed·연예 컨텍스트만 발동, 일반은 제외', () => {
    expect(isCelebrityContext({ contentMode: 'homefeed' })).toBe(true);
    expect(isCelebrityContext({ categoryHint: '연예' })).toBe(true);
    expect(isCelebrityContext({ categoryHint: '스포츠' })).toBe(true); // 스포츠 확장
    expect(isCelebrityContext({ categoryHint: '맛집' })).toBe(false);
    expect(isCelebrityContext(undefined)).toBe(false);
    expect(isCelebrityFactGuardEnabled()).toBe(true); // 기본 ON
  });

  it('프롬프트 블록은 "완화 금지·아예 빼기"를 명시한다(법률 리서치 반영)', () => {
    const block = buildCelebrityFactGuardBlock();
    expect(block).toContain('완화하지 말고');
    expect(block).toContain('허위조작정보법');
    expect(block).toContain('극중');
  });
});
