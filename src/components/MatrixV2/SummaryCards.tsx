import React, { useMemo } from 'react';
import { Order } from '../../typesV2';

interface SummaryCardsProps {
  data: Order[];
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ data }) => {
  const stats = useMemo(() => {
    const quickCommerce = data.filter(o => o.source === 'EXPRESS').length;
    const scheduleCommerce = data.filter(o => o.source === 'DEFAULT').length;
    const total = data.length;

    // Calculate orders in progress (not delivered)
    const inProgress = data.filter(o => {
      const status = o.partial_status.toUpperCase();
      return status !== 'DELIVERED' && status !== 'FINISHED' && status !== 'CANCELLED';
    });

    return {
      quickCommerce,
      scheduleCommerce,
      total,
      inProgressCount: inProgress.length
    };
  }, [data]);

  return (
    <>
      {/* Order Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card quick-commerce">
          <div className="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-label">Quick Commerce</span>
            <span className="card-value">{stats.quickCommerce}</span>
          </div>
          <div className="card-indicator green"></div>
        </div>

        <div className="summary-card schedule-commerce">
          <div className="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-label">Schedule Commerce</span>
            <span className="card-value">{stats.scheduleCommerce}</span>
          </div>
          <div className="card-indicator blue"></div>
        </div>

        <div className="summary-card total-volume">
          <div className="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-label">Total Volume</span>
            <span className="card-value">{stats.total}</span>
          </div>
          <div className="card-indicator purple"></div>
        </div>

        <div className="summary-card in-progress">
          <div className="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-label">In Progress</span>
            <span className="card-value">{stats.inProgressCount}</span>
          </div>
          <div className="card-indicator orange"></div>
        </div>
      </div>
    </>
  );
};

export default SummaryCards;
