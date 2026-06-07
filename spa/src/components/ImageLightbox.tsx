import { useEffect } from 'react';
import { createPortal } from 'react-dom';

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
                    background: rgba(3, 7, 18, 0.82);
                    backdrop-filter: blur(18px);
                }
                .image-lightbox-panel {
                    position: relative;
                    width: min(1180px, 100%);
                    max-height: calc(100vh - 56px);
                    padding: 18px;
                    border: 1px solid rgba(255,255,255,0.18);
                    border-radius: 14px;
                    background: linear-gradient(180deg, rgba(15,23,42,0.96), rgba(4,8,18,0.98));
                    box-shadow: 0 28px 100px rgba(0,0,0,0.55);
                }
                .image-lightbox-scroll {
                    max-height: calc(100vh - 146px);
                    overflow: auto;
                    overscroll-behavior: contain;
                    border-radius: 10px;
                    background: #020617;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(244, 201, 93, 0.78) rgba(15, 23, 42, 0.92);
                }
                .image-lightbox-scroll::-webkit-scrollbar {
                    width: 12px;
                    height: 12px;
                }
                .image-lightbox-scroll::-webkit-scrollbar-track {
                    background: rgba(15, 23, 42, 0.92);
                    border-radius: 999px;
                }
                .image-lightbox-scroll::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, rgba(244, 201, 93, 0.95), rgba(68, 215, 182, 0.85));
                    border: 3px solid rgba(15, 23, 42, 0.92);
                    border-radius: 999px;
                }
                .image-lightbox-panel img {
                    display: block;
                    width: 100%;
                    height: auto;
                    border-radius: 10px;
                    background: #020617;
                }
                .image-lightbox-title {
                    margin: 12px 48px 0 2px;
                    color: #e5edf7;
                    font-size: 15px;
                    font-weight: 800;
                    line-height: 1.45;
                }
                .image-lightbox-close {
                    position: absolute;
                    top: 14px;
                    right: 14px;
                    width: 38px;
                    height: 38px;
                    border: 1px solid rgba(255,255,255,0.18);
                    border-radius: 999px;
                    background: rgba(15,23,42,0.82);
                    color: #ffffff;
                    cursor: pointer;
                    font-size: 24px;
                    line-height: 1;
                }
                .image-lightbox-close:hover {
                    background: rgba(244, 201, 93, 0.22);
                    border-color: rgba(244, 201, 93, 0.55);
                }
                @media (max-width: 640px) {
                    .image-lightbox-backdrop {
                        padding: 14px;
                    }
                    .image-lightbox-panel {
                        padding: 10px;
                        border-radius: 12px;
                    }
                    .image-lightbox-scroll {
                        max-height: calc(100vh - 116px);
                    }
                    .image-lightbox-title {
                        margin-right: 42px;
                        font-size: 13px;
                    }
                    .image-lightbox-close {
                        width: 34px;
                        height: 34px;
                        top: 10px;
                        right: 10px;
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
