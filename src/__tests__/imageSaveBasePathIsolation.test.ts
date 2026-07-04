/**
 * imageSaveBasePathIsolation.test.ts
 *
 * [2026-07-03] getImageSaveBasePath가 TEST_MODE+GENERATED_IMAGES_DIR를 존중하지 않아
 * writeImageFile 테스트(bytesize-check/dedup/roundtrip-test 등)가 사용자의 실제
 * ~/Downloads/naver-blog-images에 타임스탬프 더미 폴더를 계속 남기던 회귀를 잠근다.
 * (ensureDirectory는 이미 존중했으나 getImageSaveBasePath 경로만 가드가 빠져 있었음)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getImageSaveBasePath } from '../image/imageUtils';

describe('getImageSaveBasePath 테스트 격리 (실제 이미지 폴더 오염 방지)', () => {
  afterEach(() => {
    delete process.env.TEST_MODE;
    delete process.env.GENERATED_IMAGES_DIR;
  });

  it('TEST_MODE+GENERATED_IMAGES_DIR면 그 폴더를 반환한다', async () => {
    process.env.TEST_MODE = 'true';
    process.env.GENERATED_IMAGES_DIR = '/tmp/bln-test-images-isolation';
    expect(await getImageSaveBasePath()).toBe('/tmp/bln-test-images-isolation');
  });

  it('TEST_MODE 없으면 GENERATED_IMAGES_DIR를 무시한다 (프로덕션 무영향)', async () => {
    delete process.env.TEST_MODE;
    process.env.GENERATED_IMAGES_DIR = '/tmp/should-be-ignored';
    expect(await getImageSaveBasePath()).not.toBe('/tmp/should-be-ignored');
  });
});
