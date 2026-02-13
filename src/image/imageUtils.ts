import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export async function ensureDirectory(): Promise<string> {
  // 테스트 환경에서는 환경변수를 사용
  if (process.env.TEST_MODE && process.env.GENERATED_IMAGES_DIR) {
    const baseDir = process.env.GENERATED_IMAGES_DIR;
    await fs.mkdir(baseDir, { recursive: true });
    return baseDir;
  }

  // Electron 환경에서는 app.getPath 사용
  try {
    if (app && typeof app.getPath === 'function') {
      const baseDir = path.join(app.getPath('userData'), 'generated-images');
      await fs.mkdir(baseDir, { recursive: true });
      return baseDir;
    }
  } catch {
    // Electron app이 없는 경우 무시
  }

  // Fallback: 사용자 홈 디렉토리 사용
  const os = await import('os');
  const baseDir = path.join(os.homedir(), '.naver-blog-automation', 'generated-images');
  await fs.mkdir(baseDir, { recursive: true });
  return baseDir;
}

// ✅ 이미지 저장 기본 경로 가져오기 (설정에서 사용자 지정 경로 또는 기본 경로)
export async function getImageSaveBasePath(): Promise<string> {
  try {
    const { loadConfig } = await import('../configManager.js');
    const config = await loadConfig();

    if (config.customImageSavePath && config.customImageSavePath.trim() !== '') {
      // 사용자 지정 경로 사용
      return config.customImageSavePath;
    }
  } catch (error) {
    console.warn('[ImagePath] 설정 로드 실패, 기본 경로 사용:', error);
  }

  // 기본 경로: Downloads/naver-blog-images
  const os = await import('os');
  return path.join(os.homedir(), 'Downloads', 'naver-blog-images');
}

export async function writeImageFile(buffer: Buffer, extension: string, heading?: string, postTitle?: string, postId?: string): Promise<{ filePath: string; previewDataUrl: string; savedToLocal?: string }> {
  // ✅ 이미지 리사이징 (일관된 크기로 조정)
  let processedBuffer = buffer;
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default || sharpModule;
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // 목표 크기: 너비 1200px, 비율 유지
    const targetWidth = 1200;
    const targetHeight = Math.round((metadata.height || targetWidth) * (targetWidth / (metadata.width || targetWidth)));

    // 이미지가 목표 크기보다 크거나 작으면 리사이징
    if (metadata.width && metadata.width !== targetWidth) {
      const processedImage = image.resize(targetWidth, targetHeight, {
        fit: 'inside', // 비율 유지하면서 안쪽에 맞춤
        withoutEnlargement: false, // 작은 이미지도 확대 허용
      });

      // JPEG 품질 설정 (85% - 좋은 품질과 파일 크기 균형)
      if (extension === 'jpg' || extension === 'jpeg') {
        processedBuffer = await processedImage.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      } else if (extension === 'png') {
        processedBuffer = await processedImage.png({ quality: 90, compressionLevel: 9 }).toBuffer();
      } else if (extension === 'webp') {
        processedBuffer = await processedImage.webp({ quality: 85 }).toBuffer();
      } else {
        // 기타 형식은 리사이징만
        processedBuffer = await processedImage.toBuffer();
      }

      console.log(`[ImageGenerator] 이미지 리사이징: ${metadata.width}x${metadata.height} → ${targetWidth}x${targetHeight}`);
    }
  } catch (resizeError) {
    // 리사이징 실패 시 원본 사용
    console.warn('[ImageGenerator] 이미지 리사이징 실패, 원본 사용:', (resizeError as Error).message);
    processedBuffer = buffer;
  }

  const dir = await ensureDirectory();
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.${extension}`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, processedBuffer);

  // ✅ 사용자 접근 가능한 로컬 위치에도 저장 (글 ID별 폴더 구조)
  let savedToLocal: string | undefined;
  try {
    const basePath = await getImageSaveBasePath();

    // ✅ 제목 폴더로만 저장 (날짜 폴더 없이 바로 제목 폴더)
    let blogImagesPath: string;

    if (postTitle && postTitle.trim()) {
      // 제목 폴더만 사용 (날짜 폴더 없음)
      const safeTitleFolder = postTitle
        .replace(/[<>:"/\\|?*]/g, '_')  // 파일명에 사용할 수 없는 문자 제거
        .replace(/\s+/g, '_')            // 공백을 언더스코어로 변경
        .substring(0, 100)                // 최대 100자로 제한
        .trim() || 'untitled';
      blogImagesPath = path.join(basePath, safeTitleFolder);
    } else if (postId) {
      // ✅ [2026-01-20] 글ID도 안전한 폴더명으로 변환 (특수문자 제거)
      const safePostIdFolder = postId
        .replace(/[<>:"/\\|?*]/g, '_')  // 파일명에 사용할 수 없는 문자 제거
        .replace(/\s+/g, '_')            // 공백을 언더스코어로 변경
        .substring(0, 100)               // 최대 100자로 제한
        .trim() || 'untitled';
      blogImagesPath = path.join(basePath, safePostIdFolder);
    } else {
      // 둘 다 없으면 날짜_시간 폴더 사용
      const now = new Date();
      const dateTimeFolder = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      blogImagesPath = path.join(basePath, dateTimeFolder);
    }

    await fs.mkdir(blogImagesPath, { recursive: true });

    // 파일명을 소제목 기반으로 생성 (안전한 파일명으로 변환)
    const safeHeading = heading
      ? heading.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50).trim() || 'image'
      : 'image';
    // ✅ 중복 방지: 타임스탬프 추가
    const timestamp = Date.now();
    const localFileName = `${safeHeading}-${timestamp}.${extension}`;
    const localFilePath = path.join(blogImagesPath, localFileName);

    await fs.writeFile(localFilePath, processedBuffer);
    savedToLocal = localFilePath;

    console.log(`[ImageGenerator] 이미지 로컬 저장 완료: ${localFilePath} (글 ID: ${postId || '없음'})`);
  } catch (error) {
    // 다운로드 폴더 저장 실패는 무시 (기본 저장 위치는 성공)
    console.warn('[ImageGenerator] 다운로드 폴더 저장 실패:', (error as Error).message);
  }

  const previewDataUrl = `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${processedBuffer.toString('base64')}`;
  return { filePath, previewDataUrl, savedToLocal };
}

/**
 * 이미지 프롬프트를 안전하게 변환하는 함수
 * 콘텐츠 정책 위배 키워드를 제거하거나 안전한 표현으로 변환
 */
export function sanitizeImagePrompt(prompt: string): string {
  if (!prompt) return '';
  let sanitized = String(prompt).trim();

  // 위험한 키워드와 안전한 대체 표현 매핑
  const dangerousKeywords: Record<string, string> = {
    // 건강/의료 관련 - 중립적 표현으로 변경
    '멍투성이': '일상적인 생활',
    '멍': '일상적인 모습',
    '아픈': '건강 관리',
    '병원': '일상적인 공간',
    '의료': '일상적인 활동',
    '부상': '일상적인 모습',
    '다쳤': '일상적인 생활',
    '상처': '일상적인 모습',

    // 부정적 감정 - 긍정적 표현으로 변경
    '힘든': '노력하는',
    '고통': '성장하는',
    '스트레스': '관리하는',
    '피로': '회복하는',
    '우울': '긍정적인',

    // 폭력 관련 - 중립적 표현으로 변경
    '폭력': '일상적인',
    '싸움': '소통하는',
    '갈등': '협력하는',
  };

  // 위험한 키워드 찾아서 대체
  for (const [dangerous, safe] of Object.entries(dangerousKeywords)) {
    if (sanitized.includes(dangerous)) {
      sanitized = sanitized.replace(new RegExp(dangerous, 'gi'), safe);
    }
  }

  // 영어 프롬프트 변환 시 안전한 표현으로 변환
  const englishReplacements: Record<string, string> = {
    'bruised': 'healthy',
    'injured': 'active',
    'hospital': 'home',
    'sick': 'wellness',
    'pain': 'comfort',
    'suffering': 'living',
    'hurt': 'care',
    'wound': 'daily life',
    'medical': 'everyday',
    'treatment': 'routine',
    'illness': 'health',
    'disease': 'wellness',
  };

  for (const [dangerous, safe] of Object.entries(englishReplacements)) {
    sanitized = sanitized.replace(new RegExp(`\\b${dangerous}\\b`, 'gi'), safe);
  }

  // 안전한 접두사 추가 (프롬프트를 더 안전하게 만들기)
  if (!sanitized.toLowerCase().includes('professional') && !sanitized.toLowerCase().includes('safe')) {
    sanitized = `Professional, safe, positive, ${sanitized}`;
  }

  // 부정적 단어가 남아있는지 확인
  const negativeWords = ['bruised', 'injured', 'hurt', 'pain', 'sick', 'hospital', 'medical treatment'];
  for (const word of negativeWords) {
    if (sanitized.toLowerCase().includes(word)) {
      // 부정적 단어가 있으면 일반적인 긍정적 표현으로 대체
      sanitized = sanitized.replace(new RegExp(`\\b${word}\\b`, 'gi'), 'healthy lifestyle');
    }
  }

  return sanitized.trim();
}

/**
 * 이미지 URL을 다운로드하고 저장하는 함수
 */
export async function downloadAndSaveImage(
  imageUrl: string,
  heading: string,
  postTitle?: string,
  postId?: string
): Promise<{ filePath: string; previewDataUrl: string; savedToLocal?: string }> {
  try {
    // URL에서 이미지 다운로드 (Node.js 내장 모듈 사용)
    const https = await import('https');
    const http = await import('http');
    const url = await import('url');

    // SSL 검증 무시 (공공 사이트의 SSL 설정 문제 대응)
    const agent = new https.Agent({
      rejectUnauthorized: false,
      secureOptions: 0x4, // SSL_OP_LEGACY_SERVER_CONNECT
    });

    // URL 파싱
    const parsedUrl = new url.URL(imageUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    // Promise로 래핑하여 다운로드
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const request = client.get(imageUrl, {
        agent: isHttps ? agent : undefined,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30000, // 30초 타임아웃
      }, (response) => {
        if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
          reject(new Error(`이미지 다운로드 실패: ${response.statusCode} ${response.statusMessage || ''}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('이미지 다운로드 타임아웃'));
      });
    });

    // 파일 확장자 추출
    const urlPath = new URL(imageUrl).pathname;
    let ext = path.extname(urlPath).toLowerCase() || '.jpg';
    const validExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';

    // GIF는 PNG로 변환 (리사이징을 위해)
    if (ext === '.gif') {
      ext = '.png';
    }

    // 이미지 저장 (리사이징 포함)
    const { filePath, previewDataUrl, savedToLocal } = await writeImageFile(
      buffer,
      validExt.slice(1), // 확장자에서 점 제거
      heading,
      postTitle,
      postId
    );

    return { filePath, previewDataUrl, savedToLocal };
  } catch (error) {
    console.error('[ImageGenerator] 이미지 다운로드 및 저장 실패:', error);
    throw error;
  }
}

/**
 * ✅ [2026-01-24] 유사 이미지 필터링 함수
 * - perceptual hash (aHash) 기반으로 스티커/워터마크가 붙은 같은 이미지도 중복으로 감지
 * - 수집된 이미지 목록에서 유사한 이미지를 필터링하여 고유한 이미지만 반환
 */
export async function filterSimilarImages(
  imageUrls: string[],
  similarityThreshold: number = 10  // Hamming distance 임계값 (낮을수록 엄격)
): Promise<string[]> {
  if (!imageUrls || imageUrls.length <= 1) return imageUrls;

  const axios = (await import('axios')).default;
  const sharp = (await import('sharp')).default;

  // aHash 계산 함수 (8x8 = 64bit)
  async function computeAHash(buffer: Buffer): Promise<bigint | null> {
    try {
      const pixels = await sharp(buffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

      if (!pixels || pixels.length < 64) return null;

      let sum = 0;
      for (let i = 0; i < 64; i++) sum += pixels[i];
      const avg = sum / 64;

      let bits = 0n;
      for (let i = 0; i < 64; i++) {
        if (pixels[i] > avg) {
          bits |= 1n << BigInt(63 - i);
        }
      }
      return bits;
    } catch {
      return null;
    }
  }

  // Hamming distance 계산
  function hammingDistance(a: bigint, b: bigint): number {
    let v = a ^ b;
    let count = 0;
    while (v) {
      count += Number(v & 1n);
      v >>= 1n;
    }
    return count;
  }

  console.log(`[ImageFilter] 🔍 ${imageUrls.length}개 이미지 유사도 검사 시작...`);

  const uniqueImages: { url: string; hash: bigint }[] = [];
  const skippedUrls: string[] = [];

  for (const item of imageUrls) {
    // ✅ [2026-02-01] 객체 배열도 처리 (item이 객체일 수 있음)
    let url: string;
    if (typeof item === 'string') {
      url = item;
    } else if (item && typeof item === 'object') {
      // 객체인 경우 url, thumbnailUrl, src 등에서 URL 추출
      url = (item as any).url || (item as any).thumbnailUrl || (item as any).src || '';
    } else {
      continue;
    }

    // URL 유효성 검사
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      console.warn(`[ImageFilter] ⚠️ 유효하지 않은 URL 형식, 스킵: ${JSON.stringify(item).substring(0, 80)}...`);
      continue;
    }

    try {
      // 이미지 다운로드 (타임아웃 5초)
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const buffer = Buffer.from(response.data);
      const hash = await computeAHash(buffer);

      if (!hash) {
        // 해시 계산 실패 시 포함 (무시하지 않음)
        uniqueImages.push({ url, hash: 0n });
        continue;
      }

      // 기존 이미지들과 유사도 비교
      let isDuplicate = false;
      for (const existing of uniqueImages) {
        if (existing.hash === 0n) continue; // 해시 없는 이미지는 비교 건너뜀

        const distance = hammingDistance(hash, existing.hash);
        if (distance <= similarityThreshold) {
          isDuplicate = true;
          skippedUrls.push(url);
          console.log(`[ImageFilter] ⚠️ 유사 이미지 감지 (distance=${distance}): ${url.substring(0, 60)}...`);
          break;
        }
      }

      if (!isDuplicate) {
        uniqueImages.push({ url, hash });
      }
    } catch (error) {
      // 다운로드 실패 시 포함 (유사도 검사 불가)
      console.warn(`[ImageFilter] ⚠️ 이미지 다운로드 실패, 포함: ${(error as Error).message}`);
      uniqueImages.push({ url, hash: 0n });
    }
  }

  const result = uniqueImages.map(item => item.url);
  console.log(`[ImageFilter] ✅ 유사 이미지 필터링 완료: ${imageUrls.length}개 → ${result.length}개 (${skippedUrls.length}개 제거)`);

  return result;
}
