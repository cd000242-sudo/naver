/**
 * ✅ [2026-02-27] 2단계 쇼핑 이미지 콘텐츠 분석 필터
 * ✅ [2026-03-12] 3단계 대표 이미지 유사도 필터 + 4단계 Gemini/OpenAI Vision 폴백 추가
 * 
 * 이미지를 실제 다운로드하여 픽셀 기반 분석으로 비제품 이미지를 필터링합니다.
 * 
 * 분석 항목:
 * 1. 실제 크기 (width/height) — 200x200 미만 제외
 * 2. 가로세로비 — 극단적 비율 (8:1 이상) 배너/장식 제외
 * 3. 색상 분산도 — 단색/플레이스홀더/텍스트 위주 이미지 제외
 * 4. 파일 크기 — 1KB 미만 스페이서, 극소 파일 제외
 * 5. pHash(aHash) 시각적 중복 — 동일/유사 이미지 중복 제거
 * 6. [NEW] 대표 이미지 유사도 — 갤러리 대표 이미지와 크게 다른 + 색상 단순 = 로고/배너 제외
 * 7. [NEW] AI Vision 분류 — 의심 이미지를 Gemini/OpenAI Vision으로 최종 판정
 */

interface ImageAnalysisResult {
    url: string;
    width: number;
    height: number;
    fileSize: number;
    aspectRatio: number;
    colorVariance: number;  // 색상 분산도 (0~255, 낮을수록 단색)
    hash: bigint;           // aHash for visual dedup
    passed: boolean;
    rejectReason?: string;
    /** ✅ [2026-03-12] 대표 이미지 대비 hamming distance */
    refDistance?: number;
}

/**
 * aHash 계산 (8x8 = 64bit perceptual hash)
 */
async function computeAHash(sharp: any, buffer: Buffer): Promise<bigint | null> {
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

/**
 * Hamming distance 계산 (두 해시 간 차이)
 */
function hammingDistance(a: bigint, b: bigint): number {
    let v = a ^ b;
    let count = 0;
    while (v) {
        count += Number(v & 1n);
        v >>= 1n;
    }
    return count;
}

/**
 * 단일 이미지 분석
 */
async function analyzeImage(
    sharp: any,
    url: string,
    buffer: Buffer,
): Promise<ImageAnalysisResult> {
    const fileSize = buffer.length;

    // 1. 파일 크기 체크 (1KB 미만 = 스페이서/아이콘)
    if (fileSize < 1024) {
        return {
            url, width: 0, height: 0, fileSize, aspectRatio: 0,
            colorVariance: 0, hash: 0n, passed: false,
            rejectReason: `파일 크기 너무 작음 (${fileSize}B)`,
        };
    }

    try {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        // 2. 실제 크기 체크 (200x200 미만 제외)
        if (width < 200 || height < 200) {
            return {
                url, width, height, fileSize,
                aspectRatio: width / (height || 1),
                colorVariance: 0, hash: 0n, passed: false,
                rejectReason: `크기 부족 (${width}x${height}, 최소 200x200)`,
            };
        }

        // 3. 가로세로비 체크 (극단적 비율 = 배너/줄/장식)
        const aspectRatio = Math.max(width, height) / Math.min(width, height);
        if (aspectRatio > 8) {
            return {
                url, width, height, fileSize, aspectRatio,
                colorVariance: 0, hash: 0n, passed: false,
                rejectReason: `극단적 비율 (${aspectRatio.toFixed(1)}:1, 최대 8:1)`,
            };
        }

        // 4. 색상 분산도 분석 (단색/플레이스홀더 감지)
        let colorVariance = 255; // 기본값: 정상
        try {
            const stats = await sharp(buffer)
                .resize(64, 64, { fit: 'fill' }) // 분석 속도를 위해 축소
                .stats();

            // channels 배열에서 각 채널의 stdev(표준편차) 평균 계산
            if (stats.channels && stats.channels.length > 0) {
                const avgStdev = stats.channels.reduce(
                    (sum: number, ch: any) => sum + (ch.stdev || 0), 0
                ) / stats.channels.length;
                colorVariance = avgStdev;
            }
        } catch {
            // stats 실패 시 정상으로 간주
        }

        // 색상 분산도가 매우 낮으면 = 단색/플레이스홀더
        // stdev < 5: 거의 단색 (흰색, 검정 배경 등)
        if (colorVariance < 5 && fileSize < 10240) {
            return {
                url, width, height, fileSize, aspectRatio, colorVariance,
                hash: 0n, passed: false,
                rejectReason: `단색/플레이스홀더 (색상 분산도=${colorVariance.toFixed(1)})`,
            };
        }

        // 5. aHash 계산
        const hash = await computeAHash(sharp, buffer) || 0n;

        return {
            url, width, height, fileSize, aspectRatio, colorVariance,
            hash, passed: true,
        };
    } catch (error) {
        // sharp 분석 실패 시 통과 (다운로드 성공했으면 유효한 이미지)
        console.warn(`[ImageAnalyzer] ⚠️ 분석 실패 (통과 처리): ${(error as Error).message}`);
        return {
            url, width: 0, height: 0, fileSize, aspectRatio: 0,
            colorVariance: 255, hash: 0n, passed: true,
        };
    }
}

/**
 * 이미지 다운로드 (타임아웃 8초)
 */
async function downloadImage(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/*,*/*',
                'Referer': url.includes('coupang') ? 'https://www.coupang.com/' : 'https://smartstore.naver.com/',
            },
            signal: AbortSignal.timeout(8000), // 8초 타임아웃
        });

        if (!response.ok) return null;

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch {
        return null;
    }
}

// ════════════════════════════════════════════════════════════════════
// ✅ [2026-03-12] 4단계: AI Vision 분류 (Gemini → OpenAI 폴백)
// ════════════════════════════════════════════════════════════════════

/**
 * Gemini Vision으로 이미지 분류 (제품 사진 vs 비제품)
 * @returns 'product' | 'non-product' | null (실패 시)
 */
async function classifyWithGemini(
    imageUrl: string,
    geminiApiKey: string,
): Promise<'product' | 'non-product' | null> {
    try {
        // 이미지 다운로드하여 base64 인코딩
        const buffer = await downloadImage(imageUrl);
        if (!buffer) return null;

        const base64Data = buffer.toString('base64');
        // MIME type 추론
        const mimeType = imageUrl.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `You are an image classifier for an e-commerce product scraper.
Classify this image as one of:
- "product": An actual product photo (the item being sold, product packaging, product in use, lifestyle shot of the product)
- "non-product": Brand logo, store logo, banner, advertisement, text-only image, certification mark, QR code, shipping info, return policy, decorative separator, or any non-product visual

Respond with ONLY one word: "product" or "non-product". Nothing else.`,
                            },
                            {
                                inlineData: {
                                    mimeType,
                                    data: base64Data,
                                },
                            },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0,
                        maxOutputTokens: 10,
                    },
                }),
                signal: AbortSignal.timeout(15000),
            }
        );

        if (!response.ok) {
            console.warn(`[ImageAnalyzer] ⚠️ Gemini Vision 응답 오류: ${response.status}`);
            return null;
        }

        const data = await response.json() as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase() || '';

        if (text.includes('non-product') || text.includes('non_product')) return 'non-product';
        if (text.includes('product')) return 'product';

        console.warn(`[ImageAnalyzer] ⚠️ Gemini Vision 응답 파싱 실패: "${text}"`);
        return null;
    } catch (error) {
        console.warn(`[ImageAnalyzer] ⚠️ Gemini Vision 호출 실패: ${(error as Error).message}`);
        return null;
    }
}

/**
 * OpenAI Vision으로 이미지 분류 (Gemini 실패 시 폴백)
 * GPT-4o / GPT-4o-mini의 Vision 기능 사용
 * @returns 'product' | 'non-product' | null (실패 시)
 */
async function classifyWithOpenAI(
    imageUrl: string,
    openaiApiKey: string,
): Promise<'product' | 'non-product' | null> {
    try {
        const response = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `You are an image classifier for an e-commerce product scraper.
Classify this image as one of:
- "product": An actual product photo (the item being sold, product packaging, product in use, lifestyle shot of the product)
- "non-product": Brand logo, store logo, banner, advertisement, text-only image, certification mark, QR code, shipping info, return policy, decorative separator, or any non-product visual

Respond with ONLY one word: "product" or "non-product". Nothing else.`,
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl,
                                    detail: 'low', // 비용 절감: low detail
                                },
                            },
                        ],
                    }],
                    max_tokens: 10,
                    temperature: 0,
                }),
                signal: AbortSignal.timeout(15000),
            }
        );

        if (!response.ok) {
            console.warn(`[ImageAnalyzer] ⚠️ OpenAI Vision 응답 오류: ${response.status}`);
            return null;
        }

        const data = await response.json() as any;
        const text = data?.choices?.[0]?.message?.content?.trim()?.toLowerCase() || '';

        if (text.includes('non-product') || text.includes('non_product')) return 'non-product';
        if (text.includes('product')) return 'product';

        console.warn(`[ImageAnalyzer] ⚠️ OpenAI Vision 응답 파싱 실패: "${text}"`);
        return null;
    } catch (error) {
        console.warn(`[ImageAnalyzer] ⚠️ OpenAI Vision 호출 실패: ${(error as Error).message}`);
        return null;
    }
}

/**
 * ✅ [2026-03-12] AI Vision 분류 (Gemini → OpenAI 체인)
 * 의심 이미지들을 배치로 분류합니다.
 */
async function classifyWithVision(
    suspiciousUrls: string[],
    geminiApiKey?: string,
    openaiApiKey?: string,
): Promise<Map<string, 'product' | 'non-product'>> {
    const classifications = new Map<string, 'product' | 'non-product'>();

    if (suspiciousUrls.length === 0) return classifications;
    if (!geminiApiKey && !openaiApiKey) {
        console.log(`[ImageAnalyzer] ⚠️ AI Vision API 키 없음 → 4단계 분류 생략`);
        return classifications;
    }

    console.log(`[ImageAnalyzer] 🤖 4단계 AI Vision 분류 시작: ${suspiciousUrls.length}개 의심 이미지`);

    // 비용 제한: 최대 5개만 AI Vision에 보냄
    const MAX_VISION_CALLS = 5;
    const urlsToClassify = suspiciousUrls.slice(0, MAX_VISION_CALLS);

    for (const url of urlsToClassify) {
        let result: 'product' | 'non-product' | null = null;

        // 1차: Gemini Vision 시도
        if (geminiApiKey) {
            result = await classifyWithGemini(url, geminiApiKey);
            if (result) {
                console.log(`[ImageAnalyzer] 🤖 Gemini: ${url.substring(0, 50)}... → ${result}`);
            }
        }

        // 2차: OpenAI Vision 폴백
        if (!result && openaiApiKey) {
            result = await classifyWithOpenAI(url, openaiApiKey);
            if (result) {
                console.log(`[ImageAnalyzer] 🤖 OpenAI: ${url.substring(0, 50)}... → ${result}`);
            }
        }

        if (result) {
            classifications.set(url, result);
        }
    }

    console.log(`[ImageAnalyzer] 🤖 AI Vision 분류 완료: ${classifications.size}/${urlsToClassify.length}개 성공`);
    return classifications;
}

// ════════════════════════════════════════════════════════════════════
// 메인 분석 함수
// ════════════════════════════════════════════════════════════════════

/**
 * ✅ 2단계 이미지 콘텐츠 분석 필터
 * ✅ [2026-03-12] 3단계 대표 이미지 유사도 + 4단계 AI Vision 폴백 추가
 * 
 * @param imageUrls 1단계 URL 필터를 통과한 이미지 URL 배열
 * @param options 분석 옵션
 * @returns 분석을 통과한 이미지 URL 배열
 */
export async function analyzeAndFilterShoppingImages(
    imageUrls: string[],
    options: {
        minWidth?: number;       // 최소 너비 (기본 200)
        minHeight?: number;      // 최소 높이 (기본 200)
        maxAspectRatio?: number; // 최대 가로세로비 (기본 8)
        hashThreshold?: number;  // pHash 유사도 임계값 (기본 8)
        concurrency?: number;    // 동시 다운로드 수 (기본 5)
        /** ✅ [2026-03-12] 대표 이미지 URL (갤러리 첫 번째) */
        referenceImageUrl?: string;
        /** ✅ [2026-03-12] Gemini API 키 (Vision 분류 폴백) */
        geminiApiKey?: string;
        /** ✅ [2026-03-12] OpenAI API 키 (Gemini 실패 시 폴백) */
        openaiApiKey?: string;
    } = {},
): Promise<string[]> {
    if (!imageUrls || imageUrls.length === 0) return [];
    if (imageUrls.length <= 1) return imageUrls;

    const {
        minWidth = 200,
        minHeight = 200,
        maxAspectRatio = 8,
        hashThreshold = 8,
        concurrency = 5,
        referenceImageUrl,
        geminiApiKey,
        openaiApiKey,
    } = options;

    console.log(`[ImageAnalyzer] 🔬 2단계 콘텐츠 분석 시작: ${imageUrls.length}개 이미지`);
    const startTime = Date.now();

    // sharp 동적 임포트
    let sharp: any;
    try {
        const sharpModule = await import('sharp');
        sharp = sharpModule.default || sharpModule;
    } catch (err) {
        console.warn('[ImageAnalyzer] ⚠️ sharp 로드 실패, 2단계 분석 생략:', (err as Error).message);
        return imageUrls;
    }

    // ══════════════════════════════════════════════════════════════
    // 2단계: 기존 분석 (크기/비율/색상/해시)
    // ══════════════════════════════════════════════════════════════
    const results: ImageAnalysisResult[] = [];

    for (let i = 0; i < imageUrls.length; i += concurrency) {
        const batch = imageUrls.slice(i, i + concurrency);
        const batchPromises = batch.map(async (url) => {
            const buffer = await downloadImage(url);
            if (!buffer) {
                console.log(`[ImageAnalyzer] ⚠️ 다운로드 실패 (통과): ${url.substring(0, 60)}...`);
                return {
                    url, width: 0, height: 0, fileSize: 0, aspectRatio: 0,
                    colorVariance: 255, hash: 0n, passed: true,
                } as ImageAnalysisResult;
            }
            return analyzeImage(sharp, url, buffer);
        });

        const batchSettled = await Promise.allSettled(batchPromises);
        const fulfilled = batchSettled.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map(r => r.value);
        const rejected = batchSettled.filter(r => r.status === 'rejected');
        if (rejected.length > 0) {
          console.warn(`[NanoBananaPro] ${rejected.length}/${batchSettled.length} image generations failed`);
        }
        results.push(...fulfilled);
    }

    // pHash 기반 시각적 중복 제거
    const uniqueResults: ImageAnalysisResult[] = [];
    let hashDuplicates = 0;

    for (const result of results) {
        if (!result.passed) {
            console.log(`[ImageAnalyzer] ❌ 제외: ${result.rejectReason} — ${result.url.substring(0, 60)}...`);
            continue;
        }

        // hash가 유효한 경우 시각적 중복 체크
        if (result.hash !== 0n) {
            let isDuplicate = false;
            for (const existing of uniqueResults) {
                if (existing.hash === 0n) continue;
                const distance = hammingDistance(result.hash, existing.hash);
                if (distance <= hashThreshold) {
                    isDuplicate = true;
                    hashDuplicates++;
                    console.log(`[ImageAnalyzer] 🔁 시각적 중복 (distance=${distance}): ${result.url.substring(0, 60)}...`);
                    break;
                }
            }
            if (isDuplicate) continue;
        }

        uniqueResults.push(result);
    }

    // ══════════════════════════════════════════════════════════════
    // 3단계: 대표 이미지 유사도 필터 [2026-03-12 NEW]
    // ══════════════════════════════════════════════════════════════
    let refFilteredResults = uniqueResults;
    let refRejected = 0;
    const suspiciousUrls: string[] = []; // AI Vision으로 보낼 의심 이미지

    // 대표 이미지 URL이 있으면 유사도 비교 수행
    const refUrl = referenceImageUrl || imageUrls[0]; // 폴백: 첫 번째 이미지
    const refResult = uniqueResults.find(r => r.url === refUrl);
    const refHash = refResult?.hash;

    if (refHash && refHash !== 0n && uniqueResults.length > 1) {
        console.log(`[ImageAnalyzer] 🔍 3단계 대표 이미지 유사도 분석 시작 (기준: ${refUrl.substring(0, 50)}...)`);

        refFilteredResults = [];

        for (const result of uniqueResults) {
            // 대표 이미지 자체는 항상 통과
            if (result.url === refUrl) {
                refFilteredResults.push(result);
                continue;
            }

            // 해시가 없으면 통과 (분석 실패 이미지)
            if (result.hash === 0n) {
                refFilteredResults.push(result);
                continue;
            }

            const distance = hammingDistance(result.hash, refHash);
            result.refDistance = distance;

            // ✅ 판정 기준:
            // distance > 28 (64bit 중 44%+ 차이) + 낮은 색상 다양성 → 확정 제외 (로고/배너)
            // distance > 24 + 중간 색상 다양성(30~60) → 의심 → AI Vision으로 최종 판정
            // 그 외 → 통과 (제품 사진 or 다른 앵글)

            if (distance > 28 && result.colorVariance < 30) {
                // ✅ 확정 제외: 대표 이미지와 매우 다르고 + 색상도 단순 = 로고/배너
                console.log(`[ImageAnalyzer] 🚫 3단계 제외: distance=${distance}, colorVar=${result.colorVariance.toFixed(1)} — ${result.url.substring(0, 60)}...`);
                refRejected++;
                continue;
            }

            if (distance > 24 && result.colorVariance < 60) {
                // ✅ 의심: 대표 이미지와 꽤 다르고 + 색상이 중간 → AI Vision 확인
                console.log(`[ImageAnalyzer] 🔎 3단계 의심: distance=${distance}, colorVar=${result.colorVariance.toFixed(1)} — ${result.url.substring(0, 60)}...`);
                suspiciousUrls.push(result.url);
                refFilteredResults.push(result); // 일단 통과시키고, 4단계에서 제거 가능
                continue;
            }

            // 통과
            refFilteredResults.push(result);
        }

        console.log(`[ImageAnalyzer] 🔍 3단계 결과: 확정 제외 ${refRejected}개, 의심 ${suspiciousUrls.length}개, 통과 ${refFilteredResults.length - suspiciousUrls.length}개`);
    }

    // ══════════════════════════════════════════════════════════════
    // 4단계: AI Vision 분류 (의심 이미지만) [2026-03-12 NEW]
    // ══════════════════════════════════════════════════════════════
    let visionRejected = 0;

    if (suspiciousUrls.length > 0 && (geminiApiKey || openaiApiKey)) {
        const classifications = await classifyWithVision(suspiciousUrls, geminiApiKey, openaiApiKey);

        if (classifications.size > 0) {
            refFilteredResults = refFilteredResults.filter(result => {
                const classification = classifications.get(result.url);
                if (classification === 'non-product') {
                    console.log(`[ImageAnalyzer] 🤖 4단계 AI 제외: ${result.url.substring(0, 60)}...`);
                    visionRejected++;
                    return false;
                }
                return true;
            });
        }
    }

    // ══════════════════════════════════════════════════════════════
    // 최종 결과
    // ══════════════════════════════════════════════════════════════
    const finalUrls = refFilteredResults.map(r => r.url);
    const elapsed = Date.now() - startTime;

    const rejected = results.filter(r => !r.passed);
    console.log(`[ImageAnalyzer] ════════════════════════════════════════`);
    console.log(`[ImageAnalyzer] 🔬 분석 완료 (${elapsed}ms)`);
    console.log(`[ImageAnalyzer] 📊 입력: ${imageUrls.length}개`);
    console.log(`[ImageAnalyzer] ❌ 2단계 크기/비율/색상 제외: ${rejected.length}개`);
    console.log(`[ImageAnalyzer] 🔁 2단계 시각적 중복 제외: ${hashDuplicates}개`);
    console.log(`[ImageAnalyzer] 🚫 3단계 유사도 제외: ${refRejected}개`);
    console.log(`[ImageAnalyzer] 🤖 4단계 AI Vision 제외: ${visionRejected}개`);
    console.log(`[ImageAnalyzer] ✅ 최종 통과: ${finalUrls.length}개`);
    console.log(`[ImageAnalyzer] ════════════════════════════════════════`);

    return finalUrls;
}
