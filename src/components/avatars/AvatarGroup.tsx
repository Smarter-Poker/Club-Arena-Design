import React from 'react';
import './AvatarGroup.css';

interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  size?: 'small' | 'medium' | 'large';
  remainingCount?: number;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  children,
  max,
  size = 'medium',
  remainingCount,
}) => {
  const childArray = React.Children.toArray(children);
  const visibleItems = max ? childArray.slice(0, max) : childArray;
  const remaining = remainingCount ?? (max ? childArray.length - max : 0);

  return (
    <div className={`avatar-group size-${size}`}>
      {visibleItems}
      {remaining > 0 && <div className="avatar-more">+{remaining}</div>}
    </div>
  );
};

export default AvatarGroup;
