const fs = require('fs');
const path = './src/renderer/renderer.ts';
let content = fs.readFileSync(path, 'utf8');
let changes = 0;

// 1. stabilityApiKey 변수 선언 추가
const oldDecl = `const pixabayApiKey = document.getElementById('pixabay-api-key') as HTMLInputElement;
  const naverDatalabClientId = document.getElementById('naver-datalab-client-id') as HTMLInputElement;`;
const newDecl = `const pixabayApiKey = document.getElementById('pixabay-api-key') as HTMLInputElement;
  const stabilityApiKey = document.getElementById('stability-api-key') as HTMLInputElement;
  const naverDatalabClientId = document.getElementById('naver-datalab-client-id') as HTMLInputElement;`;
if (content.includes(oldDecl)) {
  content = content.replace(oldDecl, newDecl);
  changes++;
  console.log('✅ stabilityApiKey 변수 선언 추가');
}

// 2. 배포용 빈 값 처리에 stabilityApiKey 추가
const oldEmpty = `if (pixabayApiKey) pixabayApiKey.value = '';
      if (naverDatalabClientId) naverDatalabClientId.value = '';`;
const newEmpty = `if (pixabayApiKey) pixabayApiKey.value = '';
      if (stabilityApiKey) stabilityApiKey.value = '';
      if (naverDatalabClientId) naverDatalabClientId.value = '';`;
if (content.includes(oldEmpty)) {
  content = content.replace(oldEmpty, newEmpty);
  changes++;
  console.log('✅ 배포용 빈 값 처리 추가');
}

// 3. disabled 처리 배열에 stabilityApiKey 추가
const oldArr = `[geminiApiKey, openaiApiKey, claudeApiKey, pexelsApiKey, unsplashApiKey, pixabayApiKey, naverDatalabClientId, naverDatalabClientSecret]`;
const newArr = `[geminiApiKey, openaiApiKey, claudeApiKey, pexelsApiKey, unsplashApiKey, pixabayApiKey, stabilityApiKey, naverDatalabClientId, naverDatalabClientSecret]`;
if (content.includes(oldArr)) {
  content = content.replace(new RegExp(oldArr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newArr);
  changes++;
  console.log('✅ disabled 배열에 추가');
}

// 4. 설정 로드에 stabilityApiKey 추가
const oldLoad = `if (pixabayApiKey) pixabayApiKey.value = config.pixabayApiKey || '';
    if (naverDatalabClientId) naverDatalabClientId.value = config.naverDatalabClientId || '';`;
const newLoad = `if (pixabayApiKey) pixabayApiKey.value = config.pixabayApiKey || '';
    if (stabilityApiKey) stabilityApiKey.value = config.stabilityApiKey || '';
    if (naverDatalabClientId) naverDatalabClientId.value = config.naverDatalabClientId || '';`;
if (content.includes(oldLoad)) {
  content = content.replace(oldLoad, newLoad);
  changes++;
  console.log('✅ 설정 로드에 추가');
}

// 5. 설정 저장에 stabilityApiKey 추가
const oldSave = `pixabayApiKey: pixabayApiKey?.value.trim() || undefined,
            naverDatalabClientId: naverDatalabClientId?.value.trim() || undefined,`;
const newSave = `pixabayApiKey: pixabayApiKey?.value.trim() || undefined,
            stabilityApiKey: stabilityApiKey?.value.trim() || undefined,
            naverDatalabClientId: naverDatalabClientId?.value.trim() || undefined,`;
if (content.includes(oldSave)) {
  content = content.replace(oldSave, newSave);
  changes++;
  console.log('✅ 설정 저장에 추가');
}

fs.writeFileSync(path, content, 'utf8');
console.log('✅ Stability API 키 처리 완료! (' + changes + '개 변경)');
























