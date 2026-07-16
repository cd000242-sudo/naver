/* @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { formatWelcomeToastMessage } from '../renderer/modules/licenseUI';

describe('license welcome toast', () => {
  it('returns readable plain text without exposing HTML or inline CSS', () => {
    const message = formatWelcomeToastMessage('박성현');

    expect(message).toContain('박성현님 환영합니다');
    expect(message).toContain('Better Life Naver');
    expect(message).not.toMatch(/[<>]/);
    expect(message).not.toContain('style=');
    expect(message).not.toContain('font-weight');
  });

  it('keeps an HTML-looking user label inert as plain text', () => {
    expect(formatWelcomeToastMessage('<img onerror=alert(1)>')).toContain('<img onerror=alert(1)>');
  });
});
