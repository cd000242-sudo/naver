import { describe, expect, it } from 'vitest';
import { buildFullPrompt, resolveHomefeedCraft } from '../promptLoader';
import { buildHomefeedCraftBlock, HOMEFEED_CRAFT_TOPICS } from '../content/homefeedTopicCraft';

// [2026-11-16] "Endgame" step: each homefeed topic gets a short block of positive writing devices
// ("write it like this"). Measured before: bans outnumbering devices produced flat, score-perfect posts.
describe('homefeed topic craft - which topic', () => {
  it.each([
    ['연예', 'entertainment'], ['드라마', 'entertainment'], ['스포츠', 'sports'], ['IT', 'it'], ['자동차', 'car'],
    ['패션', 'fashion'], ['뷰티', 'beauty'], ['리빙', 'living'], ['인테리어', 'living'], ['건강', 'health'], ['경제', 'finance'],
  ])('homefeed %s -> %s', (hint, topic) => {
    expect(resolveHomefeedCraft('homefeed', hint)).toBe(topic);
  });

  it.each(['사회', '여행', '맛집', '육아', '반려동물', '', undefined])('homefeed %s has no craft block', (hint) => {
    expect(resolveHomefeedCraft('homefeed', hint)).toBeNull();
  });

  it.each(['seo', 'affiliate', 'business', 'custom', 'mate'] as const)('%s mode never gets one', (mode) => {
    for (const hint of ['연예', '건강', '자동차', '경제']) expect(resolveHomefeedCraft(mode, hint)).toBeNull();
  });
});

describe('homefeed topic craft - blocks', () => {
  it.each(HOMEFEED_CRAFT_TOPICS)('%s block is short and mostly devices, not bans', (topic) => {
    const block = buildHomefeedCraftBlock(topic);
    const lines = block.split('\n').filter((line) => line.startsWith('- '));
    expect(block.startsWith('[주제 장치 — ')).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(block.length).toBeLessThanOrEqual(720);
    const banLines = lines.filter((line) => /금지|않는다\.?$|쓰지 않/.test(line));
    expect(banLines.length).toBeLessThanOrEqual(1);
  });

  it('every block defers to the evidence rules instead of inviting invention', () => {
    for (const topic of HOMEFEED_CRAFT_TOPICS) {
      expect(buildHomefeedCraftBlock(topic)).toContain('자료에 있을 때만');
    }
  });

  it('blocks are different from each other', () => {
    expect(new Set(HOMEFEED_CRAFT_TOPICS.map(buildHomefeedCraftBlock)).size).toBe(HOMEFEED_CRAFT_TOPICS.length);
  });
});

describe('homefeed topic craft - prompt wiring', () => {
  it('appends the block once, after the body of the prompt', () => {
    const prompt = buildFullPrompt('homefeed', '건강', false, 'friendly');
    const at = prompt.indexOf('[주제 장치 — 건강');
    expect(at).toBeGreaterThan(prompt.length * 0.5);
    expect(prompt.indexOf('[주제 장치 — ', at + 1)).toBe(-1);
  });

  it('keeps the plain-register rule last for plain topics', () => {
    const prompt = buildFullPrompt('homefeed', '스포츠', false, 'friendly');
    const craft = prompt.indexOf('[주제 장치 — 스포츠');
    const plain = prompt.indexOf('[말투 최종 규칙 — 평서체');
    expect(craft).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(craft);
  });

  it('leaves other modes and uncovered topics without a block', () => {
    expect(buildFullPrompt('seo', '건강', false, 'friendly')).not.toContain('[주제 장치 — ');
    expect(buildFullPrompt('homefeed', '여행', false, 'friendly')).not.toContain('[주제 장치 — ');
    expect(buildFullPrompt('homefeed', undefined, false, 'friendly')).not.toContain('[주제 장치 — ');
  });
});
