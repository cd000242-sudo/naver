// src/main/ipc/imageTableHandlers.ts
// 이미지 테이블/배너 관련 IPC 핸들러
// - 비교표, 장단점 표, 커스텀 배너, 테스트 이미지 생성

import { ipcMain, app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 이미지 테이블/배너 핸들러 등록
 */
export function registerImageTableHandlers(): void {

  // ✅ 비교표 이미지 생성
  ipcMain.handle('image:generateComparisonTable', async (_event, options: {
    title?: string;
    products: Array<{
      name: string;
      price?: string;
      rating?: string;
      pros?: string[];
      cons?: string[];
      specs?: Record<string, string>;
      isRecommended?: boolean;
    }>;
    theme?: 'light' | 'dark' | 'gradient';
    accentColor?: string;
    width?: number;
    showRanking?: boolean;
  }) => {
    try {
      console.log('[imageTableHandlers] 비교표 이미지 생성 요청:', options.title, options.products?.length);
      const { generateComparisonTableImage } = await import('../../image/comparisonTableGenerator.js');

      const result = await generateComparisonTableImage(options);

      if (result.success) {
        console.log('[imageTableHandlers] 비교표 이미지 생성 완료:', result.imagePath);
      } else {
        console.error('[imageTableHandlers] 비교표 이미지 생성 실패:', result.error);
      }

      return result;
    } catch (error) {
      console.error('[imageTableHandlers] 비교표 이미지 생성 오류:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // ✅ [2026-01-18] 커스텀 CTA 배너 생성 핸들러
  ipcMain.handle('image:generateCustomBanner', async (_event, options: {
    text: string;
    colorKey: string;
    sizeKey: string;
    animationKey: string;
    customImagePath?: string;
  }) => {
    try {
      console.log('[imageTableHandlers] 커스텀 배너 생성 요청:', options.text, options.colorKey);
      const { generateCustomBanner } = await import('../../image/tableImageGenerator.js');

      const bannerPath = await generateCustomBanner({
        text: options.text || '지금 바로 구매하기 →',
        colorKey: options.colorKey || 'naver-green',
        sizeKey: options.sizeKey || 'standard',
        animationKey: options.animationKey || 'shimmer',
        customImagePath: options.customImagePath,
      });

      console.log('[imageTableHandlers] 커스텀 배너 생성 완료:', bannerPath);
      return { success: true, path: bannerPath };
    } catch (error) {
      console.error('[imageTableHandlers] 커스텀 배너 생성 오류:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  // ✅ [2026-01-19] 장단점 표 이미지 생성 핸들러
  ipcMain.handle('image:generateProsConsTable', async (_event, options: {
    productName: string;
    pros: string[];
    cons: string[];
  }) => {
    try {
      const { productName, pros, cons } = options;
      console.log(`[imageTableHandlers] 장단점 표 생성 요청: ${productName}, 장점 ${pros.length}개, 단점 ${cons.length}개`);

      const { generateProsConsTableImage } = await import('../../image/tableImageGenerator.js');
      const result = await generateProsConsTableImage(productName, pros, cons);

      if (result) {
        console.log(`[imageTableHandlers] 장단점 표 생성 완료: ${result}`);
        return { success: true, path: result };
      } else {
        return { success: false, message: '장단점 표 생성 실패' };
      }
    } catch (error) {
      console.error('[imageTableHandlers] 장단점 표 생성 오류:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  // ✅ [2026-01-27] 테스트 이미지 생성 핸들러 (스타일 미리보기용)
  // ✅ [2026-02-08] engine, textOverlay 파라미터 추가
  ipcMain.handle('generate-test-image', async (_event, options: {
    style: string;
    ratio: string;
    prompt: string;
    engine?: string;
    textOverlay?: { enabled: boolean; text: string };
  }) => {
    try {
      const { style, ratio, prompt, engine, textOverlay } = options;
      console.log(`[imageTableHandlers] 🎨 테스트 이미지 생성: style=${style}, ratio=${ratio}, engine=${engine || '(config)'}, textOverlay=${textOverlay?.enabled || false}`);

      const { loadConfig } = await import('../../configManager.js');
      const config = await loadConfig();
      // ✅ [2026-02-08] engine 파라미터가 있으면 임시 엔진 사용, 없으면 저장된 설정
      const imageSource = engine || (config as any).globalImageSource || 'deepinfra';

      // API 키 결정
      let apiKey = '';
      if (imageSource === 'nano-banana-pro' || imageSource.includes('gemini')) {
        apiKey = config.geminiApiKey || '';
      } else {
        apiKey = (config as any).deepinfraApiKey || '';
      }

      if (!apiKey) {
        return { success: false, error: '이미지 생성을 위한 API 키가 설정되지 않았습니다.' };
      }

      // ✅ [2026-02-08] 11가지 스타일별 프롬프트 (3카테고리 동기화)
      const stylePromptMap: Record<string, string> = {
        // 📷 실사
        'realistic': 'Hyper-realistic professional photography, 8K UHD quality, DSLR camera, natural lighting, cinematic composition, Fujifilm XT3 quality',
        'bokeh': 'Beautiful bokeh photography, shallow depth of field, dreamy out-of-focus background lights, soft circular bokeh orbs, DSLR wide aperture f/1.4 quality, romantic atmosphere',
        // 🖌️ 아트
        'vintage': 'Vintage retro illustration, 1950s poster art style, muted color palette, nostalgic aesthetic, old-fashioned charm, classic design elements, aged paper texture',
        'minimalist': 'Minimalist flat design, simple clean lines, solid colors, modern aesthetic, geometric shapes, professional infographic style, san-serif typography',
        '3d-render': '3D render, Octane render quality, Cinema 4D style, Blender 3D art, realistic materials and textures, studio lighting setup, high-end 3D visualization',
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

      // ✅ 실사 외 스타일인 경우 강화 (실제 생성과 동일 - nanoBananaProGenerator.ts 553-556)
      let finalPrompt: string;
      if (style !== 'realistic') {
        finalPrompt = `[ART STYLE: ${style.toUpperCase()}]\n${stylePrompt}\n\n${prompt}\n\nIMPORTANT: Generate the image in ${style} style. DO NOT generate photorealistic images.`;
        console.log(`[imageTableHandlers] 🎨 스타일 프롬프트 강화 적용: ${style}`);
      } else {
        finalPrompt = `${stylePrompt}\n\n${prompt}`;
      }

      // 비율 → 해상도 매핑
      const ratioMap: Record<string, { width: number; height: number }> = {
        '1:1': { width: 1024, height: 1024 },
        '16:9': { width: 1344, height: 768 },
        '9:16': { width: 768, height: 1344 },
        '4:3': { width: 1152, height: 896 },
        '3:4': { width: 896, height: 1152 },
      };
      const resolution = ratioMap[ratio] || ratioMap['1:1'];

      // 이미지 생성 (사용자 설정에 따라 엔진 선택)
      let imagePath: string;

      console.log(`[imageTableHandlers] 🎨 테스트 이미지 생성 - 엔진: ${imageSource}, 스타일: ${style}`);

      if (imageSource === 'nano-banana-pro' || imageSource.includes('gemini')) {
        // ✅ 나노바나나프로 (Gemini) 사용 - 실제 생성과 동일 옵션
        const { generateWithNanoBananaPro } = await import('../../image/nanoBananaProGenerator.js');
        const testItem = {
          heading: prompt || '테스트 이미지',
          prompt: finalPrompt,
          imageStyle: style,
          imageRatio: ratio,
          aspectRatio: ratio,
        };

        const results = await generateWithNanoBananaPro(
          [testItem],
          'test-image',
          'Test',
          false,
          apiKey,
          false,
          undefined,
          undefined
        );

        if (results && results.length > 0 && results[0].filePath) {
          imagePath = results[0].filePath;
        } else {
          throw new Error('나노바나나프로 이미지 생성 실패');
        }
      } else if (imageSource === 'deepinfra' || imageSource === 'deepinfra-flux') {
        // ✅ [2026-02-08] DeepInfra 사용 - 설정 모델 동적 선택
        const DEEPINFRA_MODEL_MAP: Record<string, string> = {
          'flux-2-dev': 'black-forest-labs/FLUX-2-dev',
          'flux-dev': 'black-forest-labs/FLUX-1-dev',
          'flux-schnell': 'black-forest-labs/FLUX-1-schnell'
        };
        const selectedModelKey = (config as any).deepinfraModel || 'flux-2-dev';
        const actualModel = DEEPINFRA_MODEL_MAP[selectedModelKey] || 'black-forest-labs/FLUX-2-dev';
        console.log(`[imageTableHandlers] 🔧 DeepInfra 모델: ${selectedModelKey} → ${actualModel}`);

        const { generateSingleDeepInfraImage } = await import('../../image/deepinfraGenerator.js');
        const sizeStr = `${resolution.width}x${resolution.height}`;
        const result = await generateSingleDeepInfraImage(
          { prompt: finalPrompt, size: sizeStr, model: actualModel },
          apiKey
        );

        if (result.success && result.localPath) {
          imagePath = result.localPath;
        } else {
          throw new Error(result.error || 'DeepInfra 이미지 생성 실패');
        }
      } else if (imageSource === 'openai-image') {
        // ✅ [2026-02-22] OpenAI Image (DALL-E / gpt-image-1)
        console.log(`[imageTableHandlers] 🎨 OpenAI Image 엔진으로 테스트 이미지 생성`);
        const { generateSingleOpenAIImage } = await import('../../image/openaiImageGenerator.js');
        const apiKeyOpenAI = (config as any).openaiImageApiKey;
        if (!apiKeyOpenAI) throw new Error('OpenAI Image API 키가 설정되지 않았습니다.');

        const result = await generateSingleOpenAIImage(
          { prompt: finalPrompt, size: `${resolution.width}x${resolution.height}` },
          apiKeyOpenAI
        );

        if (result.success && result.localPath) {
          imagePath = result.localPath;
        } else {
          throw new Error(result.error || 'OpenAI Image 이미지 생성 실패');
        }
      } else if (imageSource === 'leonardoai') {
        // ✅ [2026-02-22] Leonardo AI
        console.log(`[imageTableHandlers] 🎨 Leonardo AI 엔진으로 테스트 이미지 생성`);
        const { generateSingleLeonardoAIImage } = await import('../../image/leonardoAIGenerator.js');
        const leonardoKey = (config as any).leonardoaiApiKey;
        if (!leonardoKey) throw new Error('Leonardo AI API 키가 설정되지 않았습니다.');
        const leonardoModel = (config as any).leonardoaiModel || 'seedream-4.5';

        const result = await generateSingleLeonardoAIImage(
          { prompt: finalPrompt, size: `${resolution.width}x${resolution.height}`, model: leonardoModel },
          leonardoKey
        );

        if (result.success && result.localPath) {
          imagePath = result.localPath;
        } else {
          throw new Error(result.error || 'Leonardo AI 이미지 생성 실패');
        }
      } else {
        // ✅ 알 수 없는 엔진 → DeepInfra 폴백
        console.warn(`[imageTableHandlers] ⚠️ 알 수 없는 엔진 "${imageSource}", DeepInfra로 폴백`);
        const { generateSingleDeepInfraImage } = await import('../../image/deepinfraGenerator.js');
        const sizeStr = `${resolution.width}x${resolution.height}`;
        const result = await generateSingleDeepInfraImage(
          { prompt: finalPrompt, size: sizeStr },
          apiKey
        );

        if (result.success && result.localPath) {
          imagePath = result.localPath;
        } else {
          throw new Error(result.error || '이미지 생성 실패');
        }
      }

      // 파일 저장 (이미 생성된 이미지 경로를 test-images 폴더로 복사)
      const testImagesDir = path.join(app.getPath('userData'), 'test-images');
      await fs.mkdir(testImagesDir, { recursive: true });

      const fileName = `test_${style}_${ratio.replace(':', 'x')}_${Date.now()}.png`;
      const filePath = path.join(testImagesDir, fileName);

      // 생성된 이미지를 test-images 폴더로 복사
      await fs.copyFile(imagePath, filePath);

      // ✅ [2026-02-08] 텍스트 오버레이 적용 (활성화된 경우)
      let previewDataUrl: string | undefined;
      if (textOverlay?.enabled && textOverlay.text) {
        try {
          console.log(`[imageTableHandlers] 📝 텍스트 오버레이 적용 중: "${textOverlay.text}"`);
          const { ThumbnailService } = await import('../../thumbnailService.js');
          const thumbnailService = new ThumbnailService();

          // ✅ 오버레이 적용된 이미지를 별도 파일로 저장
          const overlayFileName = `test_overlay_${style}_${ratio.replace(':', 'x')}_${Date.now()}.png`;
          const overlayFilePath = path.join(testImagesDir, overlayFileName);

          const resultPath = await thumbnailService.createProductThumbnail(
            filePath,
            textOverlay.text,
            overlayFilePath,
            { fontSize: 48, textColor: '#FFFFFF', position: 'bottom' }
          );

          if (resultPath && typeof resultPath === 'string') {
            // base64로 변환하여 previewDataUrl 생성
            const imageBuffer = await fs.readFile(resultPath);
            previewDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

            console.log(`[imageTableHandlers] ✅ 텍스트 오버레이 완료: ${resultPath}`);
            return { success: true, path: resultPath, previewDataUrl };
          } else {
            console.warn(`[imageTableHandlers] ⚠️ 텍스트 오버레이 실패, 원본 이미지 반환`);
          }
        } catch (overlayError) {
          console.warn(`[imageTableHandlers] ⚠️ 텍스트 오버레이 오류 (원본 이미지 반환):`, (overlayError as Error).message);
        }
      }

      console.log(`[imageTableHandlers] ✅ 테스트 이미지 생성 완료: ${filePath}`);
      return { success: true, path: filePath, previewDataUrl };

    } catch (error: any) {
      console.error('[imageTableHandlers] ❌ 테스트 이미지 생성 오류:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  console.log('[IPC] Image table handlers registered (4 handlers)');
}
