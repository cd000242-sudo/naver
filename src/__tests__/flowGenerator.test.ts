/**
 * ✅ [v1.4.80] Flow (Nano Banana Pro) 이미지 엔진 회귀 방지
 *
 * 검증:
 *   - flowGenerator.ts가 ImageFX 세션을 공유하는 패턴으로 구현됨
 *   - labs.google/flow 접속 + 자동 API 학습 메커니즘
 *   - imageGenerator 라우팅에 'flow' 분기 추가
 *   - UI 드롭다운에 옵션 추가
 *   - 가격 테이블에 'flow-nano-banana-pro' = 0 등록
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('v1.4.80 — Flow (Nano Banana Pro) 이미지 엔진', () => {
  describe('flowGenerator.ts 구현', () => {
    const code = read('image/flowGenerator.ts');

    it('labs.google/flow 접속 경로 존재', () => {
      expect(code).toMatch(/labs\.google\/flow/);
    });

    it('generateWithFlow export (일괄 생성)', () => {
      expect(code).toMatch(/export async function generateWithFlow/);
    });

    it('generateSingleImageWithFlow export (단일 생성)', () => {
      expect(code).toMatch(/export async function generateSingleImageWithFlow/);
    });

    it('testFlowConnection export (UI 연결 테스트)', () => {
      expect(code).toMatch(/export async function testFlowConnection/);
    });

    it('자동 API 학습 메커니즘 (discoverAndCacheApi)', () => {
      expect(code).toMatch(/discoverAndCacheApi/);
      expect(code).toMatch(/CANDIDATE_ENDPOINTS/);
      expect(code).toMatch(/CANDIDATE_MODEL_NAMES/);
    });

    it('메타데이터 파일 저장/로드 (캐시)', () => {
      expect(code).toMatch(/saveApiMetadata/);
      expect(code).toMatch(/loadApiMetadata/);
      expect(code).toMatch(/FLOW_API_CACHE_FILE/);
    });

    it('세션 엔드포인트 후보 (ImageFX 호환 /fx/api/auth/session)', () => {
      expect(code).toMatch(/\/fx\/api\/auth\/session/);
    });

    it('쿼터 초과(429) 처리', () => {
      expect(code).toMatch(/HTTP_429[\s\S]{0,200}?쿼터 초과/);
    });

    it('안전 필터(FLOW_SAFETY_BLOCK) 처리', () => {
      expect(code).toMatch(/FLOW_SAFETY_BLOCK/);
    });

    it('메타 무효 시 자동 재학습 (세션당 1회 제한)', () => {
      // ✅ [v1.4.80 P1] 재학습 로직 존재 + 세션당 1회 제한 명시
      expect(code).toMatch(/unlinkSync\(getCachePath\(\)\)/);
      expect(code).toMatch(/_discoveryAttemptedThisSession/);
    });

    it('이미지 비용 0 기록 (무료)', () => {
      expect(code).toMatch(/costOverride:\s*0/);
    });
  });

  describe('imageGenerator 라우팅', () => {
    const code = read('imageGenerator.ts');

    it("'flow' 프로바이더 import", () => {
      expect(code).toMatch(/import\s*\{\s*generateWithFlow\s*\}\s*from\s*['"]\.\/image\/flowGenerator/);
    });

    it("normalizedProvider === 'flow' 분기", () => {
      expect(code).toMatch(/normalizedProvider\s*===\s*'flow'/);
    });

    it('Flow 에러 FLOW_ 접두사 분류 메시지', () => {
      expect(code).toMatch(/rawMsg\.startsWith\('FLOW_'\)/);
    });
  });

  describe('IPC + Preload 브리지', () => {
    const ipc = read('main/ipc/imageHandlers.ts');
    const preload = read('preload.ts');

    it("IPC 'flow:testConnection' 핸들러", () => {
      expect(ipc).toMatch(/safeHandle\('flow:testConnection'/);
    });

    it('preload testFlowConnection 노출', () => {
      expect(preload).toMatch(/testFlowConnection:/);
      expect(preload).toMatch(/'flow:testConnection'/);
    });
  });

  describe('UI — 드롭다운 옵션', () => {
    const html = fs.readFileSync(path.resolve(ROOT, '../public/index.html'), 'utf-8');

    it("option value='flow' 존재 (이미지 엔진 드롭다운)", () => {
      expect(html).toMatch(/<option value="flow"[^>]*>[\s\S]{0,200}?Flow/);
    });

    it('Nano Banana Pro 라벨 포함', () => {
      expect(html).toMatch(/Nano Banana Pro/);
    });
  });

  describe('가격 테이블 — Flow 무료 엔진', () => {
    const code = read('apiUsageTracker.ts');

    it("'flow-nano-banana-pro' = 0 (무료)", () => {
      expect(code).toMatch(/'flow-nano-banana-pro':\s*0/);
    });

    it("'imagen-3.5-imagefx' = 0 (ImageFX도 무료 유지)", () => {
      expect(code).toMatch(/'imagen-3\.5-imagefx':\s*0/);
    });
  });
});
