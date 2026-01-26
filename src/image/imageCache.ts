// ✅ ImageCache: URL 중복 관리 및 캐싱 (메모리 폭발 방지 개선)
export class ImageCache {
  // ✅ readonly로 변경 (TS 문법 준수)
  // 메모리 폭발 방지: 최대 저장 개수 제한
  private readonly MAX_SIZE = 1000;
  private readonly MAX_TITLE_CACHE = 50; // 타이틀별 캐시도 최대 50개 글까지만 기억

  private usedUrls = new Set<string>();
  private titleCache = new Map<string, Set<string>>();

  /**
   * URL 정규화
   */
  normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url.split('?')[0].split('&')[0].split('#')[0];
    }
  }

  /**
   * 이미지 ID 추출 (파일명 기반)
   */
  getImageId(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || '';

      // 정규식: 타임스탬프 및 버전 제거
      const coreId = filename.replace(/[_-]\d+\.(jpg|jpeg|png|gif|webp)$/i, '').replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
      return coreId || this.normalizeUrl(url);
    } catch {
      return this.normalizeUrl(url);
    }
  }

  /**
   * 사용 여부 확인
   */
  isUsed(url: string, postTitle?: string): boolean {
    const normalized = this.normalizeUrl(url);
    const imageId = this.getImageId(url);

    // 글로벌 중복 체크
    if (this.usedUrls.has(normalized) || this.usedUrls.has(imageId)) {
      return true;
    }

    // 타이틀별 중복 체크
    if (postTitle) {
      const titleKey = postTitle.trim().toLowerCase();
      const titleUsedUrls = this.titleCache.get(titleKey);
      if (titleUsedUrls && (titleUsedUrls.has(normalized) || titleUsedUrls.has(imageId))) {
        return true;
      }
    }

    return false;
  }

  /**
   * 사용 처리 (메모리 제한 완벽 적용)
   */
  markAsUsed(url: string, postTitle?: string): void {
    const normalized = this.normalizeUrl(url);
    const imageId = this.getImageId(url);

    // ✅ while 루프로 확실하게 공간 확보 (2개 추가 가능)
    while (this.usedUrls.size >= this.MAX_SIZE) {
      const first = this.usedUrls.values().next().value;
      if (first) this.usedUrls.delete(first);
      else break; // 안전장치
    }

    this.usedUrls.add(normalized);
    this.usedUrls.add(imageId);

    if (postTitle) {
      const titleKey = postTitle.trim().toLowerCase();

      // ✅ 타이틀 캐시도 무한 증식 방지 (오래된 글 캐시 삭제)
      if (!this.titleCache.has(titleKey)) {
        if (this.titleCache.size >= this.MAX_TITLE_CACHE) {
          const firstKey = this.titleCache.keys().next().value;
          if (firstKey) this.titleCache.delete(firstKey);
        }
        this.titleCache.set(titleKey, new Set<string>());
      }

      const titleUsedUrls = this.titleCache.get(titleKey)!;
      titleUsedUrls.add(normalized);
      titleUsedUrls.add(imageId);
    }
  }

  /**
   * 제목별 사용된 이미지 URL 로드
   */
  loadTitleCache(postTitle: string): void {
    const titleKey = postTitle.trim().toLowerCase();
    if (!this.titleCache.has(titleKey)) {
      this.titleCache.set(titleKey, new Set<string>());
    }
    const titleUsedUrls = this.titleCache.get(titleKey)!;
    titleUsedUrls.forEach(url => this.usedUrls.add(url));
  }

  /**
   * 캐시 초기화
   */
  clear(): void {
    this.usedUrls.clear();
    this.titleCache.clear();
  }

  /**
   * 현재 캐시 상태 확인 (디버깅용)
   */
  getStats(): { usedCount: number; titleCount: number } {
    return {
      usedCount: this.usedUrls.size,
      titleCount: this.titleCache.size
    };
  }
}
