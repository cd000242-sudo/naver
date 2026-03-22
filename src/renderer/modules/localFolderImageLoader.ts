// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-03-22] 로컬 폴더 이미지 로더 모듈
// 로컬 폴더에서 이미지를 스캔하고 소제목에 매핑하는 유틸리티
// ═══════════════════════════════════════════════════════════════════

import { shouldGenerateImageForHeading } from '../components/HeadingImageSettings.js';

/** 로컬 폴더 이미지 — AutomationImage 호환 */
export interface LocalFolderImage {
  heading: string;
  filePath: string;
  provider: 'local-folder';
  alt: string;
  isThumbnail?: boolean;
}

/** 파싱 결과 중간 객체 */
interface ParsedFile {
  fileName: string;
  fullPath: string;
  isThumbnail: boolean;
  sortOrder: number;
  fileSize: number;
}

/** 지원 이미지 확장자 */
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/** 썸네일 인식 키워드 */
const THUMBNAIL_KEYWORDS = ['썸네일', 'thumbnail', 'thumb', '대표'];

/** 5MB 리사이즈 임계값 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * 로컬 폴더 스캔 → 파싱 → heading 매핑
 * @param folderPath  선택된 폴더 절대 경로
 * @param headings    structuredContent.headings (title 필드 필수)
 * @returns AutomationImage 호환 배열
 */
export async function parseLocalFolderImages(
  folderPath: string,
  headings: Array<{ title: string; isThumbnail?: boolean; isIntro?: boolean }>
): Promise<LocalFolderImage[]> {
  // ✅ [Issue #5 FIX] trailing 슬래시/백슬래시 정규화
  folderPath = folderPath.replace(/[\\/]+$/, '');
  console.log(`[LocalFolder] 📂 폴더 스캔 시작: ${folderPath}`);
  console.log(`[LocalFolder] 소제목 ${headings.length}개`);

  // 1. 폴더 존재 확인 (기존 IPC 재활용)
  try {
    const exists = await (window as any).api.checkFileExists(folderPath);
    if (!exists) {
      console.error(`[LocalFolder] ❌ 폴더를 찾을 수 없습니다: ${folderPath}`);
      return [];
    }
  } catch (e) {
    console.error(`[LocalFolder] ❌ 폴더 접근 실패:`, e);
    return [];
  }

  // 2. 파일 목록 스캔 (기존 IPC 재활용)
  let files: Array<{ name: string; isFile: boolean; isDirectory: boolean; size: number }>;
  try {
    files = await (window as any).api.readDirWithStats(folderPath);
  } catch (e) {
    console.error(`[LocalFolder] ❌ 폴더 읽기 실패:`, e);
    return [];
  }

  // 3. 이미지 필터 + 파싱
  const parsed: ParsedFile[] = [];
  const seenNumbers = new Map<number, string>(); // 중복 번호 감지

  for (const f of files) {
    if (!f.isFile) continue;

    const lowerName = f.name.toLowerCase();
    const hasValidExt = SUPPORTED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    if (!hasValidExt) continue;

    // size=0 → 깨진 이미지 스킵
    if (f.size === 0) {
      console.warn(`[LocalFolder] ⚠️ 빈 파일 스킵: ${f.name}`);
      continue;
    }

    const baseName = f.name.replace(/\.[^.]+$/, '');
    const isThumbnail = THUMBNAIL_KEYWORDS.some(
      k => baseName.toLowerCase().includes(k)
    );
    const numMatch = baseName.match(/^(\d+)/);
    const sortOrder = numMatch ? parseInt(numMatch[1], 10) : Infinity;

    // 같은 번호 중복 경고
    if (numMatch && seenNumbers.has(sortOrder)) {
      console.warn(`[LocalFolder] ⚠️ 번호 ${sortOrder} 중복: ${f.name} (이전: ${seenNumbers.get(sortOrder)}) → 첫 번째 파일 사용`);
      continue;
    }
    if (numMatch) {
      seenNumbers.set(sortOrder, f.name);
    }

    // ✅ renderer에서 path.join 사용 불가 → 문자열 결합 (기존 패턴: localImageModals.ts L50)
    const fullPath = `${folderPath}/${f.name}`.replace(/\\/g, '/');

    parsed.push({
      fileName: baseName,
      fullPath,
      isThumbnail,
      sortOrder,
      fileSize: f.size
    });
  }

  // 4. 빈 폴더 체크
  if (parsed.length === 0) {
    console.warn('[LocalFolder] ⚠️ 폴더에 이미지 파일이 없습니다');
    return [];
  }

  console.log(`[LocalFolder] ✅ ${parsed.length}개 이미지 파일 발견`);

  // 5. 분리: 썸네일 + 나머지 (자연수 정렬)
  const thumbnails = parsed.filter(p => p.isThumbnail);
  const numbered = parsed.filter(p => !p.isThumbnail)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // 6. 5MB 초과 리사이즈 (IPC 호출)
  for (const p of [...thumbnails, ...numbered]) {
    if (p.fileSize > MAX_FILE_SIZE) {
      try {
        console.log(`[LocalFolder] 📐 리사이즈: ${p.fileName} (${(p.fileSize / 1024 / 1024).toFixed(1)}MB)`);
        const result = await (window as any).api.resizeImage(p.fullPath, 1920, 1080);
        if (result?.success && result.filePath) {
          p.fullPath = result.filePath;
        }
      } catch (e) {
        console.warn(`[LocalFolder] ⚠️ 리사이즈 실패 (원본 사용): ${p.fileName}`, e);
        // 원본 그대로 사용 (네이버 업로드 시 자체 리사이즈될 수 있음)
      }
    }
  }

  // 7. heading 매핑
  const result: LocalFolderImage[] = [];

  // 7a. 썸네일 → isThumbnail/isIntro heading 또는 첫 번째 heading
  const thumbHeading = headings.find(h => h.isThumbnail || h.isIntro) || headings[0];
  if (thumbnails.length > 0 && thumbHeading) {
    result.push({
      heading: thumbHeading.title,
      filePath: thumbnails[0].fullPath,
      provider: 'local-folder',
      alt: thumbHeading.title,
      isThumbnail: true
    });
    console.log(`[LocalFolder] 🖼️ 썸네일: ${thumbnails[0].fileName} → "${thumbHeading.title}"`);
  } else if (thumbnails.length === 0 && numbered.length > 0) {
    // 썸네일 파일 없으면 1번 이미지를 썸네일로 복제
    if (thumbHeading) {
      result.push({
        heading: thumbHeading.title,
        filePath: numbered[0].fullPath,
        provider: 'local-folder',
        alt: thumbHeading.title,
        isThumbnail: true
      });
      console.log(`[LocalFolder] 🖼️ 썸네일 대체: ${numbered[0].fileName} → "${thumbHeading.title}"`);
    }
  }

  // 7b. 숫자 파일 → heading 순서대로
  const remainingHeadings = headings.filter(h => !h.isThumbnail && !h.isIntro);
  const mappingCount = Math.min(numbered.length, remainingHeadings.length);

  let imageIdx = 0;
  for (let i = 0; i < remainingHeadings.length && imageIdx < numbered.length; i++) {
    // ✅ [Issue #4 FIX] headingImageMode 적용 (홀수/짝수/썸네일만 모드)
    if (!shouldGenerateImageForHeading(i, false)) {
      console.log(`[LocalFolder] ⏭️ 소제목 "${remainingHeadings[i].title}" → headingImageMode에 의해 스킵`);
      continue;
    }
    result.push({
      heading: remainingHeadings[i].title,
      filePath: numbered[imageIdx].fullPath,
      provider: 'local-folder',
      alt: remainingHeadings[i].title
    });
    console.log(`[LocalFolder] 📷 ${numbered[imageIdx].fileName} → "${remainingHeadings[i].title}"`);
    imageIdx++;
  }

  // 매핑 결과 경고
  if (numbered.length > remainingHeadings.length) {
    console.warn(`[LocalFolder] ⚠️ 이미지(${numbered.length}장) > 소제목(${remainingHeadings.length}개) → ${numbered.length - remainingHeadings.length}장 미사용`);
  } else if (numbered.length < remainingHeadings.length) {
    console.warn(`[LocalFolder] ⚠️ 이미지(${numbered.length}장) < 소제목(${remainingHeadings.length}개) → ${remainingHeadings.length - numbered.length}개 소제목 이미지 없음`);
  }

  console.log(`[LocalFolder] ✅ 총 ${result.length}장 매핑 완료`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// ✅ 모듈 등록 (dual-pattern)
// - ES Module export: multiAccountManager.ts가 import로 사용
// - Window 전역 등록: fullAutoFlow.ts가 declare로 사용
// ═══════════════════════════════════════════════════════════════════
(window as any).parseLocalFolderImages = parseLocalFolderImages;

console.log('[LocalFolderImageLoader] 📦 모듈 로드됨!');
