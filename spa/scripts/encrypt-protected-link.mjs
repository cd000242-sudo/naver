#!/usr/bin/env node
// Seals a link with a password and stores ONLY the ciphertext in src/data/protectedLinks.json.
//
// Usage (from the spa folder):
//   node scripts/encrypt-protected-link.mjs --id homefeed-prompt --url "<https link>" --password "<password>"
//
// Keeping secrets out of the shell history / process list — use environment variables instead of flags:
//   PowerShell:  $env:PROTECTED_LINK_URL="<https link>"; $env:PROTECTED_LINK_PASSWORD="<password>"
//                node scripts/encrypt-protected-link.mjs --id homefeed-prompt
//   Git Bash:    PROTECTED_LINK_URL="<https link>" PROTECTED_LINK_PASSWORD="<password>" \
//                node scripts/encrypt-protected-link.mjs --id homefeed-prompt
//
// Re-running with the same --id replaces that entry (this is how the password is changed); other ids are kept.
// Optional: --out <file> writes somewhere else (default src/data/protectedLinks.json).
// The link and the password are never printed or written anywhere except as ciphertext.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decryptLink, encryptLink, normalizePassword, ProtectedLinkError } from '../src/lib/protectedLink.mjs';

const defaultOut = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'protectedLinks.json');
const MIN_RECOMMENDED_PASSWORD = 12;

function fail(message) {
    console.error(`[protected-link] ${message}`);
    process.exit(1);
}

function readExisting(file) {
    if (!fs.existsSync(file)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through to the error below */ }
    return fail(`${file} 을(를) 읽을 수 없습니다. 기존 파일이 깨져 있어 덮어쓰지 않습니다.`);
}

let values;
try {
    ({ values } = parseArgs({
        options: {
            id: { type: 'string' },
            url: { type: 'string' },
            password: { type: 'string' },
            out: { type: 'string' },
        },
        strict: true,
    }));
} catch (error) {
    fail(`${error.message} — 사용법은 파일 맨 위 설명을 보세요.`);
}

const id = values.id ?? '';
const url = values.url || process.env.PROTECTED_LINK_URL || '';
const password = values.password || process.env.PROTECTED_LINK_PASSWORD || '';
const out = values.out ? path.resolve(values.out) : defaultOut;

if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) fail('--id 는 영문 소문자·숫자·하이픈만 쓸 수 있습니다 (예: homefeed-prompt).');
if (!url) fail('링크가 없습니다. --url 또는 환경변수 PROTECTED_LINK_URL 로 넘기세요.');
if (!normalizePassword(password)) fail('비밀번호가 없습니다. --password 또는 환경변수 PROTECTED_LINK_PASSWORD 로 넘기세요.');
if (normalizePassword(password).length < MIN_RECOMMENDED_PASSWORD) {
    console.warn(`[protected-link] 경고: 비밀번호가 ${MIN_RECOMMENDED_PASSWORD}자보다 짧습니다. 암호문은 공개 저장소에 올라가므로 짧은 비밀번호는 무차별 대입에 약합니다.`);
}

try {
    const payload = await encryptLink(url, password);
    // Round-trip before touching the file: a payload that cannot be opened is worse than no payload.
    if ((await decryptLink(payload, password)) !== url) fail('복호화 검증이 맞지 않아 중단했습니다. 파일은 바꾸지 않았습니다.');
    const next = { ...readExisting(out), [id]: payload };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    console.log(`[protected-link] "${id}" 암호문 저장 완료 (PBKDF2 ${payload.iter}회, AES-GCM). 복호화 검증 통과.`);
    console.log(`[protected-link] 파일: ${out}`);
    console.log('[protected-link] 다음: npm run build 로 사이트를 다시 만들고, 변경된 protectedLinks.json 만 커밋하세요.');
} catch (error) {
    fail(error instanceof ProtectedLinkError ? `${error.code}: ${error.message}` : `예상치 못한 오류: ${error.message}`);
}
