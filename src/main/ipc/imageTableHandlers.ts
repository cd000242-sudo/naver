// Image table and banner IPC handlers.

import { ipcMain } from 'electron';

export function registerImageTableHandlers(): void {
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
      const { generateComparisonTableImage } = await import('../../image/comparisonTableGenerator.js');
      return await generateComparisonTableImage(options);
    } catch (error) {
      console.error('[imageTableHandlers] comparison table generation failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('image:generateCustomBanner', async (_event, options: {
    text: string;
    colorKey: string;
    sizeKey: string;
    animationKey: string;
    customImagePath?: string;
  }) => {
    try {
      const { generateCustomBanner } = await import('../../image/tableImageGenerator.js');
      const bannerPath = await generateCustomBanner({
        text: options.text || '지금 바로 구매하기 →',
        colorKey: options.colorKey || 'naver-green',
        sizeKey: options.sizeKey || 'standard',
        animationKey: options.animationKey || 'shimmer',
        customImagePath: options.customImagePath,
      });
      return { success: true, path: bannerPath };
    } catch (error) {
      console.error('[imageTableHandlers] custom banner generation failed:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  ipcMain.handle('image:generateProsConsTable', async (_event, options: {
    productName: string;
    pros: string[];
    cons: string[];
  }) => {
    try {
      const { productName, pros, cons } = options;
      const { generateProsConsTableImage } = await import('../../image/tableImageGenerator.js');
      const result = await generateProsConsTableImage(productName, pros, cons);
      return result
        ? { success: true, path: result }
        : { success: false, message: '장단점 표 생성 실패' };
    } catch (error) {
      console.error('[imageTableHandlers] pros/cons table generation failed:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  // generate-test-image is intentionally owned by imageHandlers.ts. Registering it here
  // used to shadow the current provider router and silently send Nano Banana previews to
  // a different engine.
  console.log('[IPC] Image table handlers registered (3 handlers)');
}
