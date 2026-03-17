// @ts-nocheck
// ============================================
// 썸네일 생성기 모듈 (Thumbnail Generator)
// modules/thumbnailGenerator.ts
// ============================================
// ============================================
// ✅ [2026-01-20] 프리셋 썸네일 적용 헬퍼 함수
// 발행 모드별로 미리 세팅된 썸네일을 반환
// ============================================

/**
 * 발행 모드에 미리 세팅된 썸네일이 있으면 반환하고 1회성 사용 후 초기화
 * @param mode - 발행 모드 ('full-auto' | 'continuous' | 'ma-semi-auto' | 'ma-full-auto')
 * @returns forHeading: generatedImages[0]용, forThumbnail: thumbnailPath용 (쇼핑커넥트)
 */
export function applyPresetThumbnailIfExists(mode: string): {
  forHeading?: any;      // generatedImages[0]에 주입할 이미지 객체
  forThumbnail?: string; // thumbnailPath에 주입할 base64 (쇼핑커넥트용)
  applied: boolean;
} {
  const presetThumbnails = (window as any).presetThumbnails;

  if (!presetThumbnails || !presetThumbnails[mode]) {
    console.log(`[PresetThumbnail] ${mode}: 미리 세팅된 썸네일 없음`);
    return { applied: false };
  }

  const thumbnail = presetThumbnails[mode];
  console.log(`[PresetThumbnail] ${mode}: 미리 세팅된 썸네일 발견!`, thumbnail);

  // 1회성 사용 후 초기화
  presetThumbnails[mode] = null;

  return {
    forHeading: thumbnail,
    forThumbnail: thumbnail.previewDataUrl || thumbnail.filePath,
    applied: true
  };
}

// ============================================
// 🎨 썸네일 생성기 (Thumbnail Generator)
// ============================================


export class ThumbnailGenerator {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private backgroundImage: HTMLImageElement | null = null;
  private stickers: Array<{ emoji: string; x: number; y: number; size: number }> = [];
  private isDragging = false;
  private dragTarget: 'text' | 'sticker' | 'background' | null = null;
  private dragIndex = -1;
  private textPosition = { x: 380, y: 200 }; // center by default
  private bgPos = { x: 0, y: 0 };
  private bgScale = 1.0;
  private lastMousePos = { x: 0, y: 0 };

  // 설정값들
  private settings = {
    mainText: '제목을 입력하세요',
    subText: '',
    fontFamily: "'Noto Sans KR', sans-serif",
    fontSize: 48,
    textColor: '#ffffff',
    textAlign: 'center' as CanvasTextAlign,
    textPosition: 'center', // top, center, bottom
    textShadow: true,
    textOutline: false,
    textHighlight: false,
    outlineColor: '#000000',
    outlineWidth: 2,
    highlightColor: '#ffff00',
    highlightOpacity: 50,
    bgColor: '#1a1a2e',
    overlayEnabled: false,  // ✅ 기본 비활성화 (배경 어두워지지 않음)
    overlayColor: '#000000',
    overlayOpacity: 0,  // ✅ 기본 투명도 0
    overlayType: 'solid',
    bgBlur: 0,
    bgBrightness: 0,
    aspectRatio: '1.91:1', // '1:1' or '1.91:1'
    bgMode: 'cover', // 'cover' or 'contain'
    bgZoomEnabled: true
  };

  constructor() {
    this.init();
  }

  public setMainText(text: string): void {
    this.settings.mainText = text || '';
    const mainTextInput = document.getElementById('thumb-main-text') as HTMLTextAreaElement;
    if (mainTextInput) {
      mainTextInput.value = this.settings.mainText;
    }
    this.render();
  }

  public setBackgroundFromUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('empty url'));
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.backgroundImage = img;
        this.render();
        resolve();
      };
      img.onerror = () => reject(new Error('background image load failed'));
      img.src = url;
    });
  }

  private init(): void {
    this.canvas = document.getElementById('thumbnail-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.setupEventListeners();
    this.render();
  }

  private setupEventListeners(): void {
    // 텍스트 입력
    const mainTextInput = document.getElementById('thumb-main-text') as HTMLTextAreaElement;
    const subTextInput = document.getElementById('thumb-sub-text') as HTMLInputElement;

    mainTextInput?.addEventListener('input', (e) => {
      this.settings.mainText = (e.target as HTMLTextAreaElement).value;
      this.render();
    });

    subTextInput?.addEventListener('input', (e) => {
      this.settings.subText = (e.target as HTMLInputElement).value;
      this.render();
    });

    // 폰트 설정
    const fontFamily = document.getElementById('thumb-font-family') as HTMLSelectElement;
    fontFamily?.addEventListener('change', (e) => {
      this.settings.fontFamily = (e.target as HTMLSelectElement).value;
      this.render();
    });

    // 폰트 크기
    const fontSize = document.getElementById('thumb-font-size') as HTMLInputElement;
    const fontSizeValue = document.getElementById('thumb-font-size-value') as HTMLSpanElement;
    fontSize?.addEventListener('input', (e) => {
      this.settings.fontSize = parseInt((e.target as HTMLInputElement).value);
      if (fontSizeValue) fontSizeValue.textContent = `${this.settings.fontSize}px`;
      this.render();
    });

    // 텍스트 색상
    const textColor = document.getElementById('thumb-text-color') as HTMLInputElement;
    textColor?.addEventListener('input', (e) => {
      this.settings.textColor = (e.target as HTMLInputElement).value;
      this.render();
    });

    // 텍스트 정렬
    const textAlign = document.getElementById('thumb-text-align') as HTMLSelectElement;
    textAlign?.addEventListener('change', (e) => {
      this.settings.textAlign = (e.target as HTMLSelectElement).value as CanvasTextAlign;
      this.render();
    });

    // 텍스트 효과
    const textShadow = document.getElementById('thumb-text-shadow') as HTMLInputElement;
    textShadow?.addEventListener('change', (e) => {
      this.settings.textShadow = (e.target as HTMLInputElement).checked;
      this.render();
    });

    const textOutline = document.getElementById('thumb-text-outline') as HTMLInputElement;
    const outlineSettings = document.getElementById('thumb-outline-settings') as HTMLDivElement;
    textOutline?.addEventListener('change', (e) => {
      this.settings.textOutline = (e.target as HTMLInputElement).checked;
      if (outlineSettings) outlineSettings.style.display = this.settings.textOutline ? 'block' : 'none';
      this.render();
    });

    const textHighlight = document.getElementById('thumb-text-highlight') as HTMLInputElement;
    const highlightSettings = document.getElementById('thumb-highlight-settings') as HTMLDivElement;
    textHighlight?.addEventListener('change', (e) => {
      this.settings.textHighlight = (e.target as HTMLInputElement).checked;
      if (highlightSettings) highlightSettings.style.display = this.settings.textHighlight ? 'block' : 'none';
      this.render();
    });

    // 외곽선 설정
    const outlineColor = document.getElementById('thumb-outline-color') as HTMLInputElement;
    outlineColor?.addEventListener('input', (e) => {
      this.settings.outlineColor = (e.target as HTMLInputElement).value;
      this.render();
    });

    const outlineWidth = document.getElementById('thumb-outline-width') as HTMLInputElement;
    outlineWidth?.addEventListener('input', (e) => {
      this.settings.outlineWidth = parseInt((e.target as HTMLInputElement).value);
      this.render();
    });

    // 형광펜 설정
    const highlightColor = document.getElementById('thumb-highlight-color') as HTMLInputElement;
    highlightColor?.addEventListener('input', (e) => {
      this.settings.highlightColor = (e.target as HTMLInputElement).value;
      this.render();
    });

    const highlightOpacity = document.getElementById('thumb-highlight-opacity') as HTMLInputElement;
    highlightOpacity?.addEventListener('input', (e) => {
      this.settings.highlightOpacity = parseInt((e.target as HTMLInputElement).value);
      this.render();
    });

    // 텍스트 위치 프리셋
    document.querySelectorAll('.thumb-position-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.thumb-position-btn').forEach(b => {
          (b as HTMLElement).style.background = 'var(--bg-tertiary)';
          (b as HTMLElement).style.color = 'var(--text-muted)';
          (b as HTMLElement).style.borderColor = 'var(--border-medium)';
          b.classList.remove('selected');
        });
        (e.target as HTMLElement).style.background = 'var(--primary)';
        (e.target as HTMLElement).style.color = 'white';
        (e.target as HTMLElement).style.borderColor = 'var(--primary)';
        (e.target as HTMLElement).classList.add('selected');

        this.settings.textPosition = (e.target as HTMLElement).dataset.position || 'center';
        this.updateTextPosition();
        this.render();
      });
    });

    // 배경 색상
    const bgColor = document.getElementById('thumb-bg-color') as HTMLInputElement;
    bgColor?.addEventListener('input', (e) => {
      this.settings.bgColor = (e.target as HTMLInputElement).value;
      this.render();
    });

    // 배경 이미지 업로드
    const bgUploadBtn = document.getElementById('thumb-bg-upload-btn') as HTMLButtonElement;
    const bgFileInput = document.getElementById('thumb-bg-file-input') as HTMLInputElement;

    if (bgUploadBtn && bgUploadBtn.getAttribute('data-listener-added') !== 'true') {
      bgUploadBtn.setAttribute('data-listener-added', 'true');
      bgUploadBtn.addEventListener('click', () => bgFileInput?.click());
    }

    if (bgFileInput && bgFileInput.getAttribute('data-listener-added') !== 'true') {
      bgFileInput.setAttribute('data-listener-added', 'true');
      bgFileInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.loadBackgroundImage(file);
        try {
          (e.target as HTMLInputElement).value = '';
        } catch (e) {
          console.warn('[thumbnailGenerator] catch ignored:', e);
        }
      });
    }

    // 저장소에서 배경 선택
    const bgStorageBtn = document.getElementById('thumb-bg-storage-btn') as HTMLButtonElement;
    bgStorageBtn?.addEventListener('click', () => this.openStorageModal());

    // ✅ AI 배경 이미지 생성 (나노 바나나 프로 + NEVER TEXT 고정)
    const bgAiBtn = document.getElementById('thumb-bg-ai-btn') as HTMLButtonElement;
    const bgAiPrompt = document.getElementById('thumb-bg-ai-prompt') as HTMLInputElement;
    bgAiBtn?.addEventListener('click', async () => {
      const userPrompt = bgAiPrompt?.value?.trim() || 'beautiful abstract gradient background';
      // ✅ NEVER TEXT 프롬프트 고정 (텍스트 없는 깔끔한 배경)
      const prompt = `High quality background image: ${userPrompt}. CRITICAL: Do NOT include any text, words, letters, numbers, watermarks, or logos. Clean background only. No typography.`;

      try {
        bgAiBtn.disabled = true;
        bgAiBtn.innerHTML = '<span>🔄</span> 나노 바나나 프로로 생성중...';

        // ✅ 나노 바나나 프로 (Gemini) 사용
        const result = await generateImagesWithCostSafety({
          provider: 'nano-banana-pro',
          // ✅ [2026-03-01 FIX] 썸네일 전용 모델(nanoBananaMainModel)을 타도록 isThumbnail 명시
          items: [{ heading: 'thumbnail-bg', prompt: prompt, isThumbnail: true }],
          styleHint: 'background',
        });

        if (result.success && result.images && result.images.length > 0) {
          const imageData = result.images[0].previewDataUrl || result.images[0].filePath;

          if (imageData) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              this.backgroundImage = img;
              this.render();
              toastManager.success('✅ 나노 바나나 프로로 배경 생성 완료!');
            };
            img.onerror = () => {
              toastManager.error('❌ 이미지 로드에 실패했습니다.');
            };
            img.src = imageData;
          } else {
            toastManager.error('❌ 이미지 데이터가 없습니다.');
          }
        } else {
          toastManager.error('❌ AI 배경 생성 실패: ' + (result.message || '알 수 없는 오류'));
        }
      } catch (error) {
        console.error('[Thumbnail] AI 배경 생성 실패:', error);
        toastManager.error('❌ AI 배경 생성 실패: ' + (error as Error).message);
      } finally {
        bgAiBtn.disabled = false;
        bgAiBtn.innerHTML = '<span>🍌</span> AI 생성 (나노 바나나)';
      }
    });

    // 오버레이 설정
    const overlayEnable = document.getElementById('thumb-overlay-enable') as HTMLInputElement;
    const overlaySettings = document.getElementById('thumb-overlay-settings') as HTMLDivElement;
    overlayEnable?.addEventListener('change', (e) => {
      this.settings.overlayEnabled = (e.target as HTMLInputElement).checked;
      if (overlaySettings) overlaySettings.style.display = this.settings.overlayEnabled ? 'block' : 'none';
      this.render();
    });

    const overlayColor = document.getElementById('thumb-overlay-color') as HTMLInputElement;
    overlayColor?.addEventListener('input', (e) => {
      this.settings.overlayColor = (e.target as HTMLInputElement).value;
      this.render();
    });

    const overlayOpacity = document.getElementById('thumb-overlay-opacity') as HTMLInputElement;
    const overlayOpacityValue = document.getElementById('thumb-overlay-opacity-value') as HTMLSpanElement;
    overlayOpacity?.addEventListener('input', (e) => {
      this.settings.overlayOpacity = parseInt((e.target as HTMLInputElement).value);
      if (overlayOpacityValue) overlayOpacityValue.textContent = String(this.settings.overlayOpacity);
      this.render();
    });

    const overlayType = document.getElementById('thumb-overlay-type') as HTMLSelectElement;
    overlayType?.addEventListener('change', (e) => {
      this.settings.overlayType = (e.target as HTMLSelectElement).value;
      this.render();
    });

    // 배경 효과
    const bgBlur = document.getElementById('thumb-bg-blur') as HTMLInputElement;
    const blurValue = document.getElementById('thumb-blur-value') as HTMLSpanElement;
    bgBlur?.addEventListener('input', (e) => {
      this.settings.bgBlur = parseInt((e.target as HTMLInputElement).value);
      if (blurValue) blurValue.textContent = String(this.settings.bgBlur);
      this.render();
    });

    const bgBrightness = document.getElementById('thumb-bg-brightness') as HTMLInputElement;
    const brightnessValue = document.getElementById('thumb-brightness-value') as HTMLSpanElement;
    bgBrightness?.addEventListener('input', (e) => {
      this.settings.bgBrightness = parseInt((e.target as HTMLInputElement).value);
      if (brightnessValue) brightnessValue.textContent = String(this.settings.bgBrightness);
      this.render();
    });

    // 종횡비 설정
    const aspectRatio = document.getElementById('thumb-aspect-ratio') as HTMLSelectElement;
    aspectRatio?.addEventListener('change', (e) => {
      this.settings.aspectRatio = (e.target as HTMLSelectElement).value;
      this.updateCanvasSize();
      this.render();
    });

    // 배경 모드 설정
    const bgMode = document.getElementById('thumb-bg-mode') as HTMLSelectElement;
    bgMode?.addEventListener('change', (e: Event) => {
      this.settings.bgMode = (e.target as HTMLSelectElement).value;
      this.render();
    });

    // 배경 줌(확대/축소) 활성화 설정
    const bgZoomEnable = document.getElementById('thumb-bg-zoom-enable') as HTMLInputElement;
    bgZoomEnable?.addEventListener('change', (e: Event) => {
      this.settings.bgZoomEnabled = (e.target as HTMLInputElement).checked;
    });

    // 스티커 버튼들
    document.querySelectorAll('.thumb-sticker-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const emoji = (e.target as HTMLElement).dataset.sticker || '⭐';
        this.addSticker(emoji);
      });
    });

    // 프리셋 버튼들
    document.querySelectorAll('.thumb-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = (e.target as HTMLElement).dataset.preset || 'modern';
        this.applyPreset(preset);
      });
    });

    // 액션 버튼들
    const resetBtn = document.getElementById('thumb-reset-btn') as HTMLButtonElement;
    resetBtn?.addEventListener('click', () => this.reset());

    const downloadBtn = document.getElementById('thumb-download-btn') as HTMLButtonElement;
    downloadBtn?.addEventListener('click', () => this.download());

    const applyBtn = document.getElementById('thumb-apply-btn') as HTMLButtonElement;
    applyBtn?.addEventListener('click', () => this.applyToPost());

    // 캔버스 드래그 이벤트
    this.canvas?.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas?.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas?.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas?.addEventListener('mouseleave', () => this.onMouseUp());
    this.canvas?.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  private updateCanvasSize(): void {
    if (!this.canvas) return;

    const sizeTextEl = document.getElementById('thumb-canvas-size-text');

    if (this.settings.aspectRatio === '1:1') {
      this.canvas.width = 760;
      this.canvas.height = 760;
      this.canvas.style.width = '400px';  // ✅ 정사각형은 더 작게 표시
      this.canvas.style.height = '400px';
      if (sizeTextEl) sizeTextEl.textContent = '760×760';
      console.log('[ThumbnailGen] 캔버스 크기 변경: 1:1 (760x760)');
    } else {
      this.canvas.width = 760;
      this.canvas.height = 400;
      this.canvas.style.width = '100%';  // ✅ 와이드는 100% 표시
      this.canvas.style.height = 'auto';
      this.canvas.style.maxWidth = '760px';
      if (sizeTextEl) sizeTextEl.textContent = '760×400';
      console.log('[ThumbnailGen] 캔버스 크기 변경: 1.91:1 (760x400)');
    }

    // 위치 초기화 (옵션)
    this.updateTextPosition();
  }

  private updateTextPosition(): void {
    const canvas = this.canvas!;
    switch (this.settings.textPosition) {
      case 'top':
        this.textPosition.y = 80;
        break;
      case 'center':
        this.textPosition.y = canvas.height / 2;
        break;
      case 'bottom':
        this.textPosition.y = canvas.height - 80;
        break;
    }
  }

  private loadBackgroundImage(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.backgroundImage = img;
        this.render();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  private openStorageModal(): void {
    // ✅ 이미지 저장소 모달 - 영어 프롬프트 이미지, 생성된 이미지, 저장된 이미지 연동
    const generatedImages = (window as any).imageManagementGeneratedImages || [];
    const savedImages = ImageManager.getAllImages();

    // 이미지 목록 합치기
    const allImages: Array<{ src: string; label: string; source: string }> = [];

    // 1. 생성된 이미지 (영어 프롬프트 포함)
    generatedImages.forEach((img: any, idx: number) => {
      const src = img.previewDataUrl || img.filePath || img.url;
      if (src) {
        allImages.push({
          src,
          label: img.prompt || img.heading || `이미지 ${idx + 1}`,
          source: '생성됨'
        });
      }
    });

    // 2. 저장된 이미지 (ImageManager)
    Object.values(savedImages).forEach((img: any) => {
      const src = img.previewDataUrl || img.filePath || img.url;
      if (src && !allImages.find(i => i.src === src)) {
        allImages.push({
          src,
          label: img.heading || '저장된 이미지',
          source: '저장됨'
        });
      }
    });

    if (allImages.length === 0) {
      toastManager.warning('선택할 이미지가 없습니다. 먼저 이미지를 생성하거나 저장해주세요.');
      return;
    }

    // 모달 생성
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;';

    modal.innerHTML = `
      <div style="background:var(--bg-secondary);border-radius:16px;max-width:800px;width:90%;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:20px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;color:var(--text-strong);font-size:18px;">🖼️ 배경 이미지 선택</h3>
          <button id="thumb-storage-close" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:20px;overflow-y:auto;flex:1;">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;">
            ${allImages.map((img, idx) => `
              <div class="thumb-storage-item" data-idx="${idx}" style="cursor:pointer;border-radius:12px;overflow:hidden;border:2px solid transparent;transition:all 0.2s;">
                <div style="position:relative;padding-bottom:75%;background:#1a1a2e;">
                  <img src="${img.src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
                </div>
                <div style="padding:8px;background:var(--bg-tertiary);">
                  <div style="font-size:12px;color:var(--text-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${img.label}</div>
                  <div style="font-size:10px;color:var(--text-muted);">${img.source}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 이벤트 리스너
    modal.querySelector('#thumb-storage-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // 이미지 선택
    modal.querySelectorAll('.thumb-storage-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.transform = 'scale(1.02)';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.borderColor = 'transparent';
        (item as HTMLElement).style.transform = 'scale(1)';
      });
      item.addEventListener('click', () => {
        const idx = parseInt((item as HTMLElement).dataset.idx || '0');
        const selectedImg = allImages[idx];
        if (selectedImg) {
          this.loadBackgroundFromUrl(selectedImg.src);
          modal.remove();
          toastManager.success(`배경 이미지가 적용되었습니다: ${selectedImg.label}`);
        }
      });
    });
  }

  // URL에서 배경 이미지 로드
  private loadBackgroundFromUrl(src: string): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.backgroundImage = img;
      this.render();
    };
    img.onerror = () => {
      toastManager.error('이미지를 불러올 수 없습니다.');
    };
    img.src = src;
  }

  // 외부에서 배경 이미지 설정 가능하도록 public 메서드 추가
  public setBackgroundImage(src: string): void {
    this.loadBackgroundFromUrl(src);
  }

  private addSticker(emoji: string): void {
    this.stickers.push({
      emoji,
      x: 380 + Math.random() * 100 - 50,
      y: 200 + Math.random() * 100 - 50,
      size: 48
    });
    this.render();
  }

  private applyPreset(preset: string): void {
    switch (preset) {
      case 'modern':
        this.settings.bgColor = '#1a1a2e';
        this.settings.textColor = '#ffffff';
        this.settings.overlayEnabled = true;
        this.settings.overlayColor = '#667eea';
        this.settings.overlayOpacity = 30;
        this.settings.overlayType = 'gradient-v';
        break;
      case 'minimal':
        this.settings.bgColor = '#f5f5f5';
        this.settings.textColor = '#333333';
        this.settings.overlayEnabled = false;
        this.settings.textShadow = false;
        break;
      case 'vibrant':
        this.settings.bgColor = '#ff416c';
        this.settings.textColor = '#ffffff';
        this.settings.overlayEnabled = true;
        this.settings.overlayColor = '#ff4b2b';
        this.settings.overlayOpacity = 50;
        this.settings.overlayType = 'gradient-h';
        break;
      case 'nature':
        this.settings.bgColor = '#11998e';
        this.settings.textColor = '#ffffff';
        this.settings.overlayEnabled = true;
        this.settings.overlayColor = '#38ef7d';
        this.settings.overlayOpacity = 40;
        this.settings.overlayType = 'gradient-v';
        break;
      case 'dark':
        this.settings.bgColor = '#232526';
        this.settings.textColor = '#ffffff';
        this.settings.overlayEnabled = true;
        this.settings.overlayColor = '#414345';
        this.settings.overlayOpacity = 60;
        this.settings.overlayType = 'gradient-v';
        break;
    }
    this.render();
    this.updateUI();
  }

  private updateUI(): void {
    // UI 요소들을 현재 설정값으로 업데이트
    (document.getElementById('thumb-bg-color') as HTMLInputElement).value = this.settings.bgColor;
    (document.getElementById('thumb-text-color') as HTMLInputElement).value = this.settings.textColor;
    (document.getElementById('thumb-overlay-enable') as HTMLInputElement).checked = this.settings.overlayEnabled;
    (document.getElementById('thumb-overlay-color') as HTMLInputElement).value = this.settings.overlayColor;
    (document.getElementById('thumb-overlay-opacity') as HTMLInputElement).value = String(this.settings.overlayOpacity);
    (document.getElementById('thumb-overlay-opacity-value') as HTMLSpanElement).textContent = String(this.settings.overlayOpacity);
    (document.getElementById('thumb-overlay-type') as HTMLSelectElement).value = this.settings.overlayType;
    (document.getElementById('thumb-text-shadow') as HTMLInputElement).checked = this.settings.textShadow;

    // 배경 줌 활성화 상태 업데이트
    const bgZoomEnable = document.getElementById('thumb-bg-zoom-enable') as HTMLInputElement;
    if (bgZoomEnable) bgZoomEnable.checked = this.settings.bgZoomEnabled;
  }

  private reset(): void {
    this.settings = {
      mainText: '제목을 입력하세요',
      subText: '',
      fontFamily: "'Noto Sans KR', sans-serif",
      fontSize: 48,
      textColor: '#ffffff',
      textAlign: 'center',
      textPosition: 'center',
      textShadow: true,
      textOutline: false,
      textHighlight: false,
      outlineColor: '#000000',
      outlineWidth: 2,
      highlightColor: '#ffff00',
      highlightOpacity: 50,
      bgColor: '#1a1a2e',
      overlayEnabled: true,
      overlayColor: '#000000',
      overlayOpacity: 40,
      overlayType: 'solid',
      bgBlur: 0,
      bgBrightness: 0,
      aspectRatio: '1.91:1',
      bgMode: 'cover',
      bgZoomEnabled: true
    };
    this.backgroundImage = null;
    this.stickers = [];
    this.textPosition = { x: 380, y: 200 };

    // UI 초기화
    (document.getElementById('thumb-main-text') as HTMLInputElement).value = this.settings.mainText;
    (document.getElementById('thumb-sub-text') as HTMLInputElement).value = '';
    this.updateUI();
    this.render();
    toastManager.success('썸네일이 초기화되었습니다.');
  }

  private download(): void {
    if (!this.canvas) return;

    const link = document.createElement('a');
    link.download = `thumbnail_${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
    toastManager.success('썸네일이 다운로드되었습니다.');
  }

  private applyToPost(): void {
    if (!this.canvas) return;

    const base64 = this.canvas.toDataURL('image/png');

    // ✅ [2026-01-20] 적용 대상 드롭다운 확인
    const applyTarget = (document.getElementById('thumb-apply-target') as HTMLSelectElement)?.value || 'image-tab';
    console.log('[ThumbnailGen] 적용 대상:', applyTarget);

    const thumbnailImage = {
      heading: '썸네일',
      filePath: base64,
      previewDataUrl: base64,
      provider: 'thumbnail-generator',
      url: base64,
      headingIndex: 0
    };

    // ✅ 발행 모드별 썸네일 저장 (전역 상태)
    if (!(window as any).presetThumbnails) {
      (window as any).presetThumbnails = {
        'image-tab': null,
        'full-auto': null,
        'continuous': null,
        'ma-semi-auto': null,
        'ma-full-auto': null
      };
    }

    const modeLabels: Record<string, string> = {
      'image-tab': '🖼️ 이미지관리탭 (반자동)',
      'full-auto': '🤖 풀오토발행',
      'continuous': '🔄 연속발행',
      'ma-semi-auto': '👥 반자동 다중계정발행',
      'ma-full-auto': '🚀 풀오토 다중계정발행'
    };

    // 선택된 발행 모드에 썸네일 저장
    (window as any).presetThumbnails[applyTarget] = thumbnailImage;

    // ✅ image-tab인 경우 기존 로직 (1번 소제목에 즉시 적용)
    if (applyTarget === 'image-tab') {
      // 소제목 목록 가져오기 (ImageManager 우선)
      const headings = ImageManager.headings.length > 0
        ? ImageManager.headings
        : ((window as any).imageManagementHeadings || []);

      // 1번 소제목에 썸네일 적용 (무조건 1번에 배치)
      const firstHeadingTitle = resolveFirstHeadingTitleForThumbnail();
      thumbnailImage.heading = firstHeadingTitle;

      // ImageManager에 1번 소제목 이미지로 등록
      ImageManager.setImage(firstHeadingTitle, thumbnailImage);

      // generatedImages 배열 업데이트 (1번 위치에 강제 배치)
      let existingImages: any[] = [];
      if ((window as any).imageManagementGeneratedImages && (window as any).imageManagementGeneratedImages.length > 0) {
        existingImages = [...(window as any).imageManagementGeneratedImages];
      } else if ((window as any).generatedImages && (window as any).generatedImages.length > 0) {
        existingImages = [...(window as any).generatedImages];
      } else if (generatedImages && generatedImages.length > 0) {
        existingImages = [...generatedImages];
      }

      if (existingImages.length > 0) {
        existingImages[0] = thumbnailImage;
      } else {
        for (let i = 0; i < headings.length; i++) {
          if (i === 0) {
            existingImages.push(thumbnailImage);
          } else {
            existingImages.push(null);
          }
        }
      }

      // ✅ [2026-02-12 P1 FIX #8] 직접 할당 → syncGlobalImagesFromImageManager
      try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

      // 대표사진(썸네일) 경로 설정
      (window as any).thumbnailPath = base64;
      (window as any).selectedThumbnailImage = thumbnailImage;

      appendLog(`✅ 썸네일이 1번 소제목 "${firstHeadingTitle}"에 적용되었습니다!`);
      appendLog(`📷 대표사진으로 자동 등록됩니다.`);
      toastManager.success(`✅ 이미지관리탭 1번 소제목에 적용 + 대표사진 등록 완료!`);
    } else {
      // ✅ 다른 발행 모드 (풀오토/연속/다중계정) - 사전 세팅만 저장
      appendLog(`✅ ${modeLabels[applyTarget]}에 썸네일이 미리 세팅되었습니다.`);
      toastManager.success(`✅ ${modeLabels[applyTarget]}에 썸네일 미리 세팅 완료!`);
      toastManager.info(`💡 해당 발행 시작 시 자동으로 1번 소제목에 적용됩니다.`);

      // ✅ [2026-01-22 NEW] 풀오토/다중계정풀오토의 경우 setManualThumbnailForFullAuto 호출
      // 이렇게 하면 풀오토 발행 시 첫 번째 이미지(썸네일) 자동 생성을 건너뛰게 됨
      if (applyTarget === 'full-auto' || applyTarget === 'ma-full-auto') {
        const manualThumbnailWithFlag = {
          ...thumbnailImage,
          isManualThumbnail: true,
          source: 'thumbnail-generator',
          isThumbnail: true
        };

        // 전역 함수 호출하여 수동 썸네일 등록
        if (typeof (window as any).setManualThumbnailForFullAuto === 'function') {
          (window as any).setManualThumbnailForFullAuto(manualThumbnailWithFlag);
          appendLog(`🎨 수동 썸네일이 풀오토 발행용으로 등록되었습니다. (자동 생성 건너뛰기)`);
        } else {
          // 폴백: 직접 imageManagementGeneratedImages에 추가
          const existingImages = (window as any).imageManagementGeneratedImages || [];
          if (existingImages.length > 0 && (existingImages[0]?.isManualThumbnail || existingImages[0]?.source === 'thumbnail-generator')) {
            existingImages[0] = manualThumbnailWithFlag;
          } else {
            existingImages.unshift(manualThumbnailWithFlag);
          }
          (window as any).imageManagementGeneratedImages = existingImages;
          console.log('[ThumbnailGen] 수동 썸네일 등록 (폴백 로직)');
        }
      }
    }
  }

  // 마우스 이벤트 핸들러
  private onMouseDown(e: MouseEvent): void {
    const rect = this.canvas!.getBoundingClientRect();
    const scaleX = this.canvas!.width / rect.width;
    const scaleY = this.canvas!.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    this.lastMousePos = { x, y };

    // 스티커 클릭 체크
    for (let i = this.stickers.length - 1; i >= 0; i--) {
      const sticker = this.stickers[i];
      if (Math.abs(x - sticker.x) < sticker.size / 2 && Math.abs(y - sticker.y) < sticker.size / 2) {
        this.isDragging = true;
        this.dragTarget = 'sticker';
        this.dragIndex = i;
        return;
      }
    }

    // 텍스트 영역 클릭 체크
    if (Math.abs(x - this.textPosition.x) < 200 && Math.abs(y - this.textPosition.y) < 50) {
      this.isDragging = true;
      this.dragTarget = 'text';
      return;
    }

    // 아무것도 클릭하지 않았으면 배경 드래그
    if (this.backgroundImage) {
      this.isDragging = true;
      this.dragTarget = 'background';
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging || !this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const dx = x - this.lastMousePos.x;
    const dy = y - this.lastMousePos.y;

    if (this.dragTarget === 'text') {
      this.textPosition.x = x;
      this.textPosition.y = y;
    } else if (this.dragTarget === 'sticker' && this.dragIndex >= 0) {
      this.stickers[this.dragIndex].x = x;
      this.stickers[this.dragIndex].y = y;
    } else if (this.dragTarget === 'background') {
      this.bgPos.x += dx;
      this.bgPos.y += dy;
    }

    this.lastMousePos = { x, y };
    this.render();
  }

  private onMouseUp(): void {
    this.isDragging = false;
    this.dragTarget = null;
    this.dragIndex = -1;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.backgroundImage || !this.canvas || !this.settings.bgZoomEnabled) return;
    e.preventDefault();

    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const prevScale = this.bgScale;
    this.bgScale = Math.max(0.1, Math.min(10, this.bgScale + delta * zoomSpeed));

    // 마우스 위치 기준으로 줌인/아웃 (점진적 위치 보정)
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // 줌 중심점 보정 로직 (선택 사항)
    // this.bgPos.x -= (mouseX - this.bgPos.x) * (this.bgScale / prevScale - 1);
    // this.bgPos.y -= (mouseY - this.bgPos.y) * (this.bgScale / prevScale - 1);

    this.render();
  }

  render(): void {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const canvas = this.canvas;

    // 1. 배경 그리기
    if (this.backgroundImage) {
      // 이미지 배경
      ctx.save();

      // 밝기 필터
      if (this.settings.bgBrightness !== 0) {
        ctx.filter = `brightness(${100 + this.settings.bgBrightness}%)`;
      }

      const imgWidth = this.backgroundImage.width;
      const imgHeight = this.backgroundImage.height;
      const imgRatio = imgWidth / imgHeight;
      const canvasRatio = canvas.width / canvas.height;

      let drawWidth, drawHeight;

      if (this.settings.bgMode === 'cover') {
        if (imgRatio > canvasRatio) {
          drawHeight = canvas.height;
          drawWidth = drawHeight * imgRatio;
        } else {
          drawWidth = canvas.width;
          drawHeight = drawWidth / imgRatio;
        }
      } else { // 'contain'
        if (imgRatio > canvasRatio) {
          drawWidth = canvas.width;
          drawHeight = drawWidth / imgRatio;
        } else {
          drawHeight = canvas.height;
          drawWidth = drawHeight * imgRatio;
        }
      }

      // 기본 중앙 정렬 위치에 사용자 오프셋(bgPos)과 스케일(bgScale) 적용
      const centerX = (canvas.width - drawWidth * this.bgScale) / 2;
      const centerY = (canvas.height - drawHeight * this.bgScale) / 2;

      ctx.drawImage(
        this.backgroundImage,
        centerX + this.bgPos.x,
        centerY + this.bgPos.y,
        drawWidth * this.bgScale,
        drawHeight * this.bgScale
      );

      ctx.restore();
    } else {
      // 단색 배경
      ctx.fillStyle = this.settings.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. 오버레이 그리기
    if (this.settings.overlayEnabled) {
      ctx.save();
      ctx.globalAlpha = this.settings.overlayOpacity / 100;

      if (this.settings.overlayType === 'solid') {
        ctx.fillStyle = this.settings.overlayColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (this.settings.overlayType === 'gradient-v') {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, this.settings.overlayColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (this.settings.overlayType === 'gradient-h') {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, this.settings.overlayColor);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.restore();
    }

    // 3. 텍스트 그리기
    ctx.save();
    ctx.textAlign = this.settings.textAlign;
    ctx.textBaseline = 'middle';

    // 메인 텍스트 (줄바꿈 지원)
    ctx.font = `bold ${this.settings.fontSize}px ${this.settings.fontFamily}`;

    let textX = this.textPosition.x;
    if (this.settings.textAlign === 'left') textX = 40;
    else if (this.settings.textAlign === 'right') textX = canvas.width - 40;

    // ✅ 줄바꿈 처리
    const lines = this.settings.mainText.split('\n');
    const lineHeight = this.settings.fontSize * 1.3; // 줄 간격
    const totalHeight = lines.length * lineHeight;
    const startY = this.textPosition.y - (totalHeight / 2) + (lineHeight / 2);

    // 형광펜 효과 (각 줄별로)
    if (this.settings.textHighlight && this.settings.mainText) {
      ctx.save();
      ctx.globalAlpha = this.settings.highlightOpacity / 100;
      ctx.fillStyle = this.settings.highlightColor;
      const padding = 10;

      lines.forEach((line, i) => {
        if (line.trim()) {
          const metrics = ctx.measureText(line);
          const lineY = startY + (i * lineHeight);
          let hlX = textX - metrics.width / 2 - padding;
          if (this.settings.textAlign === 'left') hlX = textX - padding;
          else if (this.settings.textAlign === 'right') hlX = textX - metrics.width - padding;
          ctx.fillRect(hlX, lineY - this.settings.fontSize / 2 - padding / 2, metrics.width + padding * 2, this.settings.fontSize + padding);
        }
      });
      ctx.restore();
    }

    // 그림자 효과
    if (this.settings.textShadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
    }

    // 외곽선 (각 줄별로)
    if (this.settings.textOutline) {
      ctx.strokeStyle = this.settings.outlineColor;
      ctx.lineWidth = this.settings.outlineWidth * 2;
      lines.forEach((line, i) => {
        ctx.strokeText(line, textX, startY + (i * lineHeight));
      });
    }

    // 메인 텍스트 (각 줄별로)
    ctx.fillStyle = this.settings.textColor;
    lines.forEach((line, i) => {
      ctx.fillText(line, textX, startY + (i * lineHeight));
    });

    // 서브 텍스트
    if (this.settings.subText) {
      ctx.shadowBlur = 5;
      ctx.font = `${Math.round(this.settings.fontSize * 0.5)}px ${this.settings.fontFamily}`;
      const subY = startY + (lines.length * lineHeight) + this.settings.fontSize * 0.3;
      ctx.fillText(this.settings.subText, textX, subY);
    }

    ctx.restore();

    // 4. 스티커 그리기
    this.stickers.forEach(sticker => {
      ctx.font = `${sticker.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sticker.emoji, sticker.x, sticker.y);
    });
  }
}

// ============================================
// 🔄 이미지 변환기 (Image Converter)
// ============================================

class ImageConverter {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private originalImage: HTMLImageElement | null = null;
  private originalCanvas: HTMLCanvasElement | null = null;
  private originalCtx: CanvasRenderingContext2D | null = null;
  private currentFormat = 'png';
  private currentQuality = 90;

  // 필터 설정
  private filters = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpen: 0
  };

  constructor() {
    this.init();
  }

  private init(): void {
    this.canvas = document.getElementById('converter-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.originalCanvas = document.createElement('canvas');
    this.originalCtx = this.originalCanvas.getContext('2d');
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 파일 업로드
    const fileBtn = document.getElementById('converter-file-btn') as HTMLButtonElement;
    const fileInput = document.getElementById('converter-file-input') as HTMLInputElement;

    fileBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadImage(file);
    });

    // 드래그 앤 드롭
    const uploadZone = document.getElementById('converter-upload-zone') as HTMLDivElement;
    uploadZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'var(--primary)';
      uploadZone.style.background = 'rgba(6, 182, 212, 0.1)';
    });
    uploadZone?.addEventListener('dragleave', () => {
      uploadZone.style.borderColor = 'var(--border-medium)';
      uploadZone.style.background = 'var(--bg-secondary)';
    });
    uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'var(--border-medium)';
      uploadZone.style.background = 'var(--bg-secondary)';
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) {
        this.loadImage(file);
      }
    });

    // 저장소에서 선택
    const storageBtn = document.getElementById('converter-storage-btn') as HTMLButtonElement;
    storageBtn?.addEventListener('click', () => this.openStorageModal());

    // 탭 전환
    document.querySelectorAll('.converter-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).dataset.tab;
        this.switchTab(tab || 'format');
      });
    });

    // 포맷 버튼
    document.querySelectorAll('.format-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.format-btn').forEach(b => {
          (b as HTMLElement).style.background = 'var(--bg-tertiary)';
          (b as HTMLElement).style.color = 'var(--text-strong)';
          (b as HTMLElement).style.border = '1px solid var(--border-medium)';
          b.classList.remove('selected');
        });
        (e.target as HTMLElement).style.background = 'var(--primary)';
        (e.target as HTMLElement).style.color = 'white';
        (e.target as HTMLElement).style.border = 'none';
        (e.target as HTMLElement).classList.add('selected');

        this.currentFormat = (e.target as HTMLElement).dataset.format || 'png';

        // 품질 슬라이더 표시/숨김
        const qualityContainer = document.getElementById('converter-quality-container') as HTMLDivElement;
        if (qualityContainer) {
          qualityContainer.style.display = this.currentFormat !== 'png' ? 'block' : 'none';
        }

        this.updateResultInfo();
      });
    });

    // 품질 슬라이더
    const qualitySlider = document.getElementById('converter-quality') as HTMLInputElement;
    const qualityValue = document.getElementById('converter-quality-value') as HTMLSpanElement;
    qualitySlider?.addEventListener('input', (e) => {
      this.currentQuality = parseInt((e.target as HTMLInputElement).value);
      if (qualityValue) qualityValue.textContent = String(this.currentQuality);
      this.updateResultInfo();
    });

    // 크기 조절 프리셋
    document.querySelectorAll('.resize-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const width = parseInt((e.target as HTMLElement).dataset.width || '0');
        const height = parseInt((e.target as HTMLElement).dataset.height || '0');
        (document.getElementById('converter-width') as HTMLInputElement).value = String(width);
        (document.getElementById('converter-height') as HTMLInputElement).value = String(height);
      });
    });

    // 비율 유지
    const keepRatio = document.getElementById('converter-keep-ratio') as HTMLInputElement;
    const widthInput = document.getElementById('converter-width') as HTMLInputElement;
    const heightInput = document.getElementById('converter-height') as HTMLInputElement;

    widthInput?.addEventListener('input', () => {
      if (keepRatio?.checked && this.originalImage) {
        const ratio = this.originalImage.height / this.originalImage.width;
        heightInput.value = String(Math.round(parseInt(widthInput.value) * ratio));
      }
    });

    heightInput?.addEventListener('input', () => {
      if (keepRatio?.checked && this.originalImage) {
        const ratio = this.originalImage.width / this.originalImage.height;
        widthInput.value = String(Math.round(parseInt(heightInput.value) * ratio));
      }
    });

    // 크기 적용
    const applyResize = document.getElementById('converter-apply-resize') as HTMLButtonElement;
    applyResize?.addEventListener('click', () => this.applyResize());

    // 필터 슬라이더
    ['brightness', 'contrast', 'saturation', 'sharpen'].forEach(filter => {
      const slider = document.getElementById(`filter-${filter}`) as HTMLInputElement;
      const valueSpan = document.getElementById(`filter-${filter}-value`) as HTMLSpanElement;

      slider?.addEventListener('input', (e) => {
        (this.filters as any)[filter] = parseInt((e.target as HTMLInputElement).value);
        if (valueSpan) valueSpan.textContent = String((this.filters as any)[filter]);
        this.applyFilters();
      });
    });

    // 필터 프리셋
    document.querySelectorAll('.filter-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-preset-btn').forEach(b => {
          (b as HTMLElement).style.background = 'var(--bg-tertiary)';
          (b as HTMLElement).style.color = 'var(--text-strong)';
          b.classList.remove('selected');
        });
        (e.target as HTMLElement).style.background = 'var(--primary)';
        (e.target as HTMLElement).style.color = 'white';
        (e.target as HTMLElement).classList.add('selected');

        this.applyFilterPreset((e.target as HTMLElement).dataset.filter || 'none');
      });
    });

    // 필터 초기화
    const filterReset = document.getElementById('filter-reset-btn') as HTMLButtonElement;
    filterReset?.addEventListener('click', () => this.resetFilters());

    // 자르기 적용
    const applyCrop = document.getElementById('converter-apply-crop') as HTMLButtonElement;
    applyCrop?.addEventListener('click', () => this.applyCrop());

    // ✅ 비율 변환 프리셋 버튼 (자르기 탭 내)
    document.querySelectorAll('.crop-ratio-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ratioStr = (e.target as HTMLElement).dataset.ratio;
        if (ratioStr && this.originalImage) {
          this.applyRatioCrop(ratioStr);
        }
      });
    });

    // ✅ 비율 변환 탭 버튼 (별도 탭)
    document.querySelectorAll('.ratio-convert-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const ratioStr = target.dataset.ratio;
        if (ratioStr && this.canvas && this.canvas.width > 0) {
          this.applyRatioCrop(ratioStr);
        } else {
          toastManager.error('먼저 이미지를 로드해주세요.');
        }
      });
    });

    // AI 기능
    const removeBgBtn = document.getElementById('ai-remove-bg-btn') as HTMLButtonElement;
    removeBgBtn?.addEventListener('click', () => this.removeBackground());

    const upscaleBtn = document.getElementById('ai-upscale-btn') as HTMLButtonElement;
    upscaleBtn?.addEventListener('click', () => this.upscale());

    // 출력 버튼들
    const newBtn = document.getElementById('converter-new-btn') as HTMLButtonElement;
    newBtn?.addEventListener('click', () => this.reset());

    const insertBtn = document.getElementById('converter-insert-btn') as HTMLButtonElement;
    insertBtn?.addEventListener('click', () => this.insertToPost());

    const saveStorageBtn = document.getElementById('converter-save-storage-btn') as HTMLButtonElement;
    saveStorageBtn?.addEventListener('click', () => this.saveToStorage());

    const downloadBtn = document.getElementById('converter-download-btn') as HTMLButtonElement;
    downloadBtn?.addEventListener('click', () => this.download());
  }

  private loadImage(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.originalImage = img;

        // 원본 캔버스에 저장
        this.originalCanvas!.width = img.width;
        this.originalCanvas!.height = img.height;
        this.originalCanvas!.getContext('2d')?.drawImage(img, 0, 0);

        // 편집 캔버스 설정
        this.canvas!.width = img.width;
        this.canvas!.height = img.height;
        this.ctx?.drawImage(img, 0, 0);

        // UI 업데이트
        this.showEditor();
        this.updateOriginalInfo();
        this.updateResultInfo();

        // 크기 입력 초기화
        (document.getElementById('converter-width') as HTMLInputElement).value = String(img.width);
        (document.getElementById('converter-height') as HTMLInputElement).value = String(img.height);
        (document.getElementById('crop-width') as HTMLInputElement).value = String(img.width);
        (document.getElementById('crop-height') as HTMLInputElement).value = String(img.height);
      };
      img.src = e.target?.result as string;

      // 원본 미리보기
      const originalImg = document.getElementById('converter-original-img') as HTMLImageElement;
      if (originalImg) originalImg.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  private showEditor(): void {
    const placeholder = document.getElementById('converter-upload-placeholder') as HTMLDivElement;
    const editor = document.getElementById('converter-editor') as HTMLDivElement;
    const uploadZone = document.getElementById('converter-upload-zone') as HTMLDivElement;

    if (placeholder) placeholder.style.display = 'none';
    if (editor) editor.style.display = 'block';
    if (uploadZone) {
      uploadZone.style.border = 'none';
      uploadZone.style.padding = '0';
      uploadZone.style.background = 'transparent';
    }
  }

  private updateOriginalInfo(): void {
    const info = document.getElementById('converter-original-info') as HTMLParagraphElement;
    if (info && this.originalImage) {
      info.textContent = `${this.originalImage.width} × ${this.originalImage.height}px`;
    }
  }

  private updateResultInfo(): void {
    const info = document.getElementById('converter-result-info') as HTMLParagraphElement;
    if (info && this.canvas) {
      const format = this.currentFormat.toUpperCase();
      const quality = this.currentFormat !== 'png' ? ` (품질: ${this.currentQuality}%)` : '';
      info.textContent = `${this.canvas.width} × ${this.canvas.height}px | ${format}${quality}`;
    }
  }

  private switchTab(tab: string): void {
    // 탭 버튼 스타일 변경
    document.querySelectorAll('.converter-tab-btn').forEach(btn => {
      if ((btn as HTMLElement).dataset.tab === tab) {
        (btn as HTMLElement).style.background = 'var(--primary)';
        (btn as HTMLElement).style.color = 'white';
        (btn as HTMLElement).style.border = 'none';
        btn.classList.add('active');
      } else {
        (btn as HTMLElement).style.background = 'var(--bg-tertiary)';
        (btn as HTMLElement).style.color = 'var(--text-strong)';
        (btn as HTMLElement).style.border = '1px solid var(--border-medium)';
        btn.classList.remove('active');
      }
    });

    // 탭 콘텐츠 전환
    document.querySelectorAll('.converter-tab-content').forEach(content => {
      (content as HTMLElement).style.display = 'none';
    });
    const activeContent = document.getElementById(`converter-tab-${tab}`) as HTMLDivElement;
    if (activeContent) activeContent.style.display = 'block';
  }

  private openStorageModal(): void {
    // ✅ 이미지 저장소 모달 - 영어 프롬프트 이미지, 생성된 이미지, 저장된 이미지 연동
    const generatedImages = (window as any).imageManagementGeneratedImages || [];
    const savedImages = ImageManager.getAllImages();

    // 이미지 목록 합치기
    const allImages: Array<{ src: string; label: string; source: string }> = [];

    // 1. 생성된 이미지 (영어 프롬프트 포함)
    generatedImages.forEach((img: any, idx: number) => {
      const src = img.previewDataUrl || img.filePath || img.url;
      if (src) {
        allImages.push({
          src,
          label: img.prompt || img.heading || `이미지 ${idx + 1}`,
          source: '생성됨'
        });
      }
    });

    // 2. 저장된 이미지 (ImageManager)
    Object.values(savedImages).forEach((img: any) => {
      const src = img.previewDataUrl || img.filePath || img.url;
      if (src && !allImages.find(i => i.src === src)) {
        allImages.push({
          src,
          label: img.heading || '저장된 이미지',
          source: '저장됨'
        });
      }
    });

    if (allImages.length === 0) {
      toastManager.warning('선택할 이미지가 없습니다. 먼저 이미지를 생성하거나 저장해주세요.');
      return;
    }

    // 모달 생성
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;';

    modal.innerHTML = `
      <div style="background:var(--bg-secondary);border-radius:16px;max-width:800px;width:90%;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:20px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;color:var(--text-strong);font-size:18px;">🖼️ 이미지 선택</h3>
          <button id="converter-storage-close" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:20px;overflow-y:auto;flex:1;">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;">
            ${allImages.map((img, idx) => `
              <div class="converter-storage-item" data-idx="${idx}" style="cursor:pointer;border-radius:12px;overflow:hidden;border:2px solid transparent;transition:all 0.2s;">
                <div style="position:relative;padding-bottom:75%;background:#1a1a2e;">
                  <img src="${img.src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
                </div>
                <div style="padding:8px;background:var(--bg-tertiary);">
                  <div style="font-size:12px;color:var(--text-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${img.label}</div>
                  <div style="font-size:10px;color:var(--text-muted);">${img.source}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 이벤트 리스너
    modal.querySelector('#converter-storage-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // 이미지 선택
    modal.querySelectorAll('.converter-storage-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.transform = 'scale(1.02)';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.borderColor = 'transparent';
        (item as HTMLElement).style.transform = 'scale(1)';
      });
      item.addEventListener('click', () => {
        const idx = parseInt((item as HTMLElement).dataset.idx || '0');
        const selectedImg = allImages[idx];
        if (selectedImg) {
          this.loadImageFromUrl(selectedImg.src);
          modal.remove();
          toastManager.success(`이미지가 로드되었습니다: ${selectedImg.label}`);
        }
      });
    });
  }

  // URL에서 이미지 로드
  private loadImageFromUrl(src: string): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.originalImage = img;

      // 캔버스 크기 설정
      if (this.canvas && this.ctx && this.originalCanvas && this.originalCtx) {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.originalCanvas.width = img.width;
        this.originalCanvas.height = img.height;

        // 원본 캔버스에 그리기
        this.originalCtx.drawImage(img, 0, 0);

        // 결과 캔버스에도 그리기
        this.ctx.drawImage(img, 0, 0);

        // 크기 입력 필드 업데이트
        (document.getElementById('converter-width') as HTMLInputElement).value = String(img.width);
        (document.getElementById('converter-height') as HTMLInputElement).value = String(img.height);

        this.updateResultInfo();
      }
    };
    img.onerror = () => {
      toastManager.error('이미지를 불러올 수 없습니다.');
    };
    img.src = src;
  }

  private applyResize(): void {
    if (!this.originalImage || !this.canvas || !this.ctx) return;

    const width = parseInt((document.getElementById('converter-width') as HTMLInputElement).value);
    const height = parseInt((document.getElementById('converter-height') as HTMLInputElement).value);

    if (width <= 0 || height <= 0) {
      toastManager.error('올바른 크기를 입력해주세요.');
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(this.originalCanvas!, 0, 0, width, height);
    this.applyFilters();
    this.updateResultInfo();
    toastManager.success(`크기가 ${width}×${height}px로 변경되었습니다.`);
  }

  private applyFilters(): void {
    if (!this.originalCanvas || !this.canvas || !this.ctx) return;

    // CSS 필터 문자열 생성
    const brightness = 100 + this.filters.brightness;
    const contrast = 100 + this.filters.contrast;
    const saturation = 100 + this.filters.saturation;

    this.ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    this.ctx.drawImage(this.originalCanvas, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.filter = 'none';
  }

  private applyFilterPreset(preset: string): void {
    switch (preset) {
      case 'none':
        this.filters = { brightness: 0, contrast: 0, saturation: 0, sharpen: 0 };
        break;
      case 'vivid':
        this.filters = { brightness: 5, contrast: 15, saturation: 20, sharpen: 20 };
        break;
      case 'soft':
        this.filters = { brightness: 10, contrast: -10, saturation: -10, sharpen: 0 };
        break;
      case 'grayscale':
        this.filters = { brightness: 0, contrast: 10, saturation: -100, sharpen: 0 };
        break;
      case 'sepia':
        this.filters = { brightness: 5, contrast: 0, saturation: -50, sharpen: 0 };
        break;
      case 'vintage':
        this.filters = { brightness: 10, contrast: -15, saturation: -30, sharpen: 0 };
        break;
    }

    // UI 업데이트
    ['brightness', 'contrast', 'saturation', 'sharpen'].forEach(filter => {
      const slider = document.getElementById(`filter-${filter}`) as HTMLInputElement;
      const valueSpan = document.getElementById(`filter-${filter}-value`) as HTMLSpanElement;
      if (slider) slider.value = String((this.filters as any)[filter]);
      if (valueSpan) valueSpan.textContent = String((this.filters as any)[filter]);
    });

    this.applyFilters();
  }

  private resetFilters(): void {
    this.applyFilterPreset('none');
    toastManager.success('필터가 초기화되었습니다.');
  }

  private applyCrop(): void {
    if (!this.canvas || !this.ctx) return;

    const x = parseInt((document.getElementById('crop-x') as HTMLInputElement).value);
    const y = parseInt((document.getElementById('crop-y') as HTMLInputElement).value);
    const width = parseInt((document.getElementById('crop-width') as HTMLInputElement).value);
    const height = parseInt((document.getElementById('crop-height') as HTMLInputElement).value);

    if (width <= 0 || height <= 0) {
      toastManager.error('올바른 크기를 입력해주세요.');
      return;
    }

    // 현재 캔버스에서 자르기
    const imageData = this.ctx.getImageData(x, y, width, height);
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.putImageData(imageData, 0, 0);

    // 원본 캔버스도 업데이트
    this.originalCanvas!.width = width;
    this.originalCanvas!.height = height;
    this.originalCanvas!.getContext('2d')?.putImageData(imageData, 0, 0);

    this.updateResultInfo();
    toastManager.success('이미지가 잘렸습니다.');
  }

  // ✅ 비율 변환 프리셋 적용 (원본에서 시작, 이미지 꽉 채우기)
  private applyRatioCrop(ratioStr: string): void {
    if (!this.canvas || !this.ctx || !this.originalImage) {
      toastManager.error('먼저 이미지를 로드해주세요.');
      return;
    }

    // 비율 파싱
    const [wRatio, hRatio] = ratioStr.split(':').map(Number);
    if (!wRatio || !hRatio) return;

    const targetRatio = wRatio / hRatio;

    // ✅ 항상 원본 이미지에서 시작 (중첩 방지)
    const origWidth = this.originalImage.width;
    const origHeight = this.originalImage.height;

    // 새 캔버스 크기 계산 (원본 기준으로 비율에 맞게)
    let newWidth: number, newHeight: number;

    if (origWidth / origHeight > targetRatio) {
      // 원본이 더 넓음 → 너비 기준으로 높이 계산
      newWidth = origWidth;
      newHeight = Math.round(origWidth / targetRatio);
    } else {
      // 원본이 더 높음 → 높이 기준으로 너비 계산
      newHeight = origHeight;
      newWidth = Math.round(origHeight * targetRatio);
    }

    // 캔버스 크기 설정
    this.canvas.width = newWidth;
    this.canvas.height = newHeight;

    // ✅ 원본 이미지를 캔버스 전체에 꽉 채워서 그리기 (stretch)
    this.ctx.drawImage(this.originalImage, 0, 0, newWidth, newHeight);

    // 원본 캔버스도 업데이트
    this.originalCanvas!.width = newWidth;
    this.originalCanvas!.height = newHeight;
    const origCtx = this.originalCanvas!.getContext('2d');
    if (origCtx) {
      origCtx.drawImage(this.originalImage, 0, 0, newWidth, newHeight);
    }

    // 자르기 입력 필드 업데이트
    (document.getElementById('crop-x') as HTMLInputElement).value = '0';
    (document.getElementById('crop-y') as HTMLInputElement).value = '0';
    (document.getElementById('crop-width') as HTMLInputElement).value = String(newWidth);
    (document.getElementById('crop-height') as HTMLInputElement).value = String(newHeight);

    this.updateResultInfo();
    toastManager.success(`✅ ${ratioStr} 비율로 변환되었습니다.`);
  }

  private async removeBackground(): Promise<void> {
    if (!this.canvas || !this.ctx) {
      toastManager.error('이미지를 먼저 로드해주세요.');
      return;
    }

    const removeBgBtn = document.getElementById('ai-remove-bg-btn') as HTMLButtonElement;
    const originalText = removeBgBtn?.innerHTML || '';

    try {
      // 버튼 상태 변경
      if (removeBgBtn) {
        removeBgBtn.disabled = true;
        removeBgBtn.innerHTML = '⏳ 처리 중...';
      }

      toastManager.info('🤖 AI 배경 제거 중... (첫 실행 시 모델 다운로드로 시간이 걸릴 수 있습니다)');

      // Canvas를 Blob으로 변환
      const blob = await new Promise<Blob>((resolve, reject) => {
        this.canvas!.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Blob 변환 실패'));
        }, 'image/png');
      });

      // @imgly/background-removal 동적 import
      const { removeBackground } = await import('@imgly/background-removal');

      // 배경 제거 실행
      const resultBlob = await removeBackground(blob, {
        progress: (key: string, current: number, total: number) => {
          const percent = Math.round((current / total) * 100);
          if (removeBgBtn) {
            removeBgBtn.innerHTML = `⏳ ${key}: ${percent}%`;
          }
        }
      });

      // 결과를 Canvas에 적용
      const resultUrl = URL.createObjectURL(resultBlob);
      const resultImg = new Image();

      resultImg.onload = () => {
        if (!this.canvas || !this.ctx) return;

        // 캔버스 크기 유지
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(resultImg, 0, 0, this.canvas.width, this.canvas.height);

        // 원본 캔버스도 업데이트
        const origCtx = this.originalCanvas?.getContext('2d');
        if (origCtx && this.originalCanvas) {
          origCtx.clearRect(0, 0, this.originalCanvas.width, this.originalCanvas.height);
          origCtx.drawImage(resultImg, 0, 0, this.originalCanvas.width, this.originalCanvas.height);
        }

        URL.revokeObjectURL(resultUrl);

        // 포맷을 PNG로 변경 (투명 배경 유지)
        this.currentFormat = 'png';
        document.querySelectorAll('.format-btn').forEach(btn => {
          if ((btn as HTMLElement).dataset.format === 'png') {
            (btn as HTMLElement).style.background = 'var(--primary)';
            (btn as HTMLElement).style.color = 'white';
            btn.classList.add('selected');
          } else {
            (btn as HTMLElement).style.background = 'var(--bg-tertiary)';
            (btn as HTMLElement).style.color = 'var(--text-strong)';
            btn.classList.remove('selected');
          }
        });

        this.updateResultInfo();
        toastManager.success('✅ 배경 제거 완료! (PNG 포맷으로 저장하면 투명 배경 유지)');

        if (removeBgBtn) {
          removeBgBtn.disabled = false;
          removeBgBtn.innerHTML = originalText;
        }
      };

      resultImg.onerror = () => {
        URL.revokeObjectURL(resultUrl);
        toastManager.error('결과 이미지 로드 실패');
        if (removeBgBtn) {
          removeBgBtn.disabled = false;
          removeBgBtn.innerHTML = originalText;
        }
      };

      resultImg.src = resultUrl;

    } catch (error) {
      console.error('배경 제거 오류:', error);
      toastManager.error(`배경 제거 실패: ${(error as Error).message}`);
      if (removeBgBtn) {
        removeBgBtn.disabled = false;
        removeBgBtn.innerHTML = originalText;
      }
    }
  }

  private async upscale(): Promise<void> {
    if (!this.canvas || !this.ctx || !this.originalCanvas) {
      toastManager.error('이미지를 먼저 로드해주세요.');
      return;
    }

    const upscaleBtn = document.getElementById('ai-upscale-btn') as HTMLButtonElement;
    const factorSelect = document.getElementById('ai-upscale-factor') as HTMLSelectElement;
    const factor = parseInt(factorSelect?.value || '2');
    const originalText = upscaleBtn?.innerHTML || '';

    try {
      if (upscaleBtn) {
        upscaleBtn.disabled = true;
        upscaleBtn.innerHTML = '⏳ 처리 중...';
      }

      toastManager.info(`🔬 ${factor}배 업스케일링 중... (고급 Lanczos 알고리즘 사용)`);

      const srcCanvas = this.originalCanvas;
      const srcWidth = srcCanvas.width;
      const srcHeight = srcCanvas.height;
      const dstWidth = srcWidth * factor;
      const dstHeight = srcHeight * factor;

      // 결과 캔버스 생성
      const dstCanvas = document.createElement('canvas');
      dstCanvas.width = dstWidth;
      dstCanvas.height = dstHeight;
      const dstCtx = dstCanvas.getContext('2d')!;

      // 고품질 이미지 스케일링 설정
      dstCtx.imageSmoothingEnabled = true;
      dstCtx.imageSmoothingQuality = 'high';

      // Lanczos 리샘플링 구현 (고급 업스케일링)
      const srcCtx = srcCanvas.getContext('2d')!;
      const srcData = srcCtx.getImageData(0, 0, srcWidth, srcHeight);
      const dstData = dstCtx.createImageData(dstWidth, dstHeight);

      // Lanczos kernel (a=3)
      const lanczos = (x: number): number => {
        if (x === 0) return 1;
        if (Math.abs(x) >= 3) return 0;
        const pix = Math.PI * x;
        return (Math.sin(pix) / pix) * (Math.sin(pix / 3) / (pix / 3));
      };

      // 업스케일링 처리 (청크 단위로 처리하여 UI 블로킹 방지)
      const processChunk = async (startY: number, endY: number): Promise<void> => {
        for (let dy = startY; dy < endY; dy++) {
          for (let dx = 0; dx < dstWidth; dx++) {
            const sx = dx / factor;
            const sy = dy / factor;

            let r = 0, g = 0, b = 0, a = 0, weight = 0;

            // Lanczos 3x3 kernel
            for (let ky = -2; ky <= 2; ky++) {
              for (let kx = -2; kx <= 2; kx++) {
                const px = Math.floor(sx) + kx;
                const py = Math.floor(sy) + ky;

                if (px >= 0 && px < srcWidth && py >= 0 && py < srcHeight) {
                  const w = lanczos(sx - px) * lanczos(sy - py);
                  const idx = (py * srcWidth + px) * 4;

                  r += srcData.data[idx] * w;
                  g += srcData.data[idx + 1] * w;
                  b += srcData.data[idx + 2] * w;
                  a += srcData.data[idx + 3] * w;
                  weight += w;
                }
              }
            }

            const dIdx = (dy * dstWidth + dx) * 4;
            if (weight > 0) {
              dstData.data[dIdx] = Math.min(255, Math.max(0, r / weight));
              dstData.data[dIdx + 1] = Math.min(255, Math.max(0, g / weight));
              dstData.data[dIdx + 2] = Math.min(255, Math.max(0, b / weight));
              dstData.data[dIdx + 3] = Math.min(255, Math.max(0, a / weight));
            }
          }
        }
      };

      // 청크 단위 처리
      const chunkSize = 50;
      for (let y = 0; y < dstHeight; y += chunkSize) {
        const endY = Math.min(y + chunkSize, dstHeight);
        await processChunk(y, endY);

        // 진행률 표시
        const progress = Math.round((y / dstHeight) * 100);
        if (upscaleBtn) {
          upscaleBtn.innerHTML = `⏳ ${progress}%`;
        }

        // UI 업데이트를 위한 짧은 대기
        await new Promise(r => setTimeout(r, 0));
      }

      // 결과 적용
      dstCtx.putImageData(dstData, 0, 0);

      // 선명도 향상 (Unsharp Mask)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = dstWidth;
      tempCanvas.height = dstHeight;
      const tempCtx = tempCanvas.getContext('2d')!;

      // 블러 이미지 생성
      tempCtx.filter = 'blur(1px)';
      tempCtx.drawImage(dstCanvas, 0, 0);
      tempCtx.filter = 'none';

      const blurData = tempCtx.getImageData(0, 0, dstWidth, dstHeight);
      const sharpAmount = 0.5; // 선명도 강도

      for (let i = 0; i < dstData.data.length; i += 4) {
        dstData.data[i] = Math.min(255, Math.max(0, dstData.data[i] + (dstData.data[i] - blurData.data[i]) * sharpAmount));
        dstData.data[i + 1] = Math.min(255, Math.max(0, dstData.data[i + 1] + (dstData.data[i + 1] - blurData.data[i + 1]) * sharpAmount));
        dstData.data[i + 2] = Math.min(255, Math.max(0, dstData.data[i + 2] + (dstData.data[i + 2] - blurData.data[i + 2]) * sharpAmount));
      }

      dstCtx.putImageData(dstData, 0, 0);

      // 결과를 메인 캔버스에 적용
      this.canvas.width = dstWidth;
      this.canvas.height = dstHeight;
      this.ctx.drawImage(dstCanvas, 0, 0);

      // 원본 캔버스도 업데이트
      this.originalCanvas.width = dstWidth;
      this.originalCanvas.height = dstHeight;
      this.originalCanvas.getContext('2d')?.drawImage(dstCanvas, 0, 0);

      // 크기 입력 업데이트
      (document.getElementById('converter-width') as HTMLInputElement).value = String(dstWidth);
      (document.getElementById('converter-height') as HTMLInputElement).value = String(dstHeight);
      (document.getElementById('crop-width') as HTMLInputElement).value = String(dstWidth);
      (document.getElementById('crop-height') as HTMLInputElement).value = String(dstHeight);

      this.updateResultInfo();
      toastManager.success(`✅ ${factor}배 업스케일 완료! (${srcWidth}×${srcHeight} → ${dstWidth}×${dstHeight})`);

    } catch (error) {
      console.error('업스케일 오류:', error);
      toastManager.error(`업스케일 실패: ${(error as Error).message}`);
    } finally {
      if (upscaleBtn) {
        upscaleBtn.disabled = false;
        upscaleBtn.innerHTML = originalText;
      }
    }
  }

  private reset(): void {
    this.originalImage = null;
    this.filters = { brightness: 0, contrast: 0, saturation: 0, sharpen: 0 };

    const placeholder = document.getElementById('converter-upload-placeholder') as HTMLDivElement;
    const editor = document.getElementById('converter-editor') as HTMLDivElement;
    const uploadZone = document.getElementById('converter-upload-zone') as HTMLDivElement;

    if (placeholder) placeholder.style.display = 'block';
    if (editor) editor.style.display = 'none';
    if (uploadZone) {
      uploadZone.style.border = '2px dashed var(--border-medium)';
      uploadZone.style.padding = '2rem';
      uploadZone.style.background = 'var(--bg-secondary)';
    }

    // 필터 초기화
    this.resetFilters();

    toastManager.success('새 이미지를 선택해주세요.');
  }

  private insertToPost(): void {
    if (!this.canvas) return;

    const mimeType = `image/${this.currentFormat === 'jpeg' ? 'jpeg' : this.currentFormat}`;
    const quality = this.currentFormat !== 'png' ? this.currentQuality / 100 : undefined;
    const base64 = this.canvas.toDataURL(mimeType, quality);

    // ✅ 소제목 목록 가져오기 (ImageManager 우선)
    const headings = ImageManager.headings.length > 0
      ? ImageManager.headings
      : ((window as any).imageManagementHeadings || []);

    if (headings.length > 0) {
      // ✅ 소제목 선택 모달 표시
      this.showHeadingSelectionForInsert(base64, headings);
    } else {
      toastManager.info('소제목이 없어 저장소에 저장합니다.');
      this.saveToStorage();
    }
  }

  // ✅ 소제목 선택 모달 (이미지 변환기용)
  private showHeadingSelectionForInsert(imageBase64: string, headings: any[]): void {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); z-index: 100000; display: flex;
      align-items: center; justify-content: center; padding: 2rem;
    `;

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; max-width: 500px; width: 100%; max-height: 80vh; overflow: auto; padding: 2rem;">
        <h3 style="margin: 0 0 1rem 0; color: var(--text-strong); font-size: 1.25rem;">📍 이미지를 배치할 소제목 선택</h3>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem;">
          ${headings.map((h: any, i: number) => {
      const title = typeof h === 'string' ? h : (h.title || `소제목 ${i + 1}`);
      const hasImage = ImageManager.hasImage(title);
      return `
              <button type="button" class="heading-select-btn" data-index="${i}" 
                      style="padding: 0.75rem 1rem; background: ${hasImage ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--bg-tertiary)'}; 
                             color: ${hasImage ? 'white' : 'var(--text-strong)'}; border: 1px solid var(--border-light); border-radius: 8px; 
                             text-align: left; cursor: pointer; transition: all 0.2s;">
                ${hasImage ? '✅ ' : ''}${i + 1}. ${title}
              </button>
            `;
    }).join('')}
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="apply-btn" style="flex: 1; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">1번 소제목에 적용 (썸네일)</button>
          <button type="button" class="cancel-btn" style="padding: 0.75rem 1.5rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;">취소</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let selectedIndex = 0;

    // 소제목 버튼 클릭
    modal.querySelectorAll('.heading-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedIndex = parseInt((btn as HTMLElement).dataset.index || '0');
        modal.querySelectorAll('.heading-select-btn').forEach(b => {
          (b as HTMLElement).style.borderColor = 'var(--border-light)';
          (b as HTMLElement).style.borderWidth = '1px';
        });
        (btn as HTMLElement).style.borderColor = 'var(--primary)';
        (btn as HTMLElement).style.borderWidth = '2px';
      });
    });

    // 적용 버튼 (1번 소제목에 적용)
    modal.querySelector('.apply-btn')?.addEventListener('click', () => {
      const targetHeading = headings[selectedIndex];
      const title = typeof targetHeading === 'string' ? targetHeading : (targetHeading?.title || `소제목 ${selectedIndex + 1}`);

      const newImage = {
        heading: title,
        filePath: imageBase64,
        previewDataUrl: imageBase64,
        provider: 'image-converter',
        url: imageBase64,
        headingIndex: selectedIndex
      };

      // ✅ ImageManager에 등록
      ImageManager.setImage(title, newImage);

      // ✅ generatedImages 업데이트
      const existingImages = [...((window as any).imageManagementGeneratedImages || generatedImages || [])];
      if (selectedIndex < existingImages.length) {
        existingImages[selectedIndex] = newImage;
      } else {
        existingImages.push(newImage);
      }

      // ✅ [2026-02-12 P1 FIX #9] 직접 할당 → syncGlobalImagesFromImageManager
      try { syncGlobalImagesFromImageManager(); } catch { /* ignore */ }

      // ✅ 1번 소제목이면 대표사진으로 등록
      if (selectedIndex === 0) {
        (window as any).thumbnailPath = imageBase64;
        (window as any).selectedThumbnailImage = newImage;
        appendLog(`📷 대표사진으로 자동 등록됩니다.`);
      }

      appendLog(`✅ 이미지가 ${selectedIndex + 1}번 소제목 "${title}"에 적용되었습니다!`);
      toastManager.success(`✅ 이미지가 "${title}" 위치에 삽입되었습니다!`);
      modal.remove();
    });

    // 취소 버튼
    modal.querySelector('.cancel-btn')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  private saveToStorage(): void {
    if (!this.canvas) return;

    const mimeType = `image/${this.currentFormat === 'jpeg' ? 'jpeg' : this.currentFormat}`;
    const quality = this.currentFormat !== 'png' ? this.currentQuality / 100 : undefined;
    const base64 = this.canvas.toDataURL(mimeType, quality);

    // 저장소에 저장 로직 (기존 이미지 라이브러리 활용)
    toastManager.success('이미지가 저장소에 저장되었습니다.');
  }

  private download(): void {
    if (!this.canvas) return;

    const mimeType = `image/${this.currentFormat === 'jpeg' ? 'jpeg' : this.currentFormat}`;
    const quality = this.currentFormat !== 'png' ? this.currentQuality / 100 : undefined;

    const link = document.createElement('a');
    link.download = `converted_${Date.now()}.${this.currentFormat === 'jpeg' ? 'jpg' : this.currentFormat}`;
    link.href = this.canvas.toDataURL(mimeType, quality);
    link.click();
    toastManager.success('이미지가 다운로드되었습니다.');
  }
}

// ============================================
// 썸네일 생성기 & 이미지 변환기 초기화
// ============================================

let thumbnailGenerator: ThumbnailGenerator | null = null;
let imageConverter: ImageConverter | null = null;

// 탭 전환 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  // ✅ LEWORD 황금키워드 실행 버튼 이벤트 리스너 (전역 등록 - DOMContentLoaded)
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    // 버튼 자체거나 버튼 내부 요소(아이콘 등)를 클릭한 경우 모두 처리
    if (target.id === 'launch-leword-btn' || target.closest('#launch-leword-btn')) {
      console.log('🔑 황금키워드(LEWORD) 실행 버튼 클릭됨');
      try {
        const result = await (window as any).api.launchLeword();
        if (!result.success) {
          console.error('LEWORD 실행 실패:', result.message);
        }
      } catch (error) {
        console.error('LEWORD 실행 오류:', error);
      }
    }
  });

  // 기존 탭 전환 이벤트에 통합
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab;

      // ✅ 스마트 자동 발행 탭 전용 섹션들 표시/숨김 제어
      const unifiedOnlySections = [
        'unified-semi-auto-section',      // 반자동 편집 영역
        'unified-only-posts-list',        // 생성된 글 목록
        'unified-only-log-section',       // 로그 & 진행상황
        'unified-only-image-engine',      // 이미지 엔진 선택
        'unified-only-publish-settings',  // 발행 설정
        'unified-preview-section',        // 콘텐츠 미리보기
      ];

      unifiedOnlySections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
          // 'unified' 탭(스마트 자동 발행)에서만 표시
          if (tab === 'unified') {
            // unified-semi-auto-section과 unified-only-posts-list, unified-only-log-section은 기본 표시
            if (sectionId === 'unified-semi-auto-section' ||
              sectionId === 'unified-only-posts-list' ||
              sectionId === 'unified-only-log-section') {
              section.style.display = 'block';
            }
            // 나머지는 기존 상태 유지 (none으로 시작했다가 필요 시 표시)
          } else {
            // 다른 탭에서는 모두 숨김
            section.style.display = 'none';
          }
        }
      });

      // ✅ 이미지 도구 탭 진입 시 썸네일 생성기 초기화 (기본 서브탭)
      if (tab === 'image-tools' && !thumbnailGenerator) {
        setTimeout(() => {
          thumbnailGenerator = new ThumbnailGenerator();
        }, 100);
      }
    });
  });

  // ✅ 이미지 도구 서브탭 전환 로직
  const subtabButtons = document.querySelectorAll('.image-tools-subtab');
  console.log('[ImageToolsSubtab] 서브탭 버튼 개수:', subtabButtons.length);

  subtabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = (btn as HTMLElement).dataset.subtab;
      console.log('[ImageToolsSubtab] 서브탭 클릭:', subtab);

      // 버튼 스타일 업데이트
      subtabButtons.forEach(b => {
        const btnEl = b as HTMLElement;
        if (btnEl.dataset.subtab === subtab) {
          btnEl.style.background = 'var(--accent-primary)';
          btnEl.style.color = 'white';
          btnEl.classList.add('active');
        } else {
          btnEl.style.background = 'transparent';
          btnEl.style.color = 'var(--text-muted)';
          btnEl.classList.remove('active');
        }
      });

      // 서브패널 표시/숨김
      const thumbnailPanel = document.getElementById('subtab-thumbnail');
      const converterPanel = document.getElementById('subtab-converter');
      const shoppingBannerPanel = document.getElementById('subtab-shopping-banner');

      console.log('[ImageToolsSubtab] 패널 존재 여부:', {
        thumbnail: !!thumbnailPanel,
        converter: !!converterPanel,
        shoppingBanner: !!shoppingBannerPanel
      });

      // ✅ 모든 패널 숨기기
      if (thumbnailPanel) thumbnailPanel.style.display = 'none';
      if (converterPanel) converterPanel.style.display = 'none';
      if (shoppingBannerPanel) shoppingBannerPanel.style.display = 'none';

      if (subtab === 'thumbnail') {
        if (thumbnailPanel) thumbnailPanel.style.display = 'block';

        // 썸네일 생성기 초기화
        if (!thumbnailGenerator) {
          setTimeout(() => {
            thumbnailGenerator = new ThumbnailGenerator();
          }, 100);
        }
      } else if (subtab === 'converter') {
        if (converterPanel) converterPanel.style.display = 'block';

        // 이미지 변환기 초기화
        if (!imageConverter) {
          setTimeout(() => {
            imageConverter = new ImageConverter();
          }, 100);
        }
      } else if (subtab === 'shopping-banner') {
        console.log('[ImageToolsSubtab] 쇼핑커넥트 배너 패널 표시!');
        if (shoppingBannerPanel) {
          shoppingBannerPanel.style.display = 'block';
          console.log('[ImageToolsSubtab] shoppingBannerPanel.style.display =', shoppingBannerPanel.style.display);
        }

        // ✅ [2026-01-19] 쇼핑커넥트 배너 탭 전용 이벤트 리스너 초기화
        initShoppingBannerTab();
      }
    });
  });

  // ✅ 분석 도구 서브탭 전환 로직
  const analyticsSubtabButtons = document.querySelectorAll('.analytics-subtab');
  analyticsSubtabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = (btn as HTMLElement).dataset.subtab;

      // 버튼 스타일 업데이트
      analyticsSubtabButtons.forEach(b => {
        const btnEl = b as HTMLElement;
        if (btnEl.dataset.subtab === subtab) {
          btnEl.style.background = 'var(--accent-primary)';
          btnEl.style.color = 'white';
          btnEl.classList.add('active');
        } else {
          btnEl.style.background = 'transparent';
          btnEl.style.color = 'var(--text-muted)';
          btnEl.classList.remove('active');
        }
      });

      // 서브패널 표시/숨김
      document.querySelectorAll('.analytics-subpanel').forEach(panel => {
        (panel as HTMLElement).style.display = 'none';
      });
      const targetPanel = document.getElementById(`subtab-${subtab}`);
      if (targetPanel) targetPanel.style.display = 'block';
    });
  });

  // ✅ 키워드 분석 버튼
  const analyzeKeywordBtn = document.getElementById('analyze-keyword-btn');
  analyzeKeywordBtn?.addEventListener('click', async () => {
    const input = document.getElementById('keyword-analysis-input') as HTMLInputElement;
    const keyword = input?.value.trim();
    if (!keyword) {
      toastManager.warning('키워드를 입력해주세요.');
      return;
    }

    analyzeKeywordBtn.textContent = '분석 중...';
    (analyzeKeywordBtn as HTMLButtonElement).disabled = true;

    try {
      const result = await (window as any).electronAPI.analyzeKeyword(keyword);
      if (result.success && result.analysis) {
        const analysis = result.analysis;
        const resultDiv = document.getElementById('keyword-analysis-result');
        const contentDiv = document.getElementById('keyword-result-content');

        // 추천도 한글 변환
        const recommendationLabels: Record<string, string> = {
          'excellent': '🌟 매우 좋음',
          'good': '✅ 좋음',
          'moderate': '⚠️ 보통',
          'difficult': '❌ 어려움',
          'avoid': '🚫 피하세요'
        };
        const recommendationColors: Record<string, string> = {
          'excellent': '#10b981',
          'good': '#22c55e',
          'moderate': '#f59e0b',
          'difficult': '#ef4444',
          'avoid': '#dc2626'
        };

        if (resultDiv && contentDiv) {
          resultDiv.style.display = 'block';
          contentDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
              <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">기회 점수</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${analysis.opportunity >= 70 ? '#10b981' : analysis.opportunity >= 40 ? '#f59e0b' : '#ef4444'};">${analysis.opportunity || 0}</div>
              </div>
              <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">난이도</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${analysis.difficulty >= 70 ? '#ef4444' : analysis.difficulty >= 40 ? '#f59e0b' : '#10b981'};">${analysis.difficulty || 0}</div>
              </div>
              <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">블로그 결과</div>
                <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-strong);">${analysis.blogCount?.toLocaleString() || '-'}</div>
              </div>
              <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">추천도</div>
                <div style="font-size: 1rem; font-weight: 600; color: ${recommendationColors[analysis.recommendation] || 'var(--primary)'};">${recommendationLabels[analysis.recommendation] || analysis.recommendation || '-'}</div>
              </div>
            </div>
            ${analysis.reasons && analysis.reasons.length > 0 ? `
            <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 1rem;">
              <strong>💡 분석 이유:</strong>
              <ul style="margin: 0.5rem 0 0 0; padding-left: 1.25rem; color: var(--text-muted);">
                ${analysis.reasons.map((r: string) => `<li>${r}</li>`).join('')}
              </ul>
            </div>
            ` : ''}
            ${analysis.suggestions && analysis.suggestions.length > 0 ? `
            <div style="padding: 1rem; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05)); border-radius: 8px; margin-bottom: 1rem;">
              <strong style="color: #10b981;">📝 제안:</strong>
              <ul style="margin: 0.5rem 0 0 0; padding-left: 1.25rem; color: var(--text-muted);">
                ${analysis.suggestions.map((s: string) => `<li>${s}</li>`).join('')}
              </ul>
            </div>
            ` : ''}
            ${analysis.relatedKeywords && analysis.relatedKeywords.length > 0 ? `
            <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 8px;">
              <strong>🔗 연관 키워드:</strong>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                ${analysis.relatedKeywords.map((kw: string) => `<span style="padding: 0.25rem 0.75rem; background: var(--bg-secondary); border-radius: 20px; font-size: 0.85rem; color: var(--text-strong);">${kw}</span>`).join('')}
              </div>
            </div>
            ` : ''}
          `;
        }
        toastManager.success('키워드 분석 완료!');
      } else {
        toastManager.error(result.message || '분석 실패');
      }
    } catch (error) {
      console.error('[KeywordAnalysis] 오류:', error);
      toastManager.error('분석 중 오류 발생: ' + (error as Error).message);
    } finally {
      analyzeKeywordBtn.textContent = '🔍 분석하기';
      (analyzeKeywordBtn as HTMLButtonElement).disabled = false;
    }
  });

  // ✅ 블루오션 키워드 찾기
  const findBlueoceanBtn = document.getElementById('find-blueocean-btn');
  findBlueoceanBtn?.addEventListener('click', async () => {
    const input = document.getElementById('keyword-analysis-input') as HTMLInputElement;
    const keyword = input?.value.trim();
    if (!keyword) {
      toastManager.warning('기준 키워드를 입력해주세요.');
      return;
    }

    findBlueoceanBtn.textContent = '검색 중...';
    (findBlueoceanBtn as HTMLButtonElement).disabled = true;

    try {
      const result = await (window as any).electronAPI.findBlueOceanKeywords(keyword, 5);
      if (result.success && result.keywords) {
        const resultDiv = document.getElementById('keyword-analysis-result');
        const contentDiv = document.getElementById('keyword-result-content');

        if (resultDiv && contentDiv) {
          resultDiv.style.display = 'block';
          contentDiv.innerHTML = `
            <h5 style="margin: 0 0 1rem 0; color: var(--text-strong);">🌊 블루오션 키워드 추천</h5>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${result.keywords.map((kw: any) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px;">
                  <span style="font-weight: 600; color: var(--text-strong);">${kw.keyword}</span>
                  <span style="font-size: 0.85rem; color: ${kw.score >= 70 ? '#10b981' : '#f59e0b'};">점수: ${kw.score}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
        toastManager.success('블루오션 키워드 검색 완료!');
      } else {
        toastManager.error(result.message || '검색 실패');
      }
    } catch (error) {
      console.error('[BlueOcean] 오류:', error);
      toastManager.error('검색 중 오류 발생: ' + (error as Error).message);
    } finally {
      findBlueoceanBtn.textContent = '🌊 블루오션 키워드 찾기';
      (findBlueoceanBtn as HTMLButtonElement).disabled = false;
    }
  });

  // ✅ 자동 블루오션 키워드 발견 (입력 없이) - 진행률 바 포함
  const discoverBlueoceanBtn = document.getElementById('discover-blueocean-btn');
  discoverBlueoceanBtn?.addEventListener('click', async () => {
    discoverBlueoceanBtn.textContent = '🔍 발견 중...';
    (discoverBlueoceanBtn as HTMLButtonElement).disabled = true;

    // 진행률 UI 표시
    const resultDiv = document.getElementById('keyword-analysis-result');
    const contentDiv = document.getElementById('keyword-result-content');

    if (resultDiv && contentDiv) {
      resultDiv.style.display = 'block';
      contentDiv.innerHTML = `
        <div id="blueocean-progress-container" style="padding: 1.5rem;">
          <h5 style="margin: 0 0 1rem 0; color: var(--text-strong);">🔍 블루오션 키워드 자동 발견 중...</h5>
          
          <div style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <span id="blueocean-progress-text" style="font-size: 0.85rem; color: var(--text-muted);">트렌드 키워드 수집 중...</span>
              <span id="blueocean-progress-percent" style="font-size: 0.85rem; font-weight: 600; color: #f59e0b;">0%</span>
            </div>
            <div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
              <div id="blueocean-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #f59e0b, #d97706); border-radius: 4px; transition: width 0.3s ease;"></div>
            </div>
          </div>
          
          <div id="blueocean-log-container" style="background: var(--bg-tertiary); border-radius: 8px; padding: 1rem; max-height: 150px; overflow-y: auto; font-family: monospace; font-size: 0.8rem;">
            <div class="log-item" style="color: var(--text-muted);">⏳ 네이버 트렌드 키워드 수집 시작...</div>
          </div>
        </div>
      `;
    }

    // 진행률 업데이트 함수
    const updateBlueProgress = (percent: number, text: string, logMessage?: string) => {
      const progressBar = document.getElementById('blueocean-progress-bar');
      const progressText = document.getElementById('blueocean-progress-text');
      const progressPercent = document.getElementById('blueocean-progress-percent');
      const logContainer = document.getElementById('blueocean-log-container');

      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = text;
      if (progressPercent) progressPercent.textContent = `${percent}%`;
      if (logContainer && logMessage) {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.style.color = 'var(--text-muted)';
        logItem.style.marginTop = '0.25rem';
        logItem.textContent = logMessage;
        logContainer.appendChild(logItem);
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    };

    // 진행률 애니메이션
    let progress = 0;
    const logMessages = [
      '📊 네이버 쇼핑 트렌드 수집 중...',
      '📈 데이터랩 인기 키워드 분석 중...',
      '🔍 연관 키워드 검색 중...',
      '📉 검색량/문서량 비교 중...',
      '⭐ 블루오션 점수 계산 중...',
    ];
    let logIndex = 0;

    const progressInterval = setInterval(() => {
      if (progress < 85) {
        progress += 3;
        if (progress % 15 === 0 && logIndex < logMessages.length) {
          updateBlueProgress(progress, logMessages[logIndex], `✅ ${logMessages[logIndex].replace('...', ' 완료')}`);
          logIndex++;
        } else {
          updateBlueProgress(progress, '분석 진행 중...');
        }
      }
    }, 600);

    try {
      const result = await (window as any).electronAPI.discoverBlueOceanKeywords(10);

      clearInterval(progressInterval);
      updateBlueProgress(100, '완료!', '🎉 블루오션 키워드 발견 완료!');

      if (result.success && result.keywords && result.keywords.length > 0) {
        const resultDiv = document.getElementById('keyword-analysis-result');
        const contentDiv = document.getElementById('keyword-result-content');

        if (resultDiv && contentDiv) {
          resultDiv.style.display = 'block';
          contentDiv.innerHTML = `
            <h5 style="margin: 0 0 1rem 0; color: var(--text-strong);">🔥 자동 발견 블루오션 키워드 (트렌드 기반)</h5>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">검색량 높고 문서량 낮은 키워드를 자동으로 찾았습니다.</p>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${result.keywords.map((kw: any) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; cursor: pointer;" onclick="document.getElementById('keyword-analysis-input').value='${kw.keyword}'">
                  <div>
                    <span style="font-weight: 600; color: var(--text-strong);">${kw.keyword}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem;">${kw.searchVolume} / ${kw.competition}</span>
                  </div>
                  <div style="text-align: right;">
                    <span style="font-size: 0.85rem; color: ${kw.score >= 70 ? '#10b981' : '#f59e0b'}; font-weight: 600;">점수: ${kw.score}</span>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${kw.reason || ''}</div>
                  </div>
                </div>
              `).join('')}
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 1rem;">💡 키워드를 클릭하면 입력창에 자동 입력됩니다.</p>
          `;
        }
        toastManager.success(`블루오션 키워드 ${result.keywords.length}개 자동 발견!`);
      } else {
        toastManager.warning(result.message || '발견된 블루오션 키워드가 없습니다.');
      }
    } catch (error) {
      console.error('[DiscoverBlueOcean] 오류:', error);
      toastManager.error('자동 발견 중 오류 발생: ' + (error as Error).message);
    } finally {
      discoverBlueoceanBtn.textContent = '🔍 자동 발견 (입력 없이)';
      (discoverBlueoceanBtn as HTMLButtonElement).disabled = false;
    }
  });

  // ✅ 단일 카테고리 황금키워드 발견 (사용자 선택)
  const discoverGoldenBtn = document.getElementById('discover-golden-btn');
  const goldenCategorySelect = document.getElementById('golden-category-select') as HTMLSelectElement;

  discoverGoldenBtn?.addEventListener('click', async () => {
    const selectedCategory = goldenCategorySelect?.value || 'restaurant';
    const categoryNames: Record<string, string> = {
      // 엔터테인먼트·예술
      literature: '📚 문학·책', movie: '🎬 영화', art: '🎨 미술·디자인',
      performance: '🎭 공연·전시', music: '🎵 음악', drama: '📺 드라마',
      celebrity: '⭐ 스타·연예인', cartoon: '🎌 만화·애니', broadcast: '📡 방송',
      // 생활·노하우·쇼핑
      daily: '💭 일상·생각', parenting: '👶 육아·결혼', pet: '🐶 반려동물',
      photo: '🖼️ 좋은글·이미지', fashion: '👗 패션·미용', interior: '🏠 인테리어·DIY',
      cooking: '🍳 요리·레시피', product: '📦 상품리뷰', gardening: '🌱 원예·재배',
      // 취미·여가·여행
      game: '🎮 게임', sports: '⚽ 스포츠', camera: '📷 사진',
      car: '🚗 자동차', hobby: '🎯 취미', domestic_travel: '🗺️ 국내여행',
      world_travel: '✈️ 세계여행', restaurant: '🍽️ 맛집',
      // 지식·동향
      it: '💻 IT·컴퓨터', politics: '📰 사회·정치', health: '🏥 건강·의학',
      economy: '💼 비즈니스·경제', language: '🌍 어학·외국어', education: '🎓 교육·학문',
      realestate: '🏢 부동산', selfdev: '📈 자기계발',
    };
    const categoryName = categoryNames[selectedCategory] || '🍽️ 맛집';

    discoverGoldenBtn.textContent = '🔍 발견 중...';
    (discoverGoldenBtn as HTMLButtonElement).disabled = true;

    // 진행률 UI 표시
    const resultDiv = document.getElementById('keyword-analysis-result');
    const contentDiv = document.getElementById('keyword-result-content');

    if (resultDiv && contentDiv) {
      resultDiv.style.display = 'block';
      contentDiv.innerHTML = `
        <div id="golden-progress-container" style="padding: 1.5rem;">
          <h5 style="margin: 0 0 1rem 0; color: var(--text-strong);">🏆 ${categoryName} 황금키워드 발견 중...</h5>
          
          <div style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <span id="golden-progress-text" style="font-size: 0.85rem; color: var(--text-muted);">연관 키워드 수집 중...</span>
              <span id="golden-progress-percent" style="font-size: 0.85rem; font-weight: 600; color: #ec4899;">0%</span>
            </div>
            <div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
              <div id="golden-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ec4899, #db2777); border-radius: 4px; transition: width 0.3s ease;"></div>
            </div>
          </div>
          
          <div id="golden-log-container" style="background: var(--bg-tertiary); border-radius: 8px; padding: 1rem; max-height: 150px; overflow-y: auto; font-family: monospace; font-size: 0.8rem;">
            <div class="log-item" style="color: var(--text-muted);">⏳ ${categoryName} 연관 키워드 수집 시작...</div>
          </div>
        </div>
      `;
    }

    // 진행률 업데이트 함수
    const updateProgress = (percent: number, text: string, logMessage?: string) => {
      const progressBar = document.getElementById('golden-progress-bar');
      const progressText = document.getElementById('golden-progress-text');
      const progressPercent = document.getElementById('golden-progress-percent');
      const logContainer = document.getElementById('golden-log-container');

      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = text;
      if (progressPercent) progressPercent.textContent = `${percent}%`;
      if (logContainer && logMessage) {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.style.color = 'var(--text-muted)';
        logItem.style.marginTop = '0.25rem';
        logItem.textContent = logMessage;
        logContainer.appendChild(logItem);
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    };

    // 진행률 애니메이션
    let progress = 0;
    const logSteps = [
      '📊 시드 키워드 분석 중...',
      '🔍 연관 키워드 검색 중...',
      '📈 검색량 조회 중...',
      '📉 문서량 분석 중...',
      '⭐ 황금키워드 점수 계산 중...',
    ];
    let stepIndex = 0;

    const progressInterval = setInterval(() => {
      if (progress < 85) {
        progress += 4;
        if (progress % 16 === 0 && stepIndex < logSteps.length) {
          updateProgress(progress, logSteps[stepIndex], `✅ ${logSteps[stepIndex].replace('...', ' 완료')}`);
          stepIndex++;
        } else {
          updateProgress(progress, '키워드 분석 중...');
        }
      }
    }, 500);

    try {
      // ✅ 선택된 카테고리만 분석
      const result = await (window as any).electronAPI.discoverGoldenKeywordsBySingleCategory(selectedCategory, 10);

      clearInterval(progressInterval);
      updateProgress(100, '완료!', `🎉 ${categoryName} 황금키워드 발견 완료!`);

      // 1초 후 결과 표시
      setTimeout(() => {
        if (result.success && result.keywords && result.keywords.length > 0) {
          if (resultDiv && contentDiv) {
            resultDiv.style.display = 'block';

            contentDiv.innerHTML = `
              <h5 style="margin: 0 0 1rem 0; color: var(--text-strong);">🏆 ${result.category.icon} ${result.category.name} 황금키워드</h5>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">검색량이 높고 문서량이 낮은 블루오션 키워드입니다. 키워드 클릭 시 입력창에 자동 입력됩니다.</p>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                  <tr style="background: var(--bg-tertiary);">
                    <th style="padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--border-light);">키워드</th>
                    <th style="padding: 0.5rem; text-align: right; border-bottom: 1px solid var(--border-light);">검색량</th>
                    <th style="padding: 0.5rem; text-align: right; border-bottom: 1px solid var(--border-light);">문서량</th>
                    <th style="padding: 0.5rem; text-align: right; border-bottom: 1px solid var(--border-light);">점수</th>
                  </tr>
                </thead>
                <tbody>
                  ${result.keywords.map((kw: any) => `
                    <tr style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background=''" onclick="document.getElementById('keyword-analysis-input').value='${kw.keyword}'">
                      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-light);">
                        <span style="font-weight: 600; color: var(--text-strong);">${kw.keyword}</span>
                      </td>
                      <td style="padding: 0.5rem; text-align: right; border-bottom: 1px solid var(--border-light); color: #10b981; font-weight: 600;">
                        ${kw.searchVolume.toLocaleString()}회
                      </td>
                      <td style="padding: 0.5rem; text-align: right; border-bottom: 1px solid var(--border-light); color: ${kw.blogCount <= 1000 ? '#10b981' : kw.blogCount <= 10000 ? '#f59e0b' : '#ef4444'};">
                        ${kw.blogCount.toLocaleString()}개
                      </td>
                      <td style="padding: 0.5rem; text-align: right; border-bottom: 1px solid var(--border-light);">
                        <span style="background: ${kw.score >= 70 ? '#10b981' : kw.score >= 50 ? '#f59e0b' : '#ef4444'}; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">${kw.score}점</span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 1rem;">💡 키워드를 클릭하면 입력창에 자동 입력됩니다. | 🔥 문서량 1,000개 이하 = 초황금</p>
            `;
          }
          toastManager.success(`${result.category.icon} ${result.category.name} 황금키워드 ${result.keywords.length}개 발견!`);
        } else {
          if (contentDiv) {
            contentDiv.innerHTML = `
              <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">😢</div>
                <h5 style="margin: 0 0 0.5rem 0; color: var(--text-strong);">황금키워드를 찾지 못했습니다</h5>
                <p style="color: var(--text-muted); font-size: 0.9rem;">다른 카테고리를 선택하거나 잠시 후 다시 시도해주세요.</p>
              </div>
            `;
          }
          toastManager.warning(result.message || '발견된 황금키워드가 없습니다.');
        }
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      console.error('[DiscoverGolden] 오류:', error);
      toastManager.error('발견 중 오류 발생: ' + (error as Error).message);
    } finally {
      discoverGoldenBtn.textContent = '🔍 황금키워드 찾기';
      (discoverGoldenBtn as HTMLButtonElement).disabled = false;
    }
  });

  // ✅ 레거시: 카테고리별 황금키워드 발견 (전체) - 사용 안 함
  /*
  const discoverGoldenBtnLegacy = document.getElementById('discover-golden-btn-legacy');
  discoverGoldenBtnLegacy?.addEventListener('click', async () => {
    // 진행률 UI 표시
    const resultDiv = document.getElementById('keyword-analysis-result');
    const contentDiv = document.getElementById('keyword-result-content');
    
    if (resultDiv && contentDiv) {
      resultDiv.style.display = 'block';
      contentDiv.innerHTML = `레거시 기능`;
    }
    
    try {
      const result = await (window as any).electronAPI.discoverGoldenKeywordsByCategory(5);
      
      if (result.success && result.categories && result.categories.length > 0) {
        const resultDiv = document.getElementById('keyword-analysis-result');
        const contentDiv = document.getElementById('keyword-result-content');
        
        if (resultDiv && contentDiv) {
          resultDiv.style.display = 'block';
          
          let html = `레거시 결과`;
          
          for (const category of result.categories) {
            html += `카테고리: ${category.name}`;
          }
          
          contentDiv.innerHTML = html;
        }
      }
    } catch (error) {
      console.error('[DiscoverGolden] 오류:', error);
    }
  });
  */

  // ✅ 경쟁 분석 버튼
  const analyzeCompetitorBtn = document.getElementById('analyze-competitor-btn');
  analyzeCompetitorBtn?.addEventListener('click', async () => {
    const input = document.getElementById('competitor-keyword-input') as HTMLInputElement;
    const keyword = input?.value.trim();
    if (!keyword) {
      toastManager.warning('키워드를 입력해주세요.');
      return;
    }

    analyzeCompetitorBtn.textContent = '분석 중...';
    (analyzeCompetitorBtn as HTMLButtonElement).disabled = true;

    try {
      const result = await (window as any).electronAPI.analyzeCompetitors(keyword);
      if (result.success && result.result) {
        const analysis = result.result;
        const resultDiv = document.getElementById('competitor-analysis-result');
        const contentDiv = document.getElementById('competitor-result-content');

        if (resultDiv && contentDiv) {
          resultDiv.style.display = 'block';

          const difficultyColors: Record<string, string> = {
            'easy': '#10b981',
            'medium': '#f59e0b',
            'hard': '#ef4444',
            'very_hard': '#dc2626'
          };
          const difficultyLabels: Record<string, string> = {
            'easy': '쉬움',
            'medium': '보통',
            'hard': '어려움',
            'very_hard': '매우 어려움'
          };

          contentDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
              <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">난이도</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: ${difficultyColors[analysis.difficulty] || '#666'};">${difficultyLabels[analysis.difficulty] || analysis.difficulty}</div>
              </div>
              <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">평균 글자수</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-strong);">${analysis.contentAnalysis?.avgWordCount?.toLocaleString() || '-'}자</div>
              </div>
              <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">평균 이미지</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-strong);">${analysis.contentAnalysis?.avgImageCount || '-'}개</div>
              </div>
            </div>
            
            <div style="padding: 1rem; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(124, 58, 237, 0.05)); border-radius: 8px; margin-bottom: 1rem;">
              <strong style="color: var(--primary);">🎯 승리 전략</strong>
              <p style="margin: 0.5rem 0 0 0; color: var(--text-strong);">${analysis.winningStrategy || '-'}</p>
            </div>
            
            <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 1rem;">
              <strong>💡 인사이트</strong>
              <ul style="margin: 0.5rem 0 0 0; padding-left: 1.25rem; color: var(--text-muted);">
                ${(analysis.insights || []).map((i: string) => `<li>${i}</li>`).join('')}
              </ul>
            </div>
            
            <div style="padding: 1rem; background: var(--bg-tertiary); border-radius: 8px;">
              <strong>📝 추천 사항</strong>
              <ul style="margin: 0.5rem 0 0 0; padding-left: 1.25rem; color: var(--text-muted);">
                ${(analysis.recommendations || []).map((r: string) => `<li>${r}</li>`).join('')}
              </ul>
            </div>
          `;
        }
        toastManager.success('경쟁 분석 완료!');
      } else {
        toastManager.error(result.message || '분석 실패');
      }
    } catch (error) {
      console.error('[Competitor] 오류:', error);
      toastManager.error('분석 중 오류 발생: ' + (error as Error).message);
    } finally {
      analyzeCompetitorBtn.textContent = '🔍 경쟁 분석';
      (analyzeCompetitorBtn as HTMLButtonElement).disabled = false;
    }
  });

  // ✅ 제목 후보 생성 버튼
  const generateTitlesBtn = document.getElementById('generate-titles-btn');
  generateTitlesBtn?.addEventListener('click', async () => {
    const keywordInput = document.getElementById('title-keyword-input') as HTMLInputElement;
    const categorySelect = document.getElementById('title-category-select') as HTMLSelectElement;
    const keyword = keywordInput?.value.trim();
    const category = categorySelect?.value;

    if (!keyword) {
      toastManager.warning('키워드를 입력해주세요.');
      return;
    }

    generateTitlesBtn.textContent = '생성 중...';
    (generateTitlesBtn as HTMLButtonElement).disabled = true;

    try {
      const result = await (window as any).electronAPI.generateTitleCandidates(keyword, category || undefined, 5);
      if (result.success && result.result) {
        const abResult = result.result;
        const resultDiv = document.getElementById('title-ab-result');
        const contentDiv = document.getElementById('title-result-content');

        if (resultDiv && contentDiv) {
          resultDiv.style.display = 'block';
          contentDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${abResult.candidates.map((c: any, idx: number) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: ${idx === 0 ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))' : 'var(--bg-tertiary)'}; border-radius: 8px; border: ${idx === 0 ? '2px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-light)'};">
                  <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem;">${idx === 0 ? '🏆 ' : ''}${c.title}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${c.style} · ${c.reasons?.[0] || ''}</div>
                  </div>
                  <div style="text-align: right; min-width: 60px;">
                    <div style="font-size: 1.25rem; font-weight: 700; color: ${c.score >= 80 ? '#10b981' : c.score >= 60 ? '#f59e0b' : '#ef4444'};">${c.score}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">CTR 점수</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }
        toastManager.success('제목 후보 생성 완료!');
      } else {
        toastManager.error(result.message || '생성 실패');
      }
    } catch (error) {
      console.error('[TitleAB] 오류:', error);
      toastManager.error('생성 중 오류 발생: ' + (error as Error).message);
    } finally {
      generateTitlesBtn.textContent = '✨ 제목 후보 생성';
      (generateTitlesBtn as HTMLButtonElement).disabled = false;
    }
  });

  // ✅ 제목 평가 버튼
  const evaluateTitleBtn = document.getElementById('evaluate-title-btn');
  evaluateTitleBtn?.addEventListener('click', async () => {
    const input = document.getElementById('evaluate-title-input') as HTMLInputElement;
    const categorySelect = document.getElementById('title-category-select') as HTMLSelectElement;
    const title = input?.value.trim();

    if (!title) {
      toastManager.warning('평가할 제목을 입력해주세요.');
      return;
    }

    try {
      const result = await (window as any).electronAPI.evaluateTitle(title, categorySelect?.value || undefined);
      if (result.success && result.evaluation) {
        const ev = result.evaluation;
        toastManager.info(`📊 점수: ${ev.score}점 (${ev.style}) - ${ev.reasons?.[0] || ''}`);
      } else {
        toastManager.error(result.message || '평가 실패');
      }
    } catch (error) {
      toastManager.error('평가 중 오류 발생');
    }
  });

  // ✅ 성과 추적 추가 버튼
  const addTrackPostBtn = document.getElementById('add-track-post-btn');
  addTrackPostBtn?.addEventListener('click', async () => {
    const input = document.getElementById('track-post-url') as HTMLInputElement;
    const url = input?.value.trim();

    if (!url) {
      toastManager.warning('추적할 글 URL을 입력해주세요.');
      return;
    }

    try {
      const result = await (window as any).electronAPI.addPostToTrack(url);
      if (result.success) {
        toastManager.success('글이 추적 목록에 추가되었습니다.');
        input.value = '';
        // 목록 새로고침
        refreshTrackingList();
      } else {
        toastManager.error(result.message || '추가 실패');
      }
    } catch (error) {
      toastManager.error('추가 중 오류 발생');
    }
  });

  // 추적 목록 새로고침 함수
  async function refreshTrackingList() {
    try {
      const result = await (window as any).electronAPI.getAllTrackedPosts();
      const listDiv = document.getElementById('tracking-posts-list');
      if (listDiv && result.success && result.posts) {
        if (result.posts.length === 0) {
          listDiv.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">추적 중인 글이 없습니다.</div>';
        } else {
          listDiv.innerHTML = result.posts.map((post: any) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 0.5rem;">
              <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 600; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${post.title || post.url}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">조회: ${post.views || 0} · 댓글: ${post.comments || 0} · 공감: ${post.likes || 0}</div>
              </div>
            </div>
          `).join('');
        }
      }
    } catch (error) {
      console.error('추적 목록 로드 실패:', error);
    }
  }

  // 전체 새로고침 버튼
  document.getElementById('refresh-analytics-btn')?.addEventListener('click', refreshTrackingList);
});
