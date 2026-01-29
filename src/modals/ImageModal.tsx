import React from 'react';
import './ImageModal.css';

interface ImageModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    alt?: string;
    caption?: string;
}

export const ImageModal: React.FC<ImageModalProps> = ({
    isOpen,
    onClose,
    imageUrl,
    alt = 'Image',
    caption
}) => {
    if (!isOpen) return null;

    return (
        <div className="image-modal-overlay" onClick={onClose}>
            <button className="image-close" onClick={onClose}>×</button>
            <div className="image-container" onClick={(e) => e.stopPropagation()}>
                <img src={imageUrl} alt={alt} />
                {caption && <p className="image-caption">{caption}</p>}
            </div>
        </div>
    );
};

export default ImageModal;
