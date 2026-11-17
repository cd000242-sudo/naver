import InViewClip from '../motion/InViewClip';

/**
 * The All in one short cut, shown in the /products hero copy column.
 *
 * Wide screens: it sits above the headline, capped in width (and without its caption) so the headline and both
 * buttons stay in the first screen and the copy column does not grow taller than the comparison panel beside it.
 * Stacked layout (one column): the copy column becomes a flex column and the clip moves after the buttons, so the
 * headline, the paragraph and the buttons are read first. It reuses the shared screenshot frame (.pp-shot).
 */
const BASE = '/videos/pricing-showcase/site-allinone-short';

export default function HeroFilm() {
    return (
        <>
            <style>{`
.pp-hero-copy .pp-hero-film { max-width:300px; margin:0 0 24px; }
.pp-hero-copy .pp-hero-film figcaption { display:none; }
.pp-hero-film .pp-hero-film-clip { display:block; width:100%; height:auto; aspect-ratio:16 / 9; object-fit:cover; background:#0b0c0e; cursor:pointer; }
@media (max-width: 1080px) {
  .pp-hero-copy { display:flex; flex-direction:column; }
  .pp-hero-copy .pp-hero-film { order:1; width:100%; max-width:640px; margin:40px 0 0; }
  .pp-hero-copy .pp-hero-film figcaption { display:block; }
}
`}</style>
            <figure className="pp-shot pp-hero-film">
                <InViewClip className="pp-hero-film-clip" src={`${BASE}.mp4`} poster={`${BASE}.jpg`} label="All in one 소개 영상" />
                <figcaption>실제 화면으로 만든 소개 영상 · 소리 없음</figcaption>
            </figure>
        </>
    );
}
