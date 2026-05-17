import React from 'react';

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  view: 'management' | 'store';
  onViewChange: (view: 'management' | 'store') => void;
  syncTime: string;
  currentTime: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title,
  subtitle,
  view,
  onViewChange,
  syncTime,
  currentTime,
  showBackButton,
  onBack
}) => {
  return (
    <header className="dashboard-header">
      <div className="header-left">
        {showBackButton && (
          <button className="back-btn" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="title-section">
          <h1 className="dashboard-title">{title}</h1>
          <p className="dashboard-subtitle">{subtitle} <span className="text-[10px] opacity-40 ml-1">v7.2</span></p>
        </div>
      </div>
      <div className="header-right">
        <div className="view-toggle">
          <button
            className={`toggle-btn ${view === 'management' ? 'active' : ''}`}
            onClick={() => onViewChange('management')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Management
          </button>
          <button
            className={`toggle-btn ${view === 'store' ? 'active' : ''}`}
            onClick={() => onViewChange('store')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Store Level
          </button>
        </div>
        <div className="user-profile">
          <div className="profile-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span className="user-name">Operations</span>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
