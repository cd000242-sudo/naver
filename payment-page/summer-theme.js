/* ═══════════════════════════════════════════════════════════
   Summer Theme runtime — sun particles + ocean wave SVG
   Auto-injects into <body> on DOMContentLoaded.
   No external deps. Works on every page that loads this script.
   ═══════════════════════════════════════════════════════════ */

(function summerTheme() {
  function injectWaves() {
    if (document.querySelector('.summer-waves')) return;
    var wrap = document.createElement('div');
    wrap.className = 'summer-waves';
    wrap.innerHTML = [
      '<svg viewBox="0 0 1440 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
        '<defs>',
          '<linearGradient id="summerWaveGrad1" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#4dd0e1" stop-opacity="0.6"/>',
            '<stop offset="100%" stop-color="#00838f" stop-opacity="0.85"/>',
          '</linearGradient>',
          '<linearGradient id="summerWaveGrad2" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#80deea" stop-opacity="0.45"/>',
            '<stop offset="100%" stop-color="#0097a7" stop-opacity="0.7"/>',
          '</linearGradient>',
          '<linearGradient id="summerWaveGrad3" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#b2ebf2" stop-opacity="0.35"/>',
            '<stop offset="100%" stop-color="#26c6da" stop-opacity="0.55"/>',
          '</linearGradient>',
        '</defs>',
        '<path class="wave-shape layer-3" fill="url(#summerWaveGrad3)" d="M0,80 C240,30 480,130 720,80 C960,30 1200,130 1440,80 L1440,140 L0,140 Z"/>',
        '<path class="wave-shape layer-2" fill="url(#summerWaveGrad2)" d="M0,95 C200,55 400,135 720,95 C1040,55 1240,135 1440,95 L1440,140 L0,140 Z"/>',
        '<path class="wave-shape" fill="url(#summerWaveGrad1)" d="M0,110 C240,75 480,140 720,110 C960,75 1200,140 1440,110 L1440,140 L0,140 Z"/>',
      '</svg>'
    ].join('');
    document.body.appendChild(wrap);
  }

  function injectParticles() {
    if (document.querySelector('.summer-particles')) return;
    var container = document.createElement('div');
    container.className = 'summer-particles';

    var w = window.innerWidth;
    var count = w < 768 ? 14 : 22;

    for (var i = 0; i < count; i++) {
      var dot = document.createElement('div');
      dot.className = 'sun-dot' + (Math.random() < 0.45 ? ' small' : '');
      var startX = Math.random() * 100;
      var startY = 100 + Math.random() * 20;
      var duration = 12 + Math.random() * 18; // 12s – 30s
      var delay = -Math.random() * duration;  // pre-stagger
      dot.style.left = startX + '%';
      dot.style.top = startY + 'vh';
      dot.style.animationDuration = duration + 's';
      dot.style.animationDelay = delay + 's';
      container.appendChild(dot);
    }
    document.body.appendChild(container);
  }

  function injectScenery() {
    if (document.querySelector('.summer-scenery')) return;
    var palmSvg =
      '<svg class="summer-palm-svg" viewBox="0 0 200 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">' +
        // Trunk (curved)
        '<path d="M96 320 Q88 240, 100 165 Q108 100, 95 55" stroke="#7a4a2a" stroke-width="14" fill="none" stroke-linecap="round"/>' +
        '<path d="M96 320 Q88 240, 100 165 Q108 100, 95 55" stroke="#5d3315" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.5"/>' +
        // Coconuts
        '<circle cx="88" cy="60" r="6" fill="#5d3a1a"/>' +
        '<circle cx="102" cy="62" r="6" fill="#4a2d12"/>' +
        '<circle cx="95" cy="68" r="6" fill="#5d3a1a"/>' +
        // Palm fronds (6 leaves radiating)
        '<path d="M95 55 Q35 25, 0 45 Q40 38, 95 65 Z" fill="#3cb371" opacity="0.92"/>' +
        '<path d="M95 55 Q155 25, 195 45 Q160 38, 95 65 Z" fill="#2e8b57" opacity="0.92"/>' +
        '<path d="M95 55 Q55 0, 60 -25 Q80 25, 95 65 Z" fill="#228b22" opacity="0.92"/>' +
        '<path d="M95 55 Q135 0, 130 -25 Q110 25, 95 65 Z" fill="#3cb371" opacity="0.92"/>' +
        '<path d="M95 55 Q30 65, 5 105 Q50 80, 95 65 Z" fill="#2e8b57" opacity="0.9"/>' +
        '<path d="M95 55 Q160 65, 195 105 Q150 80, 95 65 Z" fill="#228b22" opacity="0.9"/>' +
        // Leaf veins (lighter green details)
        '<path d="M95 55 L40 35" stroke="#90ee90" stroke-width="1.5" opacity="0.6"/>' +
        '<path d="M95 55 L155 35" stroke="#90ee90" stroke-width="1.5" opacity="0.6"/>' +
        '<path d="M95 55 L65 0" stroke="#90ee90" stroke-width="1.5" opacity="0.6"/>' +
        '<path d="M95 55 L130 0" stroke="#90ee90" stroke-width="1.5" opacity="0.6"/>' +
        '<path d="M95 55 L30 95" stroke="#90ee90" stroke-width="1.5" opacity="0.6"/>' +
        '<path d="M95 55 L160 95" stroke="#90ee90" stroke-width="1.5" opacity="0.6"/>' +
      '</svg>';

    var wrap = document.createElement('div');
    wrap.className = 'summer-scenery';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="summer-sun"></div>' +
      '<div class="summer-palm palm-left">' + palmSvg + '</div>' +
      '<div class="summer-palm palm-right">' + palmSvg + '</div>';
    document.body.appendChild(wrap);
  }

  function init() {
    try {
      injectScenery();
      injectWaves();
      injectParticles();
      // Stop legacy cherry-blossom petal generation if still running
      var legacy = document.querySelectorAll('.petal-container, .petal');
      legacy.forEach(function (el) { el.remove(); });
    } catch (err) {
      console.warn('[summer-theme] init failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
