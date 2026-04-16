import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let gasUrl = (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim();
  
  // Fallback to the known working URL
  if (!gasUrl || gasUrl === "undefined" || !gasUrl.startsWith("http")) {
    gasUrl = "https://script.google.com/macros/s/AKfycbxUVldHO9dPY9uTfuCc-A_RZUhkyngPQvMDpMC31nrjZV-SXWH2ZzXWIyDh3HDD_Zom/exec";
  }

  try {
    const target = new URL(gasUrl);
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'action' || !target.searchParams.has('action')) {
        target.searchParams.set(key, String(value));
      }
    }

    const config: any = {
      method: req.method,
      url: target.toString(),
      timeout: 30000,
      maxRedirects: 15,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Vercel-Proxy',
        'Accept': 'application/json, text/plain, */*',
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
      config.data = req.body;
      config.headers['Content-Type'] = req.headers['content-type'] || 'application/json';
    }

    const response = await axios(config);
    
    // Check for GAS error pages
    if (typeof response.data === 'string' && (
      response.data.includes('<!DOCTYPE html>') || 
      response.data.includes('goog-script-error')
    )) {
      return res.status(502).json({ 
        status: "error", 
        message: "Google Apps Script returned an error page. Check script deployment.",
        debug: response.data.substring(0, 100)
      });
    }

    res.status(response.status).send(response.data);
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
}
