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
     * 텍스트 오버레이용 SVG 생성
     */
    private generateTextSvg(
        text: string,
        width: number,
        height: number,
        options: any
    ): string {
        const { textColor, fontSize, fontFamily, opacity, position } = options;

        // ✅ [개선] 텍스트 줄바꿈 처리 - 쉼표(,) 우선 줄바꿈
        const maxCharsPerLine = Math.floor(width / (fontSize * 0.6));
        const lines: string[] = [];

        // 먼저 쉼표로 분리
        const commaParts = text.split(',').map(s => s.trim()).filter(s => s.length > 0);

        for (const part of commaParts) {
            // 각 쉼표 단위가 maxCharsPerLine을 넘으면 추가 분할
            let remaining = part;
            while (remaining.length > 0) {
                if (remaining.length <= maxCharsPerLine) {
                    lines.push(remaining);
                    break;
                }
                let splitIdx = remaining.lastIndexOf(' ', maxCharsPerLine);
                if (splitIdx === -1) splitIdx = maxCharsPerLine;
                lines.push(remaining.slice(0, splitIdx).trim());
                remaining = remaining.slice(splitIdx).trim();
            }
        }

        const lineHeight = fontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;

        let startY = (height - totalTextHeight) / 2 + fontSize;
        if (position === 'bottom') {
            startY = height - totalTextHeight - 40 + fontSize;
        } else if (position === 'top') {
            startY = 40 + fontSize;
        }

        const textElements = lines.map((line, i) =>
            `<text x="${width / 2}" y="${startY + i * lineHeight}" 
             text-anchor="middle" 
             font-family="${fontFamily}" 
             font-size="${fontSize}" 
             font-weight="bold" 
             fill="${textColor}"
             filter="url(#shadow)">${this.escapeXml(line)}</text>`
        ).join('\n');

        // 가독성을 위한 반투명 검은색 배경 박스 또는 그림자
        const rectHeight = totalTextHeight + 40;
        const rectY = startY - fontSize - 10;

        return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.8"/>
          </filter>
        </defs>
        <rect x="0" y="${rectY}" width="${width}" height="${rectHeight}" fill="black" fill-opacity="0.4" />
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
