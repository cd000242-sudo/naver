/**
 * textOverlay.ts - 이미지에 텍스트 오버레이 추가
 * 
 * AI가 생성한 깔끔한 이미지에 후처리로 텍스트를 오버레이합니다.
 * - 3줄 자동 줄바꿈
 * - 폰트 크기 자동 최적화
 * - 반투명 배경 박스 + 그림자 효과
 */

import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

export interface TextOverlayOptions {
    text: string;                    // 오버레이할 텍스트 (타이틀)
    position?: 'bottom' | 'center';  // 텍스트 위치 (기본: bottom)
    fontSize?: number;               // 폰트 크기 (기본: 자동 계산)
    maxLines?: number;               // 최대 줄 수 (기본: 3)
    textColor?: string;              // 텍스트 색상 (기본: white)
    backgroundColor?: string;        // 배경 색상 (기본: rgba(0,0,0,0.6))
    fontFamily?: string;             // 폰트 (기본: Noto Sans KR, sans-serif)
    padding?: number;                // 패딩 (기본: 30)
}

export interface TextOverlayResult {
    success: boolean;
    outputPath?: string;
    outputBuffer?: Buffer;
    error?: string;
}

/**
 * 이미지에 텍스트 오버레이 추가
 */
export async function addTextOverlay(
    inputPath: string | Buffer,
    options: TextOverlayOptions
): Promise<TextOverlayResult> {
    try {
        const {
            text,
            position = 'bottom',
            maxLines = 3,
            textColor = 'white',
            backgroundColor = 'rgba(0,0,0,0.65)',
            fontFamily = 'Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif',
            padding = 30
        } = options;

        // 이미지 메타데이터 가져오기
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        const width = metadata.width || 1024;
        const height = metadata.height || 1024;

        // 텍스트 줄바꿈 처리 (최대 maxLines줄)
        const lines = wrapText(text, maxLines, Math.floor(width * 0.8));

        // 폰트 크기 자동 계산 (이미지 크기 및 텍스트 길이 기반)
        const fontSize = options.fontSize || calculateFontSize(lines, width, height);

        // 텍스트 영역 높이 계산
        const lineHeight = fontSize * 1.4;
        const textBlockHeight = lines.length * lineHeight + padding * 2;

        // ✅ [2026-02-08 FIX] 텍스트 위치 — 하단 근접 배치 (이전보다 더 아래)
        const yPosition = position === 'center'
            ? Math.floor((height - textBlockHeight) / 2)
            : height - textBlockHeight - Math.floor(padding * 0.3);

        // SVG 텍스트 오버레이 생성
        const svgOverlay = generateSVGOverlay({
            width,
            height,
            lines,
            fontSize,
            lineHeight,
            textColor,
            backgroundColor,
            fontFamily,
            padding,
            yPosition,
            textBlockHeight
        });

        // 이미지에 오버레이 합성
        const result = await image
            .composite([{
                input: Buffer.from(svgOverlay),
                top: 0,
                left: 0,
            }])
            .png()
            .toBuffer();

        return {
            success: true,
            outputBuffer: result
        };
    } catch (error: any) {
        console.error('[TextOverlay] 오류:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 이미지 파일에 텍스트 오버레이 추가 후 저장
 */
export async function addTextOverlayToFile(
    inputPath: string,
    outputPath: string,
    options: TextOverlayOptions
): Promise<TextOverlayResult> {
    try {
        const result = await addTextOverlay(inputPath, options);

        if (result.success && result.outputBuffer) {
            fs.writeFileSync(outputPath, result.outputBuffer);
            return {
                success: true,
                outputPath
            };
        }

        return result;
    } catch (error: any) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Base64 이미지에 텍스트 오버레이 추가
 */
export async function addTextOverlayToBase64(
    base64Data: string,
    options: TextOverlayOptions
): Promise<{ success: boolean; base64?: string; error?: string }> {
    try {
        // Base64 → Buffer
        const inputBuffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');

        const result = await addTextOverlay(inputBuffer, options);

        if (result.success && result.outputBuffer) {
            return {
                success: true,
                base64: `data:image/png;base64,${result.outputBuffer.toString('base64')}`
            };
        }

        return { success: false, error: result.error };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * 텍스트를 지정된 줄 수로 자동 줄바꿈
 */
function wrapText(text: string, maxLines: number, maxWidth: number): string[] {
    const cleanText = text.trim();

    // 텍스트가 매우 짧으면 그대로 반환
    if (cleanText.length <= 15) {
        return [cleanText];
    }

    // 한글 기준 대략적인 글자 수 계산 (폰트 크기 48px 기준, 글자당 약 30px)
    const charsPerLine = Math.floor(maxWidth / 30);

    // 단어 단위로 분리 (한글은 조사/어미에서 분리하기 어려우므로 글자 수 기준)
    const lines: string[] = [];
    let currentLine = '';

    // 공백이나 쉼표, 마침표 등에서 분리
    const segments = cleanText.split(/([,，.。!?·…\s]+)/);

    for (const segment of segments) {
        if (currentLine.length + segment.length <= charsPerLine) {
            currentLine += segment;
        } else {
            if (currentLine.trim()) {
                lines.push(currentLine.trim());
            }
            currentLine = segment.trim();

            // 최대 줄 수 도달
            if (lines.length >= maxLines - 1 && currentLine) {
                // 마지막 줄에 남은 텍스트 추가 (필요시 말줄임)
                const remaining = segments.slice(segments.indexOf(segment)).join('').trim();
                if (remaining.length > charsPerLine) {
                    lines.push(remaining.substring(0, charsPerLine - 3) + '...');
                } else {
                    lines.push(remaining);
                }
                return lines.slice(0, maxLines);
            }
        }
    }

    if (currentLine.trim()) {
        lines.push(currentLine.trim());
    }

    return lines.slice(0, maxLines);
}

/**
 * 폰트 크기 자동 계산
 * ✅ [2026-02-02] 폰트 크기 재조정 - 이미지 대비 적절한 크기로 수정
 */
function calculateFontSize(lines: string[], width: number, height: number): number {
    // ✅ [2026-02-02] 기본 크기 조정: 이미지 너비의 8% (기존 15%에서 축소)
    const baseSize = Math.floor(width * 0.08);

    // 가장 긴 줄 기준으로 조정
    const longestLine = Math.max(...lines.map(l => l.length));

    // 글자 수가 많으면 폰트 크기 축소
    let adjustedSize = baseSize;
    if (longestLine > 15) {
        adjustedSize = Math.floor(baseSize * 0.8);
    }
    if (longestLine > 25) {
        adjustedSize = Math.floor(baseSize * 0.65);
    }
    if (longestLine > 35) {
        adjustedSize = Math.floor(baseSize * 0.5);
    }

    // 줄 수가 많으면 폰트 크기 축소
    if (lines.length >= 3) {
        adjustedSize = Math.floor(adjustedSize * 0.85);
    }

    // ✅ [2026-02-02] 최소/최대 제한 조정 (최소 36px, 최대 100px)
    return Math.max(36, Math.min(100, adjustedSize));
}

/**
 * SVG 오버레이 생성
 */
function generateSVGOverlay(params: {
    width: number;
    height: number;
    lines: string[];
    fontSize: number;
    lineHeight: number;
    textColor: string;
    backgroundColor: string;
    fontFamily: string;
    padding: number;
    yPosition: number;
    textBlockHeight: number;
}): string {
    const {
        width, height, lines, fontSize, lineHeight,
        textColor, backgroundColor, fontFamily,
        padding, yPosition, textBlockHeight
    } = params;

    // 텍스트 라인 SVG 생성
    const textLines = lines.map((line, index) => {
        const y = yPosition + padding + (index + 0.8) * lineHeight;
        // XML 이스케이프 처리
        const escapedLine = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        return `
            <!-- ✅ [2026-02-08 FIX] 두꺼운 검은색 외곽선 (stroke-width 16) -->
            <text 
                x="50%" 
                y="${y}" 
                text-anchor="middle" 
                fill="none"
                stroke="black"
                stroke-width="16"
                stroke-linejoin="round"
                font-size="${fontSize}px"
                font-family="${fontFamily}"
                font-weight="900"
            >${escapedLine}</text>
            <!-- 메인 흰색 텍스트 (외곽선 위에 렌더링) -->
            <text 
                x="50%" 
                y="${y}" 
                text-anchor="middle" 
                fill="${textColor}"
                font-size="${fontSize}px"
                font-family="${fontFamily}"
                font-weight="900"
            >${escapedLine}</text>
        `;
    }).join('\n');

    // ✅ [2026-02-08 FIX] 오버레이 배경 제거 — 텍스트만 외곽선으로 표시
    return `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <!-- 텍스트만 (배경 오버레이 없음) -->
            ${textLines}
        </svg>
    `;
}

/**
 * 썸네일용 텍스트 오버레이 (기본 설정)
 */
export async function addThumbnailTextOverlay(
    input: string | Buffer,
    title: string
): Promise<TextOverlayResult> {
    return addTextOverlay(input, {
        text: title,
        position: 'bottom',
        maxLines: 3,
        textColor: 'white',
        padding: 40
    });
}
