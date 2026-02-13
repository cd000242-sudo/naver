import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export interface ThumbnailOptions {
    width?: number;
    height?: number;
    textColor?: string;
    fontSize?: number;
    fontFamily?: string;
    backgroundColor?: string;
    opacity?: number;
    position?: 'center' | 'bottom' | 'top';
}

export class ThumbnailService {
    /**
     * 제품 이미지 위에 텍스트를 합성하여 썸네일을 생성합니다.
     * @param imagePath 원본 이미지 경로
     * @param text 합성할 텍스트
     * @param outputPath 저장할 경로
     * @param options 옵션
     */
    async createProductThumbnail(
        imagePath: string,
        text: string,
        outputPath: string,
        options: ThumbnailOptions = {}
    ): Promise<string> {
        try {
            if (!fs.existsSync(imagePath)) {
                throw new Error(`원본 이미지를 찾을 수 없습니다: ${imagePath}`);
            }

            const {
                width = 800,
                height = 800,
                textColor = '#ffffff',
                fontSize = 14, // ✅ 사용자 요청: 텍스트 크기 절반으로 축소 (28 → 14)
                fontFamily = 'Noto Sans KR, sans-serif',
                opacity = 0.8,
                position = 'center'
            } = options;

            // ✅ [핵심 수정] 1. 먼저 리사이즈를 실행하고 버퍼로 변환
            const resizedBuffer = await sharp(imagePath)
                .resize(width, height, {
                    fit: 'cover',
                    position: 'center'
                })
                .toBuffer();

            // 2. 리사이즈된 이미지의 실제 크기 확인
            const resizedImage = sharp(resizedBuffer);
            const metadata = await resizedImage.metadata();
            const actualWidth = metadata.width || width;
            const actualHeight = metadata.height || height;

            console.log(`[ThumbnailService] 리사이즈 완료: ${actualWidth}x${actualHeight}`);

            // 3. 텍스트 SVG 생성 (정확히 같은 크기로)
            const svgOverlay = this.generateTextSvg(text, actualWidth, actualHeight, {
                textColor,
                fontSize,
                fontFamily,
                opacity,
                position
            });

            // 4. 합성 (같은 크기의 이미지와 SVG)
            await sharp(resizedBuffer)
                .composite([
                    {
                        input: Buffer.from(svgOverlay),
                        blend: 'over'
                    }
                ])
                .toFile(outputPath);

            return outputPath;
        } catch (error) {
            console.error('[ThumbnailService] Error creating thumbnail:', error);
            throw error;
        }
    }

    /**
     * ✅ [2026-02-08 FIX] 텍스트 오버레이용 SVG 생성
     * textOverlay.ts와 동일한 스타일로 통일: 배경 없음, 두꺼운 외곽선, 하단 배치
     */
    private generateTextSvg(
        text: string,
        width: number,
        height: number,
        options: any
    ): string {
        const { textColor = '#ffffff', fontFamily = 'Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif', position = 'bottom' } = options;

        // ✅ [2026-02-08] 폰트 크기 자동 계산 (textOverlay.ts와 동일 로직)
        const cleanText = text.trim();
        const maxLines = 3;
        const charsPerLine = Math.floor((width * 0.8) / 30);

        // 텍스트 줄바꿈 처리
        const lines: string[] = [];
        if (cleanText.length <= 15) {
            lines.push(cleanText);
        } else {
            const segments = cleanText.split(/([,，.。!?·…\s]+)/);
            let currentLine = '';
            for (const segment of segments) {
                if (currentLine.length + segment.length <= charsPerLine) {
                    currentLine += segment;
                } else {
                    if (currentLine.trim()) lines.push(currentLine.trim());
                    currentLine = segment.trim();
                    if (lines.length >= maxLines - 1 && currentLine) {
                        const remaining = segments.slice(segments.indexOf(segment)).join('').trim();
                        lines.push(remaining.length > charsPerLine ? remaining.substring(0, charsPerLine - 3) + '...' : remaining);
                        break;
                    }
                }
            }
            if (currentLine.trim() && lines.length < maxLines) lines.push(currentLine.trim());
        }

        // ✅ [2026-02-08] 폰트 크기 자동 계산 (textOverlay.ts 동일)
        const baseSize = Math.floor(width * 0.08);
        const longestLine = Math.max(...lines.map(l => l.length));
        let adjustedSize = baseSize;
        if (longestLine > 15) adjustedSize = Math.floor(baseSize * 0.8);
        if (longestLine > 25) adjustedSize = Math.floor(baseSize * 0.65);
        if (longestLine > 35) adjustedSize = Math.floor(baseSize * 0.5);
        if (lines.length >= 3) adjustedSize = Math.floor(adjustedSize * 0.85);
        const calculatedFontSize = Math.max(36, Math.min(100, adjustedSize));

        const lineHeight = calculatedFontSize * 1.4;
        const padding = 30;
        const textBlockHeight = lines.length * lineHeight + padding * 2;

        // ✅ [2026-02-08] 하단 근접 배치 (textOverlay.ts와 동일)
        let yPosition: number;
        if (position === 'center') {
            yPosition = Math.floor((height - textBlockHeight) / 2);
        } else {
            yPosition = height - textBlockHeight - Math.floor(padding * 0.3);
        }

        // ✅ [2026-02-08] textOverlay.ts와 동일한 스타일: 두꺼운 외곽선 + 흰색 텍스트
        const textElements = lines.map((line, index) => {
            const y = yPosition + padding + (index + 0.8) * lineHeight;
            const escaped = this.escapeXml(line);
            return `
            <!-- 두꺼운 외곽선 -->
            <text x="50%" y="${y}" text-anchor="middle" 
                fill="none" stroke="black" stroke-width="16" stroke-linejoin="round"
                font-size="${calculatedFontSize}px" font-family="${fontFamily}" font-weight="900"
            >${escaped}</text>
            <!-- 메인 텍스트 -->
            <text x="50%" y="${y}" text-anchor="middle" 
                fill="${textColor}"
                font-size="${calculatedFontSize}px" font-family="${fontFamily}" font-weight="900"
            >${escaped}</text>`;
        }).join('\n');

        // ✅ [2026-02-08] 배경 오버레이 없음 — 텍스트만 외곽선으로 표시
        return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- 텍스트만 (배경 오버레이 없음) -->
        ${textElements}
      </svg>
    `;
    }

    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

export const thumbnailService = new ThumbnailService();
