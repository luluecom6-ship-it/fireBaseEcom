import React, { useMemo } from 'react';
import { Order, STATUS_ORDER, STATUS_LABELS, extractStoreCode, mapStatus } from '../../typesV2';

interface OrderMatrixProps {
  data: Order[];
}

const OrderMatrix: React.FC<OrderMatrixProps> = ({ data }) => {
  const { stores, matrixData, totalOrders } = useMemo(() => {
    // Extract unique store codes from flat data structure
    const storeCodes = Array.from(new Set(data.map(o => extractStoreCode(o.store_name))));

    const matrix: Record<string, Record<string, number>> = {};
    STATUS_ORDER.forEach(status => {
      matrix[status] = {};
      storeCodes.forEach(store => {
        matrix[status][store] = 0;
      });
    });

    // Populate matrix with order counts
    data.forEach(order => {
      const status = mapStatus(order.partial_status);
      const storeCode = extractStoreCode(order.store_name);
      if (matrix[status] && matrix[status][storeCode] !== undefined) {
        matrix[status][storeCode]++;
      } else {
        // If status is not in STATUS_ORDER, create row for it
        if (!matrix[status]) {
          matrix[status] = {};
          storeCodes.forEach(store => {
            matrix[status][store] = 0;
          });
        }
        if (matrix[status][storeCode] !== undefined) {
          matrix[status][storeCode]++;
        }
      }
    });

    return {
      stores: storeCodes,
      matrixData: matrix,
      totalOrders: data.length
    };
  }, [data]);

  const getCellColor = (count: number): string => {
    if (count === 0) return 'transparent';
    if (count <= 2) return 'rgba(16, 185, 129, 0.15)';
    if (count <= 5) return 'rgba(16, 185, 129, 0.25)';
    return 'rgba(16, 185, 129, 0.35)';
  };

  return (
    <div className="matrix-container">
      <div className="matrix-header">
        <h3>Order Distribution by Store</h3>
        <span className="total-badge">{totalOrders} Orders</span>
      </div>
      <div className="matrix-scroll">
        <table className="order-matrix">
          <thead>
            <tr>
              <th className="sticky-col">Status</th>
              {stores.map(store => (
                <th key={store}>{store}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_ORDER.map(status => {
              const rowTotal = stores.reduce((acc, store) => acc + (matrixData[status]?.[store] || 0), 0);
              return (
                <tr key={status}>
                  <td className="status-cell sticky-col">{STATUS_LABELS[status]}</td>
                  {stores.map(store => (
                    <td
                      key={store}
                      className="data-cell"
                      style={{ backgroundColor: getCellColor(matrixData[status]?.[store] || 0) }}
                    >
                      {matrixData[status]?.[store] || '—'}
                    </td>
                  ))}
                  <td className="total-cell">{rowTotal}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td className="sticky-col">Total</td>
              {stores.map(store => {
                const colTotal = STATUS_ORDER.reduce((acc, status) => acc + (matrixData[status]?.[store] || 0), 0);
                return <td key={store}>{colTotal}</td>;
              })}
              <td className="grand-total">{totalOrders}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrderMatrix;
