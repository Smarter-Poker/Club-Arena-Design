import React from 'react';
import './SideNav.css';

interface SideNavProps {
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}

export const SideNav: React.FC<SideNavProps> = ({ children, collapsed = false, onToggle }) => {
  return (
    <aside className={`side-nav ${collapsed ? 'collapsed' : ''}`}>
      {onToggle && (
        <button className="nav-toggle" onClick={onToggle}>
          {collapsed ? '→' : '←'}
        </button>
      )}
      <nav className="nav-content">{children}</nav>
    </aside>
  );
};

export default SideNav;
