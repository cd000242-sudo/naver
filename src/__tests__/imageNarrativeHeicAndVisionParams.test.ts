/**
 * [v2.11.135] 사진 모드 라이브 사용자 리포트 2건 회귀 잠금.
 *
 * 1) HEIC 죽은 배선: 렌더러 imageNarrativeUpload.ts는 출시 때부터
 *    electronAPI.convertHeic/extractExif를 호출했지만 preload 노출도 main
 *    핸들러도 없어 iPhone HEIC가 미변환으로 vision에 전달돼 400이 났다.
 * 2) OpenAI 신형 비전 모델이 max_tokens를 거부("Use 'max_completion_tokens'
 *    instead") — 사진 모드에서 GPT 계열 선택이 전부 실패했다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('HEIC 변환 IPC 체인 (죽은 배선 복구)', () => {
  it('preload가 convertHeic/extractExif를 실제 채널로 노출한다', () => {
    const preload = read('preload.ts');
    expect(preload).toMatch(/convertHeic:.*\n?\s*ipcRenderer\.invoke\('image-narrative:convert-heic'/);
    expect(preload).toMatch(/extractExif:.*\n?\s*ipcRenderer\.invoke\('image-narrative:extract-exif'/);
  });

  it('main 핸들러가 두 채널을 등록하고 main.ts에 배선된다', () => {
    const handlers = read('main/ipc/imageNarrativeSupportHandlers.ts');
    expect(handlers).toMatch(/ipcMain\.handle\('image-narrative:convert-heic'/);
    expect(handlers).toMatch(/ipcMain\.handle\('image-narrative:extract-exif'/);
    // 변환 실패는 success:false로 강등 — 업로드 플로우가 원본으로 계속 진행.
    expect(handlers).toMatch(/success: false/);

    const main = read('main.ts');
    expect(main).toMatch(/registerImageNarrativeSupportHandlers\(\);/);
  });

  it('heic-convert 의존성이 dependencies에 있고 로드된다', () => {
    const pkg = JSON.parse(read('../package.json'));
    expect(pkg.dependencies['heic-convert']).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const heicConvert = require('heic-convert');
    expect(typeof heicConvert).toBe('function');
  });

  it('잘못된 입력에서 heic-convert는 reject하고 핸들러 catch가 이를 삼킨다 (기능 확인)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const heicConvert = require('heic-convert');
    await expect(
      heicConvert({ buffer: Buffer.from('not-a-heic-file'), format: 'JPEG' }),
    ).rejects.toThrow();
  });
});

describe('OpenAI 비전 파라미터 (신형 모델 호환)', () => {
  const adapter = read('imageNarrative/visionInference/openaiVisionAdapter.ts');

  it('max_tokens 대신 max_completion_tokens를 사용한다', () => {
    expect(adapter).toMatch(/max_completion_tokens: 2_048/);
    expect(adapter).not.toMatch(/max_tokens: 2_048/);
  });

  it('temperature 미지원 모델이면 temperature 없이 1회 재시도한다', () => {
    expect(adapter).toMatch(/\{ \.\.\.baseRequest, temperature: 0\.2 \}/);
    expect(adapter).toMatch(/response = await client\.chat\.completions\.create\(baseRequest,/);
    expect(adapter).toMatch(/unsupported/i);
  });
});
