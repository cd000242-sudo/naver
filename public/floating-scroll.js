// [2026-10-11] 바로가기 두 개는 위쪽 고정 줄(⚙·💰비용표·추천 왼쪽)에 둔다 — body 바로 아래 #top-shortcuts.
//   필터가 걸린 헤더 밖이라 화면에 고정되고, 스크롤해도 늘 보인다. 왼쪽부터 이미지 → 발행.
function ensureTopShortcutBar() {
  let bar = document.getElementById('top-shortcuts');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'top-shortcuts';
    document.body.appendChild(bar);
  }
  return bar;
}

(function initPublishShortcut() {
  const toolbar = document.getElementById('right-floating-buttons');
  const shortcut = document.getElementById('publish-shortcut-btn');
  if (!toolbar || !shortcut) return;
  ensureTopShortcutBar().appendChild(shortcut);
  let highlightTimer;
  shortcut.addEventListener('click', () => {
    const tab = document.querySelector('.tab-button[data-tab="unified"]');
    const section = document.getElementById('unified-only-publish-settings');
    if (!tab || !section) return;
    tab.click();
    // Reveal the single-post controls even after a continuous/multi-account tab.
    document.querySelector('.pub-mode-tab[data-pubmode="single"]')?.click();
    window.requestAnimationFrame(() => {
      if (!section.getClientRects().length) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const controls = document.getElementById('publish-btn-container') || section;
      controls.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'center' });
      // Focus the section, not the publish button: repeated Enter must only navigate.
      section.focus({ preventScroll: true });
      section.classList.add('publish-shortcut-highlight');
      window.clearTimeout(highlightTimer);
      highlightTimer = window.setTimeout(() => section.classList.remove('publish-shortcut-highlight'), 2200);
    });
  });
})();

// [2026-10-10] 이미지 바로가기 — 발행 바로가기와 같은 줄(왼쪽), 클릭은 이동만.
(function initImageShortcut() {
  const toolbar = document.getElementById('right-floating-buttons');
  const shortcut = document.getElementById('image-shortcut-btn');
  if (!toolbar || !shortcut) return;
  const bar = ensureTopShortcutBar();
  bar.insertBefore(shortcut, bar.firstChild);
  // [2026-10-11] ⚙·💰비용표·추천도 같은 줄 오른쪽에 모은다(위치만 옮기고 동작·모양은 그대로) — 간격이 고르게 맞는다.
  for (const id of ['admin-gear-btn', 'reopen-price-info-btn']) {
    const el = document.getElementById(id);
    if (el) bar.appendChild(el);
  }
  let highlightTimer;
  shortcut.addEventListener('click', () => {
    const tab = document.querySelector('.tab-button[data-tab="images"]');
    const panel = document.getElementById('tab-images');
    if (!tab || !panel) return;
    tab.click();
    // [2026-10-11 사장님] 소제목별 "이미지 프롬프트" 카드 목록(이미지 관리)으로 바로 간다. 카드가 없으면 탭 맨 위.
    document.getElementById('images-subtab-manage')?.click();
    window.requestAnimationFrame(() => {
      if (!panel.getClientRects().length) return;
      const list = document.getElementById('prompts-container');
      const target = list && list.getClientRects().length && list.querySelector('.prompt-item') ? list : panel;
      if (target === list) list.tabIndex = -1;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
      // 포커스는 목록(또는 패널)에 둔다 — Enter 를 반복해도 아무 버튼도 눌리지 않고 이동만 한다.
      target.focus({ preventScroll: true });
      target.classList.add('image-shortcut-highlight');
      window.clearTimeout(highlightTimer);
      highlightTimer = window.setTimeout(() => target.classList.remove('image-shortcut-highlight'), 2200);
    });
  });
})();

// 플로팅 버튼 스크롤 따라다니기 스크립트
(function() {
  let lastScrollTop = 0;
  let ticking = false;
  
  const leftButtons = document.getElementById('left-floating-buttons');
  const rightButtons = document.getElementById('right-floating-buttons');
  
  if (!leftButtons || !rightButtons) return;
  
  // 초기 위치 설정
  const initialTop = 16;
  const minTop = 16;
  
  function updateButtonPosition() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // 스크롤 방향 감지
    const scrollDirection = scrollTop > lastScrollTop ? 'down' : 'up';
    lastScrollTop = scrollTop;

    // 항상 최상단 기준으로 유지 (하단에서 잘림 방지)
    const newTop = Math.max(minTop, initialTop);
    
    // 위치 적용
    leftButtons.style.top = `${newTop}px`;
    rightButtons.style.top = `${newTop}px`;
    
    // 스크롤 다운 시 약간 축소, 업 시 원래 크기
    const baseScale = window.innerWidth <= 1400 ? 0.85 : 1;
    const scrollScale = scrollDirection === 'down' && scrollTop > 50 ? 0.95 : 1;
    const finalScale = baseScale * scrollScale;
    
    leftButtons.style.transform = `scale(${finalScale})`;
    rightButtons.style.transform = `scale(${finalScale})`;
    
    ticking = false;
  }
  
  function requestTick() {
    if (!ticking) {
      window.requestAnimationFrame(updateButtonPosition);
      ticking = true;
    }
  }
  
  // 스크롤 이벤트 리스너 (최적화)
  window.addEventListener('scroll', requestTick, { passive: true });
  
  // 초기 위치 설정
  updateButtonPosition();
  
  // 호버 효과 강화
  const floatingBtns = document.querySelectorAll('.floating-btn');
  floatingBtns.forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-3px) scale(1.05)';
    });
    
    btn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0) scale(1)';
    });
  });
})();
