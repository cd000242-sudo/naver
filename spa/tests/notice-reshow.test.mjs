// [2026-11-08 사장님] "공지 다시 띄워 주고" — the home notice modal only shows unseen notices, and a closed
//   notice never comes back. Bumping the seen-store key makes the current notices pop up once more for everyone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'src', 'lib', 'noticeAlerts.ts'), 'utf8');

test('notice seen-store key is bumped so current notices show again once', () => {
    assert.match(src, /const SEEN_KEY = 'leaderspro:home-notice:seen-v2';/);
    assert.doesNotMatch(src, /home-notice:seen-v1'/);
});
