import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  BUSINESS_PROMO_ANGLES,
  pickNextBusinessAngle,
} from '../renderer/modules/businessAngleRotation';

/**
 * SPEC-STABILITY-2026 — 업체홍보 각도 로테이션.
 * 같은 업체 반복 발행 시 8개 강조 각도를 전부 순환한 뒤에야 반복된다.
 */
describe('업체홍보 각도 로테이션', () => {
  it('각도 풀은 8개이고 id가 유일하다', () => {
    expect(BUSINESS_PROMO_ANGLES).toHaveLength(8);
    expect(new Set(BUSINESS_PROMO_ANGLES.map(a => a.id)).size).toBe(8);
  });

  it('이력이 비면 첫 각도, 이후 8연속 발행에서 8개 전부 소진', () => {
    const history: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const angle = pickNextBusinessAngle(history);
      seen.add(angle.id);
      history.push(angle.id);
    }
    expect(seen.size).toBe(8);
  });

  it('9번째 발행은 다시 첫 각도로 순환한다 (직전 7개와 안 겹침)', () => {
    const history: string[] = [];
    for (let i = 0; i < 8; i++) history.push(pickNextBusinessAngle(history).id);
    const ninth = pickNextBusinessAngle(history);
    expect(history.slice(-7)).not.toContain(ninth.id);
    expect(ninth.id).toBe(history[0]);
  });

  it('fullAutoFlow가 각도를 businessInfo에 배선하고 프롬프트가 소비한다', () => {
    const fa = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'modules', 'fullAutoFlow.ts'), 'utf-8');
    const cg = fs.readFileSync(path.join(process.cwd(), 'src', 'contentGenerator.ts'), 'utf-8');
    const cs = fs.readFileSync(path.join(process.cwd(), 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(fa).toContain('rotateBusinessAngle');
    expect(fa).toContain('promoAngleDirective');
    expect(cg).toContain('이번 글 강조 각도');
    expect(cs).toContain("'businessAngleRotation.js'");
  });
});
