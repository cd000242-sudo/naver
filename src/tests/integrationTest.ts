import { generateStructuredContent, type ContentSource } from '../contentGenerator';
import { NaverBlogAutomation } from '../naverBlogAutomation';
import { generateImages } from '../imageGenerator';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Electron 없이 imageLibrary 함수 사용을 위한 래퍼
async function getLibraryImagesForTest(category?: string, titleKeywords?: string[]): Promise<any[]> {
  const userDataPath = process.env.APPDATA || 
    (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : 
     path.join(os.homedir(), '.config'));
  const libraryDir = path.join(userDataPath, 'naver-blog-automation', 'image-library');
  const metadataPath = path.join(libraryDir, 'library-metadata.json');
  
  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    let images = JSON.parse(raw);
    
    // 카테고리 필터
    if (category) {
      images = images.filter((img: any) => img.category === category);
    }
    
    return images;
  } catch {
    return [];
  }
}

function filterImagesByKeywordsForTest(images: any[], keywords: string[]): any[] {
  if (keywords.length === 0) {
    return images;
  }
  
  // 간단한 키워드 매칭 (실제 로직과 유사)
  const scoredImages = images.map((image) => {
    let score = 0;
    const imageText = [
      image.category || '',
      image.sourceTitle || '',
      ...(image.tags || []),
    ].join(' ').toLowerCase();
    
    let matchedKeywords = 0;
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (imageText.includes(lowerKeyword)) {
        score += 10;
        matchedKeywords++;
      }
    }
    
    return { image, score, matchedKeywords };
  });
  
  // 점수가 10 이상이고, 최소 1개 이상의 키워드가 매칭된 이미지만 필터링
  const relevantImages = scoredImages
    .filter((item) => item.score >= 10 && item.matchedKeywords > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.image);
  
  // 필터링 결과가 없으면 전체 이미지 반환
  if (relevantImages.length === 0) {
    return images;
  }
  
  return relevantImages;
}

// Electron 없이 설정 로드
async function loadConfigForTest(): Promise<any> {
  const userDataPath = process.env.APPDATA || 
    (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : 
     path.join(os.homedir(), '.config'));
  const configPath = path.join(userDataPath, 'naver-blog-automation', 'settings.json');
  
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // 설정 파일이 없으면 환경변수에서 직접 로드 시도
    return {
      geminiApiKey: process.env.GEMINI_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      claudeApiKey: process.env.CLAUDE_API_KEY,
      pexelsApiKey: process.env.PEXELS_API_KEY,
      savedNaverId: process.env.NAVER_ID,
      savedNaverPassword: process.env.NAVER_PASSWORD,
    };
  }
}

function applyConfigToEnvForTest(config: any): void {
  if (config.geminiApiKey) process.env.GEMINI_API_KEY = config.geminiApiKey;
  if (config.openaiApiKey) process.env.OPENAI_API_KEY = config.openaiApiKey;
  if (config.claudeApiKey) process.env.CLAUDE_API_KEY = config.claudeApiKey;
  if (config.pexelsApiKey) process.env.PEXELS_API_KEY = config.pexelsApiKey;
  if (config.savedNaverId) process.env.NAVER_ID = config.savedNaverId;
  if (config.savedNaverPassword) process.env.NAVER_PASSWORD = config.savedNaverPassword;
  if (config.authorName) process.env.AUTHOR_NAME = config.authorName;
}

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  details?: any;
}

const testResults: TestResult[] = [];

function logTest(step: string, success: boolean, message: string, details?: any) {
  testResults.push({ step, success, message, details });
  const icon = success ? '✅' : '❌';
  console.log(`${icon} [${step}] ${message}`);
  if (details && !success) {
    console.error('   상세:', details);
  }
}

async function testConfigLoad(): Promise<boolean> {
  try {
    const config = await loadConfigForTest();
    applyConfigToEnvForTest(config);
    
    const hasApiKey = 
      !!process.env.GEMINI_API_KEY || 
      !!process.env.OPENAI_API_KEY || 
      !!process.env.CLAUDE_API_KEY;
    
    if (!hasApiKey) {
      logTest('Config', false, 'API 키가 설정되어 있지 않습니다. settings.json 파일을 확인하세요.');
      return false;
    }
    
    logTest('Config', true, 'API 키 로드 완료', {
      gemini: !!process.env.GEMINI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      claude: !!process.env.CLAUDE_API_KEY,
    });
    return true;
  } catch (error) {
    logTest('Config', false, '설정 로드 실패', error);
    return false;
  }
}

async function testContentGeneration(): Promise<{ success: boolean; content?: any }> {
  try {
    // 테스트용 소스 데이터
    const testSource: ContentSource = {
      sourceType: 'custom_text',
      rawText: `임하룡 배우가 송승환의 유튜브 채널 '원더풀라이프'에 출연해서 재미있는 에피소드를 공개했다. 
      
임하룡은 KBS 특채 코미디언으로 데뷔해서 '봉숭아 학당'에서 선생님 역할로 큰 사랑을 받았다. 
그런데 코미디 프로그램들이 하나둘씩 사라지면서 설 자리를 잃게 되었다. 
그래서 장진 감독, 명계남 선배 등 영화계 인사들을 찾아가 배우의 길을 걷게 되었다.

배우로 전향한 지 3년 만에 영화 '웰컴 투 동막골'로 청룡영화제 남우조연상을 받았다.

재미있는 에피소드가 있다. 임하룡은 원래 개그맨들 사이에서는 형, 동생 하면서 편하게 지냈는데, 
배우들은 호칭 문화가 다르다는 걸 모르고 있었다. 
어느 날, 박근형 선배에게 '형님'이라고 불렀더니 엄청 놀랐다는 거다! 
오지명 선배도 마찬가지였다고 한다. 배우들은 나이 차이가 많이 나도 '선배님'이라고 부른다고 한다.`,
      categoryHint: '연예',
      generator: process.env.GEMINI_API_KEY ? 'gemini' : 
                 process.env.OPENAI_API_KEY ? 'openai' : 
                 process.env.CLAUDE_API_KEY ? 'claude' : 'gemini',
    };

    logTest('Content Generation', true, '콘텐츠 생성 시작...');
    
    const content = await generateStructuredContent(testSource, {
      minChars: 1000,
    });

    // 검증
    if (!content.selectedTitle) {
      logTest('Content Generation', false, '제목이 생성되지 않았습니다.');
      return { success: false };
    }

    if (!content.bodyPlain || content.bodyPlain.trim().length < 500) {
      logTest('Content Generation', false, `본문이 너무 짧습니다. (${content.bodyPlain?.length || 0}자)`);
      return { success: false };
    }

    if (!content.headings || content.headings.length < 5) {
      logTest('Content Generation', false, `소제목이 부족합니다. (${content.headings?.length || 0}개, 최소 5개 필요)`);
      return { success: false };
    }
    
    // 이스케이프 문자 노출 확인
    if (content.bodyPlain && (content.bodyPlain.includes('\\n') || content.bodyPlain.includes('\\t') || content.bodyPlain.includes('\\r'))) {
      logTest('Content Generation', false, '본문에 이스케이프 문자가 노출되었습니다. (\\n, \\t, \\r 등)');
      // 자동 정리 시도
      content.bodyPlain = content.bodyPlain.replace(/\\([nrtbf])/g, ' ').replace(/\\\\/g, '');
      logTest('Content Generation', true, '이스케이프 문자를 자동으로 정리했습니다.');
    }

    // 본문이 headings와 연결되어 있는지 확인
    const bodyText = content.bodyPlain.toLowerCase();
    const bodyLength = content.bodyPlain.length;
    
    // 각 heading에 대한 본문 내용이 있는지 확인
    let headingMatches = 0;
    const headingDetails: any[] = [];
    
    for (const heading of content.headings) {
      const headingTitle = heading.title.toLowerCase();
      const headingKeywords = heading.keywords?.map(k => k.toLowerCase()) || [];
      const headingSummary = heading.summary?.toLowerCase() || '';
      
      // heading title이나 keywords가 본문에 포함되어 있는지 확인
      const hasTitleMatch = bodyText.includes(headingTitle) || 
                           headingTitle.split(/\s+/).some(word => word.length > 2 && bodyText.includes(word));
      const hasKeywordMatch = headingKeywords.some(keyword => bodyText.includes(keyword));
      const hasSummaryMatch = headingSummary.split(/\s+/).some(word => word.length > 3 && bodyText.includes(word));
      
      const isMatched = hasTitleMatch || hasKeywordMatch || hasSummaryMatch;
      if (isMatched) headingMatches++;
      
      headingDetails.push({
        title: heading.title,
        matched: isMatched,
        hasTitle: hasTitleMatch,
        hasKeyword: hasKeywordMatch,
        hasSummary: hasSummaryMatch,
      });
    }

    const matchRatio = headingMatches / content.headings.length;
    if (matchRatio < 0.5) {
      logTest('Content Generation', false, 
        `본문이 소제목과 충분히 연결되지 않았습니다. (${headingMatches}/${content.headings.length} 매칭, ${(matchRatio * 100).toFixed(1)}%)`,
        headingDetails);
    } else {
      logTest('Content Generation', true, 
        `본문과 소제목 연결 확인: ${headingMatches}/${content.headings.length} 매칭 (${(matchRatio * 100).toFixed(1)}%)`);
    }

    // 본문 길이 확인
    if (bodyLength < 1000) {
      logTest('Content Generation', false, `본문이 너무 짧습니다. (${bodyLength}자, 최소 1000자 필요)`);
    } else {
      logTest('Content Generation', true, `본문 길이 확인: ${bodyLength}자`);
    }

    logTest('Content Generation', true, '콘텐츠 생성 완료', {
      title: content.selectedTitle,
      bodyLength: content.bodyPlain.length,
      headingsCount: content.headings.length,
      hashtagsCount: content.hashtags?.length || 0,
    });

    return { success: true, content };
  } catch (error) {
    logTest('Content Generation', false, '콘텐츠 생성 실패', error);
    return { success: false };
  }
}

async function testImageGeneration(content: any): Promise<{ success: boolean; generatedImages?: any[] }> {
  try {
    logTest('Image Generation', true, 'AI 이미지 생성 테스트 시작...');
    
    if (!content.headings || content.headings.length === 0) {
      logTest('Image Generation', false, '소제목이 없어 이미지 생성을 할 수 없습니다.');
      return { success: false };
    }
    
    // OpenAI API 키 확인
    if (!process.env.OPENAI_API_KEY) {
      logTest('Image Generation', false, 'OpenAI API 키가 설정되지 않았습니다. (DALL-E 이미지 생성 스킵)');
      return { success: false };
    }
    
    // 테스트 환경 설정
    const userDataPath = process.env.APPDATA || 
      (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : 
       path.join(os.homedir(), '.config'));
    const generatedImagesDir = path.join(userDataPath, 'naver-blog-automation', 'generated-images');
    await fs.mkdir(generatedImagesDir, { recursive: true });
    process.env.TEST_MODE = 'true';
    process.env.GENERATED_IMAGES_DIR = generatedImagesDir;
    
    // 첫 2개 소제목에 대해서만 테스트 (비용 절감)
    const testHeadings = content.headings.slice(0, 2);
    const imageRequests = testHeadings.map((heading: any) => ({
      heading: heading.title,
      prompt: heading.imagePrompt || `DSLR photo of ${heading.title}, natural lighting, premium aesthetic`,
    }));
    
    logTest('Image Generation', true, `${testHeadings.length}개 소제목에 대한 이미지 생성 시작...`);
    logTest('Image Generation', true, `⚠️ DALL-E API 호출 시 비용이 발생할 수 있습니다.`);
    
    try {
      const generatedImages = await generateImages({
        provider: 'dalle',
        items: imageRequests,
      });
      
      if (!generatedImages || generatedImages.length === 0) {
        logTest('Image Generation', false, '이미지 생성에 실패했습니다.');
        return { success: false };
      }
      
      // 생성된 이미지 파일이 실제로 존재하는지 확인
      let validImages = 0;
      for (const image of generatedImages) {
        try {
          await fs.access(image.filePath);
          validImages++;
          logTest('Image Generation', true, `✅ "${image.heading}" 이미지 생성 완료: ${image.filePath}`);
        } catch {
          logTest('Image Generation', false, `이미지 파일을 찾을 수 없습니다: ${image.filePath}`);
        }
      }
      
      if (validImages === 0) {
        logTest('Image Generation', false, '생성된 이미지 파일이 없습니다.');
        return { success: false };
      }
      
      logTest('Image Generation', true, `이미지 생성 완료: ${validImages}/${generatedImages.length}개 성공`);
      
      return { success: true, generatedImages };
    } catch (error: any) {
      // Electron app 관련 오류인 경우 상세 정보 출력
      if (error.message && error.message.includes('app')) {
        logTest('Image Generation', false, `Electron 환경 오류: ${error.message}`);
        logTest('Image Generation', true, '💡 이미지 생성은 Electron 앱 환경에서만 가능합니다.');
        return { success: false };
      }
      throw error;
    } finally {
      // 환경변수 정리
      delete process.env.TEST_MODE;
      delete process.env.GENERATED_IMAGES_DIR;
    }
  } catch (error) {
    logTest('Image Generation', false, '이미지 생성 테스트 실패', error);
    return { success: false };
  }
}

async function testImageLibrarySelection(content: any): Promise<{ success: boolean; libraryImages?: any[] }> {
  try {
    logTest('Image Library', true, '이미지 라이브러리 선택 테스트 시작...');
    
    // Pexels API 키 확인
    if (!process.env.PEXELS_API_KEY) {
      logTest('Image Library', false, 'Pexels API 키가 설정되지 않았습니다. (이미지 라이브러리 테스트 스킵)');
      return { success: false };
    }
    
    // 라이브러리에서 이미지 가져오기
    const libraryImages = await getLibraryImagesForTest();
    
    if (!libraryImages || libraryImages.length === 0) {
      logTest('Image Library', false, '라이브러리에 이미지가 없습니다.');
      return { success: false };
    }
    
    logTest('Image Library', true, `라이브러리에서 ${libraryImages.length}개 이미지 발견`);
    
    // 첫 번째 소제목에 대한 키워드로 이미지 필터링
    if (content.headings && content.headings.length > 0) {
      const firstHeading = content.headings[0];
      const keywords = firstHeading.keywords || [firstHeading.title];
      
      const filteredImages = filterImagesByKeywordsForTest(libraryImages, keywords);
      logTest('Image Library', true, 
        `"${firstHeading.title}" 키워드로 ${filteredImages.length}개 이미지 필터링`);
      
      if (filteredImages.length > 0) {
        const selectedImage = filteredImages[0];
        logTest('Image Library', true, `✅ 선택된 이미지: ${selectedImage.filePath}`);
        
        // 선택된 이미지 파일이 존재하는지 확인
        try {
          await fs.access(selectedImage.filePath);
          logTest('Image Library', true, '선택된 이미지 파일 확인 완료');
        } catch {
          logTest('Image Library', false, `선택된 이미지 파일을 찾을 수 없습니다: ${selectedImage.filePath}`);
          return { success: false };
        }
        
        return { success: true, libraryImages: [selectedImage] };
      }
    }
    
    // 필터링 결과가 없으면 첫 번째 이미지 사용
    const firstImage = libraryImages[0];
    logTest('Image Library', true, `✅ 첫 번째 이미지 선택: ${firstImage.filePath}`);
    
    return { success: true, libraryImages: [firstImage] };
  } catch (error) {
    logTest('Image Library', false, '이미지 라이브러리 테스트 실패', error);
    return { success: false };
  }
}

async function testImagePlacement(content: any): Promise<boolean> {
  try {
    logTest('Image Placement', true, '이미지 배치 테스트 시작...');
    
    // 이미지가 headings와 올바르게 매칭되는지 확인
    if (!content.images || content.images.length === 0) {
      logTest('Image Placement', false, '이미지가 생성되지 않았습니다.');
      return false;
    }
    
    if (!content.headings || content.headings.length === 0) {
      logTest('Image Placement', false, '소제목이 없어 이미지 배치를 확인할 수 없습니다.');
      return false;
    }
    
    // 각 이미지가 올바른 heading에 연결되어 있는지 확인
    const headingTitles = content.headings.map((h: any) => h.title);
    let matchedImages = 0;
    const imagePlacementDetails: any[] = [];
    
    for (const image of content.images) {
      const isMatched = headingTitles.includes(image.heading);
      if (isMatched) matchedImages++;
      
      imagePlacementDetails.push({
        heading: image.heading,
        matched: isMatched,
        placement: image.placement || 'middle',
        alt: image.alt || '',
        caption: image.caption || '',
      });
    }
    
    const matchRatio = matchedImages / content.images.length;
    if (matchRatio < 0.8) {
      logTest('Image Placement', false, 
        `이미지가 소제목과 충분히 매칭되지 않았습니다. (${matchedImages}/${content.images.length} 매칭, ${(matchRatio * 100).toFixed(1)}%)`,
        imagePlacementDetails);
      return false;
    }
    
    logTest('Image Placement', true, 
      `이미지 배치 확인: ${matchedImages}/${content.images.length} 매칭 (${(matchRatio * 100).toFixed(1)}%)`,
      imagePlacementDetails);
    
    // 이미지 placement 확인 (top, middle, bottom)
    const validPlacements = ['top', 'middle', 'bottom'];
    const invalidPlacements = content.images.filter((img: any) => 
      img.placement && !validPlacements.includes(img.placement)
    );
    
    if (invalidPlacements.length > 0) {
      logTest('Image Placement', false, 
        `일부 이미지의 placement가 유효하지 않습니다: ${invalidPlacements.map((img: any) => img.placement).join(', ')}`);
    } else {
      logTest('Image Placement', true, '모든 이미지의 placement가 유효합니다.');
    }
    
    return true;
  } catch (error) {
    logTest('Image Placement', false, '이미지 배치 테스트 실패', error);
    return false;
  }
}

async function testNaverPostingWithImageVerification(
  content: any, 
  generatedImages?: any[], 
  libraryImages?: any[]
): Promise<boolean> {
  try {
    const config = await loadConfigForTest();
    
    if (!config.savedNaverId || !config.savedNaverPassword) {
      logTest('Naver Posting', false, '네이버 계정 정보가 설정되어 있지 않습니다. (테스트 스킵)');
      return false;
    }

    logTest('Naver Posting', true, '네이버 블로그 포스팅 테스트 시작 (Draft 모드)...');

    // 이미지 준비: 생성된 이미지 또는 라이브러리 이미지 사용
    const headings = content.headings || [];
    let imagesToUse: any[] = [];
    
    // 1. 생성된 이미지가 있으면 우선 사용
    if (generatedImages && generatedImages.length > 0) {
      logTest('Naver Posting', true, `✅ 생성된 이미지 ${generatedImages.length}개 사용`);
      imagesToUse = generatedImages.map((img: any) => ({
        heading: img.heading,
        filePath: img.filePath,
        provider: img.provider || 'dalle',
        alt: img.alt || '',
        caption: img.caption || '',
      }));
    }
    // 2. 라이브러리 이미지가 있으면 사용
    else if (libraryImages && libraryImages.length > 0) {
      logTest('Naver Posting', true, `✅ 라이브러리 이미지 ${libraryImages.length}개 사용`);
      // 라이브러리 이미지를 첫 번째 소제목에 할당
      const firstHeading = headings[0];
      if (firstHeading) {
        imagesToUse = libraryImages.map((img: any) => ({
          heading: firstHeading.title,
          filePath: img.filePath,
          provider: 'library',
          alt: img.sourceTitle || '',
          caption: img.sourceTitle || '',
        }));
      }
    }
    // 3. 콘텐츠에 포함된 이미지 정보 사용
    else if (content.images && content.images.length > 0) {
      logTest('Naver Posting', true, `✅ 콘텐츠 이미지 ${content.images.length}개 사용`);
      // 이미지 정보만 있고 파일이 없는 경우 스킵
      imagesToUse = [];
    }
    
    logTest('Image Placement', true, `이미지 배치 사전 확인: ${imagesToUse.length}개 이미지, ${headings.length}개 소제목`);
    
    // 각 heading에 대한 이미지 매칭 확인 및 파일 존재 확인
    const validImages: any[] = [];
    for (const heading of headings) {
      const headingImage = imagesToUse.find((img: any) => img.heading === heading.title);
      if (headingImage) {
        // 파일 존재 확인
        try {
          await fs.access(headingImage.filePath);
          validImages.push(headingImage);
          logTest('Image Placement', true, `✅ "${heading.title}"에 이미지 배치 예정: ${headingImage.filePath}`);
        } catch {
          logTest('Image Placement', false, `⚠️ "${heading.title}" 이미지 파일을 찾을 수 없습니다: ${headingImage.filePath}`);
        }
      } else {
        logTest('Image Placement', true, `ℹ️ "${heading.title}"에 이미지 없음`);
      }
    }

    logTest('Naver Posting', true, `실제 사용 가능한 이미지: ${validImages.length}개`);

    const automation = new NaverBlogAutomation(
      {
        naverId: config.savedNaverId,
        naverPassword: config.savedNaverPassword,
        headless: false, // 이미지 배치 확인을 위해 headless: false
        slowMo: 100,
      },
      (message) => console.log(`[Automation] ${message}`),
    );

    await automation.run({
      title: `[테스트] ${content.selectedTitle}`,
      structuredContent: content,
      hashtags: content.hashtags || [],
      images: validImages,
      publishMode: 'draft', // 테스트는 draft 모드로
    });

    logTest('Naver Posting', true, '네이버 블로그 포스팅 완료 (임시저장)');
    logTest('Image Placement', true, `이미지 ${validImages.length}개가 배치되었습니다. 브라우저에서 확인해주세요.`);
    
    return true;
  } catch (error) {
    logTest('Naver Posting', false, '네이버 블로그 포스팅 실패', error);
    return false;
  }
}

async function saveTestReport(): Promise<void> {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.length,
      passed: testResults.filter(r => r.success).length,
      failed: testResults.filter(r => !r.success).length,
    },
    results: testResults,
  };

  const reportPath = path.join(process.cwd(), 'test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📄 테스트 리포트 저장: ${reportPath}`);
}

async function runIntegrationTest(): Promise<void> {
  console.log('🧪 통합 테스트 시작...\n');

  // 1. 설정 로드 테스트
  const configOk = await testConfigLoad();
  if (!configOk) {
    console.log('\n❌ 설정 로드 실패로 테스트를 중단합니다.');
    await saveTestReport();
    process.exit(1);
  }

  // 2. 콘텐츠 생성 테스트
  const contentResult = await testContentGeneration();
  if (!contentResult.success || !contentResult.content) {
    console.log('\n❌ 콘텐츠 생성 실패로 테스트를 중단합니다.');
    await saveTestReport();
    process.exit(1);
  }

  // 3. 이미지 배치 테스트
  const imagePlacementResult = await testImagePlacement(contentResult.content);
  if (!imagePlacementResult) {
    console.log('\n⚠️ 이미지 배치 테스트 실패 (경고)');
  }

  // 4. AI 이미지 생성 테스트 (영어 프롬프트로 이미지 생성 및 배치 테스트)
  const imageGenerationResult = await testImageGeneration(contentResult.content);
  let generatedImages: any[] = [];
  if (imageGenerationResult.success && imageGenerationResult.generatedImages) {
    generatedImages = imageGenerationResult.generatedImages;
    logTest('Image Generation', true, `✅ ${generatedImages.length}개 이미지 생성 완료`);
    
    // 생성된 이미지가 영어 프롬프트로 생성되었는지 확인
    for (const img of generatedImages) {
      const heading = contentResult.content.headings.find((h: any) => h.title === img.heading);
      if (heading && heading.imagePrompt) {
        // 영어 프롬프트인지 확인 (한글이 아닌 경우)
        const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(heading.imagePrompt);
        if (!hasKorean) {
          logTest('Image Generation', true, `✅ 영어 프롬프트 확인: "${heading.imagePrompt.substring(0, 50)}..."`);
        } else {
          logTest('Image Generation', true, `ℹ️ 한글 프롬프트: "${heading.imagePrompt.substring(0, 50)}..."`);
        }
      }
    }
  } else {
    logTest('Image Generation', true, '이미지 생성 테스트를 스킵합니다.');
  }

  // 5. 이미지 라이브러리 선택 테스트
  const librarySelectionResult = await testImageLibrarySelection(contentResult.content);
  let libraryImages: any[] = [];
  if (librarySelectionResult.success && librarySelectionResult.libraryImages) {
    libraryImages = librarySelectionResult.libraryImages;
    logTest('Image Library', true, `✅ ${libraryImages.length}개 라이브러리 이미지 선택 완료`);
  } else {
    logTest('Image Library', true, '이미지 라이브러리 테스트를 스킵합니다.');
  }

  // 6. 네이버 포스팅 테스트 (선택적) - 생성된 이미지 또는 라이브러리 이미지 사용
  const naverId = process.env.NAVER_ID;
  const naverPassword = process.env.NAVER_PASSWORD;
  
  if (naverId && naverPassword) {
    await testNaverPostingWithImageVerification(
      contentResult.content,
      generatedImages.length > 0 ? generatedImages : undefined,
      libraryImages.length > 0 ? libraryImages : undefined
    );
  } else {
    logTest('Naver Posting', true, '네이버 계정 정보가 없어 포스팅 테스트를 스킵합니다.');
  }

  // 결과 요약
  const passed = testResults.filter(r => r.success).length;
  const failed = testResults.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(50));
  console.log(`✅ 성공: ${passed}개`);
  console.log(`❌ 실패: ${failed}개`);
  console.log(`📈 성공률: ${((passed / testResults.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(50));

  await saveTestReport();

  if (failed > 0) {
    console.log('\n⚠️ 일부 테스트가 실패했습니다. test-report.json 파일을 확인하세요.');
    process.exit(1);
  } else {
    console.log('\n🎉 모든 테스트가 성공적으로 완료되었습니다!');
    process.exit(0);
  }
}

// Electron 환경이 아닐 때만 직접 실행
if (require.main === module) {
  runIntegrationTest().catch((error) => {
    console.error('❌ 테스트 실행 중 오류:', error);
    process.exit(1);
  });
}

export { runIntegrationTest };

