export default function handler(req, res) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  res.json({ 
    hasApiKey: !!apiKey,
    keyLength: apiKey ? apiKey.length : 0,
    firstChars: apiKey ? apiKey.substring(0, 10) + '...' : 'missing'
  });
}
