import { useState, useCallback } from 'react';
import { User, OrderRecord } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';
import { compressImage } from '../utils/imageUtils';

export function useOrders(
  user: User | null, 
  showToast: (msg: string, type?: 'success' | 'error') => void,
  setDuplicateOrder: (order: OrderRecord | null) => void,
  setSuccessOrder: (order: OrderRecord | null) => void,
  setFullImage: (url: string | null) => void
) {
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [duplicateErrorId, setDuplicateErrorId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<OrderRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const validateOrderId = useCallback((id: string) => {
    const regex = /^((Lulu|Jee)-)?\d{12}(INP1)?$/i;
    return regex.test(id.trim());
  }, []);

  const handleSubmitOrder = useCallback(async (previews: string[]) => {
    if (!orderId || previews.length === 0 || !user) {
      showToast("Missing Order ID or Images", "error");
      return;
    }
    
    if (!validateOrderId(orderId)) {
      showToast("Invalid Order ID format", "error");
      return;
    }

    setLoading(true);
    setDuplicateOrder(null);
    setDuplicateErrorId(null);
    
    try {
      // Compress all images before submission to save bandwidth and drive space
      const compressedPreviews = await Promise.all(
        previews.map(base64 => compressImage(base64, 1000, 0.6))
      );

      const params = new URLSearchParams();
      params.append("action", "uploadOrder");
      params.append("orderId", orderId.trim());
      params.append("storeId", user.storeId);
      params.append("pickerName", user.name);
      params.append("uploadedBy", user.name);
      params.append("image", compressedPreviews.join("|||"));

      const res = await robustFetch(API_URL, {
        method: "POST",
        body: params,
        mode: 'cors'
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        if (text.toLowerCase().includes("error") || text.toLowerCase().includes("failed")) {
          throw new Error(text);
        }
        data = { status: "success" };
      }

      if (data.status === "duplicate") {
        const existing = data.existing || {};
        const dupObj = {
          orderId: String(existing.orderId || orderId.trim()),
          storeId: String(existing.storeId || "Unknown"),
          pickerName: String(existing.picker || existing.pickerName || existing.picker_name || "Unknown"),
          uploadedBy: String(existing.uploadedBy || existing.uploaded_by || "Unknown"),
          imageUrl: String(existing.imageUrl || existing.image || existing.image_url || ""),
          timestamp: String(existing.timestamp || new Date().toISOString())
        };
        setDuplicateOrder(dupObj);
        setDuplicateErrorId(orderId.trim());
        showToast("Duplicate Order Found", "error");
      } else if (data.status === "success" || data.status === "ok") {
        const newOrder = {
          orderId: orderId.trim(),
          storeId: user.storeId,
          pickerName: user.name,
          uploadedBy: user.name,
          imageUrl: previews.join("|||"),
          imageUrls: previews,
          timestamp: new Date().toISOString()
        };
        setSuccessOrder(newOrder);
        setOrderId("");
        setImagePreviews([]);
        showToast("Order Uploaded Successfully", "success");
      } else {
        throw new Error(data.message || data.error || "Server returned an error status");
      }
    } catch (e) { 
      console.error("Upload error:", e);
      showToast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setLoading(false);
    }
  }, [orderId, user, validateOrderId, setDuplicateOrder, setSuccessOrder, showToast]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query || !user) return;
    setIsSearching(true);
    try {
      const baseUrl = API_URL.trim();
      const searchParams = new URLSearchParams();
      searchParams.set('action', 'getAdminData');
      searchParams.set('type', 'orders');
      searchParams.set('role', user.role || "");
      searchParams.set('region', user.region || "");
      // ✅ BUG 7 FIX: Pass storeId so GAS can pre-filter server-side for non-admin users
      searchParams.set('storeId', user.storeId || "");
      searchParams.set('_t', Date.now().toString());
      
      const queryStr = searchParams.toString();
      const finalUrl = baseUrl.includes('?') 
        ? `${baseUrl}&${queryStr}` 
        : `${baseUrl}?${queryStr}`;
      
      console.log(`[Search] Fetching from: ${finalUrl}`);
      
      const res = await robustFetch(finalUrl);
      const response = await res.json();
      
      console.log(`[Search] Response received:`, response.status);
      
      let data = response.status === "success" ? response.data : response;
      
      // Handle case where backend returns full admin object instead of just orders array
      if (data && !Array.isArray(data) && data.orders) {
        data = data.orders;
      }
      
      if (!Array.isArray(data)) {
        console.error("[Search] Data is not an array:", data);
        throw new Error("Invalid response format");
      }

      console.log(`[Search] Total orders to filter: ${data.length}`);

      const normalizeId = (id: string) => String(id).replace(/^(Lulu-|Jee-)/i, '').replace(/INP1$/i, '').trim();
      const normalizedQuery = normalizeId(query.toLowerCase());
      const queryLower = query.toLowerCase().trim();

      let filtered = data.filter(o => {
        const orderIdValue = o.orderId || o.OrderID || o.order_id || "";
        const orderIdStr = String(orderIdValue).toLowerCase().trim();
        const normalizedOrderId = normalizeId(orderIdStr);
        
        // Match if direct match, includes, OR both numeric parts match
        const isMatch = orderIdStr.includes(queryLower) || 
                        queryLower.includes(orderIdStr) ||
                        (normalizedQuery.length >= 4 && normalizedOrderId.includes(normalizedQuery)) ||
                        (normalizedOrderId.length >= 4 && normalizedQuery.includes(normalizedOrderId));
        
        return isMatch;
      }).map(o => ({
        ...o,
        orderId: String(o.orderId || o.OrderID || o.order_id || ""),
        storeId: String(o.storeId || o.StoreID || o.store_id || ""),
        pickerName: String(o.pickerName || o.PickerName || o.picker_name || o.picker || ""),
        uploadedBy: String(o.uploadedBy || o.UploadedBy || o.uploaded_by || ""),
        timestamp: String(o.timestamp || o.Timestamp || o.Time || o.dateTime || ""),
        imageUrl: String(o.imageUrl || o.ImageUrl || o.image_url || o.image || ""),
        // ✅ BUG 4 FIX: Include allImages and parsed imageUrls array
        allImages: String(o.allImages || o.imageUrl || o.ImageUrl || o.image_url || o.image || "").trim(),
        imageUrls: String(o.allImages || o.imageUrl || o.ImageUrl || o.image_url || o.image || "")
          .split(",").map((s: string) => s.trim()).filter(Boolean)
      }));
      
      console.log(`[Search] Matches found after ID filter: ${filtered.length}`);
      
      // Role-based filtering (Restrict what non-admins can see)
      if (user.role !== 'admin' && user.role !== 'supervisor') {
        const userStoreId = String(user.storeId || "").trim().toLowerCase();
        const userNameRaw = String(user.name || "").trim().toLowerCase();
        
        if ((user.role === 'manager' || user.role === 'store') && userStoreId !== 'all') {
          filtered = filtered.filter(o => String(o.storeId || "").trim().toLowerCase() === userStoreId);
        } else {
          // Normal staff: see only their own uploads
          filtered = filtered.filter(o => {
            const uploadedBy = String(o.uploadedBy || "").trim().toLowerCase();
            const pickerName = String(o.pickerName || "").trim().toLowerCase();
            return uploadedBy === userNameRaw || pickerName === userNameRaw;
          });
        }
      }
      
      console.log(`[Search] Final results after role filter: ${filtered.length}`);
      setSearchResults(filtered);
    } catch (e) {
      console.error("Search error:", e);
      showToast("Search failed", "error");
    } finally {
      setIsSearching(false);
    }
  }, [user, showToast]);

  const handleDeepDive = useCallback((order: OrderRecord) => {
    setSearchResults([order]);
  }, []);

  return { 
    orderId, setOrderId, loading, duplicateErrorId, 
    searchResults, setSearchResults, isSearching, imagePreviews, setImagePreviews,
    validateOrderId, handleSubmitOrder, handleSearch, handleDeepDive
  };
}
