import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard for the input_buffer (IME proxy) trap escape (2026-06-23).
 *
 * Live diagnosis (suma0404, via the 🔬[캐럿진단] snapshot): the active element was
 * `IFRAME#input_buffer` with hasFocus:true and no overlay — clicks/keys were swallowed
 * by SmartEditor's hidden IME input-buffer iframe (which overlays the caret), so Korean
 * never committed to the body (+0 chars) and the page eventually closed (detached frame).
 *
 * Fix: ensureTailTypingReady runs an escape strategy FIRST — Escape (cancel IME composition)
 * + blur the active element + a real click on the editor's empty lower area (not covered by
 * the input_buffer) to force SmartEditor's model caret to the document end.
 */
describe('input_buffer trap escape', () => {
  const rich = read('automation/richTextPaste.ts');

  it('defines an input_buffer trap escape routine', () => {
    expect(rich).toMatch(/const escapeInputBufferTrap = async/);
  });

  it('escapes IME composition and blurs the trapped active element', () => {
    expect(rich).toContain("page.keyboard.press('Escape')");
    expect(rich).toMatch(/document\.activeElement.*\?\.blur\?\.\(\)/);
  });

  it('runs the escape strategy FIRST in the caret ladder (before paragraph clicks)', () => {
    const escIdx = rich.indexOf("name: 'escape-inputbuffer-trap'");
    const paraIdx = rich.indexOf("name: 'paragraph-end-click'");
    const textParaIdx = rich.indexOf("name: 'text-paragraph-end-click'");
    expect(escIdx).toBeGreaterThan(-1);
    // escape must precede the paragraph-click strategies in the ladder array
    expect(escIdx).toBeLessThan(paraIdx === -1 ? textParaIdx : paraIdx);
    expect(escIdx).toBeLessThan(textParaIdx);
  });
});
