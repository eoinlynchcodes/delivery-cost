import { useState, useEffect, useRef } from 'react';
import './App.css';

const DELIVERY_CONFIG_API = 'https://delivery-cost-api-ten.vercel.app/api/config';

const DEFAULT_CONFIG = {
  freeDeliveryThreshold: 400,
  originPostcode: 'N91PT7W',
};

const DEFAULT_BANDS = [
  { minOrderTotal: 0,   baseFee: 15.00, perKm: 1.25 },
  { minOrderTotal: 220, baseFee: 10.00, perKm: 0.50 },
];

function selectBand(bands, orderValue) {
  const total = parseFloat(orderValue) || 0;
  const sorted = [...bands].sort((a, b) => b.minOrderTotal - a.minOrderTotal);
  return sorted.find(b => total >= b.minOrderTotal) ?? sorted[sorted.length - 1];
}

const WESTMEATH_TOWNS = [
  { name: 'Greenpark',       km: 2  },
  { name: 'Ardmore Road',    km: 5  },
  { name: 'Mullingar Town',  km: 5  },
  { name: 'Loughanavally',   km: 9  },
  { name: 'Multyfarnham',    km: 17 },
  { name: 'Killucan',        km: 17 },
  { name: 'Streamstown',     km: 17 },
  { name: 'Rochfortbridge',  km: 17 },
  { name: 'Milltownpass',    km: 17 },
  { name: 'Tyrellspass',     km: 18 },
  { name: 'Ballymore',       km: 20 },
  { name: 'Kilbeggan',       km: 20 },
  { name: 'Collinstown',     km: 23 },
  { name: 'Castlepollard',   km: 24 },
  { name: 'Rathowen',        km: 25 },
  { name: 'Kinnegad',        km: 26 },
  { name: 'Delvin',          km: 27 },
  { name: 'Fore',            km: 29 },
  { name: 'Moate',           km: 29 },
  { name: 'Tang',            km: 30 },
  { name: 'Clonard',         km: 31 },
  { name: 'Tullamore',       km: 32 },
  { name: 'Glasson',         km: 36 },
  { name: 'Athlone',         km: 37 },
];


function bandLabel(band, allBands, freeThreshold) {
  const sorted = [...allBands].sort((a, b) => a.minOrderTotal - b.minOrderTotal);
  const idx = sorted.findIndex(b => b.minOrderTotal === band.minOrderTotal);
  const next = sorted[idx + 1];
  const upper = next ? next.minOrderTotal - 0.01 : freeThreshold > 0 ? freeThreshold - 0.01 : null;
  if (upper !== null) {
    return `Orders €${band.minOrderTotal} – €${upper.toFixed(0)}`;
  }
  return `Orders €${band.minOrderTotal}+`;
}

function App() {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('deliveryPricingConfig');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.minimumFee !== undefined || parsed.costPerKm !== undefined ||
          parsed.fuelCostPerKm !== undefined || parsed.wearTearPerKm !== undefined) {
        return DEFAULT_CONFIG;
      }
      return parsed;
    }
    return DEFAULT_CONFIG;
  });

  const [priceBands, setPriceBands] = useState(DEFAULT_BANDS);
  const [bandsLoading, setBandsLoading] = useState(true);
  const [bandsDirty, setBandsDirty] = useState(false);
  const [bandsSaving, setBandsSaving] = useState(false);
  const [bandsSaveSuccess, setBandsSaveSuccess] = useState(false);
  const [bandsSaveError, setBandsSaveError] = useState('');

  const [originAddress, setOriginAddress] = useState(config.originPostcode);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [orderValue, setOrderValue] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const [savedQuotes, setSavedQuotes] = useState(() => {
    const saved = localStorage.getItem('savedDeliveryQuotes');
    return saved ? JSON.parse(saved) : [];
  });
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const renameInputRef = useRef(null);

  useEffect(() => {
    fetch(DELIVERY_CONFIG_API)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.priceBands) && data.priceBands.length > 0) {
          setPriceBands(data.priceBands);
        }
        if (data.freeDeliveryThreshold !== undefined) {
          setConfig(prev => ({ ...prev, freeDeliveryThreshold: data.freeDeliveryThreshold }));
        }
        setBandsLoading(false);
      })
      .catch(() => setBandsLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem('deliveryPricingConfig', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('savedDeliveryQuotes', JSON.stringify(savedQuotes));
  }, [savedQuotes]);

  useEffect(() => {
    if (editingNameId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingNameId]);

  const updateBand = (index, field, value) => {
    setPriceBands(prev => prev.map((b, i) =>
      i === index ? { ...b, [field]: parseFloat(value) || 0 } : b
    ));
    setBandsDirty(true);
    setBandsSaveSuccess(false);
  };

  const addBand = () => {
    const sorted = [...priceBands].sort((a, b) => b.minOrderTotal - a.minOrderTotal);
    const highest = sorted[0]?.minOrderTotal ?? 0;
    setPriceBands(prev => [...prev, { minOrderTotal: highest + 100, baseFee: 10, perKm: 0.50 }]);
    setBandsDirty(true);
  };

  const removeBand = (index) => {
    if (priceBands.length <= 1) return;
    setPriceBands(prev => prev.filter((_, i) => i !== index));
    setBandsDirty(true);
  };

  const updateFreeThreshold = (value) => {
    setConfig(prev => ({ ...prev, freeDeliveryThreshold: parseFloat(value) || 0 }));
    setBandsDirty(true);
  };

  const saveBandsToAPI = async () => {
    setBandsSaving(true);
    setBandsSaveError('');
    setBandsSaveSuccess(false);
    try {
      const res = await fetch(DELIVERY_CONFIG_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceBands,
          freeDeliveryThreshold: config.freeDeliveryThreshold,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setBandsSaveSuccess(true);
      setBandsDirty(false);
    } catch {
      setBandsSaveError('Could not save. Please try again.');
    } finally {
      setBandsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setPriceBands(DEFAULT_BANDS);
    setConfig(DEFAULT_CONFIG);
    setBandsDirty(true);
    localStorage.removeItem('deliveryPricingConfig');
  };

  const fetchDistance = async () => {
    if (!destinationAddress.trim()) {
      setError('Please enter a destination address');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/distance?origin=${encodeURIComponent(originAddress)}&destination=${encodeURIComponent(destinationAddress)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch distance data');
      }

      const data = await response.json();

      if (data.status !== 'OK' || !data.rows[0]?.elements[0]) {
        throw new Error('Could not calculate distance between addresses');
      }

      const element = data.rows[0].elements[0];
      if (element.status !== 'OK') {
        throw new Error('Invalid address or route not found');
      }

      const distanceKm = Math.floor(element.distance.value / 1000);
      const durationMin = Math.round(element.duration.value / 60);
      const freeDelivery = orderValue >= config.freeDeliveryThreshold && config.freeDeliveryThreshold > 0;

      let deliveryFee = 0;
      let band = null;
      if (!freeDelivery) {
        band = selectBand(priceBands, orderValue);
        deliveryFee = band.baseFee + distanceKm * band.perKm;
      }

      const finalFee = freeDelivery ? 0 : deliveryFee;
      const resolved = data.resolvedAddress;

      setResult({
        distance: distanceKm,
        duration: durationMin,
        destination: destinationAddress,
        resolvedAddress: resolved,
        orderValue,
        deliveryFee: deliveryFee.toFixed(2),
        freeDelivery,
        finalFee: finalFee.toFixed(2),
        band,
        breakdown: band
          ? { baseFee: band.baseFee.toFixed(2), distanceCost: (distanceKm * band.perKm).toFixed(2) }
          : null,
      });

      const suggestedName = resolved?.town || destinationAddress.split(',')[0].trim();
      setSaveName(suggestedName);
      setSaveError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuote = () => {
    const trimmed = saveName.trim();
    if (!trimmed) { setSaveError('Please enter a name for this quote.'); return; }
    setSaveError('');
    const quote = {
      id: Date.now(),
      name: trimmed,
      savedAt: new Date().toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' }),
      destination: result.destination,
      resolvedAddress: result.resolvedAddress,
      orderValue: result.orderValue,
      distance: result.distance,
      duration: result.duration,
      finalFee: result.finalFee,
      freeDelivery: result.freeDelivery,
      breakdown: result.breakdown,
      deliveryFee: result.deliveryFee,
    };
    setSavedQuotes(prev => [quote, ...prev]);
    setSaveSuccess(true);
    setSaveName('');
  };

  const handleDeleteQuote = (id) => setSavedQuotes(prev => prev.filter(q => q.id !== id));

  const handleClearAll = () => {
    if (window.confirm('Delete all saved quotes?')) setSavedQuotes([]);
  };

  const startRename = (quote) => { setEditingNameId(quote.id); setEditingNameValue(quote.name); };
  const commitRename = () => {
    const trimmed = editingNameValue.trim();
    if (trimmed) setSavedQuotes(prev => prev.map(q => q.id === editingNameId ? { ...q, name: trimmed } : q));
    setEditingNameId(null);
    setEditingNameValue('');
  };
  const cancelRename = () => { setEditingNameId(null); setEditingNameValue(''); };

  const sortedBands = [...priceBands].sort((a, b) => a.minOrderTotal - b.minOrderTotal);

  return (
    <div className="container">
      <header>
        <h1>Delivery Cost Calculator</h1>
        <p className="subtitle">Timber and Bark Mulch - Distance-Based Pricing</p>
      </header>

      {/* ── Calculator Card ── */}
      <div className="calculator-card">
        <div className="input-group">
          <label>Origin Address (Yard)</label>
          <input
            type="text"
            value={originAddress}
            onChange={(e) => setOriginAddress(e.target.value)}
            placeholder="N91PT7W"
          />
        </div>
        <div className="input-group">
          <label>Destination Address (Customer)</label>
          <input
            type="text"
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
            placeholder="Enter Eircode or full address"
          />
        </div>
        <div className="input-group">
          <label>Order Value (€) — used to pick the right price band</label>
          <input
            type="number"
            value={orderValue}
            onChange={(e) => setOrderValue(parseFloat(e.target.value) || 0)}
            placeholder="0"
            min="0"
          />
        </div>
        <button className="calculate-btn" onClick={fetchDistance} disabled={loading}>
          {loading ? 'Calculating...' : 'Calculate Delivery Cost'}
        </button>

        {error && <div className="error-message"><strong>Error:</strong> {error}</div>}

        {result && (
          <div className="result-card">
            <h2>Delivery Quote</h2>
            {result.resolvedAddress && (
              <div className="result-address">
                <span className="result-address-icon">📍</span>
                <div>
                  {result.resolvedAddress.line1 && <div className="result-address-line1">{result.resolvedAddress.line1}</div>}
                  {result.resolvedAddress.line2 && <div className="result-address-line2-result">{result.resolvedAddress.line2}</div>}
                  {!result.resolvedAddress.line1 && !result.resolvedAddress.line2 && <div>{result.destination}</div>}
                </div>
              </div>
            )}
            <div className="result-summary">
              <div className="result-item highlight">
                <span>Final Delivery Cost:</span>
                <strong>€{result.finalFee}</strong>
              </div>
              {result.freeDelivery && (
                <div className="free-delivery-badge">
                  🎉 FREE DELIVERY (Order over €{config.freeDeliveryThreshold})
                </div>
              )}
            </div>
            <div className="result-details">
              <div className="result-item"><span>Distance:</span><span>{result.distance} km</span></div>
              <div className="result-item"><span>Estimated Time:</span><span>{result.duration} minutes</span></div>
              {result.band && <div className="result-item"><span>Price Band:</span><span>€{result.band.baseFee} base + €{result.band.perKm}/km</span></div>}
            </div>
            {result.breakdown && (
              <div className="calculation-breakdown">
                <h3>Cost Breakdown</h3>
                <div className="breakdown-section">
                  <div className="breakdown-item"><span>Base Fee:</span><span>€{result.breakdown.baseFee}</span></div>
                  <div className="breakdown-item subtotal">
                    <span>Distance Cost (€{result.band.perKm}/km × {result.distance} km):</span>
                    <span>€{result.breakdown.distanceCost}</span>
                  </div>
                  <div className="breakdown-item final-total"><span>Customer Pays:</span><span>€{result.deliveryFee}</span></div>
                </div>
              </div>
            )}
            <div className="save-quote-panel">
              <h3>💾 Save This Quote</h3>
              {saveSuccess ? (
                <div className="save-success">✅ Quote saved! <button className="link-btn" onClick={() => setSaveSuccess(false)}>Save another</button></div>
              ) : (
                <>
                  <p className="save-label">Give this quote a name before saving</p>
                  <div className="save-quote-row">
                    <input
                      type="text"
                      className="save-name-input"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder='e.g. "Multy", "John - Site 3"'
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveQuote(); } }}
                      autoComplete="off" autoCorrect="off" spellCheck="false"
                    />
                    <button className="save-btn" onClick={handleSaveQuote}>Save</button>
                  </div>
                  {saveError && <p className="save-error">{saveError}</p>}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Price Bands Editor ── */}
      <div className="bands-card">
        <div className="bands-header">
          <div>
            <h2 className="bands-title">Pricing Formula</h2>
            <p className="bands-subtitle">
              {bandsLoading ? 'Loading from Shopify…' : 'Set your price bands below. Changes apply to this calculator and the Shopify checkout.'}
            </p>
          </div>
          {bandsDirty && (
            <div className="bands-save-area">
              <button className="bands-save-btn" onClick={saveBandsToAPI} disabled={bandsSaving}>
                {bandsSaving ? 'Saving…' : 'Save Changes'}
              </button>
              {bandsSaveSuccess && <span className="bands-saved-badge">✓ Saved</span>}
              {bandsSaveError && <span className="bands-error-badge">{bandsSaveError}</span>}
            </div>
          )}
          {!bandsDirty && bandsSaveSuccess && (
            <span className="bands-saved-badge bands-saved-badge--idle">✓ Up to date</span>
          )}
        </div>

        {bandsLoading ? (
          <div className="bands-loading">Loading current rates…</div>
        ) : (
          <>
            <div className="bands-table">
              <div className="bands-table-head">
                <span>Min order value (€)</span>
                <span>Base fee (€)</span>
                <span>Per km (€)</span>
                <span>Preview</span>
                <span></span>
              </div>
              {sortedBands.map((band, i) => {
                const label = bandLabel(band, priceBands, config.freeDeliveryThreshold);
                return (
                  <div className="bands-table-row" key={i}>
                    <div className="bands-field">
                      <span className="bands-field-prefix">€</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={band.minOrderTotal}
                        onChange={(e) => updateBand(i, 'minOrderTotal', e.target.value)}
                        className="bands-input"
                      />
                    </div>
                    <div className="bands-field">
                      <span className="bands-field-prefix">€</span>
                      <input
                        type="number"
                        step="0.50"
                        min="0"
                        value={band.baseFee}
                        onChange={(e) => updateBand(i, 'baseFee', e.target.value)}
                        className="bands-input"
                      />
                    </div>
                    <div className="bands-field">
                      <span className="bands-field-prefix">€</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={band.perKm}
                        onChange={(e) => updateBand(i, 'perKm', e.target.value)}
                        className="bands-input"
                      />
                    </div>
                    <div className="bands-preview">
                      <span className="bands-preview-label">{label}</span>
                      <span className="bands-preview-formula">€{band.baseFee} + dist × €{band.perKm}/km</span>
                    </div>
                    <button
                      className="bands-remove-btn"
                      onClick={() => removeBand(i)}
                      disabled={priceBands.length <= 1}
                      title="Remove band"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              {/* Free delivery row */}
              <div className="bands-table-row bands-free-row">
                <div className="bands-field">
                  <span className="bands-field-prefix">€</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={config.freeDeliveryThreshold}
                    onChange={(e) => updateFreeThreshold(e.target.value)}
                    className="bands-input"
                  />
                </div>
                <div className="bands-free-label" style={{ gridColumn: 'span 3' }}>
                  <span className="bands-free-badge">FREE</span>
                  <span>Free delivery — no charge</span>
                  <span className="bands-field-hint">Set to 0 to disable free delivery</span>
                </div>
                <span></span>
              </div>
            </div>

            <div className="bands-footer">
              <button className="bands-add-btn" onClick={addBand}>+ Add Band</button>
              <button className="bands-reset-btn" onClick={resetToDefaults}>Reset to defaults</button>
              {bandsDirty && (
                <button className="bands-save-btn" onClick={saveBandsToAPI} disabled={bandsSaving}>
                  {bandsSaving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>

            {bandsDirty && (
              <p className="bands-unsaved-note">You have unsaved changes — click Save Changes to apply to Shopify.</p>
            )}
          </>
        )}
      </div>

      {/* ── Westmeath Delivery Reference ── */}
      {!bandsLoading && (
        <div className="towns-card">
          <h2 className="towns-title">Westmeath Delivery Reference</h2>
          <p className="towns-subtitle">
            Approximate prices from Mullingar (Ballinea). Actual checkout price is calculated by Google Maps.
          </p>
          <div className="towns-table-wrap">
            <table className="towns-table">
              <thead>
                <tr>
                  <th>Town / Area</th>
                  <th>~km</th>
                  {sortedBands.map((band, i) => {
                    const next = sortedBands[i + 1];
                    const upper = next
                      ? `–€${(next.minOrderTotal - 1).toFixed(0)}`
                      : config.freeDeliveryThreshold > 0
                        ? `–€${(config.freeDeliveryThreshold - 1).toFixed(0)}`
                        : '+';
                    return (
                      <th key={i}>
                        Orders €{band.minOrderTotal}{upper}
                      </th>
                    );
                  })}
                  {config.freeDeliveryThreshold > 0 && (
                    <th>€{config.freeDeliveryThreshold}+</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {WESTMEATH_TOWNS.map(town => (
                  <tr key={town.name}>
                    <td>{town.name}</td>
                    <td className="towns-km">{town.km} km</td>
                    {sortedBands.map((band, i) => {
                      const cost = band.baseFee + town.km * band.perKm;
                      return <td key={i} className="towns-price">€{cost.toFixed(2)}</td>;
                    })}
                    {config.freeDeliveryThreshold > 0 && (
                      <td className="towns-free">FREE</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Saved Quotes ── */}
      <button className="settings-toggle" onClick={() => setShowSaved(!showSaved)}>
        {showSaved ? '✕ Hide Saved Quotes' : `📋 Saved Quotes (${savedQuotes.length})`}
      </button>

      {showSaved && (
        <div className="saved-quotes-panel">
          <div className="saved-quotes-header">
            <h2>Saved Quotes</h2>
            {savedQuotes.length > 0 && (
              <button className="clear-all-btn" onClick={handleClearAll}>Clear All</button>
            )}
          </div>
          {savedQuotes.length === 0 ? (
            <p className="no-quotes">No saved quotes yet. Calculate a delivery cost and save it above.</p>
          ) : (
            <div className="quotes-list">
              {savedQuotes.map(q => (
                <div key={q.id} className="quote-card">
                  <div className="quote-card-header">
                    <div className="quote-name-area">
                      {editingNameId === q.id ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          className="rename-input"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                          autoComplete="off"
                        />
                      ) : (
                        <button className="quote-name-btn" onClick={() => startRename(q)} title="Click to rename">
                          <span className="quote-name">{q.name}</span>
                          <span className="rename-hint">✏️</span>
                        </button>
                      )}
                      <span className="quote-date">{q.savedAt}</span>
                    </div>
                    <button className="delete-btn" onClick={() => handleDeleteQuote(q.id)} title="Delete">✕</button>
                  </div>
                  <div className="quote-card-body">
                    <div className="quote-destination">
                      {q.resolvedAddress ? (
                        <>
                          {q.resolvedAddress.line1 && <div>📍 {q.resolvedAddress.line1}</div>}
                          {q.resolvedAddress.line2 && <div className="quote-address-line2">{q.resolvedAddress.line2}</div>}
                          {!q.resolvedAddress.line1 && !q.resolvedAddress.line2 && <div>📍 {q.destination}</div>}
                        </>
                      ) : (
                        <div>📍 {q.destination}</div>
                      )}
                    </div>
                    {q.orderValue > 0 && <div className="quote-row"><span>Order Value:</span><span>€{q.orderValue.toFixed(2)}</span></div>}
                    <div className="quote-row"><span>Distance:</span><span>{q.distance} km ({q.duration} min)</span></div>
                    {q.breakdown && (
                      <>
                        <div className="quote-row"><span>Base Fee:</span><span>€{q.breakdown.baseFee}</span></div>
                        <div className="quote-row"><span>Distance Cost:</span><span>€{q.breakdown.distanceCost}</span></div>
                      </>
                    )}
                    <div className="quote-row quote-total">
                      <span>Delivery Fee:</span>
                      <strong>{q.freeDelivery ? 'FREE' : `€${q.finalFee}`}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Settings (origin postcode only) ── */}
      <button className="settings-toggle" onClick={() => setShowSettings(!showSettings)} style={{ marginTop: '0.5rem' }}>
        {showSettings ? '✕ Close Settings' : '⚙️ Settings'}
      </button>

      {showSettings && (
        <div className="settings-panel">
          <h2>Settings</h2>
          <div className="input-group">
            <label>Origin Postcode (Yard)</label>
            <input
              type="text"
              value={originAddress}
              onChange={(e) => { setOriginAddress(e.target.value); setConfig(prev => ({ ...prev, originPostcode: e.target.value })); }}
              placeholder="N91PT7W"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
