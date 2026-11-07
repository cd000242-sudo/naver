// [2026-11-07 사장님] "비밀번호 못 본 사람들은 나한테 물어보던데 — 비밀번호 보기 누르면 노출되게.
//   그냥 풀어 놓으면 무분별하게 다 받아 가니까" → 다운로드는 계속 비밀번호를 넣어야 하고,
//   비밀번호는 [비밀번호 보기]를 눌렀을 때만 화면에 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'src', 'pages', 'DownloadPage.tsx'), 'utf8');

test('download card has a reveal button that toggles the password text', () => {
    assert.match(src, /const \[showPw, setShowPw\] = useState\(false\)/);
    assert.match(src, /onClick=\{\(\) => setShowPw\(\(v\) => !v\)\}/);
    assert.match(src, /비밀번호 보기/);
    assert.match(src, /\{showPw && [\s\S]{0,400}\{DOWNLOAD_PW\}/);
});

test('download still requires typing the password (not unlocked by revealing)', () => {
    assert.match(src, /const unlocked = pw\.trim\(\) === DOWNLOAD_PW;/);
    assert.doesNotMatch(src, /setPw\(DOWNLOAD_PW\)/);
});

test('reveal button is large enough for senior users', () => {
    const block = src.slice(src.indexOf('비밀번호 보기') - 900, src.indexOf('비밀번호 보기'));
    assert.match(block, /minHeight: 44/);
    assert.match(block, /aria-expanded=\{showPw\}/);
});
