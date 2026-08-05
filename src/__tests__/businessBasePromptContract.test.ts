import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06] 업체(business) base.prompt 신규격 계약.
 *
 * 감사 실측: 세부업종 4파일(construction/local/medical/professional)은 로드 경로가
 * 없는 데드 파일 — 의료·자격사 안전 규율을 base 로 승격했다. 구판의 압력 문구
 * ("위반 시 전체 폐기", 스코어러가 없는 "-30점/항목"), 키워드 밀도 1.5~3% 스터핑
 * 지시, 입력 게이트 없는 예문("현장 방문 상담은 무료입니다")을 제거하고
 * CTA 3회 강제를 근거-후행 동선으로 재설계했다.
 */
describe('business base prompt contract', () => {
  const prompt = readFileSync(new URL('../prompts/business/base.prompt', import.meta.url), 'utf8');

  it('★ 우선 선언 + 입력 충실도 계약', () => {
    expect(prompt).toMatch(/★ \[SECTION -2\] 입력 충실도 계약이 이 파일의 모든 절보다 항상 위다\./);
    expect(prompt).toContain('입력/원본에 없는 숫자 근거는 절대 만들지 않는다');
    expect(prompt).toContain('입력된 값만 사용');
  });

  it('의료 가드 base 승격 (데드 medical.prompt 고유 3항목 + 면책 전문)', () => {
    expect(prompt).toContain('의료광고법');
    expect(prompt).toContain('의원급');
    expect(prompt).toContain('비포/애프터');
    expect(prompt).toContain('한 번에 끝내는');
    expect(prompt).toContain('본 글은 의료광고법에 따라 작성되었으며');
  });

  it('자격사 수치 표방 금지 (professional.prompt 날조 강제의 역전)', () => {
    expect(prompt).toContain('승소율');
    expect(prompt).toContain('입력에 있어도 쓰지 않는다');
    expect(prompt).not.toContain('성공사례 수치, 비밀 보장 약속');
  });

  it('스터핑·허구 페널티·협박·무근거 예문 부활 차단', () => {
    expect(prompt).not.toContain('키워드 밀도');
    expect(prompt).not.toContain('1.5~3%');
    expect(prompt).not.toContain('위반 시 전체 폐기');
    expect(prompt).not.toContain('-30점');
    expect(prompt).not.toContain('현장 방문 상담은 무료');
  });

  it('CTA 동선 재설계 — 도입부 금지 + 3회 강제 폐지 + 재촉 금지', () => {
    expect(prompt).toContain('도입부에는 문의 유도와 연락처를 두지 않는다');
    expect(prompt).not.toContain('최소 3회');
    expect(prompt).toContain('"지금 바로", "오늘만", "서두르세요" 같은 재촉·유인 표현은 쓰지 않는다');
  });

  it('제목 — 노출 우선(지역명 앞쪽) + 공식 조립 폐기', () => {
    // [2026-08-06 사용자 결정] 업체 모드는 노출이 최우선("노출이 되어야 연락이 오고
    // 매출로 이어진다") — 조립부의 지역명 맨앞 배치를 base 가 따르는 방향으로 정합.
    expect(prompt).toMatch(/노출이 문의의 시작/);
    expect(prompt).toMatch(/지역명과 업종을 제목 앞쪽/);
    expect(prompt).not.toContain('제목 패턴');
    expect(prompt).toContain('공식에 맞춰');
    expect(prompt).toContain('조립하지 않는다');
  });

  it('잠금 계약 축자 보존 (contentModePromptContracts·verifyPreviousWork)', () => {
    expect(prompt).toContain('문의/견적/상담 안내');
    expect(prompt).toContain('총 3~6회만 자연 노출');
    expect(prompt).toContain('PASTOR');
    expect(prompt).not.toContain('8~12회');
    expect(prompt).not.toContain('시공 1,200건');
  });

  it('[원본 텍스트] 마커 — 유일 + 문두 (promptSplitter 경계 보존)', () => {
    expect((prompt.match(/\[원본 텍스트\]/g) || []).length).toBe(1);
    expect(prompt).toMatch(/^\[원본 텍스트\] /m);
  });
});

describe('business title prompt — 수치 날조 압력 제거', () => {
  // [2026-08-06 적대검증 적출] 제목 프롬프트가 "구체 숫자 1개 이상 필수 · 숫자 0개면
  // -50"을 강제해, 입력이 빈약한 업체에서 환각 수치 제목("시공 1,200건")을 구조적으로
  // 유도했다 — 본문의 "입력에 없는 숫자 근거 금지" 계약과 정면 충돌.
  const title = readFileSync(new URL('../prompts/title/business/base.prompt', import.meta.url), 'utf8');

  it('숫자 강제·무근거 수치 예시가 없다', () => {
    expect(title).not.toMatch(/구체 숫자 1개 이상!/);
    expect(title).not.toMatch(/구체 숫자 0개\W*\|\s*-50/);
    expect(title).not.toContain('시공 1,200건, 평점 4.9');
  });

  it('수치는 입력 게이트 뒤에서만 허용된다', () => {
    expect(title).toMatch(/입력(된| 자료)?에 (있|실재)/);
    expect(title).toMatch(/입력에 없는 수치/);
  });

  it('MODE VOICE business 의 수치화 의무도 입력 게이트로 반전됐다', () => {
    const loader = readFileSync(new URL('../promptLoader.ts', import.meta.url), 'utf8');
    expect(loader).not.toContain('실적/경력 수치화');
    expect(loader).toContain('입력에 있을 때만 그 값 그대로');
    expect(loader).toContain('입력에 없는 수치 생성');
  });
});
