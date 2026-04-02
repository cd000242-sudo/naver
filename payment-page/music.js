// ========== Cherry Blossom Petals ==========
(function() {
    const container = document.getElementById('petalContainer');
    if (!container) return;
    const PETAL_COUNT = 30;
    function createPetal() {
        const petal = document.createElement('div');
        petal.className = 'petal';
        const size = Math.random() * 14 + 8;
        petal.style.width = size + 'px';
        petal.style.height = size + 'px';
        petal.style.left = Math.random() * 100 + '%';
        petal.style.animationDuration = (Math.random() * 8 + 7) + 's';
        petal.style.animationDelay = (Math.random() * 10) + 's';
        container.appendChild(petal);
    }
    for (let i = 0; i < PETAL_COUNT; i++) createPetal();
})();

// ========== Premium Mini Music Player ==========
(function() {
    // === Config ===
    const PLAYLIST = [
        { id: 'r4EHi65fa-0', title: '🌸 Spring Breeze' },
        { id: 'WYp9Eo9T3BA', title: '🌿 Peaceful Garden' },
        { id: '1fueZCTYkpA', title: '☁️ Cloud Walk' },
        { id: 'lTRiuFIWV54', title: '🎋 Bamboo Rain' },
        { id: 'jfKfPfyJRdk', title: '🎵 Lofi Beats' },
    ];
    const STORAGE_KEY = 'lp_music_playing';
    const TRACK_KEY = 'lp_music_track';
    const TIME_KEY = 'lp_music_time';        // ← NEW: 재생 위치 저장
    const TIME_SAVE_KEY = 'lp_music_time_ts'; // ← NEW: 저장 시점 타임스탬프

    let player = null, isPlaying = false, apiReady = false;
    let currentTrack = parseInt(localStorage.getItem(TRACK_KEY) || '0') % PLAYLIST.length;
    const userExplicitlyOff = localStorage.getItem(STORAGE_KEY) === 'false';
    const shouldAutoPlay = !userExplicitlyOff;
    let expanded = false;
    let timeSaveInterval = null; // ← 주기적 시간 저장 인터벌

    // === Remove old elements ===
    const oldBtn = document.getElementById('musicToggle');
    if (oldBtn) oldBtn.remove();
    const oldHint = document.getElementById('musicHint');
    if (oldHint) oldHint.remove();
    // Remove youtube-float (left bottom empty spot)
    document.querySelectorAll('.youtube-float').forEach(el => el.remove());

    // === Inject CSS ===
    const style = document.createElement('style');
    style.textContent = `
        /* ===== Mini Music Player ===== */
        .lp-music-player {
            position: fixed; bottom: 100px; right: 24px; z-index: 10000;
            display: flex; flex-direction: column; align-items: flex-end; gap: 0;
            font-family: 'Pretendard Variable', 'Inter', 'Noto Sans KR', sans-serif;
            transition: all 0.4s cubic-bezier(.4,0,.2,1);
        }

        /* ===== FAB (Floating Action Button) ===== */
        .lp-music-fab {
            display: flex; align-items: center; gap: 8px;
            height: 46px; padding: 0 16px 0 14px;
            border-radius: 23px;
            background: linear-gradient(135deg, rgba(255,183,197,0.35) 0%, rgba(255,107,138,0.25) 100%);
            border: 1px solid rgba(255,183,197,0.5);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            cursor: pointer;
            font-size: 14px; transition: all 0.3s;
            box-shadow: 0 4px 24px rgba(255,107,138,0.25), 0 0 0 0 rgba(255,183,197,0);
            position: relative; overflow: visible;
        }
        .lp-fab-play-icon {
            width: 24px; height: 24px; border-radius: 50%;
            background: linear-gradient(135deg, #ff6b8a, #e0558e);
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; color: #fff; flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(255,107,138,0.4);
        }
        .lp-music-fab:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 32px rgba(255,107,138,0.4), 0 0 20px rgba(255,183,197,0.2);
        }
        .lp-music-fab.playing {
            animation: lpmFabPulse 2s ease-in-out infinite;
            background: linear-gradient(135deg, rgba(255,183,197,0.5) 0%, rgba(255,107,138,0.4) 100%);
        }
        @keyframes lpmFabPulse {
            0%, 100% { box-shadow: 0 4px 24px rgba(255,107,138,0.25); }
            50% { box-shadow: 0 6px 36px rgba(255,107,138,0.5), 0 0 48px rgba(255,183,197,0.15); }
        }

        /* FAB Icon */
        .lp-fab-icon {
            font-size: 20px; line-height: 1; flex-shrink: 0;
        }

        /* FAB Label */
        .lp-fab-label {
            font-size: 12px; font-weight: 700; letter-spacing: 0.5px;
            color: rgba(255,255,255,0.9);
            white-space: nowrap;
        }
        .lp-fab-sublabel {
            font-size: 10px; font-weight: 500;
            color: rgba(255,183,197,0.8);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 100px;
        }

        /* Equalizer bars on FAB when playing */
        .lp-eq-bars {
            display: flex; align-items: flex-end; gap: 2px; height: 16px; flex-shrink: 0;
        }
        .lp-eq-bars span {
            width: 3px; border-radius: 2px;
            background: linear-gradient(180deg, #ffb7c5, #ff6b8a);
        }
        .lp-eq-bars.active span { animation: lpmEq 0.8s ease-in-out infinite alternate; }
        .lp-eq-bars span:nth-child(1) { height: 5px; animation-delay: 0s; }
        .lp-eq-bars span:nth-child(2) { height: 10px; animation-delay: 0.15s; }
        .lp-eq-bars span:nth-child(3) { height: 7px; animation-delay: 0.3s; }
        .lp-eq-bars span:nth-child(4) { height: 12px; animation-delay: 0.1s; }
        .lp-eq-bars span:nth-child(5) { height: 8px; animation-delay: 0.25s; }
        @keyframes lpmEq {
            0% { height: 3px; }
            100% { height: 16px; }
        }
        .lp-eq-bars:not(.active) span { height: 3px !important; animation: none !important; }

        /* Expanded Panel */
        .lp-music-panel {
            width: 260px; margin-bottom: 10px;
            background: rgba(18,14,28,0.82);
            border: 1px solid rgba(255,183,197,0.25);
            border-radius: 18px; padding: 16px 16px 14px;
            backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
            box-shadow: 0 12px 48px rgba(0,0,0,0.45), 0 0 24px rgba(255,183,197,0.08);
            opacity: 0; transform: translateY(12px) scale(0.95);
            pointer-events: none; transition: all 0.35s cubic-bezier(.4,0,.2,1);
            overflow: hidden;
        }
        .lp-music-panel.open {
            opacity: 1; transform: translateY(0) scale(1);
            pointer-events: all;
        }
        .lp-panel-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 12px;
        }
        .lp-panel-title {
            font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px;
            color: rgba(255,183,197,0.7); font-weight: 700;
        }
        .lp-panel-close {
            width: 22px; height: 22px; border-radius: 50%; border: none;
            background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5);
            font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .lp-panel-close:hover { background: rgba(255,255,255,0.15); color: #fff; }

        /* Now Playing */
        .lp-now-playing {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 12px; margin-bottom: 12px;
            background: rgba(255,183,197,0.06); border-radius: 12px;
            border: 1px solid rgba(255,183,197,0.1);
        }
        .lp-now-art {
            width: 36px; height: 36px; border-radius: 10px;
            background: linear-gradient(135deg, #ff8fa3 0%, #ff6b8a 50%, #e0558e 100%);
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; flex-shrink: 0;
            box-shadow: 0 2px 12px rgba(255,107,138,0.3);
        }
        .lp-now-info { flex: 1; min-width: 0; }
        .lp-now-label {
            font-size: 9px; text-transform: uppercase; letter-spacing: 1px;
            color: rgba(255,183,197,0.5); margin-bottom: 2px;
        }
        .lp-now-title {
            font-size: 13px; font-weight: 600; color: #fff;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* Controls */
        .lp-controls {
            display: flex; align-items: center; justify-content: center; gap: 8px;
            margin-bottom: 12px;
        }
        .lp-ctrl-btn {
            width: 34px; height: 34px; border-radius: 50%; border: none;
            background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7);
            font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .lp-ctrl-btn:hover { background: rgba(255,255,255,0.12); color: #fff; transform: scale(1.08); }
        .lp-ctrl-play {
            width: 44px; height: 44px; font-size: 18px;
            background: linear-gradient(135deg, rgba(255,183,197,0.3) 0%, rgba(255,107,138,0.25) 100%);
            border: 1px solid rgba(255,183,197,0.35); color: #fff;
        }
        .lp-ctrl-play:hover {
            background: linear-gradient(135deg, rgba(255,183,197,0.45) 0%, rgba(255,107,138,0.4) 100%);
            box-shadow: 0 4px 20px rgba(255,107,138,0.3);
        }

        /* Playlist */
        .lp-playlist {
            max-height: 140px; overflow-y: auto;
            border-top: 1px solid rgba(255,255,255,0.06);
            padding-top: 8px;
        }
        .lp-playlist::-webkit-scrollbar { width: 3px; }
        .lp-playlist::-webkit-scrollbar-track { background: transparent; }
        .lp-playlist::-webkit-scrollbar-thumb { background: rgba(255,183,197,0.3); border-radius: 3px; }
        .lp-pl-item {
            display: flex; align-items: center; gap: 8px;
            padding: 7px 10px; border-radius: 8px; cursor: pointer;
            transition: all 0.2s; font-size: 12px; color: rgba(255,255,255,0.55);
        }
        .lp-pl-item:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.8); }
        .lp-pl-item.active {
            background: rgba(255,183,197,0.1); color: #ffb7c5;
            font-weight: 600;
        }
        .lp-pl-num { width: 16px; text-align: center; font-size: 10px; opacity: 0.5; flex-shrink: 0; }
        .lp-pl-item.active .lp-pl-num { opacity: 1; }
        .lp-pl-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* First-time entrance animation */
        @keyframes lpmFabEntrance {
            0% { opacity: 0; transform: translateX(60px) scale(0.8); }
            60% { opacity: 1; transform: translateX(-5px) scale(1.03); }
            100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        .lp-music-fab.entrance {
            animation: lpmFabEntrance 0.8s cubic-bezier(.4,0,.2,1) both;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .lp-music-player { bottom: 90px; right: 16px; }
            .lp-music-fab { height: 40px; padding: 0 12px 0 10px; gap: 6px; }
            .lp-fab-icon { font-size: 16px; }
            .lp-fab-label { font-size: 11px; }
            .lp-fab-sublabel { display: none; }
            .lp-music-panel { width: 240px; }
        }
    `;
    document.head.appendChild(style);

    // === Build DOM ===
    const wrapper = document.createElement('div');
    wrapper.className = 'lp-music-player';
    wrapper.innerHTML = `
        <div class="lp-music-panel" id="lpmPanel">
            <div class="lp-panel-header">
                <span class="lp-panel-title">🌸 Playlist</span>
                <button class="lp-panel-close" id="lpmClose">✕</button>
            </div>
            <div class="lp-now-playing">
                <div class="lp-now-art" id="lpmArt">🎵</div>
                <div class="lp-now-info">
                    <div class="lp-now-label">Now Playing</div>
                    <div class="lp-now-title" id="lpmTitle">${PLAYLIST[currentTrack].title}</div>
                </div>
            </div>
            <div class="lp-controls">
                <button class="lp-ctrl-btn" id="lpmPrev" title="이전 곡">⏮</button>
                <button class="lp-ctrl-btn lp-ctrl-play" id="lpmPlay" title="재생/일시정지">▶</button>
                <button class="lp-ctrl-btn" id="lpmNext" title="다음 곡">⏭</button>
            </div>
            <div class="lp-playlist" id="lpmList"></div>
        </div>
        <div class="lp-music-fab entrance" id="lpmFab" title="🌸 음악 플레이어">
            <div class="lp-fab-play-icon" id="lpmFabPlayIcon">▶</div>
            <div style="display:flex;flex-direction:column;gap:1px;">
                <span class="lp-fab-label">♪ Music</span>
                <span class="lp-fab-sublabel" id="lpmFabTrack">${PLAYLIST[currentTrack].title}</span>
            </div>
            <div class="lp-eq-bars" id="lpmEq">
                <span></span><span></span><span></span><span></span><span></span>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);

    const panel = document.getElementById('lpmPanel');
    const fab = document.getElementById('lpmFab');
    const playBtn = document.getElementById('lpmPlay');
    const prevBtn = document.getElementById('lpmPrev');
    const nextBtn = document.getElementById('lpmNext');
    const closeBtn = document.getElementById('lpmClose');
    const titleEl = document.getElementById('lpmTitle');
    const artEl = document.getElementById('lpmArt');
    const eqEl = document.getElementById('lpmEq');
    const listEl = document.getElementById('lpmList');
    const fabTrackEl = document.getElementById('lpmFabTrack');

    // Remove entrance animation after it plays
    setTimeout(() => { fab.classList.remove('entrance'); }, 1000);

    // Build playlist items
    function renderPlaylist() {
        listEl.innerHTML = PLAYLIST.map((t, i) =>
            `<div class="lp-pl-item ${i === currentTrack ? 'active' : ''}" data-idx="${i}">
                <span class="lp-pl-num">${i === currentTrack ? '♪' : (i + 1)}</span>
                <span class="lp-pl-name">${t.title}</span>
            </div>`
        ).join('');
        listEl.querySelectorAll('.lp-pl-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.idx);
                if (idx !== currentTrack) { loadTrack(idx); }
            });
        });
    }
    renderPlaylist();

    function updateUI() {
        titleEl.textContent = PLAYLIST[currentTrack].title;
        artEl.textContent = PLAYLIST[currentTrack].title.split(' ')[0]; // emoji
        playBtn.textContent = isPlaying ? '⏸' : '▶';
        fab.classList.toggle('playing', isPlaying);
        eqEl.classList.toggle('active', isPlaying);
        // Update FAB play icon
        const fabPlayIcon = document.getElementById('lpmFabPlayIcon');
        if (fabPlayIcon) fabPlayIcon.textContent = isPlaying ? '⏸' : '▶';
        // Update FAB sub-label with current track name
        if (fabTrackEl) {
            fabTrackEl.textContent = isPlaying ? PLAYLIST[currentTrack].title : '일시정지';
        }
        renderPlaylist();
    }

    // === FAB toggle ===
    fab.addEventListener('click', () => {
        if (!expanded) {
            expanded = true;
            panel.classList.add('open');
        } else {
            // Toggle play/pause if panel open
            togglePlay();
        }
    });
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        expanded = false;
        panel.classList.remove('open');
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (expanded && !wrapper.contains(e.target)) {
            expanded = false;
            panel.classList.remove('open');
        }
    });

    // === Controls ===
    playBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); loadTrack((currentTrack - 1 + PLAYLIST.length) % PLAYLIST.length); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); loadTrack((currentTrack + 1) % PLAYLIST.length); });

    function togglePlay() {
        if (!apiReady) return;
        if (!isPlaying) {
            player.playVideo();
            isPlaying = true;
            localStorage.setItem(STORAGE_KEY, 'true');
            startTimeSaving();
        } else {
            player.pauseVideo();
            isPlaying = false;
            localStorage.setItem(STORAGE_KEY, 'false');
            saveCurrentTime(); // 일시정지 시 현재 시간 저장
            stopTimeSaving();
        }
        updateUI();
    }

    function loadTrack(idx) {
        currentTrack = idx;
        localStorage.setItem(TRACK_KEY, idx);
        // 트랙을 변경했으므로 저장된 시간 초기화
        localStorage.removeItem(TIME_KEY);
        localStorage.removeItem(TIME_SAVE_KEY);
        if (apiReady && player) {
            player.loadVideoById(PLAYLIST[idx].id);
            isPlaying = true;
            localStorage.setItem(STORAGE_KEY, 'true');
            startTimeSaving();
        }
        updateUI();
    }

    // === 재생 시간 저장/복원 (탭 이동 시 이어재생) ===
    function saveCurrentTime() {
        if (apiReady && player && typeof player.getCurrentTime === 'function') {
            try {
                const t = player.getCurrentTime();
                if (t > 0) {
                    localStorage.setItem(TIME_KEY, t.toString());
                    localStorage.setItem(TIME_SAVE_KEY, Date.now().toString());
                }
            } catch(e) {}
        }
    }

    function startTimeSaving() {
        stopTimeSaving();
        timeSaveInterval = setInterval(saveCurrentTime, 2000); // 2초마다 저장
    }

    function stopTimeSaving() {
        if (timeSaveInterval) {
            clearInterval(timeSaveInterval);
            timeSaveInterval = null;
        }
    }

    function getResumeTime() {
        const savedTime = parseFloat(localStorage.getItem(TIME_KEY) || '0');
        const savedTs = parseInt(localStorage.getItem(TIME_SAVE_KEY) || '0');
        if (savedTime <= 0 || savedTs <= 0) return 0;
        // 저장 후 경과 시간 계산 (탭 이동 중에도 음악이 흘렀다 가정)
        const elapsed = (Date.now() - savedTs) / 1000;
        return savedTime + elapsed;
    }

    // 페이지 떠나기 전 현재 시간 저장
    window.addEventListener('beforeunload', () => {
        saveCurrentTime();
    });

    // === YouTube IFrame API ===
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    const playerDiv = document.createElement('div');
    playerDiv.id = 'yt-music-player';
    playerDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(playerDiv);

    // Auto-play on first interaction
    let autoPlayAttempted = false;
    function tryAutoPlay() {
        if (autoPlayAttempted || !apiReady || !shouldAutoPlay || isPlaying) return;
        autoPlayAttempted = true;
        try {
            const resumeTime = getResumeTime();
            if (resumeTime > 0) {
                player.seekTo(resumeTime, true);
            }
            player.playVideo();
            isPlaying = true;
            localStorage.setItem(STORAGE_KEY, 'true');
            startTimeSaving();
            updateUI();
        } catch(e) {}
    }
    function onFirstInteraction() {
        tryAutoPlay();
        ['click','touchstart','scroll','keydown'].forEach(ev => document.removeEventListener(ev, onFirstInteraction));
    }
    if (shouldAutoPlay) {
        ['click','touchstart','scroll','keydown'].forEach(ev => document.addEventListener(ev, onFirstInteraction, { once: true }));
    }

    window.onYouTubeIframeAPIReady = function() {
        const resumeTime = getResumeTime();
        player = new YT.Player('yt-music-player', {
            videoId: PLAYLIST[currentTrack].id,
            playerVars: {
                autoplay: shouldAutoPlay ? 1 : 0,
                start: resumeTime > 0 ? Math.floor(resumeTime) : 0, // ← 이어재생 위치
                loop: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0
            },
            events: {
                onReady: function() {
                    apiReady = true;
                    player.setVolume(40);
                    if (shouldAutoPlay) {
                        // seekTo로 더 정밀하게 이어재생
                        if (resumeTime > 0) {
                            player.seekTo(resumeTime, true);
                        }
                        player.playVideo();
                        isPlaying = true;
                        localStorage.setItem(STORAGE_KEY, 'true');
                        startTimeSaving();
                    }
                    updateUI();
                },
                onStateChange: function(e) {
                    if (e.data === YT.PlayerState.ENDED) {
                        // Auto next track
                        loadTrack((currentTrack + 1) % PLAYLIST.length);
                    }
                    // YouTube가 실제로 재생 중인지 상태 동기화
                    if (e.data === YT.PlayerState.PLAYING) {
                        isPlaying = true;
                        startTimeSaving();
                        updateUI();
                    } else if (e.data === YT.PlayerState.PAUSED) {
                        isPlaying = false;
                        saveCurrentTime();
                        stopTimeSaving();
                        updateUI();
                    }
                }
            }
        });
    };

    // Initial UI
    if (shouldAutoPlay) { fab.classList.add('playing'); eqEl.classList.add('active'); }
    updateUI();
})();
