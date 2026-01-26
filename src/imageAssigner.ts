import { ImageLibrary, LibraryImage } from './imageLibrary.js';
import type { StructuredContent } from './contentGenerator.js';
import type { AutomationImage } from './naverBlogAutomation.js';

// ========================================
// 타입 정의
// ========================================

export type ImageAssignMode = 'full-auto' | 'semi-auto' | 'manual';

export interface ImageAssignment {
  heading: string;
  selectedImage: LibraryImage | null;
  suggestions: LibraryImage[];  // 반자동 모드용 추천 목록
  customPath?: string;          // 수동 선택 경로
}

export interface AssignmentOptions {
  mode: ImageAssignMode;
  imagesPerHeading?: number;
  preferredSources?: string[];
  minMatchScore?: number;
}

export interface AssignmentResult {
  assignments: ImageAssignment[];
  automationImages: AutomationImage[];
  needsUserSelection: boolean;
}

// ========================================
// 이미지 배치 시스템
// ========================================

export class ImageAssigner {
  constructor(
    private readonly library: ImageLibrary,
    private readonly logger: (message: string) => void = console.log
  ) {}

  /**
   * 소제목에 이미지 자동 배치
   */
  async assignImages(
    content: StructuredContent,
    options: AssignmentOptions
  ): Promise<AssignmentResult> {
    const {
      mode = 'semi-auto',
      imagesPerHeading = 1,
      preferredSources = ['unsplash', 'pexels', 'pixabay'],
      minMatchScore = 0.3,
    } = options;

    const headings = content.headings || [];
    const assignments: ImageAssignment[] = [];
    let needsUserSelection = false;

    this.logger(`🖼️ 이미지 배치 모드: ${mode}`);
    this.logger(`📋 총 ${headings.length}개 소제목에 이미지 배치`);

    for (const heading of headings) {
      const assignment = await this.assignForHeading(
        heading.title,
        content.bodyPlain || '',
        mode,
        imagesPerHeading,
        preferredSources
      );

      assignments.push(assignment);

      // 반자동 모드에서 선택 필요 여부 확인
      if (mode === 'semi-auto' && !assignment.selectedImage) {
        needsUserSelection = true;
      }
    }

    // AutomationImage 형식으로 변환
    const automationImages = this.toAutomationImages(assignments);

    this.logger(`✅ 이미지 배치 완료 (${automationImages.length}개)`);

    return {
      assignments,
      automationImages,
      needsUserSelection,
    };
  }

  /**
   * 단일 소제목에 이미지 배치
   */
  private async assignForHeading(
    heading: string,
    bodyText: string,
    mode: ImageAssignMode,
    count: number,
    sources: string[]
  ): Promise<ImageAssignment> {
    // 키워드 추출
    const keywords = this.extractKeywords(heading, bodyText);
    this.logger(`   🔍 "${heading}" 키워드: ${keywords.join(', ')}`);

    // 라이브러리에서 이미지 검색
    const suggestions: LibraryImage[] = [];
    
    for (const keyword of keywords) {
      const images = await this.library.getImages(keyword, count * 3);
      suggestions.push(...images);
      
      if (suggestions.length >= count * 5) break;
    }

    // 중복 제거 및 점수 정렬
    const uniqueSuggestions = this.deduplicateAndScore(
      suggestions,
      keywords,
      sources
    );

    // 모드별 처리
    let selectedImage: LibraryImage | null = null;

    switch (mode) {
      case 'full-auto':
        // 가장 높은 점수의 이미지 자동 선택
        selectedImage = uniqueSuggestions[0] || null;
        if (selectedImage) {
          this.logger(`   ✅ 자동 선택: ${selectedImage.id}`);
        }
        break;

      case 'semi-auto':
        // 점수가 충분히 높으면 자동 선택, 아니면 사용자 선택 대기
        if (uniqueSuggestions[0]?.matchScore && uniqueSuggestions[0].matchScore > 0.7) {
          selectedImage = uniqueSuggestions[0];
          this.logger(`   ✅ 자동 선택 (고득점): ${selectedImage.id}`);
        } else {
          this.logger(`   ⏳ 사용자 선택 대기 (${uniqueSuggestions.length}개 추천)`);
        }
        break;

      case 'manual':
        // 추천만 제공, 선택은 사용자가
        this.logger(`   📋 ${uniqueSuggestions.length}개 추천 준비됨`);
        break;
    }

    return {
      heading,
      selectedImage,
      suggestions: uniqueSuggestions.slice(0, 10),
    };
  }

  /**
   * 키워드 추출
   */
  private extractKeywords(heading: string, bodyText: string): string[] {
    const keywords: string[] = [];

    // 1. 소제목에서 키워드 추출
    const headingWords = heading
      .replace(/[^\w\s가-힣]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 2);
    keywords.push(...headingWords);

    // 2. 소제목 전체를 키워드로
    keywords.unshift(heading.replace(/[^\w\s가-힣]/g, '').trim());

    // 3. 본문에서 관련 키워드 추출 (소제목 근처)
    const headingIndex = bodyText.indexOf(heading);
    if (headingIndex !== -1) {
      const nearbyText = bodyText.substring(
        headingIndex,
        Math.min(headingIndex + 200, bodyText.length)
      );
      
      // 명사 추출 (간단한 방식)
      const nouns = nearbyText.match(/[가-힣]{2,}/g) || [];
      const uniqueNouns = [...new Set(nouns)]
        .filter(n => n.length >= 2 && n.length <= 6)
        .slice(0, 3);
      keywords.push(...uniqueNouns);
    }

    // 중복 제거
    return [...new Set(keywords)].slice(0, 5);
  }

  /**
   * 중복 제거 및 점수 계산
   */
  private deduplicateAndScore(
    images: LibraryImage[],
    keywords: string[],
    preferredSources: string[]
  ): (LibraryImage & { matchScore: number })[] {
    const seen = new Set<string>();
    const scored: (LibraryImage & { matchScore: number })[] = [];

    for (const image of images) {
      if (seen.has(image.id)) continue;
      seen.add(image.id);

      // 점수 계산
      let score = 0;

      // 키워드 매칭
      const imageTags = image.tags.join(' ').toLowerCase();
      for (const keyword of keywords) {
        if (imageTags.includes(keyword.toLowerCase())) {
          score += 0.3;
        }
        if (image.query.toLowerCase().includes(keyword.toLowerCase())) {
          score += 0.2;
        }
      }

      // 선호 소스 보너스
      if (preferredSources.includes(image.source)) {
        score += 0.2;
      }

      // 이미지 크기 보너스
      if (image.width >= 1200 && image.height >= 800) {
        score += 0.1;
      }

      scored.push({ ...image, matchScore: Math.min(1, score) });
    }

    // 점수순 정렬
    return scored.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * AutomationImage 형식으로 변환
   */
  private toAutomationImages(assignments: ImageAssignment[]): AutomationImage[] {
    const result: AutomationImage[] = [];

    for (const assignment of assignments) {
      if (assignment.selectedImage) {
        result.push({
          heading: assignment.heading,
          filePath: assignment.selectedImage.localPath || assignment.selectedImage.url,
          provider: assignment.selectedImage.source,
          alt: `${assignment.heading} 이미지`,
          caption: this.library.getAttribution(assignment.selectedImage),
        });
      } else if (assignment.customPath) {
        result.push({
          heading: assignment.heading,
          filePath: assignment.customPath,
          provider: 'custom',
          alt: `${assignment.heading} 이미지`,
        });
      }
    }

    return result;
  }

  /**
   * 사용자가 이미지 선택 (반자동/수동 모드용)
   */
  selectImage(
    assignments: ImageAssignment[],
    headingIndex: number,
    imageIndex: number
  ): ImageAssignment[] {
    const assignment = assignments[headingIndex];
    if (!assignment) return assignments;

    const selected = assignment.suggestions[imageIndex];
    if (selected) {
      assignment.selectedImage = selected;
      this.logger(`✅ "${assignment.heading}" 이미지 선택: ${selected.id}`);
    }

    return assignments;
  }

  /**
   * 사용자 커스텀 이미지 설정 (수동 모드용)
   */
  setCustomImage(
    assignments: ImageAssignment[],
    headingIndex: number,
    imagePath: string
  ): ImageAssignment[] {
    const assignment = assignments[headingIndex];
    if (!assignment) return assignments;

    assignment.customPath = imagePath;
    assignment.selectedImage = null;
    this.logger(`✅ "${assignment.heading}" 커스텀 이미지: ${imagePath}`);

    return assignments;
  }

  /**
   * 이미지 선택 UI용 데이터 생성
   */
  getSelectionData(assignments: ImageAssignment[]): {
    heading: string;
    currentImage: string | null;
    suggestions: {
      id: string;
      thumbnail: string;
      source: string;
      attribution: string;
      score: number;
    }[];
  }[] {
    return assignments.map(a => ({
      heading: a.heading,
      currentImage: a.selectedImage?.localPath || a.customPath || null,
      suggestions: a.suggestions.map(s => ({
        id: s.id,
        thumbnail: s.localPath || s.url,
        source: s.source,
        attribution: this.library.getAttribution(s),
        score: (s as any).matchScore || 0,
      })),
    }));
  }
}

