import InViewClip from '../motion/InViewClip';

/**
 * The product's silent motion clip (the long cut already shown on /products), placed right under the hero of a
 * product detail page. It reuses the shared screenshot frame (.pp-shot) so it reads as one more real-screen card.
 * Nothing is downloaded until the clip scrolls into view (InViewClip: preload="none" + poster).
 */
const FILMS = {
    naver: 'Better Life Naver',
    orbit: 'Leadernam Orbit',
    leword: 'LEWORD',
} as const;

export type DetailFilmId = keyof typeof FILMS;

export default function DetailFilm({ id }: { id: DetailFilmId }) {
    const base = `/videos/pricing-showcase/site-${id}`;
    return (
        <section className="pp-section pp-film" aria-label={`${FILMS[id]} 소개 영상`}>
            <style>{`
.pp-section.pp-film { padding-top:32px; }
.pp-film .pp-shot { max-width:1080px; margin:0 auto; }
.pp-film .pp-film-clip { display:block; width:100%; height:auto; aspect-ratio:16 / 9; object-fit:cover; background:#0b0c0e; cursor:pointer; }
@media (max-width: 720px) {
  .pp-section.pp-film { padding-top:24px; }
}
`}</style>
            <div className="pp-wrap">
                <figure className="pp-shot">
                    <InViewClip className="pp-film-clip" src={`${base}.mp4`} poster={`${base}.jpg`} label={`${FILMS[id]} 소개 영상`} />
                    <figcaption>실제 화면으로 만든 소개 영상 · 소리 없음</figcaption>
                </figure>
            </div>
        </section>
    );
}
