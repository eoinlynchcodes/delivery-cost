import { useState, useEffect } from 'react';
import './App.css';

const DEFAULT_CONFIG = {
  minimumFee: 15,
  costPerKm: 1.25,
  freeDeliveryThreshold: 400,
  originPostcode: 'N91PT7W',
  baseLoadingTime: 15,
  baseUnloadingTime: 10,
  driverHourlyRate: 30,
  fuelCostPerKm: 0.40,
  wearTearPerKm: 0.10,
  margin: 0
};

function App() {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('deliveryPricingConfig');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  const [originAddress, setOriginAddress] = useState(config.originPostcode);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [orderValue, setOrderValue] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem('deliveryPricingConfig', JSON.stringify(config));
  }, [config]);

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: parseFloat(value) || value }));
  };

  const resetToDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem('deliveryPricingConfig');
  };

  const calculateDeliveryCost = (distanceKm, orderVal = 0) => {
    const loadingCost = (config.baseLoadingTime / 60) * config.driverHourlyRate;
    const unloadingCost = (config.baseUnloadingTime / 60) * config.driverHourlyRate;
    const baseCost = loadingCost + unloadingCost;

    const driverTimePerKm = (1 / 40) * config.driverHourlyRate;
    const totalCostPerKm = config.fuelCostPerKm + config.wearTearPerKm + driverTimePerKm;

    const totalCost = baseCost + (distanceKm * totalCostPerKm);
    const costWithMargin = totalCost * (1 + config.margin / 100);
    const deliveryFee = Math.max(config.minimumFee, costWithMargin);
    const finalFee = orderVal >= config.freeDeliveryThreshold ? 0 : deliveryFee;

    return {
      baseCost: baseCost.toFixed(2),
      kmCost: (distanceKm * totalCostPerKm).toFixed(2),
      totalCost: totalCost.toFixed(2),
      margin: config.margin,
      costWithMargin: costWithMargin.toFixed(2),
      minimumApplied: deliveryFee === config.minimumFee,
      deliveryFee: deliveryFee.toFixed(2),
      freeDelivery: finalFee === 0,
      finalFee: finalFee.toFixed(2),
      breakdown: {
        loadingCost: loadingCost.toFixed(2),
        unloadingCost: unloadingCost.toFixed(2),
        fuelCost: (distanceKm * config.fuelCostPerKm).toFixed(2),
        wearTear: (distanceKm * config.wearTearPerKm).toFixed(2),
        driverTimeCost: (distanceKm * driverTimePerKm).toFixed(2)
      }
    };
  };

  const fetchDistance = async () => {
    if (!destinationAddress.trim()) {
      setError('Please enter a destination address');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        // Fallback to manual entry
        const distance = prompt('Enter distance in km (Google Maps API not configured):');
        if (!distance || isNaN(distance)) {
          throw new Error('Invalid distance entered');
        }
        
        const distanceKm = parseFloat(distance);
        const durationMin = Math.round((distanceKm / 40) * 60);
        const pricing = calculateDeliveryCost(distanceKm, orderValue);

        setResult({
          distance: distanceKm.toFixed(1),
          duration: durationMin,
          distanceText: `${distanceKm.toFixed(1)} km`,
          durationText: `${durationMin} min`,
          ...pricing
        });
        
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/distance?origin=${encodeURIComponent(originAddress)}&destination=${encodeURIComponent(destinationAddress)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch distance data');
      }

      const data = await response.json();
      
      if (data.status !== 'OK' || !data.rows[0]?.elements[0]) {
        throw new Error('Could not calculate distance between addresses');
      }

      const element = data.rows[0].elements[0];
      
      if (element.status !== 'OK') {
        throw new Error('Invalid address or route not found');
      }

      const distanceKm = element.distance.value / 1000;
      const durationMin = Math.round(element.duration.value / 60);
      const pricing = calculateDeliveryCost(distanceKm, orderValue);

      setResult({
        distance: distanceKm.toFixed(1),
        duration: durationMin,
        distanceText: element.distance.text,
        durationText: element.duration.text,
        ...pricing
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
                <h4>Base Costs (Fixed per Delivery)</h4>
                <div className="breakdown-item">
                  <span>Loading ({config.baseLoadingTime} min @ €{config.driverHourlyRate}/hr):</span>
                  <span>€{result.breakdown.loadingCost}</span>
                </div>
                <div className="breakdown-item">
                  <span>Unloading ({config.baseUnloadingTime} min @ €{config.driverHourlyRate}/hr):</span>
                  <span>€{result.breakdown.unloadingCost}</span>
                </div>
                <div className="breakdown-item subtotal">
                  <span>Base Cost Subtotal:</span>
                  <span>€{result.baseCost}</span>
                </div>
              </div>

              <div className="breakdown-section">
                <h4>Distance-Based Costs ({result.distance} km)</h4>
                <div className="breakdown-item">
                  <span>Fuel (€{config.fuelCostPerKm}/km):</span>
                  <span>€{result.breakdown.fuelCost}</span>
                </div>
                <div className="breakdown-item">
                  <span>Wear & Tear (€{config.wearTearPerKm}/km):</span>
                  <span>€{result.breakdown.wearTear}</span>
                </div>
                <div className="breakdown-item">
                  <span>Driver Time (€{config.driverHourlyRate}/hr @ 40km/hr avg):</span>
                  <span>€{result.breakdown.driverTimeCost}</span>
                </div>
                <div className="breakdown-item subtotal">
                  <span>Distance Cost Subtotal:</span>
                  <span>€{result.kmCost}</span>
                </div>
              </div>

              <div className="breakdown-section">
                <div className="breakdown-item total">
                  <span>Total Cost:</span>
                  <span>€{result.totalCost}</span>
                </div>
                
                {result.minimumApplied && (
                  <div className="breakdown-item minimum-applied">
                    <span>Minimum Fee Applied:</span>
                    <span>€{config.minimumFee}</span>
                  </div>
                )}

                <div className="breakdown-item final-total">
                  <span>Customer Pays:</span>
                  <span>€{result.deliveryFee}</span>
                </div>
              </div>
            </div>

            <div className="formula-explanation">
              <h3>Pricing Formula</h3>
              <div className="formula-box">
                <code>
                  Delivery Fee = max(€{config.minimumFee}, Base Cost + Distance × €{config.costPerKm}/km)
                </code>
              </div>
              <p className="formula-notes">
                <strong>How it works:</strong> We calculate the true cost of delivery by adding fixed costs 
                (loading/unloading time) to distance-based costs (fuel, wear, driver time). 
                The final fee is always at least €{config.minimumFee}, even for very short distances.
                {config.freeDeliveryThreshold > 0 && ` Orders over €${config.freeDeliveryThreshold} qualify for free delivery.`}
              </p>
            </div>
          </div>
        )}
      </div>

      <button 
        className="settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
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
                <label>Minimum Flat Fee (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.minimumFee}
                  onChange={(e) => updateConfig('minimumFee', e.target.value)}
                />
              </div>
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

            <div className="setting-group">
              <h3>Time & Labor</h3>
              <div className="input-group">
                <label>Loading Time (minutes)</label>
                <input
                  type="number"
                  value={config.baseLoadingTime}
                  onChange={(e) => updateConfig('baseLoadingTime', e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Unloading Time (minutes)</label>
                <input
                  type="number"
                  value={config.baseUnloadingTime}
                  onChange={(e) => updateConfig('baseUnloadingTime', e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Driver Hourly Rate (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.driverHourlyRate}
                  onChange={(e) => updateConfig('driverHourlyRate', e.target.value)}
                />
              </div>
            </div>

            <div className="setting-group">
              <h3>Per-Kilometer Costs</h3>
              <div className="input-group">
                <label>Fuel Cost (€/km)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.fuelCostPerKm}
                  onChange={(e) => updateConfig('fuelCostPerKm', e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Wear & Tear (€/km)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.wearTearPerKm}
                  onChange={(e) => updateConfig('wearTearPerKm', e.target.value)}
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
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
