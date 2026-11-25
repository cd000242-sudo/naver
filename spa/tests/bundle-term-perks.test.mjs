// What an All in one licence adds by term (owner, 2026-11-25): from one year on it carries every service the owner
// runs — the apps, the extension app, the lectures and the secret class; the lifetime licence adds meeting in person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundleTermPerks, bundleTermNote } from '../src/lib/bundleTermPerks.mjs';

test('one month adds nothing beyond the apps', () => {
    assert.deepEqual(bundleTermPerks('monthly'), []);
    assert.equal(bundleTermNote('monthly'), '1년 이상부터 확장 앱 · 강의 · 시크릿 클래스가 함께 제공됩니다');
});

test('one year adds the extension app, the lectures and the secret class', () => {
    assert.deepEqual(bundleTermPerks('yearly'), ['확장 앱', '강의', '시크릿 클래스 · 1대1 원격']);
    assert.equal(bundleTermNote('yearly'), '');
});

test('lifetime adds meeting in person on top of the one-year perks', () => {
    const perks = bundleTermPerks('lifetime');
    assert.deepEqual(perks.slice(0, 3), bundleTermPerks('yearly'));
    assert.equal(perks[3], '오프라인 1대1 (직접 만나서)');
    assert.equal(perks.length, 4);
});

test('an unknown term adds nothing and never throws', () => {
    assert.deepEqual(bundleTermPerks(undefined), []);
    assert.deepEqual(bundleTermPerks('weekly'), []);
    assert.equal(bundleTermNote('weekly'), '');
});

test('the result is a fresh list each time', () => {
    const first = bundleTermPerks('yearly');
    first.push('x');
    assert.equal(bundleTermPerks('yearly').length, 3);
});

test('the store card draws the term perks on the bundle card only', () => {
    const source = readFileSync(new URL('../src/components/store/ProductStore.tsx', import.meta.url), 'utf8');
    assert.match(source, /bundleTermPerks\(term\)/);
    assert.match(source, /bundleTermNote\(term\)/);
    assert.match(source, /st-incl-plus/);
});
