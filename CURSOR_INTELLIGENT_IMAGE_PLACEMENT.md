# Cursor AI 지시사항: 지능형 이미지 배치 시스템

## 개요
- **풀오토**: AI가 소제목 분석 후 최적 이미지 자동 선택 및 배치
- **반자동**: 수집된 이미지 표시 → 사용자 선택 → "선택해서 사용하기" 버튼 → 원하는 소제목 아래 자동 삽입

---

## 1. renderer.ts - 반자동 이미지 선택 UI 추가

### 1.1 전역 상태 추가

```typescript
// 반자동 이미지 선택을 위한 상태
let pendingImageSelections: Map<string, number> = new Map(); // imageId -> headingIndex
let generatedHeadings: Array<{ index: number; title: string }> = [];
let isImageSelectionMode = false;
```

### 1.2 이미지 선택 모달 HTML (index.html에 추가)

```html
<!-- 이미지 배치 선택 모달 -->
<div id="image-placement-modal" class="modal">
  <div class="modal-content large">
    <div class="modal-header">
      <h2>이미지 배치 선택</h2>
      <button class="close-btn" onclick="closeImagePlacementModal()">&times;</button>
    </div>
    <div class="modal-body">
      <!-- 소제목 목록 -->
      <div class="placement-section">
        <h3>소제목 목록</h3>
        <div id="heading-list" class="heading-list">
          <!-- 동적 생성 -->
        </div>
      </div>

      <!-- 수집된 이미지 -->
      <div class="placement-section">
        <h3>수집된 이미지 <span id="collected-count">(0개)</span></h3>
        <div id="collected-images-grid" class="collected-images-grid">
          <!-- 동적 생성 -->
        </div>
      </div>

      <!-- 선택된 배치 미리보기 -->
      <div class="placement-section">
        <h3>배치 미리보기</h3>
        <div id="placement-preview" class="placement-preview">
          <p class="hint">이미지를 클릭한 후 배치할 소제목을 선택하세요.</p>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="secondary-btn" onclick="clearAllSelections()">선택 초기화</button>
      <button class="primary-btn" onclick="applyImagePlacements()">선택해서 사용하기</button>
    </div>
  </div>
</div>
```

### 1.3 CSS 스타일 추가 (styles.css)

```css
/* 이미지 배치 선택 모달 */
.placement-section {
  margin-bottom: var(--spacing-lg);
}

.placement-section h3 {
  font-size: 14px;
  margin-bottom: var(--spacing-sm);
  color: var(--text-secondary);
}

.heading-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.heading-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-secondary);
  border-radius: var(--border-radius);
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.heading-item:hover {
  border-color: var(--primary-color);
}

.heading-item.selected {
  border-color: var(--primary-color);
  background: rgba(3, 199, 90, 0.1);
}

.heading-item .heading-number {
  font-weight: 600;
  color: var(--primary-color);
  margin-right: var(--spacing-sm);
}

.heading-item .assigned-image {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: cover;
}

.heading-item .no-image {
  width: 40px;
  height: 40px;
  background: var(--border-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.collected-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--spacing-sm);
  max-height: 300px;
  overflow-y: auto;
}

.collected-image-item {
  position: relative;
  border-radius: var(--border-radius);
  overflow: hidden;
  cursor: pointer;
  border: 3px solid transparent;
  transition: all 0.2s;
}

.collected-image-item:hover {
  transform: scale(1.05);
}

.collected-image-item.selected {
  border-color: var(--primary-color);
}

.collected-image-item.assigned {
  opacity: 0.5;
}

.collected-image-item img {
  width: 100%;
  height: 80px;
  object-fit: cover;
}

.collected-image-item .image-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--primary-color);
  color: white;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
}

.placement-preview {
  padding: var(--spacing-md);
  background: var(--bg-secondary);
  border-radius: var(--border-radius);
  min-height: 100px;
}

.placement-preview-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid var(--border-color);
}

.placement-preview-item:last-child {
  border-bottom: none;
}
```

### 1.4 JavaScript 로직 (renderer.ts에 추가)

```typescript
// ============================================
// 반자동 이미지 배치 시스템
// ============================================

let selectedImageId: string | null = null;
let imageAssignments: Map<number, string> = new Map(); // headingIndex -> imageId

// 이미지 배치 모달 열기
function openImagePlacementModal(headings: Array<{ index: number; title: string }>, images: ImageItem[]): void {
  generatedHeadings = headings;
  imageAssignments.clear();
  selectedImageId = null;

  renderHeadingList();
  renderCollectedImages(images);
  updatePlacementPreview();

  showModal('image-placement');
}

// 소제목 목록 렌더링
function renderHeadingList(): void {
  const container = document.getElementById('heading-list');
  if (!container) return;

  container.innerHTML = generatedHeadings.map(heading => {
    const assignedImageId = imageAssignments.get(heading.index);
    const assignedImage = assignedImageId
      ? imageLibrary.find(img => img.id === assignedImageId)
      : null;

    return `
      <div class="heading-item ${selectedImageId ? 'clickable' : ''}"
           onclick="assignImageToHeading(${heading.index})"
           data-heading-index="${heading.index}">
        <div>
          <span class="heading-number">${heading.index + 1}.</span>
          <span class="heading-title">${heading.title}</span>
        </div>
        ${assignedImage
          ? `<img class="assigned-image" src="${assignedImage.thumbnailUrl}" alt="할당된 이미지" />`
          : `<div class="no-image">+</div>`
        }
      </div>
    `;
  }).join('');
}

// 수집된 이미지 렌더링
function renderCollectedImages(images: ImageItem[]): void {
  const container = document.getElementById('collected-images-grid');
  const countEl = document.getElementById('collected-count');

  if (!container) return;
  if (countEl) countEl.textContent = `(${images.length}개)`;

  // 이미 할당된 이미지 ID 목록
  const assignedIds = new Set(imageAssignments.values());

  container.innerHTML = images.map(image => {
    const isAssigned = assignedIds.has(image.id);
    const isSelected = selectedImageId === image.id;

    // 어떤 소제목에 할당되었는지 찾기
    let assignedToIndex = -1;
    for (const [idx, imgId] of imageAssignments.entries()) {
      if (imgId === image.id) {
        assignedToIndex = idx;
        break;
      }
    }

    return `
      <div class="collected-image-item ${isSelected ? 'selected' : ''} ${isAssigned ? 'assigned' : ''}"
           onclick="selectImageForPlacement('${image.id}')"
           data-image-id="${image.id}">
        <img src="${image.thumbnailUrl}" alt="${image.title}" />
        ${isAssigned ? `<div class="image-badge">${assignedToIndex + 1}</div>` : ''}
      </div>
    `;
  }).join('');
}

// 이미지 선택
function selectImageForPlacement(imageId: string): void {
  // 이미 할당된 이미지 선택 시 할당 해제
  for (const [headingIdx, assignedId] of imageAssignments.entries()) {
    if (assignedId === imageId) {
      imageAssignments.delete(headingIdx);
      selectedImageId = null;
      renderHeadingList();
      renderCollectedImages(imageLibrary.filter(img => img.selected || imageAssignments.has(imageAssignments.get(headingIdx) as any)));
      updatePlacementPreview();
      return;
    }
  }

  selectedImageId = imageId;

  // UI 업데이트
  document.querySelectorAll('.collected-image-item').forEach(el => {
    el.classList.remove('selected');
    if (el.getAttribute('data-image-id') === imageId) {
      el.classList.add('selected');
    }
  });

  // 소제목 선택 안내
  addLog('info', '이미지를 배치할 소제목을 클릭하세요.');
}

// 소제목에 이미지 할당
function assignImageToHeading(headingIndex: number): void {
  if (!selectedImageId) {
    addLog('warn', '먼저 이미지를 선택하세요.');
    return;
  }

  // 기존 할당 제거 (같은 소제목에 다른 이미지가 있었다면)
  imageAssignments.set(headingIndex, selectedImageId);
  selectedImageId = null;

  // UI 업데이트
  renderHeadingList();
  renderCollectedImages(imageLibrary);
  updatePlacementPreview();

  addLog('success', `소제목 ${headingIndex + 1}에 이미지가 배치되었습니다.`);
}

// 배치 미리보기 업데이트
function updatePlacementPreview(): void {
  const container = document.getElementById('placement-preview');
  if (!container) return;

  if (imageAssignments.size === 0) {
    container.innerHTML = '<p class="hint">이미지를 클릭한 후 배치할 소제목을 선택하세요.</p>';
    return;
  }

  const previewItems = Array.from(imageAssignments.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([headingIdx, imageId]) => {
      const heading = generatedHeadings.find(h => h.index === headingIdx);
      const image = imageLibrary.find(img => img.id === imageId);

      if (!heading || !image) return '';

      return `
        <div class="placement-preview-item">
          <img src="${image.thumbnailUrl}" alt="" style="width: 30px; height: 30px; border-radius: 4px; object-fit: cover;" />
          <span><strong>${headingIdx + 1}. ${heading.title}</strong> 아래에 배치</span>
          <button onclick="removeAssignment(${headingIdx})" style="margin-left: auto; padding: 2px 6px; font-size: 10px;">제거</button>
        </div>
      `;
    }).join('');

  container.innerHTML = previewItems || '<p class="hint">배치된 이미지가 없습니다.</p>';
}

// 할당 제거
function removeAssignment(headingIndex: number): void {
  imageAssignments.delete(headingIndex);
  renderHeadingList();
  renderCollectedImages(imageLibrary);
  updatePlacementPreview();
}

// 모든 선택 초기화
function clearAllSelections(): void {
  imageAssignments.clear();
  selectedImageId = null;
  renderHeadingList();
  renderCollectedImages(imageLibrary);
  updatePlacementPreview();
  addLog('info', '이미지 배치가 초기화되었습니다.');
}

// "선택해서 사용하기" 버튼 클릭
async function applyImagePlacements(): Promise<void> {
  if (imageAssignments.size === 0) {
    showNotification('배치할 이미지를 선택하세요.', 'warn');
    return;
  }

  // 선택 정보를 메인 프로세스로 전송
  const selections = Array.from(imageAssignments.entries()).map(([headingIdx, imageId]) => ({
    imageId,
    targetHeadingIndex: headingIdx,
    position: 'below' as const,
  }));

  hideModal('image-placement');

  addLog('info', `${selections.length}개 이미지 배치를 적용합니다...`);

  try {
    const result = await ipcRenderer.invoke('apply-image-placements', {
      selections,
      images: imageLibrary.filter(img =>
        selections.some(s => s.imageId === img.id)
      ),
    });

    if (result.success) {
      addLog('success', `✅ ${result.inserted}개 이미지가 성공적으로 배치되었습니다.`);
      showNotification(`${result.inserted}개 이미지 배치 완료!`, 'success');
    } else {
      addLog('error', `이미지 배치 실패: ${result.error}`);
    }
  } catch (error) {
    addLog('error', `이미지 배치 오류: ${error}`);
  }
}

// 모달 닫기
function closeImagePlacementModal(): void {
  hideModal('image-placement');
}

// 전역으로 노출
(window as any).selectImageForPlacement = selectImageForPlacement;
(window as any).assignImageToHeading = assignImageToHeading;
(window as any).removeAssignment = removeAssignment;
(window as any).clearAllSelections = clearAllSelections;
(window as any).applyImagePlacements = applyImagePlacements;
(window as any).closeImagePlacementModal = closeImagePlacementModal;
```

---

## 2. main.ts - IPC 핸들러 추가

```typescript
import {
  IntelligentImagePlacer,
  NaverEditorImageInserter,
  ImageAssignment,
} from './intelligentImagePlacer';

// 이미지 플레이서 인스턴스
const imagePlacer = new IntelligentImagePlacer(config.geminiApiKey);

// ============================================
// 풀오토: AI 자동 이미지 매칭
// ============================================

ipcMain.handle('auto-match-images', async (event, data) => {
  try {
    const { headings, images } = data;

    const assignments = await imagePlacer.autoMatchImagesForFullAuto(
      headings,
      images
    );

    return {
      success: true,
      assignments,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});

// ============================================
// 반자동: 사용자 선택 이미지 배치 적용
// ============================================

ipcMain.handle('apply-image-placements', async (event, data) => {
  try {
    const { selections, images } = data;

    // 이미지 다운로드 및 Base64 변환
    for (const img of images) {
      if (!img.base64) {
        const response = await fetch(img.url);
        const buffer = await response.buffer();
        img.base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
    }

    // 현재 자동화 인스턴스의 frame 가져오기
    const frame = automation.getMainFrame();
    if (!frame) {
      throw new Error('에디터 프레임을 찾을 수 없습니다.');
    }

    // 할당 정보 생성
    const assignments: ImageAssignment[] = selections.map((sel: any) => {
      const image = images.find((img: any) => img.id === sel.imageId);
      return {
        headingIndex: sel.targetHeadingIndex,
        headingTitle: '', // 실제 제목은 frame에서 찾음
        assignedImage: image,
        confidence: 100,
        reason: '사용자 선택',
      };
    });

    // 이미지 삽입
    const result = await NaverEditorImageInserter.insertAllAssignedImages(
      frame,
      assignments,
      (ms) => new Promise(resolve => setTimeout(resolve, ms))
    );

    return {
      success: true,
      inserted: result.success,
      failed: result.failed,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});
```

---

## 3. naverBlogAutomation.ts 수정

### 3.1 풀오토 모드에서 자동 이미지 매칭 호출

```typescript
async applyStructuredContent(content: StructuredContent, options: ContentOptions): Promise<void> {
  // ... 기존 코드 ...

  // ✅ 풀오토 모드: AI 이미지 자동 매칭
  if (options.imageMode === 'full-auto' && this.collectedImages.length > 0) {
    this.log('🤖 AI 이미지 자동 매칭 시작...');

    const headingsWithContent = content.headings.map((h, idx) => ({
      index: idx,
      title: h.title,
      content: h.content,
      keywords: this.extractKeywords(h.title),
    }));

    const assignments = await this.imagePlacer.autoMatchImagesForFullAuto(
      headingsWithContent,
      this.collectedImages
    );

    // 이미지 다운로드 및 Base64 변환
    for (const assignment of assignments) {
      await this.downloadImageAsBase64(assignment.assignedImage);
    }

    // 매칭 결과를 이미지 배치에 사용
    this.imageAssignments = assignments;

    this.log(`✅ AI 이미지 매칭 완료: ${assignments.length}개`);
  }

  // ... 기존 코드 (소제목/본문 입력) ...
}

// 소제목 입력 후 이미지 삽입
private async insertImageAfterHeading(headingIndex: number): Promise<void> {
  const assignment = this.imageAssignments.find(a => a.headingIndex === headingIndex);

  if (!assignment || !assignment.assignedImage.base64) {
    return;
  }

  const frame = this.ensureMainFrame();

  const success = await NaverEditorImageInserter.insertImageBelowHeading(
    frame,
    assignment.headingTitle,
    assignment.assignedImage.base64
  );

  if (success) {
    this.log(`✅ "${assignment.headingTitle}" 아래 이미지 삽입 완료`);
  } else {
    this.log(`⚠️ "${assignment.headingTitle}" 이미지 삽입 실패`);
  }
}
```

### 3.2 키워드 추출 헬퍼

```typescript
private extractKeywords(text: string): string[] {
  // 불용어 제거
  const stopWords = new Set([
    '그리고', '하지만', '그러나', '또한', '따라서',
    '이것', '저것', '무엇', '어떻게', '왜',
  ]);

  const words = text.match(/[가-힣a-zA-Z0-9]+/g) || [];

  return words
    .filter(word => word.length > 1 && !stopWords.has(word))
    .slice(0, 5);
}
```

---

## 4. 반자동 모드 워크플로우

```
1. 사용자가 "반자동 AI 글 생성" 버튼 클릭
   ↓
2. AI가 제목/키워드 기반으로 콘텐츠 생성
   ↓
3. 동시에 이미지 자동 수집 (8개 소스)
   ↓
4. 콘텐츠 생성 완료 후 "이미지 배치 선택" 모달 표시
   ↓
5. 사용자가 이미지 클릭 → 소제목 클릭으로 배치 지정
   ↓
6. "선택해서 사용하기" 버튼 클릭
   ↓
7. 네이버 에디터에 자동 삽입
```

### 트리거 코드 (renderer.ts)

```typescript
// 반자동 AI 글 생성 완료 후
async function onSemiAutoContentGenerated(headings: Array<{ index: number; title: string }>): Promise<void> {
  // 수집된 이미지가 있으면 배치 모달 표시
  const collectedImages = imageLibrary.filter(img => img.selected || true); // 수집된 이미지

  if (collectedImages.length > 0) {
    openImagePlacementModal(headings, collectedImages);
  } else {
    addLog('warn', '수집된 이미지가 없습니다. 이미지 없이 진행합니다.');
  }
}
```

---

## 5. 테스트 체크리스트

### 풀오토 모드
- [ ] AI가 소제목 분석 후 이미지 자동 선택 확인
- [ ] 선택된 이미지가 해당 소제목 아래에 자동 삽입 확인
- [ ] 이미지 중복 사용 방지 확인
- [ ] 신뢰도(confidence) 로그 출력 확인

### 반자동 모드
- [ ] 이미지 배치 모달이 정상적으로 열리는지 확인
- [ ] 이미지 클릭 시 선택 표시 확인
- [ ] 소제목 클릭 시 이미지 할당 확인
- [ ] 배치 미리보기 업데이트 확인
- [ ] "선택해서 사용하기" 버튼 클릭 후 삽입 확인
- [ ] 네이버 에디터에서 올바른 위치에 삽입 확인

### 공통
- [ ] Base64 이미지 변환 정상 작동 확인
- [ ] 이미지 삽입 후 커서 위치 정상 확인
- [ ] 오류 발생 시 적절한 로그 출력 확인

---

## 주의사항

1. **이미지 다운로드**: 외부 URL 이미지는 반드시 Base64로 변환 후 삽입
2. **삽입 순서**: 역순으로 삽입해야 인덱스가 밀리지 않음
3. **네이버 에디터 구조**: `.se-component.se-text`로 소제목 찾기
4. **지연 시간**: 각 이미지 삽입 후 500ms 대기





