// @vitest-environment happy-dom
/**
 * [2026-10-09] 네이버 업로드 거부창 감지 — DOM 글자 탐색과 오탐 방지.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NAVER_UPLOAD_REJECTION_PHRASES,
  readNaverUploadRejection,
  scanUploadRejectionInPage,
} from '../automation/naverUploadRejection.js';

const scan = (dismiss = false): string | null => scanUploadRejectionInPage(NAVER_UPLOAD_REJECTION_PHRASES, dismiss);

beforeEach(() => { document.body.innerHTML = ''; });

describe('scanUploadRejectionInPage', () => {
  it('returns the popup text and clicks only its confirm button when dismiss=true', () => {
    document.body.innerHTML = `
      <div class="se-popup-alert"><p>파일 전송 오류</p><p>알 수 없는 파일</p><button id="ok">확인</button></div>
      <button id="other">확인</button>`;
    const ok = vi.fn();
    const other = vi.fn();
    document.getElementById('ok')!.addEventListener('click', ok);
    document.getElementById('other')!.addEventListener('click', other);

    expect(scan()).toContain('파일 전송 오류');
    expect(ok).not.toHaveBeenCalled();
    expect(scan(true)).toContain('알 수 없는 파일');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('works with role=dialog boxes too', () => {
    document.body.innerHTML = '<div role="dialog"><span>파일 전송 오류</span></div>';
    expect(scan()).toContain('파일 전송 오류');
  });

  it('ignores the same words inside the editable body', () => {
    document.body.innerHTML = '<article class="se-components-wrap"><div class="se-popup-x" contenteditable="true">파일 전송 오류</div></article>';
    expect(scan()).toBeNull();
  });

  it('ignores the same words in the document title', () => {
    document.body.innerHTML = '<div class="se-documentTitle"><div class="se-popup-title">파일 전송 오류</div></div>';
    expect(scan()).toBeNull();
  });

  it('ignores a hidden box', () => {
    document.body.innerHTML = '<div style="display:none"><div class="se-popup-alert">파일 전송 오류</div></div>';
    expect(scan()).toBeNull();
  });

  it('ignores a box pre-rendered with opacity 0 (2026-10-09 review)', () => {
    document.body.innerHTML = '<div style="opacity:0"><div class="se-popup-alert">파일 전송 오류</div></div>';
    expect(scan()).toBeNull();
  });

  it('ignores aria-hidden boxes', () => {
    document.body.innerHTML = '<div class="se-popup-alert" aria-hidden="true">파일 전송 오류</div>';
    expect(scan()).toBeNull();
  });

  it('ignores wrappers longer than 300 chars', () => {
    document.body.innerHTML = `<div class="se-layer-wrap">파일 전송 오류 ${'가'.repeat(320)}</div>`;
    expect(scan()).toBeNull();
  });

  it('ignores a box that contains the editing area', () => {
    document.body.innerHTML = '<div class="se-popup-wrap">파일 전송 오류<div contenteditable="true">본문</div></div>';
    expect(scan()).toBeNull();
  });

  it('ignores other messages such as "용량 초과"', () => {
    document.body.innerHTML = '<div class="se-popup-alert">용량 초과</div>';
    expect(scan()).toBeNull();
  });

  it('ignores the phrase outside any popup-like box', () => {
    document.body.innerHTML = '<p>파일 전송 오류</p>';
    expect(scan()).toBeNull();
  });
});

describe('readNaverUploadRejection', () => {
  it('returns null when evaluate throws, returns undefined, or does not exist', async () => {
    const thrower = { evaluate: vi.fn(async () => { throw new Error('Execution context was destroyed'); }) };
    const undef = { evaluate: vi.fn(async () => undefined) };
    expect(await readNaverUploadRejection([thrower])).toBeNull();
    expect(await readNaverUploadRejection([undef])).toBeNull();
    expect(await readNaverUploadRejection([{}, null, undefined])).toBeNull();
  });

  it('returns the first target that shows the popup, passing the dismiss flag through', async () => {
    const first = { evaluate: vi.fn(async () => null) };
    const second = { evaluate: vi.fn(async () => '파일 전송 오류') };
    expect(await readNaverUploadRejection([first, second], true)).toBe('파일 전송 오류');
    expect(second.evaluate).toHaveBeenCalledWith(scanUploadRejectionInPage, NAVER_UPLOAD_REJECTION_PHRASES, true);
  });
});
