// src/main/ipc/imageHandlers.ts
// 이미지 및 미디어 관련 IPC 핸들러
// ✅ [100점 수정] Veo 영상 생성, KenBurns, MP4→GIF 변환 구현

import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { IpcContext } from '../types';
import axios from 'axios';
import { spawn } from 'child_process';
import { generateSingleLeonardoAIImage } from '../../image/leonardoAIGenerator.js';

// ffmpeg-static 경로 (GIF 변환용)
let ffmpegPath: string | null = null;
try {
    const ffmpegStatic = require('ffmpeg-static');
    ffmpegPath = ffmpegStatic;
} catch (e) {
    console.warn('[imageHandlers] ffmpeg-static을 찾을 수 없습니다.');
}

// ✅ [2026-02-08] 안전한 핸들러 등록 유틸리티
// main.ts에서 이미 등록된 핸들러가 있으면 에러 없이 건너뛰기
function safeHandle(channel: string, handler: (...args: any[]) => any): void {
    try {
        ipcMain.handle(channel, handler);
    } catch (e) {
        // 이미 등록됨 — main.ts 핸들러가 우선
        console.log(`[imageHandlers] ⏭️ ${channel} — 이미 등록됨, 건너뛰기`);
    }
}

/**
 * 이미지 핸들러 등록
 */
export function registerImageHandlers(ctx: IpcContext): void {
    // ✅ [2026-03-16] ImageFX Google 로그인 사전 확인
    safeHandle('imagefx:checkGoogleLogin', async () => {
        try {
            const { checkGoogleLoginForImageFx } = await import('../../image/imageFxGenerator.js');
            return await checkGoogleLoginForImageFx();
        } catch (error: any) {
            return { loggedIn: false, message: `로그인 확인 실패: ${error.message}` };
        }
    });

    // ✅ [2026-03-16] ImageFX Google 계정 변경 (세션 초기화 + 재로그인)
    safeHandle('imagefx:switchGoogleAccount', async () => {
        try {
            const { switchGoogleAccountForImageFx } = await import('../../image/imageFxGenerator.js');
            return await switchGoogleAccountForImageFx();
        } catch (error: any) {
            return { success: false, message: `계정 변경 실패: ${error.message}` };
        }
    });

    // 저장된 이미지 경로 가져오기
    safeHandle('images:getSavedPath', async () => {
        return path.join(os.homedir(), 'naver-blog-automation', 'images');
    });

    // 저장된 이미지 목록 가져오기
    safeHandle('images:getSaved', async (_event, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) return [];
            const files = fs.readdirSync(dirPath);
            return files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
        } catch {
            return [];
        }
    });

    // 이미지 다운로드 및 저장
    safeHandle('image:downloadAndSave', async (_event, imageUrl: string, heading: string, postTitle?: string, postId?: string) => {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const buffer = Buffer.from(response.data);

            const ext = imageUrl.match(/\.(png|jpg|jpeg|gif|webp)/i)?.[1] || 'png';
            const safeHeading = heading.replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '').substring(0, 50);
            const fileName = `${safeHeading}-${Date.now()}.${ext}`;

            const saveDir = path.join(app.getPath('userData'), 'images', postId || 'temp');
            await fsp.mkdir(saveDir, { recursive: true });

            const filePath = path.join(saveDir, fileName);
            await fsp.writeFile(filePath, buffer);

            const previewDataUrl = `data:image/${ext};base64,${buffer.toString('base64')}`;
            return { success: true, filePath, previewDataUrl, savedToLocal: filePath };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // URL에서 이미지 수집
    safeHandle('image:collectFromUrl', async (_event, url: string) => {
        console.log('[imageHandlers] image:collectFromUrl - placeholder');
        return { success: false, images: [] };
    });

    // ✅ [2026-02-27] image:collectFromShopping는 main.ts L2477에서 처리됨 (중복 제거)
    // main.ts 핸들러가 브랜드스토어/스마트스토어/쿠팡 플랫폼별 분기 로직을 포함하며,
    // fetchShoppingImages + collectShoppingImages + filterDuplicateAndLowQualityImages를 사용함.
    // 여기 imageHandlers.ts에 등록하면 Electron이 먼저 등록된 main.ts 핸들러만 사용하므로
    // 이 핸들러는 실행되지 않아 삭제함.

    // 여러 이미지 다운로드 및 저장
    safeHandle('image:downloadAndSaveMultiple', async (_event, images: Array<{ url: string; heading: string }>, title: string) => {
        console.log('[imageHandlers] image:downloadAndSaveMultiple - placeholder');
        return { success: false, savedPaths: [] };
    });

    // 비교표 이미지 생성
    safeHandle('image:generateComparisonTable', async (_event, options: any) => {
        console.log('[imageHandlers] image:generateComparisonTable - placeholder');
        return { success: false };
    });

    // ✅ [2026-01-19] 장단점 표 이미지 생성
    safeHandle('image:generateProsConsTable', async (_event, options: {
        productName: string;
        pros: string[];
        cons: string[];
    }) => {
        try {
            const { productName, pros, cons } = options;
            console.log(`[imageHandlers] 장단점 표 생성: ${productName}, 장점 ${pros.length}개, 단점 ${cons.length}개`);

            const { generateProsConsTableImage } = await import('../../image/tableImageGenerator.js');
            const result = await generateProsConsTableImage(productName, pros, cons);

            if (result) {
                console.log(`[imageHandlers] ✅ 장단점 표 생성 완료: ${result}`);
                return { success: true, path: result };
            } else {
                return { success: false, message: '장단점 표 생성 실패' };
            }
        } catch (error) {
            console.error('[imageHandlers] 장단점 표 생성 오류:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [2026-01-28] 테스트 이미지 생성 (스타일 모달용) - 모든 엔진 지원
    safeHandle('generate-test-image', async (_event, options: {
        style: string;
        ratio: string;
        prompt: string;
        engine?: string; // ✅ 엔진 파라미터
        textOverlay?: { enabled: boolean; text: string }; // ✅ 텍스트 오버레이
    }) => {
        try {
            const { style, ratio, prompt, engine } = options;

            // API 키 가져오기
            const configModule = await import('../../configManager.js');
            const config = await configModule.loadConfig();

            // ✅ 전달받은 엔진 사용, 없으면 config에서 가져옴
            const imageSource = engine || (config as any).globalImageSource || 'nano-banana-pro';
            console.log(`[imageHandlers] 🎨 테스트 이미지 생성: engine=${imageSource}, style=${style}, ratio=${ratio}`);

            // ✅ [2026-02-08] 11가지 스타일별 프롬프트 매핑 (3카테고리 동기화)
            const stylePromptMap: Record<string, string> = {
                // 📷 실사
                'realistic': 'Hyper-realistic professional photography, 8K UHD quality, KOREAN person ONLY, natural lighting, authentic Korean facial features',
                'bokeh': 'Beautiful bokeh photography, shallow depth of field, dreamy out-of-focus background lights, soft circular bokeh orbs, DSLR wide aperture f/1.4 quality, romantic atmosphere',
                // 🖌️ 아트
                'vintage': 'Vintage retro illustration, 1950s poster art style, muted color palette, nostalgic aesthetic, old-fashioned charm, classic design elements',
                'minimalist': 'Minimalist flat design, simple clean lines, solid colors, modern aesthetic, geometric shapes, professional infographic style',
                '3d-render': '3D render, Octane render quality, Cinema 4D style, Blender 3D art, realistic materials and textures, studio lighting setup',
                'korean-folk': 'Korean traditional Minhwa folk painting style, vibrant primary colors on hanji paper, stylized tiger and magpie motifs, peony flowers, pine trees, traditional Korean decorative patterns, bold flat color areas with fine ink outlines, cheerful folk art aesthetic',
                // ✨ 이색
                'stickman': 'Cute chibi cartoon character with oversized round white head much larger than body, simple black dot eyes, small expressive mouth showing emotion, tiny simple body wearing colorful casual clothes, thick bold black outlines, flat cel-shaded colors with NO gradients, detailed colorful background scene that matches the topic, Korean internet meme comic art style, humorous and lighthearted mood, web comic panel composition, clean high quality digital vector art, NO TEXT NO LETTERS NO WATERMARK',
                'roundy': 'Adorable chubby round blob character with extremely round soft body and very short stubby limbs, small dot eyes and tiny happy smile, pure white or soft pastel colored body, soft rounded outlines with NO sharp edges, dreamy pastel colored background with gentle gradient, Molang and Sumikko Gurashi inspired kawaii aesthetic, healing and cozy atmosphere, minimalist cute Korean character design, soft lighting with gentle shadows, warm comforting mood, high quality digital illustration, NO TEXT NO LETTERS NO WATERMARK',
                'claymation': 'Claymation stop-motion style, cute clay figurines, handmade plasticine texture, soft rounded shapes, miniature diorama set, warm studio lighting',
                'neon-glow': 'Neon glow effect, luminous light trails, dark background with vibrant neon lights, synthwave aesthetic, glowing outlines, electric blue and hot pink',
                'papercut': 'Paper cut art style, layered paper craft, 3D paper sculpture effect, shadow between layers, handmade tactile texture, colorful construction paper, kirigami aesthetic',
                'isometric': 'Isometric 3D illustration, cute isometric pixel world, 30-degree angle view, clean geometric shapes, pastel color palette, miniature city/scene, game-like perspective',
                // 🎨 2D 일러스트 (✅ [2026-02-17] 신규)
                '2d': 'Korean webtoon style 2D illustration, vibrant flat colors, clean line art, manhwa aesthetic, modern Korean digital illustration, soft pastel palette, cute and expressive character design, NO TEXT NO WRITING'
            };

            const stylePrompt = stylePromptMap[style] || stylePromptMap['realistic'];
            const fullPrompt = `${stylePrompt}, ${prompt}`;

            // 비율 매핑
            const ratioToSize: Record<string, { width: number; height: number }> = {
                '1:1': { width: 1024, height: 1024 },
                '16:9': { width: 1344, height: 768 },
                '9:16': { width: 768, height: 1344 },
                '4:3': { width: 1152, height: 896 },
                '3:4': { width: 896, height: 1152 }
            };
            const size = ratioToSize[ratio] || ratioToSize['1:1'];

            let result: any = null;
            const saveDir = path.join(app.getPath('userData'), 'test-images');
            await fsp.mkdir(saveDir, { recursive: true });

            // ✅ [2026-02-08] DeepInfra 모델 동적 매핑
            const DEEPINFRA_MODEL_MAP: Record<string, string> = {
                'flux-2-dev': 'black-forest-labs/FLUX-2-dev',
                'flux-dev': 'black-forest-labs/FLUX-1-dev',
                'flux-schnell': 'black-forest-labs/FLUX-1-schnell'
            };

            // ✅ 엔진별 분기 처리
            switch (imageSource) {
                case 'deepinfra':
                case 'deepinfra-flux': {
                    // ✅ [2026-02-08] 사용자 설정 모델 동적 선택
                    const deepinfraApiKey = (config as any).deepinfraApiKey;
                    if (!deepinfraApiKey) {
                        return { success: false, error: 'DeepInfra API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.' };
                    }

                    const selectedModelKey = (config as any).deepinfraModel || 'flux-2-dev';
                    const actualModel = DEEPINFRA_MODEL_MAP[selectedModelKey] || 'black-forest-labs/FLUX-2-dev';
                    console.log(`[imageHandlers] 🔧 DeepInfra 모델: ${selectedModelKey} → ${actualModel}`);

                    const response = await axios.post(
                        'https://api.deepinfra.com/v1/openai/images/generations',
                        {
                            model: actualModel, // ✅ 동적 모델 선택!
                            prompt: fullPrompt,
                            n: 1,
                            size: `${size.width}x${size.height}`
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${deepinfraApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 60000
                        }
                    );

                    if (response.data?.data?.[0]?.url) {
                        const imageUrl = response.data.data[0].url;
                        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                        const buffer = Buffer.from(imageResponse.data);

                        const fileName = `test-${style}-deepinfra-${Date.now()}.png`;
                        const filePath = path.join(saveDir, fileName);
                        await fsp.writeFile(filePath, buffer);
                        result = { success: true, path: filePath };
                    }
                    break;
                }

                case 'nano-banana-pro': {
                    // 나노바나나프로 (Gemini)
                    const geminiApiKey = (config as any).geminiApiKey;
                    if (!geminiApiKey) {
                        return { success: false, error: 'Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.' };
                    }

                    const response = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent`,
                        {
                            contents: [{ parts: [{ text: fullPrompt }] }],
                            generationConfig: {
                                responseModalities: ['Text', 'Image']
                            }
                        },
                        {
                            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
                            timeout: 120000
                        }
                    );

                    const candidates = response.data?.candidates;
                    if (candidates?.[0]?.content?.parts) {
                        for (const part of candidates[0].content.parts) {
                            if (part.inlineData?.data) {
                                const buffer = Buffer.from(part.inlineData.data, 'base64');
                                const fileName = `test-${style}-gemini-${Date.now()}.png`;
                                const filePath = path.join(saveDir, fileName);
                                await fsp.writeFile(filePath, buffer);
                                result = { success: true, path: filePath };
                                break;
                            }
                        }
                    }
                    break;
                }

                case 'falai':
                case 'fal-ai': {
                    // Fal.ai (FLUX)
                    const falApiKey = (config as any).falApiKey;
                    if (!falApiKey) {
                        return { success: false, error: 'Fal.ai API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.' };
                    }

                    const response = await axios.post(
                        'https://fal.run/fal-ai/fast-sdxl',
                        {
                            prompt: fullPrompt,
                            image_size: { width: size.width, height: size.height },
                            num_images: 1
                        },
                        {
                            headers: {
                                'Authorization': `Key ${falApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 60000
                        }
                    );

                    if (response.data?.images?.[0]?.url) {
                        const imageUrl = response.data.images[0].url;
                        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                        const buffer = Buffer.from(imageResponse.data);

                        const fileName = `test-${style}-fal-${Date.now()}.png`;
                        const filePath = path.join(saveDir, fileName);
                        await fsp.writeFile(filePath, buffer);
                        result = { success: true, path: filePath };
                    }
                    break;
                }

                case 'prodia': {
                    // Prodia AI
                    const prodiaApiKey = (config as any).prodiaApiKey;
                    if (!prodiaApiKey) {
                        return { success: false, error: 'Prodia API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.' };
                    }

                    const response = await axios.post(
                        'https://api.prodia.com/v1/sd/generate',
                        {
                            prompt: fullPrompt,
                            model: 'v1-5-pruned-emaonly.safetensors [d7049739]',
                            width: Math.min(size.width, 768),
                            height: Math.min(size.height, 768)
                        },
                        {
                            headers: {
                                'X-Prodia-Key': prodiaApiKey,
                                'Content-Type': 'application/json'
                            },
                            timeout: 60000
                        }
                    );

                    if (response.data?.job) {
                        // 작업 완료 대기
                        let jobResult = null;
                        for (let i = 0; i < 30; i++) {
                            await new Promise(r => setTimeout(r, 2000));
                            const statusRes = await axios.get(`https://api.prodia.com/v1/job/${response.data.job}`, {
                                headers: { 'X-Prodia-Key': prodiaApiKey }
                            });
                            if (statusRes.data?.status === 'succeeded' && statusRes.data?.imageUrl) {
                                jobResult = statusRes.data.imageUrl;
                                break;
                            } else if (statusRes.data?.status === 'failed') {
                                break;
                            }
                        }

                        if (jobResult) {
                            const imageResponse = await axios.get(jobResult, { responseType: 'arraybuffer' });
                            const buffer = Buffer.from(imageResponse.data);

                            const fileName = `test-${style}-prodia-${Date.now()}.png`;
                            const filePath = path.join(saveDir, fileName);
                            await fsp.writeFile(filePath, buffer);
                            result = { success: true, path: filePath };
                        }
                    }
                    break;
                }

                case 'stability': {
                    // Stability AI
                    const stabilityApiKey = (config as any).stabilityApiKey;
                    if (!stabilityApiKey) {
                        return { success: false, error: 'Stability AI API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.' };
                    }

                    const formData = new FormData();
                    formData.append('prompt', fullPrompt);
                    formData.append('output_format', 'png');

                    const response = await axios.post(
                        'https://api.stability.ai/v2beta/stable-image/generate/core',
                        formData,
                        {
                            headers: {
                                'Authorization': `Bearer ${stabilityApiKey}`,
                                'Accept': 'image/*'
                            },
                            responseType: 'arraybuffer',
                            timeout: 60000
                        }
                    );

                    if (response.data) {
                        const buffer = Buffer.from(response.data);
                        const fileName = `test-${style}-stability-${Date.now()}.png`;
                        const filePath = path.join(saveDir, fileName);
                        await fsp.writeFile(filePath, buffer);
                        result = { success: true, path: filePath };
                    }
                    break;
                }

                case 'leonardoai': {
                    // ✅ [2026-02-23] Leonardo AI (Phoenix, SeeDream, Ideogram 등)
                    const leonardoApiKey = (config as any).leonardoaiApiKey;
                    if (!leonardoApiKey) {
                        return { success: false, error: 'Leonardo AI API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.' };
                    }

                    const leonardoModel = (config as any).leonardoaiModel || 'seedream-4.5';
                    console.log(`[imageHandlers] 🎨 Leonardo AI 테스트 이미지 생성 (모델: ${leonardoModel})`);

                    const leonardoResult = await generateSingleLeonardoAIImage(
                        { prompt: fullPrompt, size: `${size.width}x${size.height}`, model: leonardoModel },
                        leonardoApiKey
                    );

                    if (leonardoResult.success && leonardoResult.localPath) {
                        // 테스트 이미지 디렉토리로 복사
                        const fileName = `test-${style}-leonardo-${Date.now()}.png`;
                        const filePath = path.join(saveDir, fileName);
                        await fsp.copyFile(leonardoResult.localPath, filePath);
                        result = { success: true, path: filePath };
                    } else {
                        return { success: false, error: leonardoResult.error || 'Leonardo AI 생성 실패' };
                    }
                    break;
                }

                case 'pollinations': {
                    // Pollinations (무료)
                    const encodedPrompt = encodeURIComponent(fullPrompt);
                    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${size.width}&height=${size.height}&nologo=true&seed=${Date.now()}`;

                    const imageResponse = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 60000
                    });

                    if (imageResponse.data) {
                        const buffer = Buffer.from(imageResponse.data);
                        const fileName = `test-${style}-pollinations-${Date.now()}.png`;
                        const filePath = path.join(saveDir, fileName);
                        await fsp.writeFile(filePath, buffer);
                        result = { success: true, path: filePath };
                    }
                    break;
                }

                case 'imagefx': {
                    // ✅ [2026-03-15] ImageFX (Google 무료 — AdsPower 또는 자체 브라우저)
                    try {
                        const { generateSingleImageWithImageFx } = await import('../../image/imageFxGenerator.js');
                        console.log(`[imageHandlers] ✨ ImageFX 테스트 이미지 생성 시도...`);
                        const fxResult = await generateSingleImageWithImageFx(fullPrompt, ratio || '1:1');
                        if (fxResult && fxResult.buffer) {
                            // ✅ [2026-03-16 FIX] 실제 포맷에 맞는 확장자 사용
                            const fxIsJPEG = fxResult.buffer[0] === 0xFF && fxResult.buffer[1] === 0xD8;
                            const fxFileExt = fxIsJPEG ? 'jpg' : 'png';
                            const fileName = `test-${style}-imagefx-${Date.now()}.${fxFileExt}`;
                            const filePath = path.join(saveDir, fileName);
                            await fsp.writeFile(filePath, fxResult.buffer);
                            result = { success: true, path: filePath };
                        } else {
                            return { success: false, error: 'ImageFX 이미지 생성 실패. Google 로그인을 확인해주세요.' };
                        }
                    } catch (fxErr: any) {
                        console.error(`[imageHandlers] ❌ ImageFX 테스트 이미지 실패:`, fxErr.message);
                        return { success: false, error: `ImageFX 오류: ${fxErr.message}` };
                    }
                    break;
                }

                default: {
                    // 기본: 나노바나나프로 폴백
                    console.log(`[imageHandlers] 알 수 없는 엔진 "${imageSource}", 나노바나나프로로 폴백`);
                    const geminiApiKey = (config as any).geminiApiKey;
                    if (!geminiApiKey) {
                        return { success: false, error: 'Gemini API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.' };
                    }

                    const response = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent`,
                        {
                            contents: [{ parts: [{ text: fullPrompt }] }],
                            generationConfig: {
                                responseModalities: ['Text', 'Image']
                            }
                        },
                        {
                            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
                            timeout: 120000
                        }
                    );

                    const candidates = response.data?.candidates;
                    if (candidates?.[0]?.content?.parts) {
                        for (const part of candidates[0].content.parts) {
                            if (part.inlineData?.data) {
                                const buffer = Buffer.from(part.inlineData.data, 'base64');
                                const fileName = `test-${style}-fallback-${Date.now()}.png`;
                                const filePath = path.join(saveDir, fileName);
                                await fsp.writeFile(filePath, buffer);
                                result = { success: true, path: filePath };
                                break;
                            }
                        }
                    }
                    break;
                }
            }

            if (result?.success) {
                console.log(`[imageHandlers] ✅ 테스트 이미지 생성 완료 (${imageSource}): ${result.path}`);
                return result;
            } else {
                return { success: false, error: `이미지 생성에 실패했습니다. (엔진: ${imageSource})` };
            }

        } catch (error: any) {
            console.error('[imageHandlers] 테스트 이미지 생성 오류:', error);
            const errorMessage = error.response?.data?.error?.message || error.message || '알 수 없는 오류';
            return { success: false, error: errorMessage };
        }
    });

    // ✅ [2026-02-18] 스타일 미리보기 캐시 조회 (+ 번들 이미지 fallback)
    safeHandle('get-style-preview-cache', async () => {
        try {
            const cacheDir = path.join(app.getPath('userData'), 'style-previews');
            const cache: Record<string, string> = {};

            // 1단계: userData 캐시에서 로드
            if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir);
                for (const file of files) {
                    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
                        const styleName = path.basename(file, path.extname(file));
                        cache[styleName] = path.join(cacheDir, file);
                    }
                }
            }

            // 2단계: 캐시에 없는 스타일은 번들된 public/style-previews/ 에서 복사
            const ALL_STYLES = ['realistic', 'vintage', 'stickman', 'roundy', '2d', 'disney'];
            const missingStyles = ALL_STYLES.filter(s => !cache[s]);

            if (missingStyles.length > 0) {
                // 번들 이미지 경로 (개발: public/, 프로덕션: resources/public/)
                const bundledDirs = [
                    path.join(app.getAppPath(), 'public', 'style-previews'),
                    path.join(process.resourcesPath || '', 'public', 'style-previews'),
                    path.join(__dirname, '..', '..', '..', 'public', 'style-previews'),
                ];

                let bundledDir = '';
                for (const dir of bundledDirs) {
                    if (fs.existsSync(dir)) {
                        bundledDir = dir;
                        break;
                    }
                }

                if (bundledDir) {
                    await fsp.mkdir(cacheDir, { recursive: true });
                    for (const style of missingStyles) {
                        const bundledFile = path.join(bundledDir, `${style}.png`);
                        if (fs.existsSync(bundledFile)) {
                            const destFile = path.join(cacheDir, `${style}.png`);
                            try {
                                await fsp.copyFile(bundledFile, destFile);
                                cache[style] = destFile;
                                console.log(`[imageHandlers] 📦 번들 이미지 복사: ${style}.png`);
                            } catch (copyErr) {
                                // 복사 실패 시 원본 경로 직접 사용
                                cache[style] = bundledFile;
                                console.log(`[imageHandlers] 📦 번들 이미지 직접 참조: ${style}.png`);
                            }
                        }
                    }
                }
            }

            return { success: true, cache };
        } catch (error) {
            console.error('[imageHandlers] 스타일 미리보기 캐시 조회 오류:', error);
            return { success: true, cache: {} };
        }
    });

    // ✅ [2026-02-18] 스타일 미리보기 이미지 생성 (온디맨드)
    safeHandle('generate-style-preview', async (_event, options: {
        style: string;
        engine?: string;
    }) => {
        try {
            const { style, engine } = options;

            const configModule = await import('../../configManager.js');
            const config = await configModule.loadConfig();
            const imageSource = engine || (config as any).globalImageSource || 'nano-banana-pro';

            console.log(`[imageHandlers] 🖼️ 스타일 미리보기 생성: style=${style}, engine=${imageSource}`);

            // ✅ 스타일별 고정 미리보기 프롬프트 (영어)
            const previewPromptMap: Record<string, string> = {
                'realistic': 'A cozy Korean cafe interior with warm lighting, a latte with beautiful foam art on a wooden table, autumn leaves visible through the window, professional DSLR photography, 8K UHD, shallow depth of field',
                'vintage': 'A vintage 1950s retro poster illustration of a charming European street cafe, muted warm color palette, old-fashioned typography elements, nostalgic sepia-toned aesthetic, classic mid-century design',
                'stickman': 'Cute chibi cartoon character with oversized round white head much larger than body, simple black dot eyes, tiny body wearing bright orange hoodie, sitting at a desk with a laptop, thick bold black outlines, flat cel-shaded colors, colorful room background, Korean internet meme comic style',
                'roundy': 'Adorable chubby round blob character with extremely round soft white body, small dot eyes and tiny happy smile, wearing a tiny pink bow, sitting on a fluffy cloud, dreamy pastel pink and lavender background with sparkles, Molang inspired kawaii aesthetic, healing cozy atmosphere',
                '2d': 'Korean webtoon style 2D illustration of a young Korean woman with short bob hair, wearing a yellow sweater, reading a book in a library, vibrant flat colors, clean line art, manhwa aesthetic, soft pastel color palette, cute and expressive character design',
                'disney': 'Disney Pixar 3D animation style, adorable cartoon animal characters in an enchanted forest, big expressive eyes, vibrant saturated colors, magical glowing particles, soft volumetric lighting, cinematic composition, family-friendly whimsical atmosphere'
            };

            const basePrompt = previewPromptMap[style] || previewPromptMap['realistic'];

            // ✅ 나노바나나프로(Gemini)만 텍스트 포함 가능, 나머지는 NO TEXT 필수
            const isGeminiEngine = imageSource === 'nano-banana-pro' || imageSource === 'gemini';
            const noTextSuffix = isGeminiEngine ? '' : ', NO TEXT, NO LETTERS, NO WRITING, NO WATERMARK';
            const fullPrompt = basePrompt + noTextSuffix;

            // 스타일별 프롬프트 힌트 추가
            const styleHintMap: Record<string, string> = {
                'realistic': 'Hyper-realistic professional photography, natural lighting, authentic details',
                'vintage': 'Vintage retro illustration, 1950s poster art style, muted color palette',
                'stickman': 'Chibi cartoon character, oversized head, cel-shaded, bold outlines, web comic style',
                'roundy': 'Chubby round blob character, pastel colors, soft outlines, kawaii healing style',
                '2d': 'Korean webtoon style, vibrant flat colors, clean line art, manhwa aesthetic',
                'disney': 'Disney Pixar 3D animation, big expressive eyes, vibrant saturated colors, magical whimsical atmosphere'
            };
            const styleHint = styleHintMap[style] || '';
            const finalPrompt = `${styleHint}, ${fullPrompt}`;

            // 고정 크기 (미리보기용)
            const size = { width: 768, height: 768 };

            const cacheDir = path.join(app.getPath('userData'), 'style-previews');
            await fsp.mkdir(cacheDir, { recursive: true });
            const cachePath = path.join(cacheDir, `${style}.png`);

            let result: any = null;

            // ✅ DeepInfra 모델 매핑 (generate-test-image와 동일)
            const DEEPINFRA_MODEL_MAP: Record<string, string> = {
                'flux-2-dev': 'black-forest-labs/FLUX-2-dev',
                'flux-dev': 'black-forest-labs/FLUX-1-dev',
                'flux-schnell': 'black-forest-labs/FLUX-1-schnell'
            };

            switch (imageSource) {
                case 'deepinfra':
                case 'deepinfra-flux': {
                    const deepinfraApiKey = (config as any).deepinfraApiKey;
                    if (!deepinfraApiKey) return { success: false, error: 'DeepInfra API 키가 설정되지 않았습니다.' };

                    const selectedModelKey = (config as any).deepinfraModel || 'flux-2-dev';
                    const actualModel = DEEPINFRA_MODEL_MAP[selectedModelKey] || 'black-forest-labs/FLUX-2-dev';

                    const response = await axios.post(
                        'https://api.deepinfra.com/v1/openai/images/generations',
                        { model: actualModel, prompt: finalPrompt, n: 1, size: `${size.width}x${size.height}` },
                        { headers: { 'Authorization': `Bearer ${deepinfraApiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 }
                    );

                    if (response.data?.data?.[0]?.url) {
                        const imageResponse = await axios.get(response.data.data[0].url, { responseType: 'arraybuffer' });
                        await fsp.writeFile(cachePath, Buffer.from(imageResponse.data));
                        result = { success: true, path: cachePath };
                    }
                    break;
                }

                case 'nano-banana-pro': {
                    const geminiApiKey = (config as any).geminiApiKey;
                    if (!geminiApiKey) return { success: false, error: 'Gemini API 키가 설정되지 않았습니다.' };

                    const response = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent`,
                        { contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { responseModalities: ['Text', 'Image'] } },
                        { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey }, timeout: 120000 }
                    );

                    const candidates = response.data?.candidates;
                    if (candidates?.[0]?.content?.parts) {
                        for (const part of candidates[0].content.parts) {
                            if (part.inlineData?.data) {
                                await fsp.writeFile(cachePath, Buffer.from(part.inlineData.data, 'base64'));
                                result = { success: true, path: cachePath };
                                break;
                            }
                        }
                    }
                    break;
                }

                case 'pollinations': {
                    const encodedPrompt = encodeURIComponent(finalPrompt);
                    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${size.width}&height=${size.height}&nologo=true&seed=${Date.now()}`;
                    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
                    if (imageResponse.data) {
                        await fsp.writeFile(cachePath, Buffer.from(imageResponse.data));
                        result = { success: true, path: cachePath };
                    }
                    break;
                }

                case 'leonardoai': {
                    // ✅ [2026-02-23] Leonardo AI 스타일 미리보기 생성
                    const leonardoApiKey = (config as any).leonardoaiApiKey;
                    if (!leonardoApiKey) return { success: false, error: 'Leonardo AI API 키가 설정되지 않았습니다.' };

                    const leonardoModel = (config as any).leonardoaiModel || 'seedream-4.5';
                    console.log(`[imageHandlers] 🎨 Leonardo AI 스타일 프리뷰 생성 (모델: ${leonardoModel})`);

                    const leonardoResult = await generateSingleLeonardoAIImage(
                        { prompt: finalPrompt, size: `${size.width}x${size.height}`, model: leonardoModel },
                        leonardoApiKey
                    );

                    if (leonardoResult.success && leonardoResult.localPath) {
                        await fsp.copyFile(leonardoResult.localPath, cachePath);
                        result = { success: true, path: cachePath };
                    } else {
                        return { success: false, error: leonardoResult.error || 'Leonardo AI 생성 실패' };
                    }
                    break;
                }

                case 'stability': {
                    const stabilityApiKey = (config as any).stabilityApiKey;
                    if (!stabilityApiKey) return { success: false, error: 'Stability AI API 키가 설정되지 않았습니다.' };

                    const formData = new FormData();
                    formData.append('prompt', finalPrompt);
                    formData.append('output_format', 'png');

                    const response = await axios.post(
                        'https://api.stability.ai/v2beta/stable-image/generate/core',
                        formData,
                        { headers: { 'Authorization': `Bearer ${stabilityApiKey}`, 'Accept': 'image/*' }, responseType: 'arraybuffer', timeout: 60000 }
                    );
                    if (response.data) {
                        await fsp.writeFile(cachePath, Buffer.from(response.data));
                        result = { success: true, path: cachePath };
                    }
                    break;
                }

                case 'imagefx': {
                    // ✅ [2026-03-15] ImageFX (Google 무료 — AdsPower 또는 자체 브라우저)
                    try {
                        const { generateSingleImageWithImageFx } = await import('../../image/imageFxGenerator.js');
                        console.log(`[imageHandlers] ✨ ImageFX 스타일 미리보기 생성 시도...`);
                        const fxResult = await generateSingleImageWithImageFx(finalPrompt, '1:1');
                        if (fxResult && fxResult.buffer) {
                            await fsp.writeFile(cachePath, fxResult.buffer);
                            result = { success: true, path: cachePath };
                        } else {
                            return { success: false, error: 'ImageFX 미리보기 생성 실패. Google 로그인을 확인해주세요.' };
                        }
                    } catch (fxErr: any) {
                        console.error(`[imageHandlers] ❌ ImageFX 미리보기 실패:`, fxErr.message);
                        return { success: false, error: `ImageFX 오류: ${fxErr.message}` };
                    }
                    break;
                }

                default: {
                    // 기본 폴백: Gemini
                    const geminiApiKey = (config as any).geminiApiKey;
                    if (!geminiApiKey) return { success: false, error: 'Gemini API 키가 설정되지 않았습니다.' };

                    const response = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent`,
                        { contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { responseModalities: ['Text', 'Image'] } },
                        { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey }, timeout: 120000 }
                    );

                    const candidates = response.data?.candidates;
                    if (candidates?.[0]?.content?.parts) {
                        for (const part of candidates[0].content.parts) {
                            if (part.inlineData?.data) {
                                await fsp.writeFile(cachePath, Buffer.from(part.inlineData.data, 'base64'));
                                result = { success: true, path: cachePath };
                                break;
                            }
                        }
                    }
                    break;
                }
            }

            if (result?.success) {
                console.log(`[imageHandlers] ✅ 스타일 미리보기 생성 완료 (${imageSource}): ${result.path}`);
                return result;
            } else {
                return { success: false, error: `미리보기 생성 실패 (엔진: ${imageSource})` };
            }

        } catch (error: any) {
            console.error('[imageHandlers] 스타일 미리보기 생성 오류:', error);
            const errorMessage = error.response?.data?.error?.message || error.message || '알 수 없는 오류';
            return { success: false, error: errorMessage };
        }
    });
}


/**
 * ✅ [100점 수정] 미디어(비디오) 핸들러 등록 - 실제 구현
 */
export function registerMediaHandlers(ctx: IpcContext): void {
    // MP4 파일 목록
    safeHandle('media:listMp4Files', async (_event, payload: { dirPath: string }) => {
        try {
            const { dirPath } = payload;
            if (!fs.existsSync(dirPath)) {
                return { success: true, files: [] };
            }

            const entries = await fsp.readdir(dirPath, { withFileTypes: true });
            const mp4Files = [];

            for (const entry of entries) {
                if (entry.isFile() && /\.mp4$/i.test(entry.name)) {
                    const fullPath = path.join(dirPath, entry.name);
                    const stat = await fsp.stat(fullPath);
                    mp4Files.push({
                        name: entry.name,
                        fullPath,
                        mtime: stat.mtimeMs,
                        size: stat.size
                    });
                }
            }

            // 최신순 정렬
            mp4Files.sort((a, b) => b.mtime - a.mtime);
            return { success: true, files: mp4Files };
        } catch (error) {
            return { success: false, files: [], message: (error as Error).message };
        }
    });

    // ✅ [100점 수정] MP4 → GIF 변환 (실제 구현)
    safeHandle('media:convertMp4ToGif', async (_event, payload: { sourcePath: string; aspectRatio?: string }) => {
        try {
            const { sourcePath, aspectRatio } = payload;

            if (!ffmpegPath) {
                return { success: false, message: 'ffmpeg-static을 찾을 수 없습니다.' };
            }

            if (!fs.existsSync(sourcePath)) {
                return { success: false, message: '원본 MP4 파일이 없습니다.' };
            }

            const gifPath = sourcePath.replace(/\.mp4$/i, '.gif');
            const fps = 12;
            const width = 480;

            let filter: string;
            if (aspectRatio === '1:1') {
                filter = `fps=${fps},scale=${width}:${width}:force_original_aspect_ratio=increase,crop=${width}:${width},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
            } else if (aspectRatio === '9:16') {
                const height = Math.round(width * (16 / 9));
                filter = `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
            } else {
                filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
            }

            return new Promise((resolve) => {
                const args = ['-y', '-i', sourcePath, '-vf', filter, gifPath];
                const ffmpeg = spawn(ffmpegPath as string, args);

                ffmpeg.on('error', (err) => {
                    console.error('[mediaHandlers] ffmpeg 오류:', err);
                    resolve({ success: false, message: err.message });
                });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        console.log(`[mediaHandlers] ✅ GIF 변환 완료: ${gifPath}`);
                        resolve({ success: true, gifPath });
                    } else {
                        resolve({ success: false, message: `ffmpeg 종료 코드: ${code}` });
                    }
                });
            });
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [100점 수정] Ken Burns 비디오 생성 (실제 구현)
    safeHandle('media:createKenBurnsVideo', async (_event, payload: { imagePath: string; heading?: string; durationSeconds?: number; aspectRatio?: string }) => {
        try {
            const { imagePath, heading, durationSeconds = 6, aspectRatio = '16:9' } = payload;

            if (!ffmpegPath) {
                return { success: false, message: 'ffmpeg-static을 찾을 수 없습니다.' };
            }

            if (!fs.existsSync(imagePath)) {
                return { success: false, message: '원본 이미지 파일이 없습니다.' };
            }

            const safeHeading = (heading || 'video').replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '').substring(0, 30);
            const fileName = `${safeHeading}-${Date.now()}.mp4`;
            const outputDir = path.join(app.getPath('userData'), 'videos');
            await fsp.mkdir(outputDir, { recursive: true });
            const outputPath = path.join(outputDir, fileName);

            // 비율에 따른 해상도
            let width = 1280, height = 720;
            if (aspectRatio === '9:16') { width = 720; height = 1280; }
            else if (aspectRatio === '1:1') { width = 720; height = 720; }

            // Ken Burns 효과: 줌인 + 살짝 이동
            const filter = `scale=${width * 1.2}:${height * 1.2},zoompan=z='min(zoom+0.0015,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationSeconds * 25}:s=${width}x${height}:fps=25`;

            return new Promise((resolve) => {
                const args = [
                    '-y',
                    '-loop', '1',
                    '-i', imagePath,
                    '-vf', filter,
                    '-c:v', 'libx264',
                    '-t', String(durationSeconds),
                    '-pix_fmt', 'yuv420p',
                    '-an',
                    outputPath
                ];

                const ffmpeg = spawn(ffmpegPath as string, args);

                ffmpeg.on('error', (err) => {
                    console.error('[mediaHandlers] KenBurns ffmpeg 오류:', err);
                    resolve({ success: false, message: err.message });
                });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        console.log(`[mediaHandlers] ✅ KenBurns 영상 생성 완료: ${outputPath}`);
                        resolve({ success: true, filePath: outputPath, fileName });
                    } else {
                        resolve({ success: false, message: `ffmpeg 종료 코드: ${code}` });
                    }
                });
            });
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // MP4 파일 가져오기 (import)
    safeHandle('media:importMp4', async (_event, payload: { sourcePath: string; dirPath: string }) => {
        try {
            const { sourcePath, dirPath } = payload;
            const fileName = path.basename(sourcePath);
            const destPath = path.join(dirPath, fileName);

            await fsp.mkdir(dirPath, { recursive: true });
            await fsp.copyFile(sourcePath, destPath);

            return { success: true, filePath: destPath, fileName };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [100점 수정] Veo 영상 생성 (Gemini API)
    safeHandle('gemini:generateVeoVideo', async (_event, payload: {
        prompt: string;
        model?: string;
        durationSeconds?: number;
        aspectRatio?: '16:9' | '9:16' | '1:1' | 'original';
        negativePrompt?: string;
        imagePath?: string;
        image?: { imageBytes: string; mimeType: string };
        heading?: string;
    }) => {
        try {
            const { prompt, model = 'veo-3.1-generate-preview', durationSeconds = 6, aspectRatio = '16:9', negativePrompt, imagePath, image, heading } = payload;

            // API 키 가져오기
            const configModule = await import('../../configManager.js');
            const config = await configModule.loadConfig();
            const apiKey = (config as any).geminiApiKey || process.env.GEMINI_API_KEY;

            if (!apiKey) {
                return { success: false, message: 'Gemini API 키가 설정되지 않았습니다.' };
            }

            console.log(`[Veo] 🎬 영상 생성 시작: "${heading || prompt.substring(0, 30)}..." (${model})`);

            // 이미지 데이터 준비 (Image-to-Video)
            let imageData = image;
            if (!imageData && imagePath && fs.existsSync(imagePath)) {
                const buffer = await fsp.readFile(imagePath);
                const ext = path.extname(imagePath).toLowerCase();
                const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                imageData = {
                    imageBytes: buffer.toString('base64'),
                    mimeType
                };
            }

            // Veo API 호출
            const requestBody: any = {
                contents: [{
                    parts: [{
                        text: prompt + (negativePrompt ? `\n\nNegative prompt: ${negativePrompt}` : '')
                    }]
                }],
                generationConfig: {
                    responseModalities: ['VIDEO'],
                    videoConfig: {
                        durationSeconds,
                        aspectRatio: aspectRatio === 'original' ? '16:9' : aspectRatio
                    }
                }
            };

            // Image-to-Video인 경우 이미지 추가
            if (imageData) {
                requestBody.contents[0].parts.unshift({
                    inlineData: {
                        mimeType: imageData.mimeType,
                        data: imageData.imageBytes
                    }
                });
            }

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                requestBody,
                {
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    timeout: 180000 // 3분 타임아웃 (영상 생성은 오래 걸림)
                }
            );

            // 응답에서 비디오 데이터 추출
            const candidates = response.data?.candidates;
            if (candidates && candidates[0]?.content?.parts) {
                for (const part of candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.mimeType?.startsWith('video/')) {
                        const videoData = Buffer.from(part.inlineData.data, 'base64');

                        const safeHeading = (heading || 'veo-video').replace(/[<>:"/\\|?*,;#&=+%!'(){}\[\]~]/g, '_').replace(/_+/g, '_').replace(/\.+$/g, '').substring(0, 30);
                        const fileName = `${safeHeading}-${Date.now()}.mp4`;
                        const outputDir = path.join(app.getPath('userData'), 'videos');
                        await fsp.mkdir(outputDir, { recursive: true });
                        const filePath = path.join(outputDir, fileName);

                        await fsp.writeFile(filePath, videoData);

                        console.log(`[Veo] ✅ 영상 생성 완료: ${filePath}`);
                        return { success: true, filePath, fileName };
                    }
                }
            }

            // 비디오 데이터가 없는 경우
            const errorMessage = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '영상 데이터가 응답에 없습니다.';
            console.error(`[Veo] ❌ 영상 생성 실패: ${errorMessage}`);
            return { success: false, message: errorMessage };

        } catch (error: any) {
            const message = error.response?.data?.error?.message || error.message || '알 수 없는 오류';
            console.error(`[Veo] ❌ API 오류: ${message}`);
            return { success: false, message };
        }
    });
}

/**
 * 소제목-비디오 매핑 핸들러 등록
 */
const headingVideoMap = new Map<string, Array<{ provider: string; filePath: string; previewDataUrl: string; updatedAt: number }>>();

export function registerHeadingVideoHandlers(ctx: IpcContext): void {
    // 비디오 적용
    safeHandle('heading:applyVideo', async (_event, heading: string, video: any) => {
        try {
            const existing = headingVideoMap.get(heading) || [];
            existing.push({
                provider: video.provider || 'unknown',
                filePath: video.filePath,
                previewDataUrl: video.previewDataUrl || '',
                updatedAt: video.updatedAt || Date.now()
            });
            headingVideoMap.set(heading, existing);
            return { success: true };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // 적용된 비디오 가져오기
    safeHandle('heading:getAppliedVideo', async (_event, heading: string) => {
        const videos = headingVideoMap.get(heading);
        if (videos && videos.length > 0) {
            return { success: true, video: videos[videos.length - 1] };
        }
        return { success: false };
    });

    // 적용된 비디오 목록 가져오기
    safeHandle('heading:getAppliedVideos', async (_event, heading: string) => {
        const videos = headingVideoMap.get(heading) || [];
        return { success: true, videos };
    });

    // 비디오 제거
    safeHandle('heading:removeVideo', async (_event, heading: string) => {
        headingVideoMap.delete(heading);
        return { success: true };
    });

    // 모든 적용된 비디오 가져오기
    safeHandle('heading:getAllAppliedVideos', async () => {
        const result: Record<string, any[]> = {};
        for (const [key, value] of headingVideoMap.entries()) {
            result[key] = value;
        }
        return { success: true, videos: result };
    });
}

