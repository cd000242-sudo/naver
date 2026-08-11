/**
 * 날조 검사 — 글에만 있고 자료에는 없는 수치·고유명사.
 *
 * 배경(2026-08-12): 기존 검사는 누락(sourceFidelityCheck)과 감정 뒤집힘
 * (checkHallucination)만 봤다. LLM 이 없던 금액을 하나 만들어 넣으면 둘 다 통과한다.
 * 사용자 지적: "AI 통해서 없는 내용 지어내고 내용도 부실하면 비웃고 지나가버리지"
 *
 * 이 검사의 생사는 오탐에 달려 있다 — "3가지 방법"을 날조라고 부르는 순간 아무도 안 본다.
 * 그래서 탐지 테스트만큼 비탐지 테스트를 촘촘히 둔다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkFabrication, extractVerifiableClaims } from '../content/fabricationCheck';

/** 대조가 켜지려면 자료가 200자를 넘어야 한다 */
const pad = (text: string) => text + ' '.repeat(0) + '　'.repeat(0) + '이 문단은 자료 길이를 채우기 위한 배경 설명이다. '.repeat(12);

describe('지어낸 사실 탐지', () => {
  it('자료에 없는 금액을 잡는다', () => {
    const source = pad('지원 사업 안내문이다. 대상은 만 39세 이하 청년이며 신청은 온라인으로 받는다.');
    const body = '지원금은 최대 500만원까지 받을 수 있습니다.';
    const result = checkFabrication(source, body);
    expect(result.checked).toBe(true);
    expect(result.findings.map(f => f.claim)).toContain('500만원');
    expect(result.warnings[0]).toContain('자료에 없는 금액');
  });

  it('자료에 없는 날짜를 잡는다', () => {
    const source = pad('접수는 예산 소진 시까지 진행한다는 안내만 있다.');
    const result = checkFabrication(source, '신청 마감은 3월 31일입니다.');
    expect(result.findings.map(f => f.claim)).toContain('3월 31일');
  });

  it('자료에 없는 비율과 인원을 잡는다', () => {
    const source = pad('사업 개요만 담긴 안내문이다.');
    const result = checkFabrication(source, '만족도가 92% 였고 1,200명이 참여했습니다.');
    const claims = result.findings.map(f => f.claim);
    expect(claims).toContain('92%');
    expect(claims).toContain('1,200명');
  });

  it('지어낸 기관명을 잡는다 — 고유명사는 바로 들통난다', () => {
    const source = pad('시청 홈페이지에서 접수한다고만 적혀 있다.');
    const result = checkFabrication(source, '자세한 내용은 청년창업진흥원에서 확인하세요.');
    expect(result.findings.some(f => f.kind === 'org')).toBe(true);
  });
});

describe('오탐 방어 — 이게 무너지면 검사 자체가 무용지물', () => {
  const source = pad('안내문에는 신청 방법과 대상만 적혀 있다.');

  it('서수·개수는 자료에 없어도 정상이다', () => {
    const result = checkFabrication(source, '준비물은 3가지입니다. 두 번째로 신분증을 챙기세요. 1단계부터 시작합니다.');
    expect(result.findings).toHaveLength(0);
  });

  it('일반적인 기간 표현은 정상이다', () => {
    const result = checkFabrication(source, '처리에는 3일 정도 걸립니다. 하루면 끝나기도 합니다. 일주일 안에 연락이 옵니다.');
    expect(result.findings).toHaveLength(0);
  });

  it('자료에 있는 수치는 표기가 달라도 잡지 않는다', () => {
    const withNumbers = pad('지원금은 1,200만원이며 신청 마감은 3월 31일이다. 선정 인원은 50명이다.');
    const result = checkFabrication(withNumbers, '지원금 1200만원, 마감 3월 31일, 총 50명을 뽑습니다.');
    expect(result.findings).toHaveLength(0);
  });

  it('자료가 너무 짧으면 대조하지 않는다 — 키워드만 넣은 생성', () => {
    const result = checkFabrication('부산 청년 지원', '지원금은 500만원입니다.');
    expect(result.checked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('추출 규칙', () => {
  it('같은 주장을 여러 번 써도 한 번만 센다', () => {
    const claims = extractVerifiableClaims('500만원을 받습니다. 그 500만원은 분할 지급됩니다.');
    expect(claims.filter(c => c.claim.includes('500만')).length).toBe(1);
  });

  it('종류를 구분해 붙인다 — 경고 문구가 뭉뚱그려지지 않게', () => {
    const kinds = new Set(extractVerifiableClaims('500만원, 30%, 3월 31일, 50명').map(c => c.kind));
    expect(kinds).toEqual(new Set(['money', 'percent', 'date', 'people']));
  });

  it('빈 입력에서 터지지 않는다', () => {
    expect(extractVerifiableClaims('')).toEqual([]);
    expect(checkFabrication('', '')).toMatchObject({ checked: false, findings: [] });
  });
});

describe('발행을 막지 않는다 — 이 모듈은 측정만 한다', () => {
  it('차단 신호를 내보내지 않는다', () => {
    const result = checkFabrication(pad('안내문'), '지원금 500만원');
    // passed / blocked / isCritical 같은 차단용 필드를 두지 않는다.
    expect(Object.keys(result).sort()).toEqual(['checked', 'findings', 'totalClaims', 'warnings']);
  });
});

/**
 * 배선 — 파이프라인에 붙었지만 흐름을 바꾸지 않는지.
 * 사용자 조건: "너가 만졌다고 회귀되거나 차단되면 안 돼"
 */
describe('파이프라인 배선', () => {
  const generator = readFileSync(
    join(__dirname, '..', 'contentGenerator.ts'), 'utf8',
  );

  it('생성 파이프라인이 날조 검사를 호출한다', () => {
    expect(generator).toContain("require('./content/fabricationCheck')");
    expect(generator).toContain('checkFabrication');
  });

  it('경고만 쌓고 발행 흐름을 건드리지 않는다', () => {
    const block = generator.slice(
      generator.indexOf('[Fabrication]') - 700,
      generator.indexOf('[Fabrication] 검사 모듈 로드 실패') + 120,
    );
    expect(block).toContain('quality');
    expect(block).toContain('warnings');
    // 차단·재시도·예외를 유발하는 표현이 이 블록에 없어야 한다
    expect(block).not.toMatch(/throw |return false|_hallucinationFail|retryInstruction/);
  });

  it('검사 모듈이 터져도 생성이 멈추지 않는다', () => {
    expect(generator).toContain('[Fabrication] 검사 모듈 로드 실패');
  });
});
