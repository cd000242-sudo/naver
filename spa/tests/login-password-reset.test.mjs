// [2026-11-07] The old LEWORD login window had 본인인증 · 비밀번호 변경. The new site-wide /login must keep
//   them reachable, otherwise users who forget a password can only ask the owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const login = fs.readFileSync(path.join(here, '..', 'src', 'pages', 'LoginPage.tsx'), 'utf8');
const lewordAuth = fs.readFileSync(path.join(here, '..', 'src', 'components', 'leword', 'LewordAuth.tsx'), 'utf8');
const recovery = fs.readFileSync(path.join(here, '..', 'src', 'components', 'auth', 'PasswordRecovery.tsx'), 'utf8');

test('LewordAuth exports the existing phone-verify and password-reset panels', () => {
    assert.match(lewordAuth, /export \{ PhoneVerifyPanel, PasswordResetPanel \}/);
});

test('/login offers 본인인증 and 비밀번호 변경; the license-account tab still uses the LEWORD reset panel', () => {
    assert.match(login, /import \{ PhoneVerifyPanel \} from '\.\.\/components\/leword\/LewordAuth'/);
    assert.match(login, /setView\('phone'\)/);
    assert.match(login, /setView\('pwreset'\)/);
    assert.match(login, /<PasswordRecovery defaultUserId=/);
    assert.match(login, /<PhoneVerifyPanel defaultUserId=\{[^}]+\} onBack=/);
    assert.match(login, /비밀번호 변경/);
    assert.match(recovery, /import \{ PasswordResetPanel \} from '\.\.\/leword\/LewordAuth'/);
    assert.match(recovery, /<PasswordResetPanel defaultUserId=\{defaultUserId\} onBack=/);
});
