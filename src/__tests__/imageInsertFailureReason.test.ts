/**
 * [2026-10-09 고객 신고] "IMAGE_INSERTION_FAILED:1/1개 이미지 삽입 실패 — 이미지 1: 3회 삽입 실패" 만 화면에 남아
 * 고객이 오류를 복사해 보내도 왜 실패했는지 알 수 없었다. 마지막 시도의 이유를 문구에 붙인다.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { describeImageFileForFailure, describeImageInsertAttempts, summarizeImageInsertFailure } from '../automation/imageInsertFailureReason';

describe('이미지 삽입 실패 이유 요약', () => {
  it('이유를 그대로 붙이되 파일 경로는 파일 이름만 남긴다(고객 PC 사용자 이름 노출 방지)', () => {
    expect(summarizeImageInsertFailure('이미지 파일을 찾을 수 없습니다: C:\\Users\\홍길동\\Downloads\\LDB Image Ultra\\글-1\\01-소제목.jpg'))
      .toBe('이미지 파일을 찾을 수 없습니다: 01-소제목.jpg');
    expect(summarizeImageInsertFailure('URL 이미지 다운로드 실패: ENOENT /home/user/tmp/a b.png')).toBe('URL 이미지 다운로드 실패: ENOENT a b.png');
  });

  it('여러 줄·긴 이유는 첫 줄 120자로 줄이고, 비어 있으면 빈 문자열', () => {
    expect(summarizeImageInsertFailure('파일 전송 오류: 네이버 에디터에서 이미지 업로드 거부 (용량 초과 또는 형식 오류)\n스택')).toBe('파일 전송 오류: 네이버 에디터에서 이미지 업로드 거부 (용량 초과 또는 형식 오류)');
    expect(summarizeImageInsertFailure('가'.repeat(300))).toHaveLength(120);
    expect(summarizeImageInsertFailure('')).toBe('');
    expect(summarizeImageInsertFailure(undefined)).toBe('');
  });

  it('삽입 실패 문구가 마지막 이유를 함께 싣는다(기존 IMAGE_INSERTION_FAILED 접두는 그대로)', () => {
    const helpers = readFileSync(resolve('src/automation/imageHelpers.ts'), 'utf8');
    expect(helpers).toContain('회 삽입 실패 [${fileFacts}]${attemptReasons.length ? ` (${describeImageInsertAttempts(attemptReasons)})` : \'\'}');
    expect(helpers).toContain('attemptReasons.push(lastInsertReason)');
    expect(helpers).toContain('lastInsertReason = summarizeImageInsertFailure((error as Error)?.message)');
    expect(helpers).toContain('throw new Error(`IMAGE_INSERTION_FAILED:${failures.length}/${images.length}개 이미지 삽입 실패');
  });
});

describe('이미지 삽입 실패: 슬래시 경로 요약', () => {
  it('슬래시·역슬래시·이중 역슬래시 경로 모두 파일 이름만 남긴다', () => {
    const bs = String.fromCharCode(92);
    expect(summarizeImageInsertFailure("open 'C:/Users/홍길동/Downloads/x/3b2f.png'")).toBe("open '3b2f.png'");
    expect(summarizeImageInsertFailure(`open 'C:${bs}${bs}Users${bs}${bs}홍길동${bs}${bs}x${bs}${bs}a.png'`)).toBe("open 'a.png'");
  });
});

describe('describeImageInsertAttempts: 회차별 이유 묶기', () => {
  it('같은 이유가 이어지면 묶는다', () => {
    expect(describeImageInsertAttempts(['A', 'B', 'B'])).toBe('1회: A | 2~3회: B');
    expect(describeImageInsertAttempts(['A', 'A', 'A'])).toBe('1~3회: A');
    expect(describeImageInsertAttempts([])).toBe('');
  });
  it('묶음마다 80자로 자른다', () => {
    expect(describeImageInsertAttempts(['가'.repeat(200)])).toBe(`1회: ${'가'.repeat(80)}`);
  });
});

describe('describeImageFileForFailure: 파일 사실(경로 없음)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'img-facts-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('PNG 매직을 담은 .jpg 는 실제 형식을 알려준다', async () => {
    const file = join(dir, 'fake.jpg');
    writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), Buffer.alloc(800)]));
    expect(await describeImageFileForFailure(file)).toBe('.jpg(실제 png) 812B');
  });
  it('이미지가 아닌 텍스트는 형식 확인 안 됨', async () => {
    const file = join(dir, 'text.jpg');
    writeFileSync(file, 'x'.repeat(126));
    expect(await describeImageFileForFailure(file)).toBe('.jpg(형식 확인 안 됨) 126B');
  });
  it('정상 jpg 는 확장자와 크기만, 경로는 넣지 않는다', async () => {
    const file = join(dir, 'ok.jpg');
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), Buffer.alloc(2 * 1024 * 1024)]));
    const facts = await describeImageFileForFailure(file);
    expect(facts).toBe('.jpg 2.0MB');
    expect(facts).not.toContain(dir);
  });
  it('URL·data·없는 파일', async () => {
    expect(await describeImageFileForFailure('https://example.com/a.png')).toBe('URL');
    expect(await describeImageFileForFailure(`data:image/png;base64,${'A'.repeat(1_500_000)}`)).toBe('image/png 1.1MB');
    expect(await describeImageFileForFailure(join(dir, 'none.jpg'))).toBe('파일 읽기 실패');
  });
});
