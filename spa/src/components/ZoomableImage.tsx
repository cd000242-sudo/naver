import { useState, type CSSProperties } from 'react';
import ImageLightbox, { type LightboxImage } from './ImageLightbox';

type ZoomableImageProps = {
    src: string;
    alt: string;
    title?: string;
    loading?: 'eager' | 'lazy';
    className?: string;
    imgClassName?: string;
    imgStyle?: CSSProperties;
    buttonStyle?: CSSProperties;
};

function ZoomableImage({
    src,
    alt,
    title,
    loading = 'lazy',
    className,
    imgClassName,
    imgStyle,
    buttonStyle,
}: ZoomableImageProps) {
    const [openImage, setOpenImage] = useState<LightboxImage | null>(null);
    const label = title || alt;

    return (
        <>
            <button
                type="button"
                className={className}
                aria-label={`${label} 크게 보기`}
                onClick={() => setOpenImage({ src, alt, title: label })}
                style={{
                    width: '100%',
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    display: 'block',
                    cursor: 'zoom-in',
                    lineHeight: 0,
                    textAlign: 'inherit',
                    ...buttonStyle,
                }}
            >
                <img src={src} alt={alt} loading={loading} className={imgClassName} style={imgStyle} />
            </button>
            <ImageLightbox image={openImage} onClose={() => setOpenImage(null)} />
        </>
    );
}

export default ZoomableImage;
