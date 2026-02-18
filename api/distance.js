export default async function handler(req, res) {
  // Enable CORS
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
      return res.status(400).json({ 
        error: 'Missing origin or destination parameter' 
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Google Maps API key not configured' 
      });
    }

    // Run distance matrix + geocoding in parallel
    const [distanceResponse, geocodeResponse] = await Promise.all([
      fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=metric&key=${apiKey}`),
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${apiKey}`)
    ]);

    const [distanceData, geocodeData] = await Promise.all([
      distanceResponse.json(),
      geocodeResponse.json()
    ]);

    if (distanceData.status !== 'OK') {
      return res.status(400).json({ 
        error: `Google Maps API error: ${distanceData.status}`,
        message: distanceData.error_message || 'Unknown error'
      });
    }

    // Extract useful address parts from geocoding result
    let resolvedAddress = null;
    if (geocodeData.status === 'OK' && geocodeData.results.length > 0) {
      const result = geocodeData.results[0];
      const components = result.address_components;

      const get = (type) => components.find(c => c.types.includes(type))?.long_name || null;

      const premise      = get('premise');
      const streetNumber = get('street_number');
      const route        = get('route');
      const locality     = get('locality');
      const sublocality  = get('sublocality') || get('sublocality_level_1');
      const postalTown   = get('postal_town');
      const adminArea2   = get('administrative_area_level_2'); // County
      const adminArea1   = get('administrative_area_level_1');
      const postalCode   = get('postal_code');

      const streetParts = [premise, streetNumber, route].filter(Boolean);
      const townParts   = [locality || sublocality || postalTown, adminArea2 || adminArea1].filter(Boolean);

      resolvedAddress = {
        line1: streetParts.length > 0 ? streetParts.join(' ') : null,
        line2: townParts.length > 0 ? townParts.join(', ') : null,
        town: locality || sublocality || postalTown || null,
        county: adminArea2 || adminArea1 || null,
        postalCode: postalCode || null,
        formattedFull: result.formatted_address,
      };
    }

    res.status(200).json({
      ...distanceData,
      resolvedAddress,
    });

  } catch (error) {
    console.error('Distance API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
