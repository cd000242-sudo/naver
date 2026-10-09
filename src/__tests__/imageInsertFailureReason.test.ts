/**
 * [2026-10-09 고객 신고] "IMAGE_INSERTION_FAILED:1/1개 이미지 삽입 실패 — 이미지 1: 3회 삽입 실패" 만 화면에 남아
 * 고객이 오류를 복사해 보내도 왜 실패했는지 알 수 없었다. 마지막 시도의 이유를 문구에 붙인다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeImageInsertFailure } from '../automation/imageInsertFailureReason';

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
    expect(helpers).toContain('회 삽입 실패${lastInsertReason ? ` (마지막 이유: ${lastInsertReason})` : \'\'}');
    expect(helpers).toContain('lastInsertReason = summarizeImageInsertFailure((error as Error)?.message)');
    expect(helpers).toContain('throw new Error(`IMAGE_INSERTION_FAILED:${failures.length}/${images.length}개 이미지 삽입 실패');
  });
});
