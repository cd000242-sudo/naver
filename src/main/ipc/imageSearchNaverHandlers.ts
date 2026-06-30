// src/main/ipc/imageSearchNaverHandlers.ts
// 네이버 이미지 검색 API IPC 핸들러
// [v2.10.256] main.ts에서 분리 — god-file 압축 15단계 (가장 큰 단일 IPC).
//
// 분리 1개 핸들러:
//   image:searchNaver — 네이버 이미지 검색 API + 다중 키 rotation + 쿼리 다양화 + 중복 필터링

import { ipcMain } from 'electron';
import { loadConfig, applyConfigToEnv } from '../../configManager.js';
import { ensureLicenseValid, enforceFreeTier, isFreeTierUser } from '../utils/authUtils.js';
import { consume as consumeQuota } from '../../quotaManager.js';

export function registerImageSearchNaverHandlers(): void {
    ipcMain.handle('image:searchNaver', async (_event, keyword: string): Promise<{ success: boolean; images?: any[]; message?: string }> => {
        // ✅ 실행 직전 최신 설정 강제 동기화
        try {
            const config = await loadConfig();
            applyConfigToEnv(config);
        } catch (e) {
            console.error('[Main] image:searchNaver - 설정 동기화 실패:', e);
        }

        if (!(await ensureLicenseValid())) {
            return { success: false, message: '라이선스 인증이 필요합니다.' };
        }

        const mediaCheck = await enforceFreeTier('media', 1);
        if (!mediaCheck.allowed) {
            return mediaCheck.response;
        }
        try {
            if (!keyword || !keyword.trim()) {
                return { success: false, message: '검색 키워드가 비어있습니다.' };
            }

            console.log(`[Main] 네이버 이미지 검색: "${keyword}"`);

            // A masked/corrupted key (e.g. "ABCD••••", • = U+2022 = 8226) crashes
            // fetch() with "Cannot convert argument to a ByteString" the moment it is
            // put in the X-Naver-Client-* header — which silently zeroed out every
            // image search. Reject any credential that is not header-safe (printable
            // ASCII) so a clean key can be used and the user gets an actionable error.
            let maskedKeyDetected = false;
            const HEADER_SAFE = /^[\x21-\x7E]+$/;
            const normalizeEnv = (v: string | undefined): string => {
                const cleaned = String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();
                if (!cleaned) return '';
                if (!HEADER_SAFE.test(cleaned)) {
                    maskedKeyDetected = true;
                    return '';
                }
                return cleaned;
            };

            const collectEnvPairs = (baseIdKey: string, baseSecretKey: string, labelPrefix: string): Array<{ id: string; secret: string; label: string }> => {
                const pairs: Array<{ id: string; secret: string; label: string }> = [];

                const baseId = normalizeEnv((process.env as any)[baseIdKey]);
                const baseSecret = normalizeEnv((process.env as any)[baseSecretKey]);
                if (baseId && baseSecret) {
                    pairs.push({ id: baseId, secret: baseSecret, label: `${labelPrefix}#1` });
                }

                // NAVER_CLIENT_ID_2 / NAVER_CLIENT_SECRET_2 ...
                for (let i = 2; i <= 10; i++) {
                    const id = normalizeEnv((process.env as any)[`${baseIdKey}_${i}`]);
                    const secret = normalizeEnv((process.env as any)[`${baseSecretKey}_${i}`]);
                    if (id && secret) {
                        pairs.push({ id, secret, label: `${labelPrefix}#${i}` });
                    }
                }

                return pairs;
            };

            const credentialCandidates: Array<{ id: string; secret: string; label: string }> = [
                ...collectEnvPairs('NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_CLIENT_*'),
                ...collectEnvPairs('NAVER_DATALAB_CLIENT_ID', 'NAVER_DATALAB_CLIENT_SECRET', 'NAVER_DATALAB_*'),
            ];

            if (credentialCandidates.length === 0) {
                const config = await loadConfig();
                const cfgId = normalizeEnv(String(config.naverClientId || config.naverDatalabClientId || ''));
                const cfgSecret = normalizeEnv(String(config.naverClientSecret || config.naverDatalabClientSecret || ''));
                if (cfgId && cfgSecret) {
                    credentialCandidates.push({ id: cfgId, secret: cfgSecret, label: 'config#1' });
                } else if (maskedKeyDetected) {
                    return {
                        success: false,
                        message: '네이버 API 키가 손상된 형태(마스킹 ••••)로 저장되어 있습니다. 환경설정에서 네이버 Client ID/Secret을 지우고 실제 키를 다시 입력해 주세요.',
                    };
                } else {
                    return {
                        success: false,
                        message: '네이버 API 키가 설정되어 있지 않습니다. 환경설정에서 네이버 Client ID와 Secret을 입력해주세요.',
                    };
                }
            }

            let credentialIndex = 0;
            console.log(`[Main] 네이버 API 키 후보 수: ${credentialCandidates.length}개 (현재: ${credentialCandidates[0]?.label || 'unknown'})`);
            const MAX_IMAGES = 50;
            const TARGET_IMAGES = MAX_IMAGES;
            const allImages: any[] = [];
            const usedUrls = new Set<string>();
            const usedImageHashes = new Set<string>();

            const httpErrors: Array<{ status: number; query: string; errorCode?: string; errorMessage?: string }> = [];

            const NAVER_NEW_APP_GUIDE_URL = 'https://developers.naver.com/apps/#/myapps/oBaehge5xTtI73Z0x1Dx/overview';
            const buildNaverQuotaGuide = (): string =>
                `\n\n네이버 이미지 API 일일 한도(쿼리) 초과로 보이면, 아래 링크에서 네이버 애플리케이션을 추가로 생성한 뒤 새 Client ID/Secret을 발급받아 환경설정에 등록하세요.\n` +
                `${NAVER_NEW_APP_GUIDE_URL}`;
            const maybeAppendNaverQuotaGuide = (detail: string): string => {
                const d = String(detail || '');
                const looksLikeQuota = /count\/quota\s*=\s*\d+\s*\/\s*\d+/i.test(d) || /Query limit exceeded/i.test(d);
                return looksLikeQuota ? `${d}${buildNaverQuotaGuide()}` : d;
            };

            const parseNaverErrorBody = (bodyText: string): { errorCode: string; errorMessage: string } => {
                let errorCode = '';
                let errorMessage = String(bodyText || '').trim();
                try {
                    const parsed = JSON.parse(bodyText || '{}') as any;
                    if (parsed && typeof parsed === 'object') {
                        errorCode = String(parsed.errorCode || '').trim();
                        errorMessage = String(parsed.errorMessage || parsed.message || bodyText || '').trim();
                    }
                } catch {
                }
                return { errorCode, errorMessage };
            };

            const sleep = async (ms: number): Promise<void> => {
                await new Promise<void>((resolve) => setTimeout(resolve, ms));
            };

            const fetchWithRotation = async (searchUrl: string, queryLabel: string): Promise<any | null> => {
                let attempts = 0;
                let lastStatus = 0;
                let lastErrorCode = '';
                let lastErrorMessage = '';
                let sameKey429Retries = 0;

                while (attempts < credentialCandidates.length) {
                    const cred = credentialCandidates[credentialIndex];
                    const keyLabel = cred?.label || `key#${credentialIndex + 1}`;

                    const response = await fetch(searchUrl, {
                        method: 'GET',
                        headers: {
                            'X-Naver-Client-Id': cred?.id || '',
                            'X-Naver-Client-Secret': cred?.secret || '',
                        },
                    });

                    if (response.ok) {
                        return await response.json();
                    }

                    let bodyText = '';
                    try {
                        bodyText = await response.text();
                    } catch {
                    }
                    const parsed = parseNaverErrorBody(bodyText);
                    lastStatus = response.status;
                    lastErrorCode = parsed.errorCode;
                    lastErrorMessage = parsed.errorMessage;
                    httpErrors.push({ status: response.status, query: queryLabel, errorCode: parsed.errorCode, errorMessage: parsed.errorMessage });
                    console.warn(`[Main] 네이버 이미지 검색 "${queryLabel}" 실패(${keyLabel}): ${response.status} ${parsed.errorCode} ${String(parsed.errorMessage || '').slice(0, 140)}`);

                    if (response.status === 429) {
                        const retryAfterRaw = String(response.headers.get('retry-after') || '').trim();
                        const retryAfterSeconds = Number.parseInt(retryAfterRaw, 10);
                        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;

                        if (sameKey429Retries < 2) {
                            sameKey429Retries++;
                            const backoffMs = Math.min(1200, 200 * Math.pow(2, sameKey429Retries - 1));
                            const waitMs = Math.max(retryAfterMs, backoffMs);
                            if (waitMs > 0) {
                                await sleep(waitMs);
                            }
                            continue;
                        }

                        sameKey429Retries = 0;
                        credentialIndex = (credentialIndex + 1) % credentialCandidates.length;
                        attempts++;
                        console.log(`[Main] 네이버 API 키 전환: ${keyLabel} → ${credentialCandidates[credentialIndex]?.label || `key#${credentialIndex + 1}`}`);
                        continue;
                    }

                    if (response.status === 401 || response.status === 403) {
                        sameKey429Retries = 0;
                        credentialIndex = (credentialIndex + 1) % credentialCandidates.length;
                        attempts++;
                        console.log(`[Main] 네이버 API 키 전환: ${keyLabel} → ${credentialCandidates[credentialIndex]?.label || `key#${credentialIndex + 1}`}`);
                        continue;
                    }

                    return null;
                }

                // 모든 키가 429/401/403 등으로 실패
                const detail = `${lastStatus}${lastErrorCode ? ` ${lastErrorCode}` : ''}${lastErrorMessage ? ` ${String(lastErrorMessage).slice(0, 220)}` : ''}`.trim();
                throw new Error(`NAVER_ALL_KEYS_FAILED: ${detail}`);
            };

            // ✅ 키워드에서 핵심 단어 추출 (조사/접속사 제거)
            const stopWords = ['은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '도', '만', '까지', '부터', '에게', '한테', '께', '보다', '처럼', '같이', '대해', '대한', '위한', '통한', '관한', '있는', '없는', '하는', '되는', '된', '할', '될', '하고', '되고', '그리고', '하지만', '그러나', '또한', '및', '등', '것', '수', '때', '중', '후', '전', '내', '외'];
            const keywordParts = keyword.split(/[\s,.\-!?:;'"()[\]{}]+/).filter(p => p.length >= 2 && !stopWords.includes(p));
            const coreKeywords = keywordParts.slice(0, 4);

            // 검색 쿼리 목록 (원본 키워드 + 변형 키워드)
            const searchQueries = [
                keyword,
                coreKeywords.join(' '),
                `${keyword} 사진`,
                `${keyword} 이미지`,
                `${keyword} 실시간`,
            ];

            // 핵심 단어 조합 추가
            if (coreKeywords.length > 1) {
                searchQueries.push(coreKeywords[0]);
                searchQueries.push(`${coreKeywords[0]} ${coreKeywords[1]}`);
                if (coreKeywords.length > 2) {
                    searchQueries.push(`${coreKeywords[0]} ${coreKeywords[2]}`);
                }
            }

            // 중복 제거
            const uniqueQueries = [...new Set(searchQueries)].filter(q => q.trim());

            for (const query of uniqueQueries) {
                if (allImages.length >= MAX_IMAGES) break;
                if (allImages.length >= TARGET_IMAGES) break;

                try {
                    const searchUrl = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=100&sort=date`;

                    const data = await fetchWithRotation(searchUrl, query);
                    if (!data) {
                        continue;
                    }

                    if (data.items && data.items.length > 0) {
                        for (const item of data.items) {
                            if (usedUrls.has(item.link)) continue;

                            const urlHash = item.link.split('/').pop()?.split('?')[0] || '';
                            if (urlHash && usedImageHashes.has(urlHash)) continue;

                            const title = item.title?.replace(/<[^>]*>/g, '').toLowerCase() || '';
                            const isIrrelevant =
                                title.includes('광고') ||
                                title.includes('배너') ||
                                title.includes('로고') ||
                                title.includes('아이콘') ||
                                title.includes('버튼') ||
                                title.includes('무료이미지') ||
                                title.includes('클립아트') ||
                                (item.sizewidth && item.sizeheight && item.sizewidth < 200 && item.sizeheight < 200);

                            if (isIrrelevant) continue;

                            const hasRelevance = coreKeywords.length === 0 || coreKeywords.some(kw =>
                                title.includes(kw.toLowerCase()) || item.link.toLowerCase().includes(kw.toLowerCase())
                            );

                            // [2026-06-30] 관련성 게이트 강화: 무관 이미지 허용 한도를 20→6으로.
                            //   sort=sim(정확도순)과 결합해 소제목·키워드에 맞는 이미지만 남도록.
                            //   소수 시드(6장)는 허용해 0개 방지, 그 이후는 관련성 필수.
                            if (!hasRelevance && allImages.length >= 6) continue;

                            usedUrls.add(item.link);
                            if (urlHash) usedImageHashes.add(urlHash);

                            allImages.push({
                                id: `naver-${allImages.length}`,
                                url: item.link,
                                thumbnailUrl: item.thumbnail,
                                title: item.title?.replace(/<[^>]*>/g, '') || '',
                                source: 'naver',
                                width: item.sizewidth,
                                height: item.sizeheight,
                            });

                            if (allImages.length >= MAX_IMAGES) break;
                            if (allImages.length >= TARGET_IMAGES) break;
                        }
                        console.log(`[Main] 검색 "${query}": ${data.items.length}개 발견 (누적: ${allImages.length}개)`);
                    }
                } catch (queryError) {
                    const msg = (queryError as Error).message;
                    if (msg.startsWith('NAVER_ALL_KEYS_FAILED:')) {
                        return {
                            success: false,
                            message: `네이버 이미지 API 모든 키가 실패했습니다. ${maybeAppendNaverQuotaGuide(msg.replace('NAVER_ALL_KEYS_FAILED:', '').trim())}`,
                        };
                    }
                    console.warn(`[Main] 검색 "${query}" 오류:`, msg);
                }
            }

            // [2026-06-30] 결과가 없거나 희박(<3)하면 주체 엔티티로 폴백.
            //   coreKeywords[0] = 글의 핵심 주어 → 인물(연예인)이면 그 이름, 비인물이면 핵심 키워드
            //   → 인물/비인물 구분 없이 "소제목에 없으면 주체로 최적 이미지 수집"이 자동 처리됨.
            if (allImages.length < 3) {
                const relaxedQueries = [
                    coreKeywords.join(' '),
                    coreKeywords[0],
                    keywordParts[0],
                    keyword,
                ]
                    .map((q) => String(q || '').trim())
                    .filter((q) => q.length >= 2);

                const uniqueRelaxedQueries = [...new Set(relaxedQueries)].slice(0, 4);

                for (const query of uniqueRelaxedQueries) {
                    if (allImages.length >= MAX_IMAGES) break;
                    if (allImages.length >= TARGET_IMAGES) break;

                    try {
                        // [2026-06-30] sort=date(최신순) → sim(정확도순, 네이버 기본). 소제목·키워드 관련성 우선.
                        const searchUrl = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=100&sort=sim`;

                        const data = await fetchWithRotation(searchUrl, query);
                        if (!data) {
                            continue;
                        }

                        if (data.items && data.items.length > 0) {
                            for (const item of data.items) {
                                if (usedUrls.has(item.link)) continue;

                                const urlHash = item.link.split('/').pop()?.split('?')[0] || '';
                                if (urlHash && usedImageHashes.has(urlHash)) continue;

                                const title = item.title?.replace(/<[^>]*>/g, '').toLowerCase() || '';
                                const isIrrelevant =
                                    title.includes('광고') ||
                                    title.includes('배너') ||
                                    title.includes('로고') ||
                                    title.includes('아이콘') ||
                                    title.includes('버튼') ||
                                    (item.sizewidth && item.sizeheight && item.sizewidth < 80 && item.sizeheight < 80);
                                if (isIrrelevant) continue;

                                usedUrls.add(item.link);
                                if (urlHash) usedImageHashes.add(urlHash);

                                allImages.push({
                                    id: `naver-${allImages.length}`,
                                    url: item.link,
                                    thumbnailUrl: item.thumbnail,
                                    title: item.title?.replace(/<[^>]*>/g, '') || '',
                                    source: 'naver',
                                    width: item.sizewidth,
                                    height: item.sizeheight,
                                });

                                if (allImages.length >= MAX_IMAGES) break;
                                if (allImages.length >= TARGET_IMAGES) break;
                            }
                            console.log(`[Main] (완화) 검색 "${query}": ${data.items.length}개 발견 (누적: ${allImages.length}개)`);
                        }
                    } catch (queryError) {
                        const msg = (queryError as Error).message;
                        if (msg.startsWith('NAVER_ALL_KEYS_FAILED:')) {
                            return {
                                success: false,
                                message: `네이버 이미지 API 모든 키가 실패했습니다. ${maybeAppendNaverQuotaGuide(msg.replace('NAVER_ALL_KEYS_FAILED:', '').trim())}`,
                            };
                        }
                        console.warn(`[Main] (완화) 검색 "${query}" 오류:`, msg);
                    }
                }
            }

            if (allImages.length > 0) {
                console.log(`[Main] 네이버 이미지 검색 완료: 총 ${allImages.length}개 발견 (중복/무관 이미지 필터링 적용)`);
                const response = { success: true, images: allImages };
                if ((response.images?.length ?? 0) > 0 && (await isFreeTierUser())) {
                    await consumeQuota('media', 1);
                }
                return response;
            } else {
                if (httpErrors.length > 0) {
                    const mostRecent = httpErrors[httpErrors.length - 1];
                    const detail = `${mostRecent.status}${mostRecent.errorCode ? ` ${mostRecent.errorCode}` : ''}${mostRecent.errorMessage ? ` ${String(mostRecent.errorMessage).slice(0, 220)}` : ''}`.trim();
                    return { success: false, message: `네이버 이미지 API 요청 실패: ${maybeAppendNaverQuotaGuide(detail)}` };
                }
                return { success: false, message: '검색 결과가 없습니다.' };
            }
        } catch (error) {
            console.error('[Main] 네이버 이미지 검색 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    console.log('[IPC] Image searchNaver handlers registered (1 handler)');
}
