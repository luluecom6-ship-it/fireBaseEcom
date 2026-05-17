import React, { useMemo, useState } from 'react';
import { Order, STATUS_ORDER, STATUS_LABELS, TIME_INTERVALS, getStatusColor, getAgeBucket, getOrderAgeMinutes, getSkuCount, getPickedSkuCount, getTotalItems, getPickedItems, extractStoreCode, mapStatus } from '../../typesV2';
import OrderPopup, { PopupOrder } from './OrderPopup';

interface HourlyAgeingMatrixProps {
  data: Order[];
  onOrderClick?: (order: Order) => void;
}

interface CellPopupData {
  status: string;
  interval: string;
  orders: PopupOrder[];
  position: { x: number; y: number };
  header: string;
}

const HourlyAgeingMatrix: React.FC<HourlyAgeingMatrixProps> = ({ data, onOrderClick }) => {
  const [popup, setPopup] = useState<CellPopupData | null>(null);

  const { matrixData, orderDetails } = useMemo(() => {
    // Filter Express orders (Quick Commerce)
    const quickOrders = data.filter(o => o.source === 'EXPRESS');

    const matrix: Record<string, Record<string, number>> = {};
    const details: Record<string, Record<string, Array<{ jobNumber: string; storeCode: string; skuPicked: number; skuTotal: number; itemsPicked: number; itemsTotal: number }>>> = {};

    // Initialize matrix with all statuses
    STATUS_ORDER.forEach(status => {
      matrix[status] = {};
      details[status] = {};
      TIME_INTERVALS.forEach(interval => {
        matrix[status][interval] = 0;
        details[status][interval] = [];
      });
    });

    quickOrders.forEach(order => {
      // Use mapStatus for consistent status mapping
      const displayStatus = mapStatus(order.partial_status);

      const ageMinutes = getOrderAgeMinutes(order);
      const interval = getAgeBucket(ageMinutes);

      if (matrix[displayStatus] && details[displayStatus]) {
        matrix[displayStatus][interval]++;

        details[displayStatus][interval].push({
          jobNumber: order.job_number,
          storeCode: extractStoreCode(order.store_name),
          skuPicked: getPickedSkuCount(order),
          skuTotal: getSkuCount(order),
          itemsPicked: getPickedItems(order),
          itemsTotal: getTotalItems(order)
        });
      }
    });

    return { matrixData: matrix, orderDetails: details };
  }, [data]);

  const totalCounts = useMemo(() => {
    const totals: Record<string, number> = {};
    TIME_INTERVALS.forEach(interval => {
      totals[interval] = 0;
      STATUS_ORDER.forEach(status => {
        totals[interval] += matrixData[status]?.[interval] || 0;
      });
    });
    return totals;
  }, [matrixData]);

  const totalOrders = useMemo(() => {
    return Object.values(totalCounts).reduce((a, b) => a + b, 0);
  }, [totalCounts]);

  const getCellBgColor = (count: number): string => {
    if (count === 0) return 'transparent';
    if (count <= 2) return 'rgba(127, 29, 29, 0.2)';
    if (count <= 5) return 'rgba(127, 29, 29, 0.35)';
    return 'rgba(127, 29, 29, 0.5)';
  };

  const handleCellClick = (
    e: React.MouseEvent,
    status: string,
    interval: string,
    orders: Array<{ jobNumber: string; storeCode: string; skuPicked: number; skuTotal: number; itemsPicked: number; itemsTotal: number }>
  ) => {
    if (orders.length === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    // Center popup horizontally relative to the cell
    setPopup({
      status,
      interval,
      orders: orders.map(o => ({
        jobNumber: o.jobNumber,
        storeCode: o.storeCode,
        skuPicked: o.skuPicked,
        skuTotal: o.skuTotal,
        itemsPicked: o.itemsPicked,
        itemsTotal: o.itemsTotal
      })),
      position: { x: rect.left + rect.width / 2, y: rect.top - 10 },
      header: `${STATUS_LABELS[status] || status} • ${interval} min`
    });
  };

  const closePopup = () => {
    setPopup(null);
  };

  const getStatusLabel = (status: string): string => {
    return STATUS_LABELS[status] || status;
  };

  return (
    <>
      <div className="matrix-container">
        <div className="matrix-header">
          <div className="matrix-title">
            <span className="section-badge red">QUICK COMMERCE</span>
            <h3>Hourly Ageing Matrix</h3>
          </div>
          <span className="total-badge">{totalOrders} Orders</span>
        </div>

        <div className="matrix-scroll">
          <table className="ageing-matrix">
            <thead>
              <tr>
                <th className="sticky-col">Status</th>
                {TIME_INTERVALS.map(interval => (
                  <th key={interval}>{interval} min</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.map(status => {
                const rowTotal = Object.values(matrixData[status] || {}).reduce((a, b) => a + b, 0);
                return (
                  <tr key={status}>
                    <td className="status-cell sticky-col">
                      <span className="status-dot" style={{ backgroundColor: getStatusColor(status) }}></span>
                      {getStatusLabel(status)}
                    </td>
                    {TIME_INTERVALS.map(interval => {
                      const count = matrixData[status]?.[interval] || 0;
                      const orders = orderDetails[status]?.[interval] || [];
                      return (
                        <td
                          key={interval}
                          className={`data-cell ${count > 0 ? 'clickable has-data' : ''}`}
                          style={{ backgroundColor: getCellBgColor(count) }}
                          onClick={(e) => handleCellClick(e, status, interval, orders)}
                        >
                          {count > 0 ? count : '—'}
                        </td>
                      );
                    })}
                    <td className="total-cell">{rowTotal}</td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td className="sticky-col">Total</td>
                {TIME_INTERVALS.map(interval => (
                  <td key={interval}>{totalCounts[interval]}</td>
                ))}
                <td className="grand-total">{totalOrders}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {popup && popup.orders.length > 0 && (
        <OrderPopup
          orders={popup.orders}
          allOrders={data}
          position={popup.position}
          header={popup.header}
          onClose={closePopup}
          onShowDetails={(order) => {
            onOrderClick?.(order);
            closePopup();
          }}
        />
      )}
    </>
  );
};

export default HourlyAgeingMatrix;
