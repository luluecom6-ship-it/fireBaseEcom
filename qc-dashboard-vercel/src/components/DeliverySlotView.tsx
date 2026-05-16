import React, { useMemo, useState } from 'react';
import { Order, Store, STATUS_ORDER, STATUS_LABELS, TIME_SLOTS, getTimeSlotBucket, getStatusColor, getSkuCount, getPickedSkuCount, getTotalItems, getPickedItems, extractStoreCode, mapStatus } from '../types';
import OrderPopup, { PopupOrder } from './OrderPopup';

interface DeliverySlotViewProps {
  data: Order[];
  stores: Store[];
}

interface CellPopupData {
  status: string;
  slot: string;
  orders: PopupOrder[];
  position: { x: number; y: number };
  header: string;
}

const DeliverySlotView: React.FC<DeliverySlotViewProps> = ({ data, stores }) => {
  const [popup, setPopup] = useState<CellPopupData | null>(null);

  const { matrixData, orderDetails } = useMemo(() => {
    // Filter Schedule Commerce orders (DEFAULT)
    const scheduleOrders = data.filter(o => o.source === 'DEFAULT');

    const matrix: Record<string, Record<string, number>> = {};
    const details: Record<string, Record<string, Array<{ jobNumber: string; storeCode: string; skuPicked: number; skuTotal: number; itemsPicked: number; itemsTotal: number }>>> = {};

    // Initialize matrix
    STATUS_ORDER.forEach(status => {
      matrix[status] = {};
      details[status] = {};
      TIME_SLOTS.forEach(slot => {
        matrix[status][slot] = 0;
        details[status][slot] = [];
      });
    });

    scheduleOrders.forEach(order => {
      // Use mapStatus for consistent status mapping
      const displayStatus = mapStatus(order.partial_status);

      const slot = getTimeSlotBucket(order.slot_from);
      const storeCode = extractStoreCode(order.store_name);

      if (matrix[displayStatus] && details[displayStatus]) {
        matrix[displayStatus][slot]++;
        details[displayStatus][slot].push({
          jobNumber: order.job_number,
          storeCode,
          skuPicked: getPickedSkuCount(order),
          skuTotal: getSkuCount(order),
          itemsPicked: getPickedItems(order),
          itemsTotal: getTotalItems(order)
        });
      }
    });

    return { matrixData: matrix, orderDetails: details };
  }, [data]);

  const slotTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    TIME_SLOTS.forEach(slot => {
      totals[slot] = 0;
      STATUS_ORDER.forEach(status => {
        totals[slot] += matrixData[status]?.[slot] || 0;
      });
    });
    return totals;
  }, [matrixData]);

  const totalOrders = useMemo(() => {
    return Object.values(slotTotals).reduce((a, b) => a + b, 0);
  }, [slotTotals]);

  const getCellColor = (count: number): string => {
    if (count === 0) return 'transparent';
    if (count <= 2) return 'rgba(16, 185, 129, 0.15)';
    if (count <= 5) return 'rgba(16, 185, 129, 0.25)';
    return 'rgba(16, 185, 129, 0.35)';
  };

  const handleCellClick = (
    e: React.MouseEvent,
    status: string,
    slot: string,
    orders: Array<{ jobNumber: string; storeCode: string; skuPicked: number; skuTotal: number; itemsPicked: number; itemsTotal: number }>
  ) => {
    if (orders.length === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({
      status,
      slot,
      orders: orders.map(o => ({
        jobNumber: o.jobNumber,
        storeCode: o.storeCode,
        skuPicked: o.skuPicked,
        skuTotal: o.skuTotal,
        itemsPicked: o.itemsPicked,
        itemsTotal: o.itemsTotal
      })),
      position: { x: rect.left + rect.width / 2, y: rect.top },
      header: `${STATUS_LABELS[status]} • ${slot}`
    });
  };

  const closePopup = () => {
    setPopup(null);
  };

  return (
    <>
      <div className="matrix-container">
        <div className="matrix-header">
          <div className="matrix-title">
            <span className="section-badge green">SCHEDULE COMMERCE</span>
            <h3>Delivery Slot View</h3>
          </div>
          <span className="total-badge">{totalOrders} Orders</span>
        </div>

        <div className="matrix-scroll">
          <table className="delivery-matrix">
            <thead>
              <tr>
                <th className="sticky-col">Status</th>
                {TIME_SLOTS.map(slot => (
                  <th key={slot}>{slot}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.map(status => {
                const rowTotal = TIME_SLOTS.reduce((acc, slot) => {
                  return acc + (matrixData[status]?.[slot] || 0);
                }, 0);

                return (
                  <tr key={status}>
                    <td className="status-cell sticky-col">
                      <span className="status-dot" style={{ backgroundColor: getStatusColor(status) }}></span>
                      {STATUS_LABELS[status]}
                    </td>
                    {TIME_SLOTS.map(slot => {
                      const count = matrixData[status]?.[slot] || 0;
                      const orders = orderDetails[status]?.[slot] || [];
                      return (
                        <td
                          key={slot}
                          className={`data-cell ${count > 0 ? 'clickable' : ''}`}
                          style={{ backgroundColor: getCellColor(count) }}
                          onClick={(e) => handleCellClick(e, status, slot, orders)}
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
                {TIME_SLOTS.map(slot => (
                  <td key={slot}>{slotTotals[slot]}</td>
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
          onShowDetails={() => {}}
        />
      )}
    </>
  );
};

export default DeliverySlotView;