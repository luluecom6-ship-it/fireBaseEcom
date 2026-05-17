import React, { useMemo, useState } from 'react';
import { Order, Store, STATUS_ORDER, STATUS_LABELS, getStatusColor, getAgeBucket, getOrderAgeMinutes, extractStoreCode, mapStatus, getPickedSkuCount, getSkuCount, getPickedItems, getTotalItems } from '../../typesV2';
import OrderPopup, { PopupOrder } from './OrderPopup';

interface QuickCommerceStoreViewProps {
  data: Order[];
  stores: Store[];
  onOrderClick?: (order: Order) => void;
}

interface CellPopupData {
  status: string;
  storeCode: string;
  orders: PopupOrder[];
  position: { x: number; y: number };
  header: string;
}

const QuickCommerceStoreView: React.FC<QuickCommerceStoreViewProps> = ({ data, stores, onOrderClick }) => {
  const [popup, setPopup] = useState<CellPopupData | null>(null);

  const { matrixData, orderDetails } = useMemo(() => {
    // Filter Quick Commerce orders (EXPRESS)
    const quickOrders = data.filter(o => o.source === 'EXPRESS');

    const matrix: Record<string, Record<string, number>> = {};
    const details: Record<string, Record<string, Array<{ 
      jobNumber: string; 
      storeCode: string; 
      ageBucket: string;
      skuPicked: number;
      skuTotal: number;
      itemsPicked: number;
      itemsTotal: number;
    }>>> = {};

    // Initialize matrix
    STATUS_ORDER.forEach(status => {
      matrix[status] = {};
      details[status] = {};
      stores.forEach(store => {
        matrix[status][store.id] = 0;
        details[status][store.id] = [];
      });
    });

    quickOrders.forEach(order => {
      // Use mapStatus for consistent status mapping
      const displayStatus = mapStatus(order.partial_status);

      const storeCode = extractStoreCode(order.store_name);
      const store = stores.find(s => s.code === storeCode || s.id === storeCode);

      if (store && matrix[displayStatus] && details[displayStatus]) {
        matrix[displayStatus][store.id]++;
        details[displayStatus][store.id].push({
          jobNumber: order.job_number,
          storeCode,
          ageBucket: getAgeBucket(getOrderAgeMinutes(order)),
          skuPicked: getPickedSkuCount(order),
          skuTotal: getSkuCount(order),
          itemsPicked: getPickedItems(order),
          itemsTotal: getTotalItems(order)
        });
      }
    });

    return { matrixData: matrix, orderDetails: details };
  }, [data, stores]);

  const storeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    stores.forEach(store => {
      totals[store.id] = 0;
      STATUS_ORDER.forEach(status => {
        totals[store.id] += matrixData[status]?.[store.id] || 0;
      });
    });
    return totals;
  }, [matrixData, stores]);

  const totalOrders = useMemo(() => {
    return Object.values(storeTotals).reduce((a, b) => a + b, 0);
  }, [storeTotals]);

  const getCellColor = (count: number): string => {
    if (count === 0) return 'transparent';
    if (count <= 2) return 'rgba(239, 68, 68, 0.1)';
    if (count <= 5) return 'rgba(239, 68, 68, 0.2)';
    return 'rgba(239, 68, 68, 0.3)';
  };

  const handleCellClick = (
    e: React.MouseEvent,
    status: string,
    store: Store,
    orders: Array<{ 
      jobNumber: string; 
      storeCode: string; 
      ageBucket: string;
      skuPicked: number;
      skuTotal: number;
      itemsPicked: number;
      itemsTotal: number;
    }>
  ) => {
    if (orders.length === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({
      status,
      storeCode: store.code,
      orders: orders.map(o => ({
        jobNumber: o.jobNumber,
        storeCode: o.storeCode,
        ageBucket: o.ageBucket,
        skuPicked: o.skuPicked,
        skuTotal: o.skuTotal,
        itemsPicked: o.itemsPicked,
        itemsTotal: o.itemsTotal
      })),
      position: { x: rect.left + rect.width / 2, y: rect.bottom + 10 },
      header: `${STATUS_LABELS[status]} • Store ${store.code}`
    });
  };

  const closePopup = () => {
    setPopup(null);
  };

  return (
    <>
      <div className="matrix-container store-distribution">
        <div className="matrix-header">
          <div className="matrix-title">
            <span className="section-badge red">QUICK COMMERCE</span>
            <h3>Store Distribution View</h3>
          </div>
          <span className="total-badge">{totalOrders} Orders</span>
        </div>

        <div className="matrix-scroll">
          <table className="store-matrix">
            <thead>
              <tr>
                <th className="sticky-col">Status</th>
                {stores.map(store => (
                  <th key={store.id} className="store-header">
                    <span className="store-id">{store.code}</span>
                    <span className="store-name">{store.name.split(',')[1]?.trim() || store.name}</span>
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.map(status => {
                const rowTotal = stores.reduce((acc, store) => {
                  return acc + (matrixData[status]?.[store.id] || 0);
                }, 0);

                return (
                  <tr key={status}>
                    <td className="status-cell sticky-col">
                      <span className="status-dot" style={{ backgroundColor: getStatusColor(status) }}></span>
                      {STATUS_LABELS[status]}
                    </td>
                    {stores.map(store => {
                      const count = matrixData[status]?.[store.id] || 0;
                      const orders = orderDetails[status]?.[store.id] || [];
                      return (
                        <td
                          key={store.id}
                          className={`data-cell ${count > 0 ? 'clickable' : ''}`}
                          style={{ backgroundColor: getCellColor(count) }}
                          onClick={(e) => handleCellClick(e, status, store, orders)}
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
                {stores.map(store => (
                  <td key={store.id}>{storeTotals[store.id]}</td>
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

export default QuickCommerceStoreView;
