import React, { useState } from 'react';
import './CardBackSelector.css';

interface CardBack {
  id: string;
  name: string;
  preview: string;
  isDefault?: boolean;
  isPremium?: boolean;
  price?: number;
}

interface CardBackSelectorProps {
  currentCardBack: string;
  ownedCardBacks: string[];
  onChange?: (cardBackId: string) => void;
  onPurchase?: (cardBackId: string) => void;
}

const CARD_BACKS: CardBack[] = [
  { id: 'black', name: 'Black', preview: '/cards/backs/black.jpeg', isDefault: true },
  { id: 'red', name: 'Red', preview: '/cards/backs/red.jpeg', isDefault: true },
  { id: 'blue', name: 'Blue', preview: '/cards/backs/blue.jpeg', isDefault: true },
  { id: 'white', name: 'White', preview: '/cards/backs/white.jpeg', isDefault: true },
  {
    id: 'classic',
    name: 'Classic',
    preview: '/cards/backs/classic.jpg',
    isPremium: true,
    price: 50,
  },
  {
    id: 'burgundy',
    name: 'Burgundy',
    preview: '/cards/backs/burgundy.jpg',
    isPremium: true,
    price: 75,
  },
  { id: 'navy', name: 'Navy', preview: '/cards/backs/navy.jpg', isPremium: true, price: 75 },
  {
    id: 'gold',
    name: 'Premium Gold',
    preview: '/cards/backs/gold.jpg',
    isPremium: true,
    price: 150,
  },
];

export const CardBackSelector: React.FC<CardBackSelectorProps> = ({
  currentCardBack,
  ownedCardBacks,
  onChange,
  onPurchase,
}) => {
  const [selected, setSelected] = useState(currentCardBack);

  const isOwned = (cardBack: CardBack): boolean => {
    return cardBack.isDefault || ownedCardBacks.includes(cardBack.id);
  };

  const handleSelect = (cardBack: CardBack) => {
    if (isOwned(cardBack)) {
      setSelected(cardBack.id);
      onChange?.(cardBack.id);
    } else if (cardBack.price) {
      onPurchase?.(cardBack.id);
    }
  };

  return (
    <div className="card-back-selector">
      <h3>Card Back Design</h3>
      <div className="card-backs-grid">
        {CARD_BACKS.map((cardBack) => {
          const owned = isOwned(cardBack);
          const isSelected = selected === cardBack.id;

          return (
            <div
              key={cardBack.id}
              className={`card-back-item ${isSelected ? 'selected' : ''} ${!owned ? 'locked' : ''}`}
              onClick={() => handleSelect(cardBack)}
            >
              <div className="card-back-preview">
                <div className="card-shape">
                  <img
                    src={cardBack.preview}
                    alt={`${cardBack.name} card back`}
                    className="card-back-preview-img"
                    draggable={false}
                  />
                </div>
              </div>
              <span className="card-back-name">{cardBack.name}</span>

              {!owned && cardBack.price && <span className="card-price">💎 {cardBack.price}</span>}
              {!owned && cardBack.isPremium && <span className="card-premium">👑 VIP</span>}
              {isSelected && <div className="selected-indicator"></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CardBackSelector;
