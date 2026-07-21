import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

// User report (v2.11.132): picked "GPT 이미지" in the continuous UI but posts
// were published with the previous engine (dropshot). Root causes locked here:
//  1. addItemToQueueV2Impl snapshotted localStorage only, ignoring the visible
//     engine select.
//  2. The engine selects synced main<->modal DOM without persisting, so the
//     choice never reached fullAutoImageSource/globalImageSource.
describe('continuous publishing image engine selection', () => {
  const code = read('renderer/modules/continuousPublishing.ts');

  it('snapshots the visible engine select when adding queue items', () => {
    // Bug pattern: localStorage-only snapshot at queue-add time.
    expect(code).not.toMatch(
      /const imageSource = textOnlyPublish \? 'skip' : getFullAutoImageSource\(\);/,
    );
    // Fix: select first, then radio, then stored default.
    expect(code).toMatch(
      /imageSourceSelectEl\?\.value \|\| imageSourceRadioEl\?\.value \|\| getFullAutoImageSource\(\)/,
    );
  });

  it('persists engine select changes to both storage keys', () => {
    expect(code).toMatch(
      /\['continuous-image-source-select', 'continuous-modal-image-source'\]\.forEach/,
    );
    const handler = code.slice(
      code.indexOf("['continuous-image-source-select', 'continuous-modal-image-source'].forEach"),
    );
    expect(handler).toMatch(/localStorage\.setItem\('fullAutoImageSource', value\)/);
    expect(handler).toMatch(/localStorage\.setItem\('globalImageSource', value\)/);
  });

  it('migrates only pending items still on the previous default engine', () => {
    expect(code).toMatch(
      /item\.status === 'pending' && item\.imageSource === prevDefault && prevDefault !== value/,
    );
  });

  it('does not touch the global engine while editing a single queue item', () => {
    const handler = code.slice(
      code.indexOf("['continuous-image-source-select', 'continuous-modal-image-source'].forEach"),
    );
    expect(handler).toMatch(/continuous-settings-editing-index/);
  });
});

describe('progress modal engine name extraction', () => {
  it('does not report "fal" from the word "failed" in error messages', () => {
    const code = read('renderer/components/ProgressModal.ts');
    expect(code).toMatch(/\\b\(nano-banana-pro\|deepinfra\|gemini\|fal\|flux\|dall-e\)\\b/);

    // Functional lock: same pattern must not match inside "failed".
    const pattern = /\b(nano-banana-pro|deepinfra|gemini|fal|flux|dall-e)\b/i;
    expect('image generation failed: IMAGE_BATCH_INCOMPLETE'.match(pattern)).toBeNull();
    expect('fal 엔진 오류'.match(pattern)?.[1]).toBe('fal');
  });
});
