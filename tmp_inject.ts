  app.post("/api/admin/test-oos-push", async (req, res) => {
    try {
      if (!db || !messaging) return res.status(500).json({ error: "Missing Firebase features" });
      const tokensSnap = await db.collection('fcm_tokens').where('role', 'in', ['admin', 'supervisor']).get();
      const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
      if (tokens.length === 0) return res.json({ status: "No admin tokens found" });
      
      const payload = {
          title: `🧪 TEST OUT OF STOCK DETECTED`,
          body: `Test Item Strawberry (SKU: 99999) marked returning OOS at Store TEST.`,
          image: 'https://placehold.co/200x200.png?text=OOS+TEST',
          data: { orderId: 'test-order-123', type: "oos", storeId: 'TEST' }
      };

      const message = {
          notification: { title: payload.title, body: payload.body, image: payload.image },
          data: payload.data,
          tokens: tokens
      };
      const response = await messaging.sendEachForMulticast(message);
      res.json({ status: "success", successCount: response.successCount });
    } catch(e: any) {
      console.error("[test-oos-push] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/send-oos-push", async (req, res) => {
    try {
      if (!db || !messaging) return res.status(500).json({ error: "Missing Firebase features" });
      
      const { item, requesterRole } = req.body;
      if (!item || (requesterRole !== 'admin' && requesterRole !== 'supervisor')) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Fetch region mapping
      let alertRegion = "";
      try {
        const adminSnap = await db.collection("app_config").doc("admin_control").get();
        if (adminSnap.exists) {
           const adminData = adminSnap.data() || {};
           const regions = adminData.regions || [];
           
           // Try format 1: { stores: [...], name: "..." }
           const storeRegionObj = regions.find((r: any) => Array.isArray(r.stores) && r.stores.includes(item.storeId));
           if (storeRegionObj && storeRegionObj.name) {
             alertRegion = storeRegionObj.name;
           } else {
             // Try format 2: { storeId: "...", region: "..." }
             const storeRegionMapping = regions.find((r: any) => String(r.storeId || r.StoreID || "").trim() === String(item.storeId).trim());
             if (storeRegionMapping && (storeRegionMapping.region || storeRegionMapping.Region)) {
               alertRegion = storeRegionMapping.region || storeRegionMapping.Region;
             }
           }
        }
      } catch (e) {
         console.warn("Could not fetch admin_control for region mapping", e);
      }
      
      const alertStoreId = String(item.storeId || "").trim();

      const tokensSnap = await db.collection('fcm_tokens').get();
      const tokens = tokensSnap.docs
        .map(d => d.data())
        .filter(data => {
            if (!data.token) return false;
            const userRole = String(data.role || "").toLowerCase().trim();
            const userStoreId = String(data.storeId || "").trim();
            const userRegion = String(data.region || "").trim();
            
            if (userRole === 'admin') return true;
            if (userRole === 'supervisor') return userRegion && alertRegion && userRegion === alertRegion;
            if (userRole === 'manager' || userRole === 'store' || userRole === 'picker' || userRole === 'driver') {
               return userStoreId === alertStoreId;
            }
            return false;
        })
        .map(data => data.token);
        
      if (tokens.length === 0) return res.json({ status: "No appropriate devices found" });
      
      const getSmallThumbnailUrl = (url: string) => {
        if (!url) return "";
        const str = String(url);
        if (str.includes("drive.google.com")) {
          const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
          if (id) return `https://lh3.googleusercontent.com/d/${id}=s200`;
        }
        return str;
      };

      const payload = {
          title: `⚠️ OUT OF STOCK DETECTED`,
          body: `Item ${item.itemName} (SKU: ${item.sku}) marked returning OOS at Store ${item.storeId}.`,
          image: getSmallThumbnailUrl(item.photoUrl),
          data: { orderId: item.orderId, type: "oos", storeId: item.storeId }
      };

      const message = {
          notification: { title: payload.title, body: payload.body, ...(payload.image ? { image: payload.image } : {}) },
          data: payload.data,
          tokens: tokens
      };
      
      const response = await messaging.sendEachForMulticast(message);
      res.json({ status: "success", successCount: response.successCount });
    } catch(e: any) {
      console.error("[send-oos-push] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });