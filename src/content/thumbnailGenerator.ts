// ✅ 썸네일 자동 생성 기능
// 제목 기반으로 눈에 띄는 썸네일을 자동 생성

export type ThumbnailStyle = 'modern' | 'minimal' | 'bold' | 'gradient' | 'photo';

export type ThumbnailConfig = {
  width: number;
  height: number;
  style: ThumbnailStyle;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  gradientColors?: [string, string];
  overlayOpacity?: number;
};

export type GeneratedThumbnail = {
  dataUrl: string;
  width: number;
  height: number;
  style: ThumbnailStyle;
  title: string;
  generatedAt: string;
};

// ✅ 스타일별 기본 설정
const STYLE_PRESETS: Record<ThumbnailStyle, Partial<ThumbnailConfig>> = {
  modern: {
    backgroundColor: '#1a1a2e',
    textColor: '#ffffff',
    gradientColors: ['#667eea', '#764ba2'],
  },
  minimal: {
    backgroundColor: '#ffffff',
    textColor: '#333333',
  },
  bold: {
    backgroundColor: '#ff6b6b',
    textColor: '#ffffff',
    gradientColors: ['#ee0979', '#ff6a00'],
  },
  gradient: {
    gradientColors: ['#11998e', '#38ef7d'],
    textColor: '#ffffff',
  },
  photo: {
    overlayOpacity: 0.5,
    textColor: '#ffffff',
  },
};

// ✅ 카테고리별 추천 색상
const CATEGORY_COLORS: Record<string, [string, string]> = {
  news: ['#1e3c72', '#2a5298'],
  entertainment: ['#ff416c', '#ff4b2b'],
  sports: ['#11998e', '#38ef7d'],
  tech: ['#4776e6', '#8e54e9'],
  lifestyle: ['#f093fb', '#f5576c'],
  food: ['#f2994a', '#f2c94c'],
  travel: ['#00b4db', '#0083b0'],
  finance: ['#134e5e', '#71b280'],
  health: ['#56ab2f', '#a8e063'],
  default: ['#667eea', '#764ba2'],
};

export class ThumbnailGenerator {
  private defaultConfig: ThumbnailConfig = {
    width: 800,
    height: 420,
    style: 'modern',
    fontSize: 42,
    fontFamily: 'Noto Sans KR, sans-serif',
  };

  // ✅ 간단한 SVG 썸네일 생성 (canvas 없이)
  generateSvgThumbnail(
    title: string,
    options: Partial<ThumbnailConfig> = {},
    category?: string
  ): string {
    const config = { ...this.defaultConfig, ...STYLE_PRESETS[options.style || 'modern'], ...options };
    
    // 카테고리별 색상
    const colors = category && CATEGORY_COLORS[category] 
      ? CATEGORY_COLORS[category] 
      : config.gradientColors || CATEGORY_COLORS.default;

    const { width, height, textColor } = config;
    
    // 제목 줄바꿈 (간단 버전)
    const maxCharsPerLine = Math.floor(width / 30);
    const lines: string[] = [];
    let remaining = title;
    
    while (remaining.length > 0) {
      if (remaining.length <= maxCharsPerLine) {
        lines.push(remaining);
        break;
      }
      lines.push(remaining.slice(0, maxCharsPerLine));
      remaining = remaining.slice(maxCharsPerLine);
    }

    const lineHeight = 50;
    const startY = (height - lines.length * lineHeight) / 2 + 20;

    const textElements = lines.map((line, i) => 
      `<text x="${width/2}" y="${startY + i * lineHeight}" 
             text-anchor="middle" 
             font-family="Noto Sans KR, sans-serif" 
             font-size="36" 
             font-weight="bold" 
             fill="${textColor || '#ffffff'}"
             filter="url(#shadow)">${this.escapeXml(line)}</text>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors[1]};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  ${textElements}
</svg>`;
  }

  // ✅ XML 이스케이프
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ✅ 스타일 목록
  getAvailableStyles(): ThumbnailStyle[] {
    return ['modern', 'minimal', 'bold', 'gradient', 'photo'];
  }

  // ✅ 카테고리 목록
  getAvailableCategories(): string[] {
    return Object.keys(CATEGORY_COLORS);
  }
}
