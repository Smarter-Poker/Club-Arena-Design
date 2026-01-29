import React, { useState, useRef } from 'react';
import './Carousel.css';

interface CarouselProps<T> {
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    itemWidth?: number;
    gap?: number;
}

export function Carousel<T>({
    items,
    renderItem,
    itemWidth = 280,
    gap = 16
}: CarouselProps<T>) {
    const [scrollIndex, setScrollIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (!containerRef.current) return;
        const scrollAmount = itemWidth + gap;
        const newIndex = direction === 'left'
            ? Math.max(0, scrollIndex - 1)
            : Math.min(items.length - 1, scrollIndex + 1);
        setScrollIndex(newIndex);
        containerRef.current.scrollTo({
            left: newIndex * scrollAmount,
            behavior: 'smooth'
        });
    };

    return (
        <div className="carousel">
            <button
                className="carousel-btn left"
                onClick={() => scroll('left')}
                disabled={scrollIndex === 0}
            >
                ‹
            </button>
            <div
                ref={containerRef}
                className="carousel-track"
                style={{ gap }}
            >
                {items.map((item, idx) => (
                    <div
                        key={idx}
                        className="carousel-item"
                        style={{ minWidth: itemWidth }}
                    >
                        {renderItem(item, idx)}
                    </div>
                ))}
            </div>
            <button
                className="carousel-btn right"
                onClick={() => scroll('right')}
                disabled={scrollIndex >= items.length - 1}
            >
                ›
            </button>
        </div>
    );
}

export default Carousel;
