// [2026-11-07 사장님] "AI 이미지로 반자동 발행하니까 이미지에 AI 활용 체크가 안 되어 있네요".
// LDB(크롬 확장)에서 가져온 AI 이미지는 provider 'ldb-image-ultra' 로 들어오는데(src/renderer/modules/ldbDraftImport.ts) 이 이름이
// AI 엔진 허용목록에 없어서 "불명 이미지"로 마크가 건너뛰어졌다. 수집(실사진)은 provider 'collected' + isCollected 로 바뀌므로 오탐이 없어야 한다.
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  aiMarkAttrValue,
  isAiGeneratedImage,
  recordImageProvenance,
  readImageProvenance,
  resolveAiMarkTarget,
} from '../automation/imageProvenance';

const ROOT = path.resolve(__dirname, '..', '..');
const readSrc = (rel: string): string => fs.readFileSync(path.join(ROOT, 'src', rel), 'utf-8');

describe('LDB 가져온 AI 이미지의 AI 활용 마크 판정', () => {
  it("provider 'ldb-image-ultra'(수집 표시 없음)는 AI 생성 이미지로 판정한다", () => {
    expect(isAiGeneratedImage({ provider: 'ldb-image-ultra' })).toBe(true);
    expect(aiMarkAttrValue({ provider: 'ldb-image-ultra' })).toBe('1');
  });

  it('LDB 수집(실사진)은 가져올 때 collected + isCollected 로 바뀌어 AI 로 판정되지 않는다', () => {
    expect(isAiGeneratedImage({ provider: 'collected', isCollected: true })).toBe(false);
    // 혹시 provider 가 그대로 ldb-image-ultra 여도 isCollected 가 먼저 본다 — 실사진 오탐은 최악의 실패
    expect(isAiGeneratedImage({ provider: 'ldb-image-ultra', isCollected: true })).toBe(false);
  });

  it('장부(삽입 단계가 기록)와 마크 대상 판정이 같은 결론을 낸다', () => {
    const host: Record<string, unknown> = {};
    recordImageProvenance(host, 0, { provider: 'ldb-image-ultra' });
    recordImageProvenance(host, 1, { provider: 'ldb-image-ultra', isCollected: true });
    const aiLedger = readImageProvenance(host, 0);
    const photoLedger = readImageProvenance(host, 1);
    expect(aiLedger?.ai).toBe('1');
    expect(photoLedger?.ai).toBe('0');
    expect(resolveAiMarkTarget({ aiMarkAllImages: false, ledger: aiLedger, attrAi: '', attrProvider: '' })).toBe(true);
    expect(resolveAiMarkTarget({ aiMarkAllImages: false, ledger: photoLedger, attrAi: '', attrProvider: '' })).toBe(false);
  });

  it('카드의 "AI 활용: 끔" 선택은 여전히 이긴다(사용자가 끈 이미지는 마크하지 않는다)', () => {
    const host: Record<string, unknown> = {};
    recordImageProvenance(host, 0, { provider: 'ldb-image-ultra', aiMarkOverride: 'off' });
    expect(resolveAiMarkTarget({ aiMarkAllImages: false, ledger: readImageProvenance(host, 0), attrAi: '', attrProvider: '' })).toBe(false);
  });

  it("pollinations(나노 바나나 별칭)도 AI 엔진으로 본다", () => {
    expect(isAiGeneratedImage({ provider: 'pollinations' })).toBe(true);
  });

  it('LDB 가져오기가 실제로 provider ldb-image-ultra 를 붙이고, 수집은 isCollected 로 덮는다(소스 잠금)', () => {
    const src = readSrc('renderer/modules/ldbDraftImport.ts');
    expect(src).toMatch(/provider: 'ldb-image-ultra', \.\.\.attribution/);
    expect(src).toMatch(/Object\.assign\(result, \{ provider: 'collected', isCollected: true/);
  });
});
