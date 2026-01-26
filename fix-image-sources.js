const fs = require('fs');
const path = './src/renderer/renderer.ts';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `// Pexels 이미지 검색
async function searchPexelsImage(prompt: string): Promise<string> {
  const response = await window.api.generateImages({
    provider: 'pexels',
    items: [{ heading: 'image', prompt: prompt }]
  });
  if (!response.success || !response.images || response.images.length === 0) {
    throw new Error(response.message || 'Pexels 이미지 검색 실패');
  }
  return response.images[0].filePath;
}


// 빠른 액션 함수들`;

const newCode = `// Pexels 이미지 검색
async function searchPexelsImage(prompt: string, isRegenerate: boolean = false): Promise<string> {
  const response = await window.api.generateImages({
    provider: 'pexels',
    items: [{ heading: 'image', prompt: prompt }],
    regenerate: isRegenerate
  });
  if (!response.success || !response.images || response.images.length === 0) {
    throw new Error(response.message || 'Pexels 이미지 검색 실패');
  }
  return response.images[0].filePath;
}

// ✅ Pollinations 이미지 생성 (무료, API 키 불필요)
async function generatePollinationsImage(prompt: string, isRegenerate: boolean = false): Promise<string> {
  const response = await window.api.generateImages({
    provider: 'pollinations',
    items: [{ heading: 'image', prompt: prompt }],
    regenerate: isRegenerate
  });
  if (!response.success || !response.images || response.images.length === 0) {
    throw new Error(response.message || 'Pollinations 이미지 생성 실패');
  }
  return response.images[0].filePath;
}

// ✅ Stability AI 이미지 생성
async function generateStabilityImage(prompt: string, isRegenerate: boolean = false): Promise<string> {
  const response = await window.api.generateImages({
    provider: 'stability',
    items: [{ heading: 'image', prompt: prompt }],
    regenerate: isRegenerate
  });
  if (!response.success || !response.images || response.images.length === 0) {
    throw new Error(response.message || 'Stability AI 이미지 생성 실패');
  }
  return response.images[0].filePath;
}


// 빠른 액션 함수들`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(path, content, 'utf8');
  console.log('✅ Pollinations/Stability 함수 추가 완료!');
} else {
  console.log('❌ 패턴을 찾을 수 없습니다.');
  if (content.includes("generatePollinationsImage")) {
    console.log("generatePollinationsImage 이미 존재합니다.");
  }
}
























