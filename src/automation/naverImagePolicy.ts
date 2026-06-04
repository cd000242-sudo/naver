export const NAVER_SINGLE_IMAGE_MAX_MB = 20;
export const NAVER_BATCH_IMAGE_MAX_MB = 50;

export const NAVER_SINGLE_IMAGE_MAX_BYTES = NAVER_SINGLE_IMAGE_MAX_MB * 1024 * 1024;
export const NAVER_BATCH_IMAGE_MAX_BYTES = NAVER_BATCH_IMAGE_MAX_MB * 1024 * 1024;

export const NAVER_SUPPORTED_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
] as const;

export type NaverSupportedImageExtension = typeof NAVER_SUPPORTED_IMAGE_EXTENSIONS[number];

export type NaverImagePolicyIssueCode =
  | 'UNSUPPORTED_EXTENSION'
  | 'SINGLE_FILE_TOO_LARGE'
  | 'BATCH_TOO_LARGE'
  | 'NON_ASCII_FILENAME';

export interface NaverImageCandidate {
  fileName?: string;
  filePath?: string;
  sizeBytes?: number;
}

export interface NaverImagePolicyIssue {
  code: NaverImagePolicyIssueCode;
  severity: 'error' | 'warning';
  message: string;
  fileName?: string;
}

const SUPPORTED_EXTENSIONS = new Set<string>(NAVER_SUPPORTED_IMAGE_EXTENSIONS);

export function normalizeNaverImageExtension(fileNameOrExtension: string): string {
  const withoutQuery = fileNameOrExtension.split(/[?#&]/)[0] ?? '';
  const lastSegment = withoutQuery.split(/[\\/]/).pop() ?? withoutQuery;
  const extension = lastSegment.includes('.') ? lastSegment.split('.').pop() : lastSegment;
  return (extension ?? '').replace(/^\./, '').trim().toLowerCase();
}

export function isSupportedNaverImageExtension(fileNameOrExtension: string): boolean {
  return SUPPORTED_EXTENSIONS.has(normalizeNaverImageExtension(fileNameOrExtension));
}

export function resolveNaverSupportedImageExtension(
  fileNameOrExtension: string,
  fallback: NaverSupportedImageExtension = 'jpg',
): NaverSupportedImageExtension {
  const extension = normalizeNaverImageExtension(fileNameOrExtension);
  return isSupportedNaverImageExtension(extension)
    ? (extension as NaverSupportedImageExtension)
    : fallback;
}

export function isNaverRecommendedAsciiFileName(fileNameOrPath: string): boolean {
  const fileName = fileNameOrPath.split(/[\\/]/).pop() ?? fileNameOrPath;
  return /^[A-Za-z0-9._-]+$/.test(fileName) && /[A-Za-z0-9]/.test(fileName);
}

export function inspectNaverImagePolicy(candidates: NaverImageCandidate[]): NaverImagePolicyIssue[] {
  const issues: NaverImagePolicyIssue[] = [];
  let totalBytes = 0;

  for (const candidate of candidates) {
    const fileName = candidate.fileName || candidate.filePath || 'image';

    if (!isSupportedNaverImageExtension(fileName)) {
      issues.push({
        code: 'UNSUPPORTED_EXTENSION',
        severity: 'error',
        fileName,
        message: `Naver Blog supports JPG, GIF, PNG, BMP, and WEBP images. Unsupported file: ${fileName}`,
      });
    }

    if (typeof candidate.sizeBytes === 'number') {
      totalBytes += candidate.sizeBytes;

      if (candidate.sizeBytes > NAVER_SINGLE_IMAGE_MAX_BYTES) {
        issues.push({
          code: 'SINGLE_FILE_TOO_LARGE',
          severity: 'error',
          fileName,
          message: `Naver Blog allows up to ${NAVER_SINGLE_IMAGE_MAX_MB}MB per image. File is ${(candidate.sizeBytes / (1024 * 1024)).toFixed(1)}MB: ${fileName}`,
        });
      }
    }

    if (!isNaverRecommendedAsciiFileName(fileName)) {
      issues.push({
        code: 'NON_ASCII_FILENAME',
        severity: 'warning',
        fileName,
        message: `Naver recommends English/number file names for image uploads: ${fileName}`,
      });
    }
  }

  if (totalBytes > NAVER_BATCH_IMAGE_MAX_BYTES) {
    issues.push({
      code: 'BATCH_TOO_LARGE',
      severity: 'error',
      message: `Naver Blog allows up to ${NAVER_BATCH_IMAGE_MAX_MB}MB per upload batch. Batch is ${(totalBytes / (1024 * 1024)).toFixed(1)}MB.`,
    });
  }

  return issues;
}
