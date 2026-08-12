/**
 * 제미나이 3티어 배선 회귀 (2026-08-12 실측 사고)
 *
 * 사고: v2.11.186 에서 백엔드 상수만 3.6 으로 올리고 화면 목록을 안 고쳤다.
 *   · public/index.html 에 gemini-3.6-flash 항목이 없어 **고를 수가 없었다**
 *   · resolveTextModelProfile 은 Lite 가 아니면 전부 'balanced' 였고 표시 이름이
 *     'Gemini 3.5 Flash' 로 고정이라, 3.6 을 골라도 화면에 3.5 로 보였다
 *   사용자: "뭐야 제미나이 모델 안바꼇는데?"
 *
 * 그래서 이 테스트는 상수만이 아니라 **고를 수 있는지**를 본다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEMINI_TEXT_MODELS, resolveTextModelProfile } from '../runtime/modelRegistry';

const root = join(__dirname, '..', '..');
const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');

/** name="primaryGeminiTextModel" 라디오로 실제 선택 가능한 값 */
function selectableModelValues(): string[] {
  const radios = html.match(/name="primaryGeminiTextModel"[^>]*?value="([^"]+)"/gu) || [];
  const inline = html.match(/value="([^"]+)"[^>]*?name="primaryGeminiTextModel"/gu) || [];
  const values = [...radios, ...inline]
    .map(tag => /value="([^"]+)"/u.exec(tag)?.[1] || '')
    .filter(Boolean);
  return [...new Set(values)];
}

describe('제미나이 3티어가 화면에서 선택 가능하다', () => {
  const selectable = selectableModelValues();

  it('가성비·균형·프리미엄 세 모델이 모두 라디오로 있다', () => {
    expect(selectable).toContain(GEMINI_TEXT_MODELS.FLASH_LITE);
    expect(selectable).toContain(GEMINI_TEXT_MODELS.FLASH);
    expect(selectable).toContain(GEMINI_TEXT_MODELS.FLASH_SUSTAINED);
  });

  it('AI 엔진 드롭다운에도 세 모델이 있다', () => {
    const block = html.slice(html.indexOf('id="unified-gemini-model"'));
    const head = block.slice(0, block.indexOf('</select>'));
    for (const model of [GEMINI_TEXT_MODELS.FLASH_LITE, GEMINI_TEXT_MODELS.FLASH, GEMINI_TEXT_MODELS.FLASH_SUSTAINED]) {
      expect(head).toContain(`value="${model}"`);
    }
  });

  it('선택 목록에 폐기된 Pro 프리뷰가 남아있지 않다 — 고를 수 있는데 안 되는 모델을 두지 않는다', () => {
    expect(selectable.filter(v => v.includes('pro'))).toHaveLength(0);
  });
});

describe('고른 모델이 그 이름 그대로 표시된다', () => {
  it('3.6 을 고르면 3.6 으로 보인다 — 이 사고의 핵심', () => {
    const profile = resolveTextModelProfile(GEMINI_TEXT_MODELS.FLASH);
    expect(profile.model).toBe('gemini-3.6-flash');
    expect(profile.displayName).toBe('Gemini 3.6 Flash');
    expect(profile.tier).toBe('balanced');
  });

  it('세 티어가 서로 다른 등급으로 갈린다', () => {
    const tiers = [
      resolveTextModelProfile(GEMINI_TEXT_MODELS.FLASH_LITE).tier,
      resolveTextModelProfile(GEMINI_TEXT_MODELS.FLASH).tier,
      resolveTextModelProfile(GEMINI_TEXT_MODELS.FLASH_SUSTAINED).tier,
    ];
    expect(tiers).toEqual(['value', 'balanced', 'premium']);
  });

  it('표시 이름이 서로 겹치지 않는다', () => {
    const names = [GEMINI_TEXT_MODELS.FLASH_LITE, GEMINI_TEXT_MODELS.FLASH, GEMINI_TEXT_MODELS.FLASH_SUSTAINED]
      .map(m => resolveTextModelProfile(m).displayName);
    expect(new Set(names).size).toBe(3);
  });
});

/** 라디오 카드(label.gemini-model-card) 블록을 값으로 찾는다 — 문자열 위치에 기대지 않는다 */
function modelCard(value: string): string {
  const cards = html.split('<label class="gemini-model-card"').slice(1);
  const card = cards.find(block => block.includes(`value="${value}"`));
  if (!card) throw new Error(`카드를 찾지 못했습니다: ${value}`);
  return card.slice(0, card.indexOf('</label>'));
}

describe('화면에 적힌 단가가 공식 가격표와 일치한다', () => {
  it('3.6 은 입력 $1.50 · 출력 $7.50', () => {
    expect(modelCard('gemini-3.6-flash')).toContain('입력 $1.50 · 출력 $7.50');
  });

  it('3.5 는 입력 $1.50 · 출력 $9.00 — 3.6 보다 비싸다', () => {
    expect(modelCard('gemini-3.5-flash')).toContain('입력 $1.50 · 출력 $9.00');
  });

  it('가성비 모델이 가장 싸다', () => {
    expect(modelCard('gemini-3.1-flash-lite')).toContain('입력 $0.25 · 출력 $1.50');
  });

  it('폐기된 옛 단가 표기가 남아있지 않다', () => {
    expect(html).not.toContain('출력 $4.50');
  });
});
