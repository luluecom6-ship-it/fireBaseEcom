import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  // ✅ NEW: If frontend passes a valid gasUrl param, use it (V2 support)
  // ✅ OLD: Otherwise fall back to env vars (V1 pages unaffected)
  const queryGasUrl = ((req.query.gasUrl as string) || "").trim();
  const isValidGasUrl = queryGasUrl.startsWith("https://script.google.com");

  let gasUrl = (
    isValidGasUrl
      ? queryGasUrl                           // V2: use what frontend sent
      : (process.env.GAS_API_URL || process.env.VITE_GAS_API_URL || "").trim()  // V1: use env var
  );

  // Final fallback if still empty/invalid
  if (!gasUrl || gasUrl === "undefined" || !gasUrl.startsWith("https://script.google.com")) {
    gasUrl = "https://script.google.com/macros/s/AKfycbziSK-a3_zBsoEPHBe1Yaz-pTEYtnZyuHdTPhziDSlB3Vhn8DZ0qaPLICnb9eY_ptj5/exec";
  }

  try {
    const target = new URL(gasUrl);
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'gasUrl') continue; // ✅ Strip gasUrl — it was for the proxy, not GAS
      if (key !== 'action' || !target.searchParams.has('action')) {
        target.searchParams.set(key, String(value));
      }
    }

    const config: any = {
      method: req.method,
      url: target.toString(),
      timeout: 60000,
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