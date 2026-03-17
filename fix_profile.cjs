/**
 * crawlerBrowser.ts에서 프로필 ID '1' → 첫 번째 프로필 자동 선택으로 변경
 */
const fs = require('fs');
const f = 'src/crawler/crawlerBrowser.ts';
let lines = fs.readFileSync(f, 'utf8').split('\n');

// "const profileId = '1';" 찾기 → 자동 조회로 교체
for (let i = 150; i < 200; i++) {
  if (lines[i] && lines[i].includes("const profileId = '1'")) {
    // 여러 줄로 교체: listAdsPowerProfiles를 임포트하고 자동 조회
    const oldLine = lines[i];
    const indent = oldLine.match(/^(\s*)/)[1];
    
    lines[i] = [
      `${indent}// ✅ [2026-03-15] 첫 번째 프로필 자동 선택`,
      `${indent}const { listAdsPowerProfiles } = await import('../main/utils/adsPowerManager.js');`,
      `${indent}const profileList = await listAdsPowerProfiles();`,
      `${indent}const profileId = profileList.success && profileList.profiles.length > 0`,
      `${indent}    ? profileList.profiles[0].serial_number`,
      `${indent}    : '1'; // fallback`,
      `${indent}console.log('[CrawlerBrowser] 🎯 AdsPower 프로필 선택:', profileId);`,
    ].join('\n');
    
    console.log('✅ profileId 자동 선택으로 교체 (line', i+1 + ')');
    break;
  }
}

// import에 listAdsPowerProfiles 추가 확인
let importLine = -1;
for (let i = 20; i < 30; i++) {
  if (lines[i] && lines[i].includes("checkAdsPowerStatus")) {
    importLine = i;
    break;
  }
}
if (importLine > -1 && !lines.slice(importLine-2, importLine+3).join('\n').includes('listAdsPowerProfiles')) {
  // import 블록에 listAdsPowerProfiles 추가
  for (let i = importLine; i < importLine + 5; i++) {
    if (lines[i] && lines[i].includes('closeAdsPowerBrowser')) {
      lines[i] = lines[i].replace('closeAdsPowerBrowser', 'closeAdsPowerBrowser,\n  listAdsPowerProfiles');
      console.log('✅ listAdsPowerProfiles import 추가 (line', i+1 + ')');
      break;
    }
  }
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('\n✅ Done! 프로필 자동 선택 적용');
