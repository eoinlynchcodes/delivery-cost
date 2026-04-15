const ORIGIN = 'N91PT7W';
const MAX_DISTANCE_KM = 40;
const CONFIG_API = 'https://delivery-cost-api-ten.vercel.app/api/config';
const CONFIG_TIMEOUT_MS = 3000;

const FALLBACK_PRICE_BANDS = [
  { minOrderTotal: 0, baseFee: 15.00, perKm: 1.25 },
  { minOrderTotal: 220, baseFee: 10.00, perKm: 0.50 },
];

const ALLOWED_ORIGINS = [
  'https://timberandbarkmulch.myshopify.com',
  'https://timberandbarkmulch.ie',
  'https://www.timberandbarkmulch.ie',
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow any origin for now to ease development — tighten later if needed
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function fetchConfig() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
    const resp = await fetch(CONFIG_API, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`Config API returned ${resp.status}`);
    const data = await resp.json();
    if (Array.isArray(data.priceBands) && data.priceBands.length > 0) {
      return data.priceBands;
    }
  } catch (err) {
    console.warn('Failed to fetch config, using fallback:', err.message);
  }
  return FALLBACK_PRICE_BANDS;
}

function selectBand(priceBands, cartTotal) {
  const total = parseFloat(cartTotal) || 0;
  const sorted = [...priceBands].sort((a, b) => b.minOrderTotal - a.minOrderTotal);
  return sorted.find(b => total >= b.minOrderTotal) ?? sorted[sorted.length - 1];
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { location } = req.body || {};

    if (!location || typeof location !== 'string' || !location.trim()) {
      return res.status(400).json({ error: 'Missing or empty "location" field' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    // Fetch dynamic pricing config (with fallback)
    const priceBands = await fetchConfig();

    // Call Google Maps Distance Matrix API
    const destination = `${location.trim()}, Ireland`;
    const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(ORIGIN)}&destinations=${encodeURIComponent(destination)}&units=metric&key=${apiKey}`;
    const mapsResp = await fetch(mapsUrl);
    const mapsData = await mapsResp.json();

    if (mapsData.status !== 'OK') {
      return res.status(400).json({
        error: `Google Maps API error: ${mapsData.status}`,
        message: mapsData.error_message || 'Could not process location',
      });
    }

    const element = mapsData.rows?.[0]?.elements?.[0];

    if (!element || element.status !== 'OK') {
      return res.status(400).json({
        error: 'Could not find that location. Try an Eircode for more accurate results.',
      });
    }

    const distanceKm = Math.floor(element.distance.value / 1000);

    if (distanceKm > MAX_DISTANCE_KM) {
      return res.status(200).json({
        deliverable: false,
        distance_km: distanceKm,
        message: "We don't deliver to this location directly, but we can arrange a courier. Please get in touch for a quote.",
      });
    }

    // Calculate both fee tiers
    const bandStandard = selectBand(priceBands, 0);
    const bandLarge = selectBand(priceBands, 220);

    const feeStandard = bandStandard.baseFee + distanceKm * bandStandard.perKm;
    const feeLarge = bandLarge.baseFee + distanceKm * bandLarge.perKm;

    return res.status(200).json({
      deliverable: true,
      distance_km: distanceKm,
      fee_standard: parseFloat(feeStandard.toFixed(2)),
      fee_large: parseFloat(feeLarge.toFixed(2)),
    });
  } catch (error) {
    console.error('Widget calculate error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
