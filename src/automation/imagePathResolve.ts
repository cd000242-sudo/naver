// src/automation/imagePathResolve.ts
// 이미지 객체에서 "쓸 수 있는 경로 문자열"만 골라낸다.
//
// [2026-08-26 사장님 실측] 반자동 발행이 첫 소제목 직후에 죽었다.
//   콘텐츠 적용 실패 (1회 시도 후): filePath.substring is not a function
//
// 원인: savedToLocal 은 `string | boolean` 이다(types.ts:39). 이미지를 로컬에 저장했다는
// 사실만 알리고 경로는 filePath 에 담기는 경우가 있어서 `true` 가 들어온다.
// 그런데 여러 곳이 이렇게 쓰고 있었다.
//     const filePath = img.filePath || img.savedToLocal || img.url || '경로 없음';
//     filePath.substring(0, 80)                     ← true.substring → 크래시
// runOptionsPolicy 는 `savedToLocal === true` 를 따로 처리할 만큼 이 사실을 알고 있었는데,
// 다른 호출부는 문자열이라고 가정하고 있었다.
//
// 더 나쁜 건 터진 자리가 **로그 한 줄**이었다는 것이다. 화면에 이미지 경로를 찍으려다
// 발행 전체가 멈췄다. 값을 고르는 일과 찍는 일 모두 여기서 안전하게 처리한다.

/** 경로로 쓸 수 있는 문자열인가. 빈 문자열·불리언·객체는 아니다. */
function usablePath(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export interface ImageLikeSource {
  filePath?: unknown;
  savedToLocal?: unknown;
  url?: unknown;
  previewDataUrl?: unknown;
}

/**
 * 이미지에서 실제 경로 문자열을 고른다. 없으면 null.
 *
 * 순서는 기존 호출부와 같게 둔다(filePath → savedToLocal → url → previewDataUrl).
 * 달라진 것은 각 후보가 **문자열일 때만** 채택된다는 점뿐이다.
 */
export function resolveImagePath(image: ImageLikeSource | null | undefined): string | null {
  if (!image) return null;
  for (const candidate of [image.filePath, image.savedToLocal, image.url, image.previewDataUrl]) {
    if (usablePath(candidate)) return candidate.trim();
  }
  return null;
}

/**
 * 로그에 찍을 짧은 경로. 경로가 없거나 이상해도 절대 던지지 않는다.
 * 발행이 로그 한 줄 때문에 멈추는 일은 다시 없어야 한다.
 */
export function describeImagePath(image: ImageLikeSource | null | undefined, maxLength = 80): string {
  const path = resolveImagePath(image);
  if (!path) return '(경로 없음)';
  return path.length > maxLength ? `${path.slice(0, maxLength)}...` : path;
}
