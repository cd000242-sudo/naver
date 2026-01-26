const fs = require('fs');
const path = './src/renderer/renderer.ts';
let content = fs.readFileSync(path, 'utf8');
let changes = 0;

// 1. 이미지 소스 이름 표시 수정 (여러 곳)
const oldSourceName1 = `formData.imageSource === 'library' ? '이미지 라이브러리' : formData.imageSource === 'dalle' ? 'DALL-E' : 'Pexels'`;
const newSourceName1 = `formData.imageSource === 'library' ? '이미지 라이브러리' : formData.imageSource === 'dalle' ? 'DALL-E' : formData.imageSource === 'pollinations' ? 'Pollinations' : formData.imageSource === 'stability' ? 'Stability AI' : 'Pexels'`;
if (content.includes(oldSourceName1)) {
  content = content.replace(new RegExp(oldSourceName1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newSourceName1);
  changes++;
}

// 2. appendLog 이미지 소스 표시 수정
const oldSourceLog = `imageSource === 'dalle' ? 'DALL-E' : 'Pexels'`;
const newSourceLog = `imageSource === 'dalle' ? 'DALL-E' : imageSource === 'pollinations' ? 'Pollinations' : imageSource === 'stability' ? 'Stability AI' : 'Pexels'`;
if (content.includes(oldSourceLog)) {
  content = content.replace(new RegExp(oldSourceLog.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newSourceLog);
  changes++;
}

// 3. updateFullAutoImagePreview 소스 이름 수정
const oldPreviewSource = `imageSource === 'library' ? '이미지 라이브러리' : imageSource === 'dalle' ? 'DALL-E' : 'Pexels'`;
const newPreviewSource = `imageSource === 'library' ? '이미지 라이브러리' : imageSource === 'dalle' ? 'DALL-E' : imageSource === 'pollinations' ? 'Pollinations' : imageSource === 'stability' ? 'Stability AI' : 'Pexels'`;
if (content.includes(oldPreviewSource)) {
  content = content.replace(new RegExp(oldPreviewSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newPreviewSource);
  changes++;
}

// 4. 이미지 생성 분기 처리 수정 (dalle/pexels만 있던 것을 확장)
const oldBranch = `if (imageSource === 'dalle') {
            imageUrl = await generateDalleImage(heading.prompt);
          } else {
            imageUrl = await searchPexelsImage(heading.prompt);
          }`;
const newBranch = `if (imageSource === 'dalle') {
            imageUrl = await generateDalleImage(heading.prompt);
          } else if (imageSource === 'pollinations') {
            imageUrl = await generatePollinationsImage(heading.prompt);
          } else if (imageSource === 'stability') {
            imageUrl = await generateStabilityImage(heading.prompt);
          } else {
            imageUrl = await searchPexelsImage(heading.prompt);
          }`;
if (content.includes(oldBranch)) {
  content = content.replace(oldBranch, newBranch);
  changes++;
}

// 5. 재생성 로직도 수정 (isRegenerate 파라미터 추가된 버전)
const oldBranch2 = `if (imageSource === 'dalle') {
            imageUrl = await generateDalleImage(prompt);
        } else {
            imageUrl = await searchPexelsImage(prompt);
          }`;
const newBranch2 = `if (imageSource === 'dalle') {
            imageUrl = await generateDalleImage(prompt);
          } else if (imageSource === 'pollinations') {
            imageUrl = await generatePollinationsImage(prompt);
          } else if (imageSource === 'stability') {
            imageUrl = await generateStabilityImage(prompt);
        } else {
            imageUrl = await searchPexelsImage(prompt);
          }`;
if (content.includes(oldBranch2)) {
  content = content.replace(oldBranch2, newBranch2);
  changes++;
}

fs.writeFileSync(path, content, 'utf8');
console.log('✅ 이미지 처리 로직 수정 완료! (' + changes + '개 변경)');

