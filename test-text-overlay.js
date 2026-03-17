/**
 * 텍스트 오버레이 테스트 스크립트
 * 생성된 이미지에 텍스트를 오버레이하는 기능 테스트
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 테스트용 이미지 경로 (PuLID 테스트에서 생성된 이미지 사용)
const testImageDir = path.join(process.env.TEMP, 'pulid_single_1769756382371');

async function testTextOverlay() {
    console.log('🎨 텍스트 오버레이 테스트 시작\n');

    // 1. 테스트 이미지 찾기
    let testImagePath = null;
    if (fs.existsSync(testImageDir)) {
        const files = fs.readdirSync(testImageDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
        if (files.length > 0) {
            testImagePath = path.join(testImageDir, files[0]);
        }
    }

    // 테스트 이미지가 없으면 샘플 생성
    if (!testImagePath) {
        console.log('⚠️ 테스트 이미지 없음, 샘플 생성...');
        const sampleDir = path.join(process.env.TEMP, 'overlay_test_' + Date.now());
        fs.mkdirSync(sampleDir, { recursive: true });

        // 1024x1024 그라데이션 샘플 이미지 생성
        const width = 1024, height = 1024;
        const gradient = Buffer.alloc(width * height * 3);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 3;
                gradient[i] = Math.floor((x / width) * 100 + 50);     // R
                gradient[i + 1] = Math.floor((y / height) * 100 + 80); // G
                gradient[i + 2] = 150;                                  // B
            }
        }

        testImagePath = path.join(sampleDir, 'sample.png');
        await sharp(gradient, { raw: { width, height, channels: 3 } })
            .png()
            .toFile(testImagePath);
        console.log('   ✅ 샘플 이미지 생성:', testImagePath);
    }

    console.log('📷 테스트 이미지:', testImagePath);

    // 2. 다양한 텍스트 오버레이 테스트
    const testCases = [
        { name: 'short', text: '짧은 제목' },
        { name: 'medium', text: '차은우 200억 추징금 논란' },
        { name: 'long', text: '차은우 200억 추징금 논란, 국세청이 지목한 어머니 회사의 숨겨진 실체' },
        { name: 'multiline', text: '황정민 병환 중에도 황하나 치아 깨지고 피부 망가져도... 아버지가 결국 무너진 진짜 이유' }
    ];

    const outputDir = path.join(process.env.TEMP, 'overlay_results_' + Date.now());
    fs.mkdirSync(outputDir, { recursive: true });

    for (const tc of testCases) {
        console.log(`\n🔧 [${tc.name}] "${tc.text.substring(0, 30)}..."`);

        try {
            const inputBuffer = fs.readFileSync(testImagePath);
            const metadata = await sharp(inputBuffer).metadata();
            const width = metadata.width || 1024;
            const height = metadata.height || 1024;

            // 텍스트 줄바꿈 (최대 3줄)
            const lines = wrapText(tc.text, 3, Math.floor(width * 0.8));
            const fontSize = calculateFontSize(lines, width, height);
            const lineHeight = fontSize * 1.4;
            const textBlockHeight = lines.length * lineHeight + 80;
            const yPosition = height - textBlockHeight - 40;

            // SVG 오버레이 생성
            const svgOverlay = generateSVGOverlay({
                width, height, lines, fontSize, lineHeight,
                textColor: 'white',
                yPosition, textBlockHeight
            });

            // 합성
            const output = await sharp(inputBuffer)
                .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
                .png()
                .toFile(path.join(outputDir, `${tc.name}.png`));

            console.log(`   ✅ 저장 완료: ${tc.name}.png`);
        } catch (e) {
            console.log(`   ❌ 실패: ${e.message}`);
        }
    }

    console.log(`\n📁 결과 폴더: ${outputDir}`);
    require('child_process').exec(`explorer "${outputDir}"`);
}

// 텍스트 줄바꿈
function wrapText(text, maxLines, maxWidth) {
    const cleanText = text.trim();
    if (cleanText.length <= 15) return [cleanText];

    const charsPerLine = Math.floor(maxWidth / 30);
    const lines = [];
    let currentLine = '';

    const segments = cleanText.split(/([,，.。!?·…\s]+)/);

    for (const segment of segments) {
        if (currentLine.length + segment.length <= charsPerLine) {
            currentLine += segment;
        } else {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = segment.trim();

            if (lines.length >= maxLines - 1 && currentLine) {
                lines.push(currentLine.substring(0, charsPerLine - 3) + '...');
                return lines.slice(0, maxLines);
            }
        }
    }

    if (currentLine.trim()) lines.push(currentLine.trim());
    return lines.slice(0, maxLines);
}

// 폰트 크기 계산
function calculateFontSize(lines, width, height) {
    const baseSize = Math.floor(width * 0.055);
    const longestLine = Math.max(...lines.map(l => l.length));

    let adjustedSize = baseSize;
    if (longestLine > 20) adjustedSize = Math.floor(baseSize * 0.85);
    if (longestLine > 30) adjustedSize = Math.floor(baseSize * 0.7);
    if (lines.length >= 3) adjustedSize = Math.floor(adjustedSize * 0.9);

    return Math.max(32, Math.min(72, adjustedSize));
}

// SVG 생성
function generateSVGOverlay(params) {
    const { width, height, lines, fontSize, lineHeight, textColor, yPosition, textBlockHeight } = params;

    const textLines = lines.map((line, index) => {
        const y = yPosition + 40 + (index + 0.8) * lineHeight;
        const escapedLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<text x="50%" y="${y}" text-anchor="middle" fill="${textColor}" font-size="${fontSize}px" font-family="Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif" font-weight="bold" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.6);">${escapedLine}</text>`;
    }).join('\n');

    return `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:rgba(0,0,0,0);stop-opacity:0" />
                    <stop offset="40%" style="stop-color:rgba(0,0,0,0);stop-opacity:0" />
                    <stop offset="100%" style="stop-color:rgba(0,0,0,0.75);stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect x="0" y="${height * 0.5}" width="${width}" height="${height * 0.5}" fill="url(#bgGradient)" />
            ${textLines}
        </svg>
    `;
}

testTextOverlay().catch(console.error);
