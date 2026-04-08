/**
 * 토스페이먼츠 결제경로 PPT 생성 스크립트 v3
 * - 이미지 슬라이드 전체 크기
 * - 목차 세로 정렬
 * - jpg/png 자동 감지
 */
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const pptx = new PptxGenJS();

pptx.author = 'Leaders Pro';
pptx.company = 'Leaders Pro';
pptx.subject = '토스페이먼츠 빌링결제 심사 - 결제경로 파일';
pptx.title = 'Leaders Pro 결제경로';
pptx.layout = 'LAYOUT_WIDE';

const SCREENSHOT_DIR = path.join(__dirname, 'ppt_screenshots');
const now = new Date();
const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
const captureInfo = `캡처 일시: ${dateStr} ${timeStr}`;

/** 이미지 파일 찾기 (jpg/png/jpeg 자동 감지) */
function findImage(baseName) {
  const exts = ['.png', '.jpg', '.jpeg', '.webp'];
  for (const ext of exts) {
    const p = path.join(SCREENSHOT_DIR, baseName + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 슬라이드 데이터
const slides = [
  {
    num: '01',
    title: '1. 메인 페이지 (랜딩)',
    url: 'https://www.leaderspro.kr/',
    base: '01_homepage'
  },
  {
    num: '02',
    title: '2. 제품 소개 페이지',
    url: 'https://www.leaderspro.kr/products.html',
    base: '02_products'
  },
  {
    num: '03',
    title: '3. 요금제 페이지 — 플랜 목록',
    url: 'https://www.leaderspro.kr/pricing.html',
    base: '03_pricing'
  },
  {
    num: '04',
    title: '4. 요금제 페이지 — 플랜 선택 및 결제 진행',
    url: 'https://www.leaderspro.kr/pricing.html',
    base: '04_plan_selected'
  },
  {
    num: '05',
    title: '5. 토스페이먼츠 결제창 (빌링키 등록)',
    url: 'https://www.leaderspro.kr/pricing.html → 토스페이먼츠 위젯',
    base: '05_toss_payment'
  },
  {
    num: '06',
    title: '6. 결제 완료 및 라이선스 발급',
    url: 'https://www.leaderspro.kr/pricing.html → 결제 완료',
    base: '06_payment_complete'
  }
];

// ===== 표지 슬라이드 =====
const coverSlide = pptx.addSlide();
coverSlide.background = { color: '0a0a0f' };

// 골드 라인 상단
coverSlide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: '100%', h: 0.06,
  fill: { color: 'c9a84c' }
});

coverSlide.addText('Leaders Pro', {
  x: 0.5, y: 1.5, w: '92%', h: 1.0,
  fontSize: 48, fontFace: 'Arial',
  color: 'c9a84c', bold: true,
  align: 'center'
});
coverSlide.addText('결제경로 안내서', {
  x: 0.5, y: 2.5, w: '92%', h: 0.8,
  fontSize: 32, fontFace: 'Arial',
  color: 'e8e6e3',
  align: 'center'
});

// 구분선
coverSlide.addShape(pptx.ShapeType.rect, {
  x: 4.5, y: 3.6, w: 4.3, h: 0.02,
  fill: { color: '333333' }
});

coverSlide.addText('토스페이먼츠 빌링결제 카드사 심사용', {
  x: 0.5, y: 3.9, w: '92%', h: 0.5,
  fontSize: 16, fontFace: 'Arial',
  color: '8a8686', align: 'center'
});
coverSlide.addText(
  `사이트  https://www.leaderspro.kr\n${captureInfo}\n제출자  박성현 (cd000242@gmail.com)`, {
  x: 0.5, y: 5.0, w: '92%', h: 1.5,
  fontSize: 13, fontFace: 'Arial',
  color: '666666', align: 'center', lineSpacingMultiple: 1.8
});

// 골드 라인 하단
coverSlide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 7.44, w: '100%', h: 0.06,
  fill: { color: 'c9a84c' }
});


// ===== 목차 슬라이드 (세로 정렬) =====
const tocSlide = pptx.addSlide();
tocSlide.background = { color: '0a0a0f' };

// 골드 라인
tocSlide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: '100%', h: 0.06,
  fill: { color: 'c9a84c' }
});

tocSlide.addText('목차', {
  x: 0.8, y: 0.5, w: 5, h: 0.7,
  fontSize: 28, fontFace: 'Arial',
  color: 'c9a84c', bold: true
});

// 구분선
tocSlide.addShape(pptx.ShapeType.rect, {
  x: 0.8, y: 1.3, w: 11.7, h: 0.01,
  fill: { color: '2a2a35' }
});

// 목차 항목 — 세로로 균등 배치
const tocStartY = 1.7;
const tocRowH = 0.85;

slides.forEach((s, i) => {
  const y = tocStartY + (i * tocRowH);
  
  // 번호 원형 배경
  tocSlide.addShape(pptx.ShapeType.ellipse, {
    x: 1.2, y: y + 0.08, w: 0.5, h: 0.5,
    fill: { color: '1a1a22' },
    line: { color: 'c9a84c', width: 1.5 }
  });
  
  // 번호
  tocSlide.addText(String(i + 1), {
    x: 1.2, y: y + 0.08, w: 0.5, h: 0.5,
    fontSize: 16, fontFace: 'Arial',
    color: 'c9a84c', bold: true,
    align: 'center', valign: 'middle'
  });
  
  // 제목
  tocSlide.addText(s.title.replace(/^\d+\.\s*/, ''), {
    x: 2.0, y: y, w: 8.0, h: 0.65,
    fontSize: 17, fontFace: 'Arial',
    color: 'e8e6e3', valign: 'middle'
  });
  
  // URL (작게)
  tocSlide.addText(s.url.split(' →')[0], {
    x: 10.0, y: y, w: 3.0, h: 0.65,
    fontSize: 9, fontFace: 'Consolas',
    color: '555555', align: 'right', valign: 'middle'
  });
  
  // 구분선
  if (i < slides.length - 1) {
    tocSlide.addShape(pptx.ShapeType.rect, {
      x: 1.2, y: y + tocRowH - 0.1, w: 11.3, h: 0.005,
      fill: { color: '1a1a22' }
    });
  }
});


// ===== 각 결제 경로 슬라이드 =====
slides.forEach((slideData) => {
  const slide = pptx.addSlide();
  slide.background = { color: '0a0a0f' };
  
  // 상단 바
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.8,
    fill: { color: '111116' }
  });
  
  // 골드 라인
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0.8, w: '100%', h: 0.02,
    fill: { color: 'c9a84c' }
  });
  
  // 제목
  slide.addText(slideData.title, {
    x: 0.4, y: 0.08, w: 7.5, h: 0.35,
    fontSize: 15, fontFace: 'Arial',
    color: 'c9a84c', bold: true
  });
  
  // URL
  slide.addText(slideData.url, {
    x: 0.4, y: 0.4, w: 7.5, h: 0.3,
    fontSize: 9, fontFace: 'Consolas',
    color: '44d7b6'
  });
  
  // 캡처 시간
  slide.addText(captureInfo, {
    x: 8.5, y: 0.08, w: 4.5, h: 0.62,
    fontSize: 9, fontFace: 'Arial',
    color: '666666', align: 'right', valign: 'middle'
  });
  
  // ★ 스크린샷 이미지
  const imgPath = findImage(slideData.base);
  if (imgPath) {
    const imgSize = fs.statSync(imgPath).size;
    console.log(`  📷 ${slideData.base}: ${path.basename(imgPath)} (${(imgSize/1024).toFixed(1)}KB)`);
    
    if (imgSize < 20000) {
      console.log(`  ⚠️  경고: 파일 크기가 ${(imgSize/1024).toFixed(1)}KB로 매우 작습니다. 화질이 낮을 수 있습니다.`);
    }
    
    slide.addImage({
      path: imgPath,
      x: 0.15, y: 0.95, w: 13.0, h: 6.4,
      sizing: { type: 'contain', w: 13.0, h: 6.4 }
    });
  } else {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 2.5, y: 2.5, w: 8.0, h: 3.0,
      fill: { color: '1a1a22' },
      line: { color: 'ff4444', width: 2 },
      rectRadius: 0.15
    });
    slide.addText(
      `⚠️ 이미지 파일을 찾을 수 없습니다\n\n` +
      `파일명: ${slideData.base}.png 또는 .jpg\n` +
      `경로: ppt_screenshots/`, {
      x: 2.5, y: 2.5, w: 8.0, h: 3.0,
      fontSize: 14, color: 'ff6666', align: 'center', valign: 'middle',
      lineSpacingMultiple: 1.5
    });
  }
});


// ===== 부록: 서비스 구조 =====
const structSlide = pptx.addSlide();
structSlide.background = { color: '0a0a0f' };

structSlide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: '100%', h: 0.8,
  fill: { color: '111116' }
});
structSlide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0.8, w: '100%', h: 0.02,
  fill: { color: 'c9a84c' }
});
structSlide.addText('부록: 서비스 제공 방식 및 구독 구조', {
  x: 0.4, y: 0.08, w: '90%', h: 0.62,
  fontSize: 15, fontFace: 'Arial',
  color: 'c9a84c', bold: true, valign: 'middle'
});

// 좌측: 정기구독 구조
structSlide.addShape(pptx.ShapeType.roundRect, {
  x: 0.3, y: 1.1, w: 6.2, h: 5.8,
  fill: { color: '111116' },
  line: { color: '2a2a35', width: 1 },
  rectRadius: 0.1
});
structSlide.addText('정기구독 결제 구조', {
  x: 0.6, y: 1.3, w: 5.6, h: 0.5,
  fontSize: 15, fontFace: 'Arial',
  color: 'c9a84c', bold: true
});
structSlide.addText(
  '• 결제 방식\n'
  + '  토스페이먼츠 빌링결제 (자동 정기결제)\n\n'
  + '• 구독 주기\n'
  + '  1개월 / 3개월 / 1년 선택\n\n'
  + '• 갱신 방식\n'
  + '  선택한 주기마다 빌링키 기반 자동 카드 결제\n\n'
  + '• 해지 방법\n'
  + '  고객지원을 통해 언제든 해지 가능\n\n'
  + '• 구독 해지 시\n'
  + '  남은 기간까지 사용 → 만료 후 자동 비활성화',
  {
    x: 0.6, y: 1.9, w: 5.6, h: 4.8,
    fontSize: 12, fontFace: 'Arial',
    color: 'e8e6e3', valign: 'top',
    lineSpacingMultiple: 1.35
  }
);

// 우측: 라이선스 코드
structSlide.addShape(pptx.ShapeType.roundRect, {
  x: 6.8, y: 1.1, w: 6.2, h: 5.8,
  fill: { color: '111116' },
  line: { color: '2a2a35', width: 1 },
  rectRadius: 0.1
});
structSlide.addText('라이선스 코드 역할', {
  x: 7.1, y: 1.3, w: 5.6, h: 0.5,
  fontSize: 15, fontFace: 'Arial',
  color: 'c9a84c', bold: true
});
structSlide.addText(
  '• 라이선스 코드란?\n'
  + '  데스크톱 앱(Electron) 활성화용 인증키\n'
  + '  결제 완료 시 자동 생성 → 이메일 발송\n\n'
  + '• 구독 중\n'
  + '  자동 갱신 결제 시 라이선스 유효기간 연장\n'
  + '  동일 코드로 계속 사용 가능\n\n'
  + '• 구독 만료 시\n'
  + '  앱 실행 → 서버 검증(verify-license API)\n'
  + '  → 만료 확인 → 기능 제한 → 재결제 안내\n\n'
  + '→ 빌링키 기반 자동 정기결제이며,\n'
  + '  라이선스 코드는 앱 인증 수단입니다.\n'
  + '  해지 시 서버에서 자동 회수됩니다.',
  {
    x: 7.1, y: 1.9, w: 5.6, h: 4.8,
    fontSize: 12, fontFace: 'Arial',
    color: 'e8e6e3', valign: 'top',
    lineSpacingMultiple: 1.35
  }
);


// ===== PPT 저장 =====
const outputPath = path.join(__dirname, 'LeadersPro_결제경로.pptx');
pptx.writeFile({ fileName: outputPath })
  .then(() => {
    console.log('\n✅ PPT 생성 완료:', outputPath);
    
    // 경고 체크
    let hasWarning = false;
    slides.forEach(s => {
      const p = findImage(s.base);
      if (!p) {
        console.log(`❌ 누락: ${s.base}`);
        hasWarning = true;
      } else {
        const size = fs.statSync(p).size;
        if (size < 20000) {
          console.log(`⚠️  화질 경고: ${s.base} — ${(size/1024).toFixed(0)}KB (최소 100KB+ 권장)`);
          hasWarning = true;
        }
      }
    });
    if (!hasWarning) {
      console.log('🎉 모든 이미지가 고화질로 포함되었습니다!');
    }
  })
  .catch(err => {
    console.error('❌ PPT 생성 실패:', err);
  });
