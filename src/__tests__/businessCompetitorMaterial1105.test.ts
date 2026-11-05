/**
 * [2026-11-05] 업체 홍보 12편 비교 — 입력이 빈약한 글에 경쟁 업체 이름·사례가 들어갔다
 * (고깃집: 화포식당 · 텍사스로드하우스 · 섬고짚구 504시간, 욕실: 다른 업체의 행사 글 · 현장 기록).
 *
 * Root cause: the keyword-mode fact checklist ("[수집 자료에서 지켜야 할 사실 30개] … 이 목록을 다
 * 다뤘는지로 판단") was prepended in business mode too, so the model was told to cover numbers that
 * belonged to other businesses. Business facts come from the business info form; collected material
 * is general background only.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKeywordFactChecklist } from '../content/sourceFactChecklist';

const SRC = path.join(__dirname, '..');
const material = [
  '화포식당 송도본점은 3cm 두께의 한돈 숙성 삼겹살을 로봇이 굽는다. 삼겹살 8인분을 3분 만에 굽는다고 밝혔다.',
  '섬고짚구는 504시간 숙성 제주 오겹살을 소개했다. 1인당 3만~4만원대에서 식사가 가능하다.',
  '2026년 11월 12일부터 네이버 지도 음식점에 AI 질문창이 생긴다. 2026년 11월 12일 적용 예정.',
].join('\n').repeat(6);

describe('keyword fact checklist is not attached in business mode', () => {
  it('still builds the checklist for other keyword modes (control)', () => {
    const result = buildKeywordFactChecklist(material);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.block).toContain('[수집 자료에서 지켜야 할 사실');
  });

  it('returns no checklist for business mode', () => {
    const result = buildKeywordFactChecklist(material, undefined, { contentMode: 'business' });
    expect(result.block).toBe('');
    expect(result.facts).toEqual([]);
  });

  it('contentGenerator passes the content mode to the checklist builder', () => {
    const source = readFileSync(path.join(SRC, 'contentGenerator.ts'), 'utf8');
    expect(source).toMatch(
      /buildKeywordFactChecklist\(\(source as any\)\.rawText,\s*undefined,\s*\{\s*contentMode:\s*\(source as any\)\.contentMode\s*\}\)/u,
    );
  });
});

describe('business prompt keeps other businesses out of the post', () => {
  const prompt = readFileSync(path.join(SRC, 'prompts', 'business', 'base.prompt'), 'utf8');
  const fidelity = prompt.slice(prompt.indexOf('[SECTION -2]'), prompt.indexOf('[AD-RULES]'));
  const finalCheck = prompt.slice(prompt.indexOf('[FINAL CHECK]'));

  it('input-fidelity section forbids other businesses names, prices and cases from collected material', () => {
    expect(fidelity).toContain('다른 업체·매장의 상호');
    expect(fidelity).toMatch(/가격·메뉴·이벤트·후기·시공 사례는 쓰지 않는다/u);
    expect(fidelity).toContain('이 글에 나오는 업체는 입력된 업체 하나뿐이다');
  });

  it('final check asks for it before output', () => {
    expect(finalCheck).toMatch(/입력된 업체 말고 다른 업체·매장 이름/u);
  });

  it('stays LF-only (baseline manifest file)', () => {
    expect(readFileSync(path.join(SRC, 'prompts', 'business', 'base.prompt')).includes(0x0d)).toBe(false);
  });
});
