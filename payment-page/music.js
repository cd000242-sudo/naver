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

// ========== YouTube Music (localStorage 자동 재생) ==========
(function() {
    const btn = document.getElementById('musicToggle');
    if (!btn) return;
    let player = null, isPlaying = false, apiReady = false;
    const STORAGE_KEY = 'lp_music_playing';

    // Check if music was playing before navigation
    const wasPlaying = localStorage.getItem(STORAGE_KEY) === 'true';
    if (wasPlaying) {
        // Immediately update UI to show playing state
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

    window.onYouTubeIframeAPIReady = function() {
        player = new YT.Player('yt-music-player', {
            videoId: 'r4EHi65fa-0',
            playerVars: {
                autoplay: wasPlaying ? 1 : 0,
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
                    if (wasPlaying) {
                        player.playVideo();
                        isPlaying = true;
                    }
                },
                onStateChange: function(e) {
                    if (e.data === YT.PlayerState.ENDED) {
                        player.seekTo(0);
                        player.playVideo();
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
