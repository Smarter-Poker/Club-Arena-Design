import React from 'react';
import './TableTabs.css';

interface TableTab {
  id: string;
  name: string;
  stakes: string;
  isYourTurn: boolean;
  hasAction?: boolean;
}

interface TableTabsProps {
  tabs: TableTab[];
  activeTabId: string;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
}

export const TableTabs: React.FC<TableTabsProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}) => {
  return (
    <div className="table-tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`table-tab ${activeTabId === tab.id ? 'active' : ''} ${tab.isYourTurn ? 'your-turn' : ''}`}
          onClick={() => onSelectTab?.(tab.id)}
        >
          <div className="tab-content">
            <span className="tab-name">{tab.name}</span>
            <span className="tab-stakes">{tab.stakes}</span>
          </div>
          {tab.isYourTurn && <span className="turn-dot"></span>}
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab?.(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button className="add-table-btn" title="Join another table">
        +
      </button>
    </div>
  );
};

export default TableTabs;
