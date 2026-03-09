import { useState, useEffect, useRef } from 'react';
import './App.css';

const DEFAULT_CONFIG = {
      freeDeliveryThreshold: 400,
      originPostcode: 'N91PT7W'
};

// Pricing constants (must match api/distance.js)
const BASE_FEE = 15;
const RATE_PER_KM = 1.25;

function App() {
      const [config, setConfig] = useState(() => {
              const saved = localStorage.getItem('deliveryPricingConfig');
              if (saved) {
                        const parsed = JSON.parse(saved);
                        // Migrate away from old config shape
                if (parsed.minimumFee !== undefined || parsed.costPerKm !== undefined ||
                              parsed.fuelCostPerKm !== undefined || parsed.wearTearPerKm !== undefined) {
                            return DEFAULT_CONFIG;
                }
                        return parsed;
              }
              return DEFAULT_CONFIG;
      });

  const [originAddress, setOriginAddress] = useState(config.originPostcode);
      const [destinationAddress, setDestinationAddress] = useState('');
      const [orderValue, setOrderValue] = useState(0);
      const [result, setResult] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const [showSettings, setShowSettings] = useState(false);

  // Saved quotes state
  const [savedQuotes, setSavedQuotes] = useState(() => {
          const saved = localStorage.getItem('savedDeliveryQuotes');
          return saved ? JSON.parse(saved) : [];
  });
      const [saveName, setSaveName] = useState('');
      const [saveError, setSaveError] = useState('');
      const [showSaved, setShowSaved] = useState(false);
      const [saveSuccess, setSaveSuccess] = useState(false);

  // Inline rename state
  const [editingNameId, setEditingNameId] = useState(null);
      const [editingNameValue, setEditingNameValue] = useState('');
      const renameInputRef = useRef(null);

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

  const updateConfig = (key, value) => {
          setConfig(prev => ({ ...prev, [key]: parseFloat(value) || value }));
  };

  const resetToDefaults = () => {
          setConfig(DEFAULT_CONFIG);
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

            // Floor to nearest whole km (Google returns metres as an integer)
            const distanceKm = Math.floor(element.distance.value / 1000);
                    const durationMin = Math.round(element.duration.value / 60);

            const distanceCost = parseFloat((distanceKm * RATE_PER_KM).toFixed(2));
                    const deliveryFee = BASE_FEE + distanceCost;

            const freeDelivery = orderValue >= config.freeDeliveryThreshold;
                    const finalFee = freeDelivery ? 0 : deliveryFee;

            const resolved = data.resolvedAddress;
                    setResult({
                                distance: distanceKm,
                                duration: durationMin,
                                destination: destinationAddress,
                                resolvedAddress: resolved,
                                orderValue,
                                distanceCost: distanceCost.toFixed(2),
                                deliveryFee: deliveryFee.toFixed(2),
                                freeDelivery,
                                finalFee: finalFee.toFixed(2),
                                breakdown: {
                                              baseFee: BASE_FEE.toFixed(2),
                                              distanceCost: distanceCost.toFixed(2),
                                },
                    });

            // Suggest name: prefer town from geocoding, fall back to first part of input
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
          if (!trimmed) {
                    setSaveError('Please enter a name for this quote.');
                    return;
          }
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
                    distanceCost: result.distanceCost,
                    deliveryFee: result.deliveryFee,
          };
          setSavedQuotes(prev => [quote, ...prev]);
          setSaveSuccess(true);
          setSaveName('');
  };

  const handleDeleteQuote = (id) => {
          setSavedQuotes(prev => prev.filter(q => q.id !== id));
  };

  const handleClearAll = () => {
          if (window.confirm('Delete all saved quotes?')) {
                    setSavedQuotes([]);
          }
  };

  const startRename = (quote) => {
          setEditingNameId(quote.id);
          setEditingNameValue(quote.name);
  };

  const commitRename = () => {
          const trimmed = editingNameValue.trim();
          if (trimmed) {
                    setSavedQuotes(prev => prev.map(q => q.id === editingNameId ? { ...q, name: trimmed } : q));
          }
          setEditingNameId(null);
          setEditingNameValue('');
  };

  const cancelRename = () => {
          setEditingNameId(null);
          setEditingNameValue('');
  };

  return (
          <div className="container">
                <header>
                        <h1>Delivery Cost Calculator</h1>
                        <p className="subtitle">Timber and Bark Mulch - Distance-Based Pricing</p>
                </header>
          
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
                                  <label>Order Value (€) - Optional</label>
                                  <input
                                                  type="number"
                                                  value={orderValue}
                                                  onChange={(e) => setOrderValue(parseFloat(e.target.value) || 0)}
                                                  placeholder="0"
                                                  min="0"
                                                />
                        </div>
                
                        <button
                                      className="calculate-btn"
                                      onClick={fetchDistance}
                                      disabled={loading}
                                    >
                            {loading ? 'Calculating...' : 'Calculate Delivery Cost'}
                        </button>
                
                    {error && (
                        <div className="error-message">
                                    <strong>Error:</strong> {error}
                        </div>
                        )}
                
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
                                                  <div className="result-item">
                                                                  <span>Distance:</span>
                                                                  <span>{result.distance} km</span>
                                                  </div>
                                                  <div className="result-item">
                                                                  <span>Estimated Time:</span>
                                                                      <span>{result.duration} minutes</span>
                                                  </div>
                                    </div>
                        
                                    <div className="calculation-breakdown">
                                                  <h3>Cost Breakdown</h3>
                                                  <div className="breakdown-section">
                                                                  <div className="breakdown-item">
                                                                                    <span>Base Fee:</span>
                                                                                    <span>€{result.breakdown.baseFee}</span>
                                                                  </div>
                                                                  <div className="breakdown-item subtotal">
                                                                                    <span>Distance Cost (€{RATE_PER_KM}/km × {result.distance} km):</span>
                                                                                    <span>€{result.distanceCost}</span>
                                                                  </div>
                                                                  <div className="breakdown-item final-total">
                                                                                    <span>Customer Pays:</span>
                                                                                    <span>€{result.deliveryFee}</span>
                                                                  </div>
                                                  </div>
                                    </div>
                        
                            {/* ── Save Quote Panel ── */}
                                    <div className="save-quote-panel">
                                                  <h3>💾 Save This Quote</h3>
                                        {saveSuccess ? (
                                            <div className="save-success">
                                                              ✅ Quote saved! <button className="link-btn" onClick={() => setSaveSuccess(false)}>Save another</button>
                                            </div>
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
                                                                                                            onKeyDown={(e) => {
                                                                                                                                        if (e.key === 'Enter') { e.preventDefault(); handleSaveQuote(); }
                                                                                                                }}
                                                                                                            autoComplete="off"
                                                                                                            autoCorrect="off"
                                                                                                            spellCheck="false"
                                                                                                          />
                                                                                  <button className="save-btn" onClick={handleSaveQuote}>Save</button>
                                                              </div>
                                                {saveError && <p className="save-error">{saveError}</p>}
                                            </>>
                                          )}
                                    </div>
                        </div>
                        )}
                </div>
          
              {/* ── Pricing Formula (always visible) ── */}
                <div className="formula-explanation">
                        <h3>Pricing Formula</h3>
                        <div className="formula-box">
                                  <code>Delivery Fee = €{BASE_FEE} + (Distance × €{RATE_PER_KM}/km)</code>
                        </div>
                        <p className="formula-notes">
                                  <strong>How it works:</strong> A flat base fee of €{BASE_FEE} covers loading/unloading, plus €{RATE_PER_KM} per km of distance (rounded down to the nearest km).
                            {config.freeDeliveryThreshold > 0 && ` Orders over €${config.freeDeliveryThreshold} qualify for free delivery.`}
                        </p>
                </div>
          
              {/* ── Saved Quotes Section ── */}
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
                                                                                                                    onKeyDown={(e) => {
                                                                                                                                                    if (e.key === 'Enter') commitRename();
                                                                                                                                                    if (e.key === 'Escape') cancelRename();
                                                                                                                        }}
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
                                                                                          </>>
                                                                                    ) : (
                                                                                      <div>📍 {q.destination}</div>
                                                                                                                      )}
                                                                                                    </div>
                                                                                {q.orderValue > 0 && (
                                                                                    <div className="quote-row">
                                                                                                            <span>Order Value:</span><span>€{q.orderValue.toFixed(2)}</span>
                                                                                        </div>
                                                                                                )}
                                                                                                <div className="quote-row">
                                                                                                                      <span>Distance:</span><span>{q.distance} km ({q.duration} min)</span>
                                                                                                    </div>
                                                                                                <div className="quote-row">
                                                                                                                      <span>Base Fee:</span><span>€{q.breakdown.baseFee}</span>
                                                                                                    </div>
                                                                                                <div className="quote-row">
                                                                                                                      <span>Distance Cost:</span><span>€{q.breakdown.distanceCost}</span>
                                                                                                    </div>
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
          
                <button
                            className="settings-toggle"
                            onClick={() => setShowSettings(!showSettings)}
                            style={{ marginTop: '0.5rem' }}
                          >
                    {showSettings ? '✕ Close Settings' : '⚙️ Edit Pricing Variables'}
                </button>
          
              {showSettings && (
                      <div className="settings-panel">
                                <h2>Pricing Configuration</h2>
                                <div className="settings-grid">
                                            <div className="setting-group">
                                                          <h3>Delivery Fees</h3>
                                                          <div className="input-group">
                                                                          <label>Free Delivery Threshold (€)</label>
                                                                          <input
                                                                                                type="number"
                                                                                                step="1"
                                                                                                value={config.freeDeliveryThreshold}
                                                                                                onChange={(e) => updateConfig('freeDeliveryThreshold', e.target.value)}
                                                                                              />
                                                          </div>
                                            </div>
                                </div>
                                <div className="settings-actions">
                                            <button className="reset-btn" onClick={resetToDefaults}>
                                                          Reset to Defaults
                                            </button>
                                </div>
                                <div className="settings-info">
                                            <p><strong>Note:</strong> Settings are saved in your browser and will persist between sessions.</p>
                                            <p><strong>Pricing:</strong> Base fee (€{BASE_FEE}) and per-km rate (€{RATE_PER_KM}) are fixed server-side.</p>
                                </div>
                      </div>
                )}
          </div>
        );
}

export default App;
