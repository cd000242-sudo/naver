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

  function buildPalmSvg() {
    // Detailed palm tree — curved striped trunk + 8 fronds with individual leaflets + coconuts
    var svg = [
      '<svg class="summer-palm-svg" viewBox="0 0 240 400" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">',
        '<defs>',
          '<linearGradient id="palmTrunk" x1="0" y1="0" x2="1" y2="0">',
            '<stop offset="0%" stop-color="#5e3a1a"/>',
            '<stop offset="45%" stop-color="#9c6a3c"/>',
            '<stop offset="55%" stop-color="#a87446"/>',
            '<stop offset="100%" stop-color="#5e3a1a"/>',
          '</linearGradient>',
          '<linearGradient id="palmLeafA" x1="0" y1="0" x2="0.3" y2="1">',
            '<stop offset="0%" stop-color="#76d275"/>',
            '<stop offset="60%" stop-color="#388e3c"/>',
            '<stop offset="100%" stop-color="#1b5e20"/>',
          '</linearGradient>',
          '<linearGradient id="palmLeafB" x1="0" y1="0" x2="0.3" y2="1">',
            '<stop offset="0%" stop-color="#81c784"/>',
            '<stop offset="60%" stop-color="#2e7d32"/>',
            '<stop offset="100%" stop-color="#1b5e20"/>',
          '</linearGradient>',
          '<radialGradient id="palmCoconut" cx="0.35" cy="0.35">',
            '<stop offset="0%" stop-color="#8d5524"/>',
            '<stop offset="100%" stop-color="#3e2310"/>',
          '</radialGradient>',
        '</defs>',
        // Curved striped trunk
        '<path d="M112 400 Q100 320, 115 240 Q128 160, 116 80" stroke="url(#palmTrunk)" stroke-width="20" fill="none" stroke-linecap="round"/>',
        // Horizontal stripes on trunk
        '<g stroke="#3e2310" stroke-width="1.6" fill="none" opacity="0.55" stroke-linecap="round">',
          '<path d="M101 360 Q113 357, 122 362"/>',
          '<path d="M100 332 Q113 330, 122 334"/>',
          '<path d="M101 304 Q116 302, 124 307"/>',
          '<path d="M104 276 Q117 274, 125 278"/>',
          '<path d="M108 248 Q120 246, 127 250"/>',
          '<path d="M112 220 Q123 218, 129 222"/>',
          '<path d="M116 192 Q126 190, 130 194"/>',
          '<path d="M120 164 Q128 162, 131 166"/>',
          '<path d="M122 136 Q128 134, 130 138"/>',
          '<path d="M122 108 Q127 106, 128 110"/>',
        '</g>',
        // Coconut cluster (with shadow)
        '<ellipse cx="115" cy="90" rx="20" ry="11" fill="#000" opacity="0.18"/>',
        '<circle cx="103" cy="80" r="9" fill="url(#palmCoconut)"/>',
        '<circle cx="120" cy="78" r="9" fill="url(#palmCoconut)"/>',
        '<circle cx="111" cy="90" r="9" fill="url(#palmCoconut)"/>',
        '<circle cx="125" cy="91" r="8" fill="url(#palmCoconut)"/>',
        // Fronds — 8 directions, each with individual leaflets
        // Frond 1: hard left
        '<g>',
          '<path d="M115 75 Q70 50, 10 30 Q40 55, 110 85 Z" fill="url(#palmLeafA)"/>',
          '<path d="M40 38 L26 18 L48 42" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M58 46 L48 22 L66 50" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M76 56 L70 30 L82 60" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M94 65 L92 38 L100 70" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M115 75 L10 30" stroke="#1b5e20" stroke-width="1" opacity="0.7"/>',
        '</g>',
        // Frond 2: hard right
        '<g>',
          '<path d="M115 75 Q160 50, 220 30 Q190 55, 120 85 Z" fill="url(#palmLeafB)"/>',
          '<path d="M190 38 L204 18 L182 42" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M172 46 L182 22 L164 50" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M154 56 L160 30 L148 60" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M136 65 L138 38 L130 70" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M115 75 L220 30" stroke="#1b5e20" stroke-width="1" opacity="0.7"/>',
        '</g>',
        // Frond 3: upper-left diagonal
        '<g>',
          '<path d="M115 75 Q78 30, 55 -5 Q92 30, 120 80 Z" fill="url(#palmLeafA)"/>',
          '<path d="M82 25 L72 8 L92 30" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M96 42 L88 20 L106 48" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M115 75 L55 -5" stroke="#1b5e20" stroke-width="1" opacity="0.7"/>',
        '</g>',
        // Frond 4: upper-right diagonal
        '<g>',
          '<path d="M115 75 Q152 30, 175 -5 Q138 30, 110 80 Z" fill="url(#palmLeafB)"/>',
          '<path d="M148 25 L158 8 L138 30" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M134 42 L142 20 L124 48" stroke="#1b5e20" stroke-width="1.4" fill="#2e7d32"/>',
          '<path d="M115 75 L175 -5" stroke="#1b5e20" stroke-width="1" opacity="0.7"/>',
        '</g>',
        // Frond 5: upper-vertical-left
        '<g>',
          '<path d="M115 75 Q98 20, 100 -15 Q108 30, 118 80 Z" fill="url(#palmLeafB)"/>',
          '<path d="M108 25 L100 5 L114 30" stroke="#1b5e20" stroke-width="1.2" fill="#2e7d32"/>',
        '</g>',
        // Frond 6: upper-vertical-right
        '<g>',
          '<path d="M115 75 Q132 20, 130 -15 Q122 30, 112 80 Z" fill="url(#palmLeafA)"/>',
          '<path d="M122 25 L130 5 L116 30" stroke="#1b5e20" stroke-width="1.2" fill="#2e7d32"/>',
        '</g>',
        // Frond 7: lower-left
        '<g>',
          '<path d="M115 80 Q70 95, 30 130 Q85 100, 118 88 Z" fill="url(#palmLeafA)" opacity="0.88"/>',
          '<path d="M55 110 L40 122 L60 115" stroke="#1b5e20" stroke-width="1.3" fill="#388e3c"/>',
          '<path d="M75 100 L62 113 L80 102" stroke="#1b5e20" stroke-width="1.3" fill="#388e3c"/>',
          '<path d="M115 80 L30 130" stroke="#1b5e20" stroke-width="1" opacity="0.6"/>',
        '</g>',
        // Frond 8: lower-right
        '<g>',
          '<path d="M115 80 Q160 95, 200 130 Q145 100, 112 88 Z" fill="url(#palmLeafB)" opacity="0.88"/>',
          '<path d="M175 110 L190 122 L170 115" stroke="#1b5e20" stroke-width="1.3" fill="#388e3c"/>',
          '<path d="M155 100 L168 113 L150 102" stroke="#1b5e20" stroke-width="1.3" fill="#388e3c"/>',
          '<path d="M115 80 L200 130" stroke="#1b5e20" stroke-width="1" opacity="0.6"/>',
        '</g>',
      '</svg>',
    ];
    return svg.join('');
  }

  function injectScenery() {
    if (document.querySelector('.summer-scenery')) return;
    var palmSvg = buildPalmSvg();
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
