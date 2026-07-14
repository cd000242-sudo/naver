import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FREE_TRIAL_DAILY_PUBLISH_LIMIT,
  createFreeTrialQuotaLimits,
} from '../freeTrialPolicy.js';

const readProjectFile = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('free trial policy', () => {
  it('allows three content-and-publish runs per day', () => {
    expect(FREE_TRIAL_DAILY_PUBLISH_LIMIT).toBe(3);
    expect(createFreeTrialQuotaLimits()).toMatchObject({
      publish: 3,
      content: 3,
    });
  });

  it('keeps the login copy and fallback quota aligned with the policy', () => {
    const loginHtml = readProjectFile('public/login.html');

    expect(loginHtml).toContain('발행 3회 무료 사용하기');
    expect(loginHtml).toContain('매일 3회 무료 체험이 가능합니다');
    expect(loginHtml).toContain('무료 ${FREE_TRIAL_DAILY_PUBLISH_LIMIT}회 발행 가능합니다.');
    expect(loginHtml).not.toMatch(/(?:발행|무료|매일)[^\n<']*2회/);
    expect(loginHtml).not.toContain('const limit = 2');
  });

  it('prevents quota implementations from reintroducing local numeric limits', () => {
    const mainSource = readProjectFile('src/main.ts');
    const authSource = readProjectFile('src/main/utils/authUtils.ts');

    expect(mainSource).toContain('createFreeTrialQuotaLimits()');
    expect(authSource).toContain('createFreeTrialQuotaLimits()');
    expect(mainSource).not.toContain('const limit = 2');
    expect(authSource).not.toContain('const limit = 2');
  });
});
