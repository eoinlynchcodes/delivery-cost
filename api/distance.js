export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { origin, destination } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Missing origin or destination parameter' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=metric&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status !== 'OK') {
      return res.status(400).json({ 
        error: `Google Maps API error: ${data.status}`,
        message: data.error_message || 'Unknown error'
      });
    }

    // Parse the resolved destination address Google already returns
    // e.g. "14 Main Street, Mullingar, Co. Westmeath, Ireland"
    let resolvedAddress = null;
    const fullAddress = data.destination_addresses?.[0];
    if (fullAddress) {
      const parts = fullAddress.split(',').map(p => p.trim()).filter(Boolean);
      // Drop the last part (country) — not useful
      const withoutCountry = parts.slice(0, -1);

      // line1 = first part (street / area), line2 = remainder joined
      const line1 = withoutCountry[0] || null;
      const line2 = withoutCountry.slice(1).join(', ') || null;
      // town is the first non-numeric/non-street part
      const town = withoutCountry.find(p => !/^\d/.test(p) && p !== line1) || withoutCountry[1] || null;

      resolvedAddress = { line1, line2, town, formattedFull: fullAddress };
    }

    res.status(200).json({ ...data, resolvedAddress });

  } catch (error) {
    console.error('Distance API error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
