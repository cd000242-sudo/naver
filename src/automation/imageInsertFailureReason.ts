/**
 * [2026-10-09 고객 신고] 화면 오류에 "이미지 1: 3회 삽입 실패" 만 남아 원인을 알 수 없었다.
 * 마지막 시도의 이유를 붙이되, 고객 PC 사용자 이름이 드러나지 않게 파일 경로는 파일 이름만 남긴다.
 */
const WINDOWS_PATH = /[A-Za-z]:\\(?:[^\\\n:*?"<>|]+\\)*([^\\\n:*?"<>|]+)/g;
const POSIX_PATH = /(?:^|\s)\/(?:[^/\n]+\/)+([^/\n]+)/g;

export function summarizeImageInsertFailure(message: string | undefined | null): string {
  const firstLine = String(message ?? '').split('\n')[0].trim();
  return firstLine
    .replace(WINDOWS_PATH, '$1')
    .replace(POSIX_PATH, (match, name: string) => `${match.startsWith(' ') ? ' ' : ''}${name}`)
    .slice(0, 120);
}
