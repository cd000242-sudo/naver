// Password-protected link (2026-11-07): WebCrypto round trip, encrypt script, and "no plaintext in the bundle" guards.
// The protected URL itself must never be written in this file — leak checks are deny-by-default instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    ProtectedLinkError,
    PROTECTED_LINK_ITERATIONS,
    decryptLink,
    encryptLink,
    encryptText,
} from '../src/lib/protectedLink.mjs';

const spaRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = path.join(spaRoot, 'scripts', 'encrypt-protected-link.mjs');
const dataPath = path.join(spaRoot, 'src', 'data', 'protectedLinks.json');
const FAKE_URL = 'https://example.invalid/private-page-7f3a';
const PASSWORD = 'test-pass-Alpha-123';

// Notion pages that are allowed to appear in plaintext (free tile, existing purchase guide). Anything else is a leak.
const ALLOWED_NOTION_IDS = ['44ec04a37c4c4c928f06241828d55982', '77c9b1f8e6824ed7b8e70c5d1926dcf8'];
const NOTION_URL = /notion\.(?:com|so|site)\/[^"'\s<>)\\]*/g;

const b64Length = (b64) => Buffer.from(b64, 'base64').length;
const rejectsWith = (promise, code) =>
    assert.rejects(promise, (error) => error instanceof ProtectedLinkError && error.code === code);

test('round trip — right password returns the original link', async () => {
    const payload = await encryptLink(FAKE_URL, PASSWORD);
    assert.equal(await decryptLink(payload, PASSWORD), FAKE_URL);
});

test('wrong password is rejected with WRONG_PASSWORD', async () => {
    const payload = await encryptLink(FAKE_URL, PASSWORD);
    await rejectsWith(decryptLink(payload, `${PASSWORD}x`), 'WRONG_PASSWORD');
});

test('empty or blank password is rejected before any crypto work', async () => {
    const payload = await encryptLink(FAKE_URL, PASSWORD);
    await rejectsWith(decryptLink(payload, ''), 'EMPTY_PASSWORD');
    await rejectsWith(decryptLink(payload, '   '), 'EMPTY_PASSWORD');
    await rejectsWith(encryptLink(FAKE_URL, ''), 'EMPTY_PASSWORD');
});

test('payload holds only ciphertext material — no link, no password, strong KDF cost, random salt/iv', async () => {
    const payload = await encryptLink(FAKE_URL, PASSWORD);
    const serialized = JSON.stringify(payload);
    assert.equal(payload.v, 1);
    assert.equal(payload.kdf, 'PBKDF2-SHA256');
    assert.ok(payload.iter >= 600_000, 'PBKDF2 iterations must be at least 600000');
    assert.equal(payload.iter, PROTECTED_LINK_ITERATIONS);
    assert.equal(b64Length(payload.salt), 16);
    assert.equal(b64Length(payload.iv), 12);
    assert.equal(b64Length(payload.ct), Buffer.byteLength(FAKE_URL) + 16, 'AES-GCM ciphertext = plaintext + 16 byte tag');
    assert.ok(!serialized.includes('example.invalid'));
    assert.ok(!serialized.includes(PASSWORD));
    const again = await encryptLink(FAKE_URL, PASSWORD);
    assert.notEqual(again.salt, payload.salt);
    assert.notEqual(again.iv, payload.iv);
    assert.notEqual(again.ct, payload.ct);
});

test('password is normalised — NFD/NFC Korean input and stray spaces still unlock', async () => {
    const nfd = '리더남비밀번호'.normalize('NFD');
    const payload = await encryptLink(FAKE_URL, nfd);
    assert.equal(await decryptLink(payload, '리더남비밀번호'.normalize('NFC')), FAKE_URL);
    assert.equal(await decryptLink(payload, '  리더남비밀번호 \n'), FAKE_URL);
});

test('decrypt honours the iteration count stored in the payload', async () => {
    const payload = await encryptLink(FAKE_URL, PASSWORD, { iterations: 100_000 });
    assert.equal(payload.iter, 100_000);
    assert.equal(await decryptLink(payload, PASSWORD), FAKE_URL);
});

test('tampered ciphertext never yields a link', async () => {
    const payload = await encryptLink(FAKE_URL, PASSWORD);
    const bytes = Buffer.from(payload.ct, 'base64');
    bytes[0] ^= 0xff;
    await rejectsWith(decryptLink({ ...payload, ct: bytes.toString('base64') }, PASSWORD), 'WRONG_PASSWORD');
});

test('malformed payloads are BAD_PAYLOAD, not a crash', async () => {
    const good = await encryptLink(FAKE_URL, PASSWORD, { iterations: 100_000 });
    for (const bad of [null, undefined, 'x', {}, { ...good, v: 2 }, { ...good, iter: 'many' }, { ...good, salt: '***' }, { ...good, ct: '' }, { ...good, kdf: 'MD5' }]) {
        await rejectsWith(decryptLink(bad, PASSWORD), 'BAD_PAYLOAD');
    }
});

test('only https links can be sealed or opened', async () => {
    await rejectsWith(encryptLink('http://example.invalid/a', PASSWORD), 'BAD_URL');
    await rejectsWith(encryptLink('javascript:alert(1)', PASSWORD), 'BAD_URL');
    await rejectsWith(encryptLink('not a url', PASSWORD), 'BAD_URL');
    const sneaky = await encryptText('javascript:alert(1)', PASSWORD, { iterations: 100_000 });
    await rejectsWith(decryptLink(sneaky, PASSWORD), 'BAD_PAYLOAD');
});

// ---- encrypt script -------------------------------------------------------------------------------------------

function runScript(args, env = {}) {
    return spawnSync(process.execPath, [scriptPath, ...args], {
        encoding: 'utf8',
        env: { ...process.env, PROTECTED_LINK_URL: '', PROTECTED_LINK_PASSWORD: '', ...env },
    });
}
const tempOut = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'protected-link-')), 'links.json');

test('script writes ciphertext only, merges with existing ids, and never echoes the secrets', async () => {
    const out = tempOut();
    fs.writeFileSync(out, JSON.stringify({ keep: { v: 1, kdf: 'PBKDF2-SHA256', iter: 1, salt: 'AA==', iv: 'AA==', ct: 'AA==' } }));
    const run = runScript(['--id', 'unit-link', '--url', FAKE_URL, '--password', PASSWORD, '--out', out]);
    assert.equal(run.status, 0, run.stderr);
    const raw = fs.readFileSync(out, 'utf8');
    const data = JSON.parse(raw);
    assert.deepEqual(Object.keys(data).sort(), ['keep', 'unit-link']);
    assert.ok(!raw.includes('example.invalid') && !raw.includes(PASSWORD));
    assert.ok(!run.stdout.includes('example.invalid') && !run.stdout.includes(PASSWORD));
    assert.ok(!run.stderr.includes('example.invalid') && !run.stderr.includes(PASSWORD));
    assert.equal(await decryptLink(data['unit-link'], PASSWORD), FAKE_URL);
    await rejectsWith(decryptLink(data['unit-link'], 'other-password-1'), 'WRONG_PASSWORD');
});

test('script re-run with a new password replaces only that id', async () => {
    const out = tempOut();
    assert.equal(runScript(['--id', 'a', '--url', FAKE_URL, '--password', PASSWORD, '--out', out]).status, 0);
    assert.equal(runScript(['--id', 'a', '--url', FAKE_URL, '--password', 'second-pass-Beta-456', '--out', out]).status, 0);
    const data = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(await decryptLink(data.a, 'second-pass-Beta-456'), FAKE_URL);
    await rejectsWith(decryptLink(data.a, PASSWORD), 'WRONG_PASSWORD');
});

test('script accepts url and password from the environment (keeps them out of argv)', async () => {
    const out = tempOut();
    const run = runScript(['--id', 'env-link', '--out', out], { PROTECTED_LINK_URL: FAKE_URL, PROTECTED_LINK_PASSWORD: PASSWORD });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(await decryptLink(JSON.parse(fs.readFileSync(out, 'utf8'))['env-link'], PASSWORD), FAKE_URL);
});

test('script refuses bad input and leaves no output file behind', () => {
    for (const args of [
        ['--id', 'x', '--url', FAKE_URL, '--out', tempOut()],
        ['--id', 'x', '--password', PASSWORD, '--out', tempOut()],
        ['--url', FAKE_URL, '--password', PASSWORD, '--out', tempOut()],
        ['--id', 'x', '--url', 'http://example.invalid/a', '--password', PASSWORD, '--out', tempOut()],
        ['--id', 'bad id!', '--url', FAKE_URL, '--password', PASSWORD, '--out', tempOut()],
    ]) {
        const run = runScript(args);
        assert.notEqual(run.status, 0, `expected failure for ${args.filter((a) => !a.startsWith('--') && a !== 'x').length} args`);
        assert.ok(!fs.existsSync(args[args.length - 1]), 'no output file on failure');
    }
});

// ---- shipped data + leak guards -------------------------------------------------------------------------------

test('shipped ciphertext for the Leader Nam homefeed prompt is well-formed and rejects a wrong password', async () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const entry = data['homefeed-prompt'];
    assert.ok(entry, 'homefeed-prompt entry exists');
    assert.equal(entry.v, 1);
    assert.equal(entry.kdf, 'PBKDF2-SHA256');
    assert.ok(entry.iter >= 600_000);
    assert.equal(b64Length(entry.salt), 16);
    assert.equal(b64Length(entry.iv), 12);
    assert.ok(b64Length(entry.ct) > 16 + 'https://'.length);
    const raw = fs.readFileSync(dataPath, 'utf8');
    assert.ok(!/notion|https?:/i.test(raw), 'data file must hold ciphertext only');
    await rejectsWith(decryptLink(entry, 'definitely-not-the-password'), 'WRONG_PASSWORD');
});

function walk(dir, skip) {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(full, skip));
        else if (/\.(?:[cm]?[jt]sx?|json|html|css|md|txt|map)$/.test(entry.name)) found.push(full);
    }
    return found;
}

function notionLeaks(files) {
    const leaks = [];
    for (const file of files) {
        for (const url of fs.readFileSync(file, 'utf8').match(NOTION_URL) ?? []) {
            // Only full page links carry a 32-hex page id; bare prefixes inside other tests are not leaks.
            if (!/[0-9a-f]{32}/i.test(url.replace(/-/g, ''))) continue;
            if (!ALLOWED_NOTION_IDS.some((id) => url.includes(id))) leaks.push(`${path.relative(spaRoot, file)}: ${url.slice(0, 40)}…`);
        }
    }
    return leaks;
}

function plaintextLeaks(files) {
    // Optional full check: PROTECTED_LINK_PLAINTEXT holds the real link, supplied by the operator at run time only.
    const secret = process.env.PROTECTED_LINK_PLAINTEXT;
    if (!secret) return [];
    const pageId = secret.match(/[0-9a-f]{32}/i)?.[0];
    return files.filter((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return text.includes(secret) || (pageId && text.toLowerCase().includes(pageId.toLowerCase()));
    }).map((file) => path.relative(spaRoot, file));
}

test('source tree has no unlisted notion link (protected link must exist only as ciphertext)', () => {
    const skip = new Set(['node_modules', 'dist', '.git']);
    const files = ['src', 'scripts', 'tests', 'public'].flatMap((dir) => walk(path.join(spaRoot, dir), skip));
    assert.deepEqual(notionLeaks(files), []);
    assert.deepEqual(plaintextLeaks(files), []);
});

test('built bundle (dist) has no unlisted notion link and still ships the ciphertext', { skip: !fs.existsSync(path.join(spaRoot, 'dist', 'assets')) && 'dist not built — run npm run build first' }, () => {
    const files = walk(path.join(spaRoot, 'dist'), new Set(['node_modules']));
    assert.ok(files.length > 0);
    assert.deepEqual(notionLeaks(files), []);
    assert.deepEqual(plaintextLeaks(files), []);
    const chunk = files.find((file) => /ChatbotsPage-[\w-]+\.js$/.test(file));
    assert.ok(chunk, 'ChatbotsPage chunk exists');
    const code = fs.readFileSync(chunk, 'utf8');
    const { ct } = JSON.parse(fs.readFileSync(dataPath, 'utf8'))['homefeed-prompt'];
    assert.ok(code.includes(ct), 'ciphertext is bundled into the chatbots chunk');
    assert.ok(code.includes(ALLOWED_NOTION_IDS[0]), 'free prompt link is bundled in plaintext');
});
