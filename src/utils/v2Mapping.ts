import { Order, extractStoreCode, getOrderAgeMinutes, getAgeBucket } from '../typesV2';
import { MatrixData, MatrixItem } from '../types';

/**
 * Maps V2 Order objects to the legacy MatrixData structure used by alert logic.
 */
export const mapOrdersToMatrixData = (orders: Order[]): MatrixData => {
  const quick: MatrixItem[] = [];
  const schedule: MatrixItem[] = [];

  orders.forEach(order => {
    const storeID = extractStoreCode(order.store_name);
    // Standardize status for alert logic which expects certain strings
    let status = (order.partial_status || "CREATED").toUpperCase().replace(/_/g, ' ');
    
    // Additional mapping to match alertLogic PREP_STATUSES/DELIVERY_STATUSES
    if (status === 'DOING' || status === 'PROCESSING') status = 'PICKING';
    if (status === 'FINISHED') status = 'DELIVERED';

    const ageMins = getOrderAgeMinutes(order);
    const bucket = getAgeBucket(ageMins);
    
    // Alert logic expects buckets like "20-25 MIN" or "60MIN+"
    const formattedBucket = bucket === '60+' ? '60MIN+' : `${bucket} MIN`;

    const slot = `${order.slot_from || ""} - ${order.slot_to || ""}`.trim();

    const item: MatrixItem = {
      status,
      storeID,
      orderID: order.job_number,
      slot,
      bucket: formattedBucket,
      timestamp: order.created_at
    };

    if (order.source === 'EXPRESS') {
      quick.push(item);
    } else {
      schedule.push(item);
    }
  });

  return { 
    quick, 
    schedule,
    timestamp: new Date().toISOString()
  };
};
