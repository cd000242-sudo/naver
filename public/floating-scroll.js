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
