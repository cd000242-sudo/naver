// intelligentImagePlacer.ts - AI 기반 이미지 자동 매칭 및 배치

// 풀오토: AI가 소제목 분석 후 최적 이미지 자동 선택
// 반자동: 사용자 선택 후 원하는 위치에 자동 삽입

// ✅ [v2.7.52] modelRegistry SSOT
import { GEMINI_TEXT_MODELS } from './runtime/modelRegistry.js';

import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================
// 타입 정의
// ============================================

export interface CollectedImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  source: string;
  title: string;
  tags: string[];
  photographer: string;
  license: string;
  base64?: string; // 다운로드 후 Base64 변환
}

export interface HeadingWithContent {
  index: number;
  title: string;
  content: string;
  keywords: string[];
}

export interface ImageAssignment {
  headingIndex: number;
  headingTitle: string;
  assignedImage: CollectedImage;
  confidence: number; // 0-100
  reason: string;
  position: 'top' | 'middle' | 'bottom'; // ✅ 삽입 위치 추가
}

export interface UserImageSelection {
  imageId: string;
  targetHeadingIndex: number;
  position: 'above' | 'below'; // 소제목 위 또는 아래
}

// ============================================
// 지능형 이미지 배치 클래스
// ============================================

export class IntelligentImagePlacer {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(geminiApiKey: string) {
    this.genAI = new GoogleGenerativeAI(geminiApiKey);
    this.model = this.genAI.getGenerativeModel({
      model: GEMINI_TEXT_MODELS.FLASH,  // ✅ [v2.7.52] modelRegistry SSOT
    });
  }

  // ============================================
  // 풀오토: AI 기반 이미지-소제목 자동 매칭
  // ============================================

  async autoMatchImagesForFullAuto(
    headings: HeadingWithContent[],
    collectedImages: CollectedImage[]
  ): Promise<ImageAssignment[]> {
    if (collectedImages.length === 0) {
      console.log('⚠️ 수집된 이미지가 없습니다.');
      return [];
    }

    console.log(`🤖 AI 이미지 매칭 시작: ${headings.length}개 소제목, ${collectedImages.length}개 이미지`);

    const assignments: ImageAssignment[] = [];

    // 각 소제목에 대해 최적 이미지 선택
    for (const heading of headings) {
      const bestMatch = await this.findBestImageForHeading(heading, collectedImages, assignments);

      // ✅ 신뢰도 임계값 적용: 60점 미만은 엉뚱한 이미지일 확률이 높으므로 제외
      if (bestMatch && bestMatch.confidence >= 60) {
        assignments.push(bestMatch);
        console.log(`✅ "${heading.title}" → "${bestMatch.assignedImage.title}" (신뢰도: ${bestMatch.confidence}%)`);
      } else if (bestMatch) {
        console.log(`⚠️ "${heading.title}" 매칭 결과가 있으나 신뢰도가 낮아 제외 (${bestMatch.confidence}%)`);
      } else {
        console.log(`⚠️ "${heading.title}"에 적합한 이미지를 찾지 못했습니다.`);
      }
    }

    return assignments;
  }

  private async findBestImageForHeading(
    heading: HeadingWithContent,
    allImages: CollectedImage[],
    existingAssignments: ImageAssignment[]
  ): Promise<ImageAssignment | null> {
    // 이미 할당된 이미지 제외
    const assignedIds = new Set(existingAssignments.map(a => a.assignedImage.id));
    const availableImages = allImages.filter(img => !assignedIds.has(img.id));

    if (availableImages.length === 0) {
      return null;
    }

    // AI를 사용해 최적 이미지 선택
    const prompt = `
다음 블로그 소제목에 가장 적합한 이미지를 선택하고, 해당 섹션 내에서의 최적 삽입 위치를 결정하세요.

## 소제목
제목: ${heading.title}
내용 요약: ${heading.content.substring(0, 250)}
키워드: ${heading.keywords.join(', ')}

## 후보 이미지 목록
${availableImages.map((img, idx) => `
${idx + 1}. ID: ${img.id}
   제목: ${img.title}
   태그: ${img.tags.join(', ')}
   출처: ${img.source}
`).join('\n')}

## 응답 형식 (JSON)
{
  "selectedIndex": 선택한 이미지 번호 (1부터 시작. 만약 모든 후보가 주제와 맞지 않으면 0),
  "confidence": 신뢰도 (0-100),
  "reason": "선택 이유 (맞는 이미지가 없으면 그 이유 설명)",
  "position": "top" | "middle" | "bottom"
}

## 가이드라인
1. **정밀 매칭:** 소제목의 주제, 분위기, 키워드와 시각적으로 **직접적인 연관성**이 있는 이미지만 선택하세요.
2. **엄격한 제외:** 후보 이미지 중 소제목의 내용을 시각적으로 대변할 수 있는 것이 하나도 없다면, 과감히 "selectedIndex": 0을 반환하세요. 억지로 맞추지 않는 것이 더 중요합니다.
3. **위치(position):**
   - **top:** 소제목 바로 아래, 본문 시작 전 (가장 일반적)
   - **middle:** 본문의 중간 문단 사이 (호흡 조절용)
   - **bottom:** 본문이 끝난 후 (결론 강조용)
   - "사람이 직접 찍어서 올린 듯한" 자연스러운 배치를 선택하세요.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      // ✅ [2026-01-21 FIX] JSON 응답 추출 강화 (AI가 한국어 텍스트를 반환할 때도 처리)
      let jsonText = response.trim();

      // 1. 마크다운 코드 블록 제거
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim();
      }

      // 2. JSON 객체가 아닌 경우, 정규식으로 JSON 부분만 추출 시도
      if (!jsonText.startsWith('{')) {
        const jsonMatch = jsonText.match(/\{[\s\S]*?"selectedIndex"[\s\S]*?\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
          console.log(`[ImagePlacer] JSON 추출 성공: ${jsonText.substring(0, 50)}...`);
        } else {
          // JSON이 없으면 폴백으로 처리
          console.log(`[ImagePlacer] ⚠️ AI가 JSON이 아닌 텍스트 반환 → 폴백 사용`);
          return this.fallbackKeywordMatch(heading, availableImages);
        }
      }

      const parsed = JSON.parse(jsonText);

      const selectedIndex = parsed.selectedIndex - 1;
      if (selectedIndex < 0 || selectedIndex >= availableImages.length) {
        return null;
      }

      return {
        headingIndex: heading.index,
        headingTitle: heading.title,
        assignedImage: availableImages[selectedIndex],
        confidence: parsed.confidence || 70,
        reason: parsed.reason || '관련성 기반 자동 선택',
        position: parsed.position || 'top',
      };
    } catch (error) {
      console.error('AI 이미지 매칭 오류:', error);

      // 폴백: 키워드 기반 간단 매칭
      return this.fallbackKeywordMatch(heading, availableImages);
    }
  }

  private fallbackKeywordMatch(
    heading: HeadingWithContent,
    images: CollectedImage[]
  ): ImageAssignment | null {
    const headingText = `${heading.title} ${heading.keywords.join(' ')}`.toLowerCase();

    let bestImage: CollectedImage | null = null;
    let bestScore = 0;

    for (const img of images) {
      const imageText = `${img.title} ${img.tags.join(' ')}`.toLowerCase();
      let score = 0;

      // 단어 매칭 점수 계산
      for (const word of headingText.split(/\s+/)) {
        if (word.length > 1 && imageText.includes(word)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestImage = img;
      }
    }

    if (bestImage && bestScore > 0) {
      return {
        headingIndex: heading.index,
        headingTitle: heading.title,
        assignedImage: bestImage,
        confidence: Math.min(bestScore * 20, 80),
        reason: '키워드 매칭 기반 선택',
        position: 'top',
      };
    }

    // 매칭 실패 시 첫 번째 이미지 사용
    if (images.length > 0) {
      return {
        headingIndex: heading.index,
        headingTitle: heading.title,
        assignedImage: images[0],
        confidence: 30,
        reason: '기본 선택 (매칭 실패)',
        position: 'top',
      };
    }

    return null;
  }

  // ============================================
  // 반자동: 사용자 선택 기반 이미지 배치
  // ============================================

  async processUserSelections(
    selections: UserImageSelection[],
    allImages: CollectedImage[],
    headings: HeadingWithContent[]
  ): Promise<ImageAssignment[]> {
    const assignments: ImageAssignment[] = [];

    for (const selection of selections) {
      const image = allImages.find(img => img.id === selection.imageId);
      const heading = headings.find(h => h.index === selection.targetHeadingIndex);

      if (image && heading) {
        assignments.push({
          headingIndex: selection.targetHeadingIndex,
          headingTitle: heading.title,
          assignedImage: image,
          confidence: 100, // 사용자 선택은 100%
          reason: '사용자 직접 선택',
          position: (selection.position === 'above' ? 'top' : 'bottom') as 'top' | 'bottom',
        });
      }
    }

    return assignments;
  }

  // ============================================
  // 이미지 삽입 순서 생성
  // ============================================

  generateInsertionOrder(assignments: ImageAssignment[]): ImageAssignment[] {
    // 소제목 순서대로 정렬
    return assignments.sort((a, b) => a.headingIndex - b.headingIndex);
  }

  // ============================================
  // 지능형 이미지 수집을 위한 시각적 키워드 생성
  // ============================================

  async generateVisualKeywordsForHeadings(
    headings: HeadingWithContent[]
  ): Promise<Array<{ index: number; visualQueries: string[] }>> {
    console.log(`🤖 소제목별 시각적 묘사 생성 시작 (${headings.length}개)`);

    const prompt = `
당신은 블로그 포스팅 전문가입니다. 다음 소제목들의 내용을 가장 잘 나타낼 수 있는 '시각적 장면'을 구상하고, 이미지 검색에 사용할 2~3개의 정교한 키워드들을 생성하세요.

단순히 소제목의 단어를 반복하지 말고, "사람이 직접 찍은 듯한 사진"의 구도를 떠올리며 키워드를 만드세요.

## 소제목 목록
${headings.map(h => `${h.index}. 제목: ${h.title}\n   내용: ${h.content.substring(0, 100)}`).join('\n\n')}

## 응답 형식 (JSON)
[
  {
    "index": 소제목 번호,
    "visualQueries": ["구체적인 시각 키워드 1", "구체적인 시각 키워드 2"]
  },
  ...
]

## 키워드 생성 가이드
- 제품 리뷰라면: "제품을 사용하는 손", "제품의 클로즈업", "실제 사용 공간의 분위기"
- 정보성 글이라면: "관련된 문서나 도구", "상황을 설명하는 일러스트", "신뢰감을 주는 배경"
- 감성적인 글이라면: "따뜻한 느낌의 인테리어", "평화로운 풍경", "활기찬 사람들의 모습"
- 키워드 언어: 한국어로 생성하세요.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response.text();

      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim();
      }

      const parsed = JSON.parse(jsonText);
      return parsed;
    } catch (error) {
      console.error('시각적 키워드 생성 오류:', error);
      // 폴백: 원래 키워드 사용
      return headings.map(h => ({
        index: h.index,
        visualQueries: h.keywords.slice(0, 2)
      }));
    }
  }
}

// ============================================
// 네이버 에디터 이미지 삽입 헬퍼
// ============================================

export class NaverEditorImageInserter {
  // 특정 소제목 아래에 이미지 삽입
  static async insertImageBelowHeading(
    frame: any, // Puppeteer Frame
    headingTitle: string,
    imageBase64: string
  ): Promise<boolean> {
    return await frame.evaluate(
      (title: string, imgData: string) => {
        // 1. 소제목 요소 찾기
        const textComponents = document.querySelectorAll('.se-component.se-text');
        let targetComponent: Element | null = null;

        for (const comp of textComponents) {
          const text = comp.textContent?.trim() || '';
          if (text.includes(title)) {
            targetComponent = comp;
            break;
          }
        }

        if (!targetComponent) {
          console.error(`[이미지 삽입] 소제목을 찾을 수 없습니다: ${title}`);
          return false;
        }

        // 2. 이미지 컴포넌트 생성
        const seComponent = document.createElement('div');
        seComponent.className = 'se-component se-image se-l-default';
        seComponent.style.margin = '15px 0';

        const seComponentContent = document.createElement('div');
        seComponentContent.className = 'se-component-content';

        const seSection = document.createElement('div');
        seSection.className = 'se-section se-section-image se-l-default se-align-center';

        const seModule = document.createElement('div');
        seModule.className = 'se-module se-module-image';

        const seLink = document.createElement('a');
        seLink.className = 'se-module-image-link';
        seLink.setAttribute('data-linktype', 'img');

        const img = document.createElement('img');
        img.className = 'se-image-resource';
        img.src = imgData;
        img.setAttribute('data-width', 'original');
        img.style.maxWidth = '100%';

        seLink.appendChild(img);
        seModule.appendChild(seLink);
        seSection.appendChild(seModule);
        seComponentContent.appendChild(seSection);
        seComponent.appendChild(seComponentContent);

        // 3. 소제목 바로 다음에 삽입
        if (targetComponent.nextSibling) {
          targetComponent.parentElement?.insertBefore(seComponent, targetComponent.nextSibling);
        } else {
          targetComponent.parentElement?.appendChild(seComponent);
        }

        console.log(`[이미지 삽입] ✅ "${title}" 아래에 이미지 삽입 완료`);
        return true;
      },
      headingTitle,
      imageBase64
    );
  }

  // 모든 할당된 이미지를 순서대로 삽입
  static async insertAllAssignedImages(
    frame: any,
    assignments: ImageAssignment[],
    delay: (ms: number) => Promise<void>
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // 역순으로 삽입 (마지막 소제목부터)
    // 이유: 앞에서 삽입하면 뒤의 인덱스가 밀림
    const reversed = [...assignments].reverse();

    for (const assignment of reversed) {
      if (!assignment.assignedImage.base64) {
        console.warn(`⚠️ "${assignment.headingTitle}" 이미지에 Base64 데이터가 없습니다.`);
        failed++;
        continue;
      }

      const result = await this.insertImageBelowHeading(
        frame,
        assignment.headingTitle,
        assignment.assignedImage.base64
      );

      if (result) {
        success++;
      } else {
        failed++;
      }

      await delay(500);
    }

    return { success, failed };
  }
}

// ============================================
// 반자동 모드 UI 지원 함수
// ============================================

export interface ImageSelectionUIData {
  headings: Array<{
    index: number;
    title: string;
  }>;
  images: Array<{
    id: string;
    thumbnailUrl: string;
    title: string;
    source: string;
  }>;
}

export function prepareImageSelectionUI(
  headings: HeadingWithContent[],
  images: CollectedImage[]
): ImageSelectionUIData {
  return {
    headings: headings.map(h => ({
      index: h.index,
      title: h.title,
    })),
    images: images.map(img => ({
      id: img.id,
      thumbnailUrl: img.thumbnailUrl,
      title: img.title,
      source: img.source,
    })),
  };
}

// 클래스는 이미 export되어 있으므로 추가 export 불필요

