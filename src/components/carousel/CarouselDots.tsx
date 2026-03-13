import React from 'react';
import './CarouselDots.css';

interface CarouselDotsProps {
  total: number;
  current: number;
  onChange: (index: number) => void;
}

export const CarouselDots: React.FC<CarouselDotsProps> = ({ total, current, onChange }) => {
  return (
    <div className="carousel-dots">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          className={`dot ${i === current ? 'active' : ''}`}
          onClick={() => onChange(i)}
        />
      ))}
    </div>
  );
};

export default CarouselDots;
