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

// ========== YouTube Music (자동 재생 + localStorage 유지) ==========
(function() {
    const btn = document.getElementById('musicToggle');
    if (!btn) return;
    let player = null, isPlaying = false, apiReady = false;
    const STORAGE_KEY = 'lp_music_playing';

    // 사용자가 명시적으로 끈 경우만 false, 그 외에는 자동 재생
    const userExplicitlyOff = localStorage.getItem(STORAGE_KEY) === 'false';
    const shouldAutoPlay = !userExplicitlyOff;

    if (shouldAutoPlay) {
        btn.textContent = '\uD83C\uDFB5';
        btn.classList.add('playing');
        btn.classList.remove('attention');
        btn.title = '\uD83C\uDF38 봄 배경음악 끄기';
        const hint = document.getElementById('musicHint');
        if (hint) hint.remove();
    }

    // Load YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    const playerDiv = document.createElement('div');
    playerDiv.id = 'yt-music-player';
    playerDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(playerDiv);

    // 브라우저 자동재생 정책 우회: 첫 사용자 인터랙션 시 재생 시작
    let autoPlayAttempted = false;
    function tryAutoPlay() {
        if (autoPlayAttempted || !apiReady || !shouldAutoPlay || isPlaying) return;
        autoPlayAttempted = true;
        try {
            player.playVideo();
            isPlaying = true;
            localStorage.setItem(STORAGE_KEY, 'true');
        } catch(e) {}
    }

    // 첫 클릭/터치/스크롤 시 자동 재생 시도
    function onFirstInteraction() {
        tryAutoPlay();
        document.removeEventListener('click', onFirstInteraction);
        document.removeEventListener('touchstart', onFirstInteraction);
        document.removeEventListener('scroll', onFirstInteraction);
        document.removeEventListener('keydown', onFirstInteraction);
    }
    if (shouldAutoPlay) {
        document.addEventListener('click', onFirstInteraction, { once: true });
        document.addEventListener('touchstart', onFirstInteraction, { once: true });
        document.addEventListener('scroll', onFirstInteraction, { once: true });
        document.addEventListener('keydown', onFirstInteraction, { once: true });
    }

    window.onYouTubeIframeAPIReady = function() {
        player = new YT.Player('yt-music-player', {
            videoId: 'r4EHi65fa-0',
            playerVars: {
                autoplay: shouldAutoPlay ? 1 : 0,
                loop: 1,
                playlist: 'r4EHi65fa-0',
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0
            },
            events: {
                onReady: function() {
                    apiReady = true;
                    player.setVolume(40);
                    if (shouldAutoPlay) {
                        player.playVideo();
                        isPlaying = true;
                        localStorage.setItem(STORAGE_KEY, 'true');
                    }
                },
                onStateChange: function(e) {
                    if (e.data === YT.PlayerState.ENDED) {
                        player.seekTo(0);
                        player.playVideo();
                    }
                    // 자동재생이 차단된 경우 감지
                    if (e.data === YT.PlayerState.PAUSED && shouldAutoPlay && !isPlaying) {
                        // 브라우저가 차단한 경우 - 사용자 인터랙션 대기
                    }
                }
            }
        });
    };

    btn.addEventListener('click', function() {
        const hint = document.getElementById('musicHint');
        if (hint) hint.remove();
        btn.classList.remove('attention');
        if (!apiReady) return;

        if (!isPlaying) {
            player.playVideo();
            isPlaying = true;
            btn.textContent = '\uD83C\uDFB5';
            btn.classList.add('playing');
            btn.title = '\uD83C\uDF38 봄 배경음악 끄기';
            localStorage.setItem(STORAGE_KEY, 'true');
        } else {
            player.pauseVideo();
            isPlaying = false;
            btn.textContent = '\uD83D\uDD07';
            btn.classList.remove('playing');
            btn.title = '\uD83C\uDF38 봄 배경음악 켜기';
            localStorage.setItem(STORAGE_KEY, 'false');
        }
    });
})();
