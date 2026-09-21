import http from 'http';
import https from 'https';

/*
 * [2026-09-21 사장님 진단리포트 09-18] 외부 URL 이미지가 "이미지 다운로드 실패: 302 Found" 로
 * 3회 전부 실패해 건너뛰어졌다. 네 군데 복사돼 있던 다운로드 코드가 전부 2xx 만 받고
 * 리다이렉트를 실패로 취급했다. 여기 한 곳으로 모은다:
 *   - 301/302/303/307/308 을 최대 5번 따라간다 (상대 Location 포함)
 *   - Referer 를 원본 사이트로 보낸다 (핫링크 차단 사이트가 302 로 튕기는 흔한 이유)
 *   - 받은 바이트가 이미지인지 확인한다 — HTML 차단 페이지를 .jpg 로 저장하면
 *     네이버가 "파일 형식 오류" 를 내고 원인을 알 수 없게 된다
 */

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface DownloadImageOptions {
  timeoutMs?: number;
  /** 기본값: URL 의 origin. 빈 문자열이면 보내지 않는다. */
  referer?: string;
  /** SSL 검증 무시 여부 (공공 사이트 인증서 문제 대응). 기본 true. */
  insecureTls?: boolean;
}

export interface DownloadedImage {
  buffer: Buffer;
  contentType: string;
  finalUrl: string;
}

const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
  secureOptions: 0x4, // SSL_OP_LEGACY_SERVER_CONNECT
});

export function sniffImageMagic(buffer: Buffer): 'jpg' | 'png' | 'gif' | 'webp' | 'bmp' | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp';
  return null;
}

function requestOnce(
  target: string,
  options: Required<Pick<DownloadImageOptions, 'timeoutMs' | 'insecureTls'>> & { referer: string },
): Promise<{ status: number; statusMessage: string; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const parsed = new URL(target);
  const isHttps = parsed.protocol === 'https:';
  const client = isHttps ? https : http;
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  };
  if (options.referer) headers.Referer = options.referer;

  return new Promise((resolve, reject) => {
    const request = client.get(target, {
      agent: isHttps && options.insecureTls ? insecureAgent : undefined,
      headers,
      timeout: options.timeoutMs,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        statusMessage: response.statusMessage || '',
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('이미지 다운로드 타임아웃'));
    });
  });
}

export async function downloadImageBuffer(
  imageUrl: string,
  options: DownloadImageOptions = {},
): Promise<DownloadedImage> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const insecureTls = options.insecureTls ?? true;
  const origin = new URL(imageUrl).origin;
  const referer = options.referer === undefined ? `${origin}/` : options.referer;

  let current = imageUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestOnce(current, { timeoutMs, insecureTls, referer });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = String(response.headers.location || '').trim();
      if (!location) {
        throw new Error(`이미지 다운로드 실패: ${response.status} (Location 없음)`);
      }
      current = new URL(location, current).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`이미지 다운로드 실패: ${response.status} ${response.statusMessage}`.trim());
    }
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    const magic = sniffImageMagic(response.body);
    if (!magic && !contentType.startsWith('image/')) {
      const kind = contentType || (response.body.subarray(0, 64).toString('utf8').trim().startsWith('<') ? 'text/html' : '알 수 없음');
      throw new Error(`이미지 다운로드 실패: 이미지가 아닌 응답(${kind}, ${response.body.length}B) — 핫링크 차단 가능성`);
    }
    return { buffer: response.body, contentType, finalUrl: current };
  }
  throw new Error(`이미지 다운로드 실패: 리다이렉트 ${MAX_REDIRECTS}회 초과`);
}
