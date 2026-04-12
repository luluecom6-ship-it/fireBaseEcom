import { useState, useCallback } from 'react';
import { User, OrderRecord } from '../types';
import { API_URL } from '../constants';
import { robustFetch } from '../utils/api';

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
      const params = new URLSearchParams();
      params.append("action", "uploadOrder");
      params.append("orderId", orderId.trim());
      params.append("storeId", user.storeId);
      params.append("pickerName", user.name);
      params.append("uploadedBy", user.name);
      params.append("image", previews.join("|||"));

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
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('action', 'getAdminData');
      urlObj.searchParams.set('type', 'orders');
      urlObj.searchParams.set('_t', Date.now().toString());
      
      const res = await robustFetch(urlObj.toString());
      const response = await res.json();
      let data = response.status === "success" ? response.data : response;
      
      // Handle case where backend returns full admin object instead of just orders array
      if (data && !Array.isArray(data) && data.orders) {
        data = data.orders;
      }
      
      if (!Array.isArray(data)) throw new Error("Invalid response format");

      let filtered = data.filter(o => String(o.orderId).toLowerCase().includes(query.toLowerCase()));
      
      if (user.role !== 'admin' && user.role !== 'supervisor') {
        filtered = filtered.filter(o => o.uploadedBy === user.name);
      }
      
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
