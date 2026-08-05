import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { detectBusinessIndustry } from '../content/businessIndustryDetector';

/**
 * [2026-08-06 사용자 승인] 업종 자동 감지 — "초반에 필드에 작성하는 걸 추론하면 답이
 * 나오잖아". 감사에서 데드 파일로 확정된 업종 4파일(construction/local/medical/
 * professional)을 업체 정보·키워드 텍스트 기반 감지로 배선한다.
 * 안전 원칙: 명시 키워드 매칭만 — 감지 실패 시 null(업종 보정 미적용, base 만).
 */
describe('detectBusinessIndustry', () => {
  it('의료: 병원·의원·치과·피부과 계열', () => {
    expect(detectBusinessIndustry('강남 화이트치과 임플란트')).toBe('medical');
    expect(detectBusinessIndustry('연세정형외과의원')).toBe('medical');
    expect(detectBusinessIndustry('맑은숨 한의원 다이어트 한약')).toBe('medical');
  });

  it('시공: 인테리어·리모델링·설비 계열', () => {
    expect(detectBusinessIndustry('30평 아파트 인테리어 리모델링')).toBe('construction');
    expect(detectBusinessIndustry('누수 방수 공사 전문')).toBe('construction');
  });

  it('전문직: 변호사·세무·노무 계열', () => {
    expect(detectBusinessIndustry('이혼 전문 변호사 상담')).toBe('professional');
    expect(detectBusinessIndustry('종합소득세 세무사 기장')).toBe('professional');
  });

  it('우선순위: 의료 > 전문직 > 시공 (혼합 텍스트)', () => {
    expect(detectBusinessIndustry('병원 인테리어 시공')).toBe('medical');
  });

  it('지역 매장: 카페·미용실·학원 계열은 local', () => {
    expect(detectBusinessIndustry('동네 카페 신메뉴 소개')).toBe('local');
    expect(detectBusinessIndustry('역삼동 필라테스 신규 회원')).toBe('local');
  });

  it('감지 실패 시 null (업종 보정 미적용 — 날조 방지)', () => {
    expect(detectBusinessIndustry('프리미엄 멤버십 온라인 오픈 이벤트')).toBe(null);
    expect(detectBusinessIndustry('')).toBe(null);
    expect(detectBusinessIndustry(undefined as unknown as string)).toBe(null);
  });
});

describe('업종 감지 배선 (소스 계약)', () => {
  it('contentGenerator 가 business 모드에서 업종 오버레이를 주입한다', () => {
    const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
    expect(generator).toMatch(/detectBusinessIndustry/);
    expect(generator).toMatch(/business\/\$\{[^}]+\}\.prompt/);
  });
});

describe('업종 4파일 신규격 (base 승격분과 중복 없는 보정)', () => {
  const read = (name: string): string =>
    readFileSync(new URL(`../prompts/business/${name}.prompt`, import.meta.url), 'utf8');

  it('medical: 잠금 문구 유지 + 압력 문구 제거 + base [MEDICAL] 우선 선언', () => {
    const p = read('medical');
    expect(p).toContain('의료광고법 56조');
    expect(p).toContain('환자 후기/체험담');
    expect(p).toContain('절대 금지');
    expect(p).toMatch(/base[\s\S]{0,60}\[MEDICAL\][\s\S]{0,60}(우선|위다)/);
    expect(p).not.toMatch(/-\d+점/);
    expect(p).not.toContain('위반 시 전체 폐기');
  });

  it('construction: 잠금 문구 유지 + 비용 입력 게이트', () => {
    const p = read('construction');
    expect(p).toContain('평수별');
    expect(p).toContain('A/S');
    expect(p).toMatch(/입력에 (있을 때만|실재)/);
    expect(p).not.toMatch(/-\d+점/);
  });

  it('professional: 승소율 날조 강제의 역전 유지', () => {
    const p = read('professional');
    expect(p).toMatch(/승소율[\s\S]{0,80}(쓰지 않는다|금지)/);
    expect(p).not.toMatch(/성공 사례 수치.*필수|성공사례 수치.*포함/);
    expect(p).not.toMatch(/비밀 보장 100%[\s\S]{0,40}(권장|포함)/);
  });

  it('local: 지역 노출 우선 + 입력 게이트', () => {
    const p = read('local');
    expect(p).toMatch(/지역명/);
    expect(p).toMatch(/입력에 (있을 때만|실재|적힌)/);
    expect(p).not.toMatch(/-\d+점/);
  });

  it('4파일 전부 분량 대역(10~30행)·변환 의무 부재', () => {
    for (const name of ['medical', 'construction', 'professional', 'local']) {
      const p = read(name);
      const lines = p.split('\n').length;
      expect(lines, `${name} 행수`).toBeGreaterThanOrEqual(10);
      expect(lines, `${name} 행수`).toBeLessThanOrEqual(30);
      expect(p).not.toMatch(/없으면[^\n]*(로 안내한다|로 대체한다|로 채운다|채워 넣는다)/);
    }
  });
});
