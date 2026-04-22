/**
 * ✅ [v1.4.77] 쇼핑커넥트 "0원" 누출 방어선 통합 회귀 테스트
 *
 * 20명 에이전트 교차 검증으로 확정된 비상구 4종을 영구 봉쇄한다:
 *   1) sourceAssembler.ts: `?? 0` / `|| '0'` 비상구 제거
 *   2) productSpecCrawler.ts: `price ? ...원 : ''` 삼항이 "0" truthy 통과하던 버그
 *   3) contentGenerator: runPostGenValidator가 price_artifact critical 감지 시 throw
 *   4) textOverlay: 이미지 오버레이 텍스트에 0원 패턴 시 전체 스킵
 *
 * 이 테스트가 FAIL 한다는 것은 "확실히 고쳤다"는 선언이 다시 거짓이 된다는 뜻.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('v1.4.77 — 0원 누출 봉쇄 매트릭스', () => {
  describe('sourceAssembler.ts — 비상구 차단', () => {
    const code = read('sourceAssembler.ts');

    it("priceNum ?? 0 비상구가 제거됨 (metadata에 숫자 0 주입 금지)", () => {
      // `priceNum ?? 0` 패턴이 productInfo 필드에 남아있지 않아야 함
      expect(code).not.toMatch(/price:\s*priceNum\s*\?\?\s*0/);
    });

    it("validateProductInfo 스키마 경유로 priceNum 가드 격상됨 (P1)", () => {
      // P1에서 인라인 가드 → Zod-equivalent 스키마로 승격
      expect(code).toMatch(/validateProductInfo\(\{[\s\S]{0,200}?price:\s*priceNum/);
    });

    it("item.lprice || '0' 폴백이 제거됨 (0 문자열 생성 금지)", () => {
      expect(code).not.toMatch(/lprice:\s*item\.lprice\s*\|\|\s*'0'/);
      expect(code).not.toMatch(/hprice:\s*item\.hprice\s*\|\|\s*'0'/);
    });
  });

  describe('productSpecCrawler.ts — 삼항 truthy 통과 차단', () => {
    const code = read('crawler/productSpecCrawler.ts');

    it("`price ? ...원 : ''` 삼항이 코드에서 제거됨 ('0' truthy 통과 버그)", () => {
      // 4곳 모두 제거됐는지 검증
      expect(code).not.toMatch(/price:\s*price\s*\?\s*`\$\{parseInt\(price\)\.toLocaleString\(\)\}원`\s*:\s*''/);
      expect(code).not.toMatch(/price:\s*price\s*\?\s*`\$\{parseInt\(price\.replace\(\/,\/g,\s*''\)\)\.toLocaleString\(\)\}원`\s*:\s*''/);
    });

    it("parseInt 양수 검증 가드가 존재 (Number.isFinite + n > 0)", () => {
      expect(code).toMatch(/Number\.isFinite\(n\)\s*&&\s*n\s*>\s*0/);
    });
  });

  describe('contentGenerator.ts — 0원 감지 시 blocking throw', () => {
    const code = read('contentGenerator.ts');

    it("ZeroPriceArtifactError 클래스가 export됨", () => {
      expect(code).toMatch(/export class ZeroPriceArtifactError extends Error/);
    });

    it("price_artifact critical 이슈 감지 시 throw", () => {
      // category === 'price_artifact' && severity === 'critical' 감지 후 throw 로직 존재
      expect(code).toMatch(/category === 'price_artifact'[\s\S]{0,200}?throw new ZeroPriceArtifactError/);
    });

    it("runPostGenValidator의 'Never throws' 주석이 제거됨 (동작 변경 반영)", () => {
      // 이전 주석: "Never throws. Never mutates content (validator is pure)."
      expect(code).not.toMatch(/Never throws\. Never mutates content \(validator is pure\)/);
    });
  });

  describe('textOverlay.ts — 이미지 0원 텍스트 오버레이 차단', () => {
    const code = read('image/textOverlay.ts');

    it("addTextOverlay가 0원 패턴 감지 시 오버레이 스킵", () => {
      // /(?:^|[^\d,])0\s*원/ 패턴 검사 후 조기 return
      expect(code).toMatch(/0\\s\*원[\s\S]{0,300}?오버레이 전체 스킵/);
    });

    it("0원 감지 시 원본 이미지를 outputBuffer로 그대로 반환", () => {
      expect(code).toMatch(/success:\s*true,\s*outputBuffer:\s*buf/);
    });
  });

  describe('통합 시나리오: 수학적 비용 환산', () => {
    it("이전 버그: metadata.productInfo.price에 숫자 0 저장되던 경로가 차단됨", () => {
      const code = read('sourceAssembler.ts');
      // 주석 제거 후 실제 코드 라인에서만 검사 (주석 내 "`?? 0` 비상구 제거" 설명 문구는 false positive)
      const stripped = code.replace(/\/\/[^\n]*\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
      const productInfoBlocks = stripped.match(/productInfo:\s*\{[\s\S]{0,500}?price:[^,\n]+/g) || [];
      for (const block of productInfoBlocks) {
        expect(block).not.toMatch(/\?\?\s*0\b/);
      }
    });
  });
});
