import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { light, lightRadius, type } from '../styles/tokens';

export type LightboxImage = {
    src: string;
    alt: string;
    title?: string;
};

type ImageLightboxProps = {
    image: LightboxImage | null;
    onClose: () => void;
};

function ImageLightbox({ image, onClose }: ImageLightboxProps) {
    useEffect(() => {
        if (!image) return;

        const prevOverflow = document.body.style.overflow;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [image, onClose]);

    if (!image || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="image-lightbox-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={image.title || image.alt}
            onClick={onClose}
        >
            <style>{`
                .image-lightbox-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 30000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 28px;
                    /* The dark veil stays: it is there so the picture can be read. */
                    background: rgba(20, 24, 28, 0.72);
                }
                .image-lightbox-panel {
                    position: relative;
                    width: min(1180px, 100%);
                    max-height: calc(100vh - 56px);
                    padding: 16px;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.card}px;
                    background: ${light.surface};
                    box-shadow: ${light.shadowFloat};
                }
                .image-lightbox-scroll {
                    max-height: calc(100vh - 146px);
                    overflow: auto;
                    overscroll-behavior: contain;
                    border-radius: ${lightRadius.control}px;
                    background: ${light.raised};
                    scrollbar-width: thin;
                    scrollbar-color: ${light.lineStrong} ${light.raised};
                }
                .image-lightbox-scroll::-webkit-scrollbar {
                    width: 12px;
                    height: 12px;
                }
                .image-lightbox-scroll::-webkit-scrollbar-track {
                    background: ${light.raised};
                    border-radius: 999px;
                }
                .image-lightbox-scroll::-webkit-scrollbar-thumb {
                    background: ${light.lineStrong};
                    border: 3px solid ${light.raised};
                    border-radius: 999px;
                }
                .image-lightbox-panel img {
                    display: block;
                    width: 100%;
                    height: auto;
                    border-radius: ${lightRadius.control}px;
                    background: ${light.raised};
                }
                .image-lightbox-title {
                    margin: 12px 56px 0 4px;
                    color: ${light.text};
                    font-size: ${type.small}px;
                    font-weight: 600;
                    line-height: 1.45;
                }
                .image-lightbox-close {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 44px;
                    height: 44px;
                    padding: 0;
                    border: 1px solid ${light.line};
                    border-radius: ${lightRadius.control}px;
                    background: ${light.surface};
                    color: ${light.text};
                    cursor: pointer;
                    font-size: 24px;
                    line-height: 1;
                }
                .image-lightbox-close:hover {
                    background: ${light.raised};
                    border-color: ${light.lineStrong};
                }
                .image-lightbox-close:focus-visible {
                    outline: 2px solid ${light.text};
                    outline-offset: 2px;
                }
                @media (max-width: 640px) {
                    .image-lightbox-backdrop {
                        padding: 12px;
                    }
                    .image-lightbox-panel {
                        padding: 8px;
                    }
                    .image-lightbox-scroll {
                        max-height: calc(100vh - 116px);
                    }
                    .image-lightbox-title {
                        font-size: ${type.meta}px;
                    }
                    .image-lightbox-close {
                        top: 4px;
                        right: 4px;
                    }
                }
            `}</style>
            <div className="image-lightbox-panel" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="이미지 닫기">×</button>
                <div className="image-lightbox-scroll">
                    <img src={image.src} alt={image.alt} />
                </div>
                {image.title ? <div className="image-lightbox-title">{image.title}</div> : null}
            </div>
        </div>,
        document.body,
    );
}

export default ImageLightbox;
