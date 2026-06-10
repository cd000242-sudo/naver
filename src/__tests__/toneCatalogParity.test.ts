import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

function optionValues(selectId: string): string[] {
  const start = html.indexOf(`id="${selectId}"`);
  expect(start, `select #${selectId} missing in public/index.html`).toBeGreaterThan(-1);
  const end = html.indexOf('</select>', start);
  const slice = html.slice(start, end);
  return [...slice.matchAll(/option value="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Tone catalog parity guard. The unified full-auto select is the canonical
 * list; every other tone select and display map must offer at least those
 * tones. Locks against the "one UI updated, the others stale" recurrence
 * (user report 2026-06-10: continuous/multi-account 상세설정 missing the
 * 2026 tones).
 */
describe('tone style catalog parity', () => {
  const canonical = optionValues('unified-tone-style');

  it('canonical unified list includes the 2026 tones', () => {
    for (const tone of ['text_hip', 'sincere_exposure', 'data_verified', 'mentor', 'self_interview']) {
      expect(canonical).toContain(tone);
    }
  });

  it.each(['continuous-tone-style-select', 'continuous-modal-tone-style', 'ma-setting-tone'])(
    '%s offers every canonical tone',
    (selectId) => {
      const values = optionValues(selectId);
      for (const tone of canonical) {
        expect(values, `${selectId} missing tone "${tone}"`).toContain(tone);
      }
    }
  );

  it('display name/emoji maps cover every canonical tone', () => {
    const continuous = read('renderer/modules/continuousPublishing.ts');
    const ma = read('renderer/modules/multiAccountManager.ts');
    for (const tone of canonical) {
      expect(continuous, `toneStyleNames missing '${tone}'`).toContain(`'${tone}'`);
      expect(ma, `toneEmoji missing ${tone}:`).toContain(`${tone}:`);
    }
  });
});
