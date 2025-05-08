// Initialize components
document.addEventListener('DOMContentLoaded', () => {
  // Set active nav link based on current page
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-links a');
  
  navLinks.forEach(link => {
    const linkPage = link.getAttribute('href');
    if (linkPage === currentPage) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Initialize map if on charging map page
  if (currentPage === 'Charging_Map.html') {
    initMap();
  }

  // Initialize emissions chart if on incentives page
  if (currentPage === 'Incentives.html') {
    updateEmissionsChart();
    document.getElementById('car-comparison')?.addEventListener('change', updateEmissionsChart);
  }

  // FAQ Card Functionality
  const faqCards = document.querySelectorAll('.faq-card');
  
  faqCards.forEach(card => {
    const question = card.querySelector('.faq-question');
    question.addEventListener('click', () => {
      card.classList.toggle('active');
      const icon = question.querySelector('.icon');
      icon.textContent = card.classList.contains('active') ? '-' : '+';
    });
  });
});

let map;
let markers = [];

function initMap() {
  // Center on Australia with a wider view
  map = L.map('map-container').setView([-25.2744, 133.7751], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Add loading indicator
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-indicator';
  loadingDiv.innerHTML = 'Loading charging stations...';
  loadingDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 1000;';
  document.getElementById('map-container').appendChild(loadingDiv);

  // Add event listener for postcode search
  const searchInput = document.getElementById('location-search');
  const searchButton = document.getElementById('use-location');
  
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchByPostcode(searchInput.value);
      }
    });
  }

  if (searchButton) {
    searchButton.addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 12);
            fetchChargingStations(latitude, longitude);
          },
          (error) => {
            console.error('Geolocation error:', error);
            showError('Unable to get your location. Please enter a postcode instead.');
          }
        );
      } else {
        showError('Geolocation is not supported by your browser. Please enter a postcode.');
      }
    });
  }

  // Initial load of all Australian stations
  fetchAllAustralianStations();
}

function fetchAllAustralianStations() {
  const apiKey = '80974945-fece-4e38-8ce2-1fac6559c2f7';
  
  // Fetch stations for major cities
  const cities = [
    { lat: -33.8688, lon: 151.2093, name: 'Sydney' },
    { lat: -37.8136, lon: 144.9631, name: 'Melbourne' },
    { lat: -27.4698, lon: 153.0251, name: 'Brisbane' },
    { lat: -31.9523, lon: 115.8613, name: 'Perth' },
    { lat: -34.9285, lon: 138.6007, name: 'Adelaide' },
    { lat: -42.8821, lon: 147.3272, name: 'Hobart' },
    { lat: -12.4634, lon: 130.8456, name: 'Darwin' },
    { lat: -35.2809, lon: 149.1300, name: 'Canberra' }
  ];

  // Fetch stations for each city
  const promises = cities.map(city => 
    fetchChargingStations(city.lat, city.lon, 50)
  );

  Promise.all(promises)
    .then(() => {
      const loadingDiv = document.getElementById('loading-indicator');
      if (loadingDiv) loadingDiv.remove();
    })
    .catch(error => {
      console.error('Error fetching stations:', error);
      showError('Error loading some charging stations. Please try searching for a specific location.');
    });
}

function searchByPostcode(postcode) {
  // Remove any spaces from the postcode
  postcode = postcode.replace(/\s+/g, '');
  
  // Use OpenCage geocoding service with the provided API key
  fetch(`https://api.opencagedata.com/geocode/v1/json?q=${postcode}+Australia&key=f05911fa42934260a19bec4058143407`)
    .then(response => response.json())
    .then(data => {
      if (data.results && data.results.length > 0) {
        const { lat, lng } = data.results[0].geometry;
        map.setView([lat, lng], 12);
        fetchChargingStations(lat, lng, 20); // Search within 20km
      } else {
        showError('Postcode not found. Please try another postcode.');
      }
    })
    .catch(error => {
      console.error('Geocoding error:', error);
      showError('Error searching for postcode. Please try again.');
    });
}

function fetchChargingStations(lat, lon, radius = 50) {
  const apiKey = '80974945-fece-4e38-8ce2-1fac6559c2f7';

  return fetch(`https://api.openchargemap.io/v3/poi/?output=json&countrycode=AU&latitude=${lat}&longitude=${lon}&maxresults=50&compact=true&verbose=false&key=${apiKey}&distance=${radius}&distanceunit=KM`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      const stations = data.map(item => ({
        latitude: item.AddressInfo.Latitude,
        longitude: item.AddressInfo.Longitude,
        name: item.AddressInfo.Title,
        address: item.AddressInfo.AddressLine1,
        powerKW: item.Connections?.[0]?.PowerKW || null,
        connectorTypes: item.Connections?.map(c => c.ConnectionType?.Title) || [],
        status: item.StatusType?.Title || 'Unknown',
        distance: item.AddressInfo.Distance
      }));
      addChargersToMap(stations);
    })
    .catch(error => {
      console.error('OCM API error:', error);
      showError('Failed to load charging stations. Please try again later.');
    });
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #ffebee; color: #c62828; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 1000;';
  errorDiv.textContent = message;
  document.getElementById('map-container').appendChild(errorDiv);
  
  // Remove error message after 5 seconds
  setTimeout(() => errorDiv.remove(), 5000);
}

function addChargersToMap(chargers) {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];

  chargers.forEach(charger => {
    if (charger.latitude && charger.longitude) {
      let chargerType = 'standard';
      if (charger.powerKW && charger.powerKW >= 150) chargerType = 'ultra';
      else if (charger.powerKW && charger.powerKW >= 50) chargerType = 'fast';

      const icon = L.divIcon({
        className: `charger-marker ${chargerType}`,
        html: `<div class="marker-dot ${chargerType}"></div>`,
        iconSize: [12, 12]
      });

      const marker = L.marker([charger.latitude, charger.longitude], { icon })
        .bindPopup(`
          <strong>${charger.name || 'Charging Station'}</strong><br>
          ${charger.address || ''}<br>
          Power: ${charger.powerKW ? charger.powerKW + 'kW' : 'Unknown'}<br>
          Connectors: ${charger.connectorTypes.length ? charger.connectorTypes.join(', ') : 'Unknown'}<br>
          Status: ${charger.status || 'Unknown'}<br>
          ${charger.distance ? `Distance: ${charger.distance.toFixed(1)}km` : ''}
        `);

      markers.push(marker);
      marker.addTo(map);
    }
  });

  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
  } else {
    showError('No charging stations found in this area.');
  }
}

// Filter chargers
document.getElementById('charger-type')?.addEventListener('change', e => {
  const type = e.target.value;
  const chargers = getChargers(); // Replace with real data
  const filtered = type === 'all' ? chargers : chargers.filter(c => c.type === type);
  addChargersToMap(filtered);
});

// Location search
document.getElementById('location-search')?.addEventListener('input', e => {
  const query = e.target.value.toLowerCase();
  const chargers = getChargers(); // Replace with real data
  const filtered = chargers.filter(c => c.name.toLowerCase().includes(query));
  addChargersToMap(filtered);
});

// Rebate finder
function showRebate() {
  const state = document.getElementById('state-select').value;
  const rebateResult = document.getElementById('rebate-result');
  
  // Example rebate data (simplified)
  const rebates = {
    'NSW': {
      stampDuty: 'Exempt',
      registration: '3 years free',
      fbt: 'Exempt'
    },
    'VIC': {
      stampDuty: 'Exempt',
      registration: '2 years free',
      fbt: 'Exempt'
    },
    // Add other states...
  };

  const stateRebates = rebates[state] || {
    stampDuty: 'Check local government',
    registration: 'Standard rates apply',
    fbt: 'Standard rates apply'
  };

  rebateResult.innerHTML = `
    <div class="rebate-summary">
      <h3>Available Rebates in ${state}</h3>
      <ul class="rebate-list">
        <li><strong>Stamp Duty:</strong> ${stateRebates.stampDuty}</li>
        <li><strong>Registration:</strong> ${stateRebates.registration}</li>
        <li><strong>FBT:</strong> ${stateRebates.fbt}</li>
      </ul>
    </div>
  `;
}

// TCO Calculator
function calcTCO() {
  const km = parseFloat(document.getElementById('km').value);
  const fuelPrice = parseFloat(document.getElementById('fuelPrice').value);
  const elecRate = parseFloat(document.getElementById('elecRate').value);

  // Example calculations (simplified)
  const evEfficiency = 0.15; // kWh/km
  const iceEfficiency = 0.08; // L/km

  const evCost = km * evEfficiency * elecRate;
  const iceCost = km * iceEfficiency * fuelPrice;
  const savings = iceCost - evCost;

  const resultDiv = document.getElementById('tco-result');
  resultDiv.innerHTML = `
    <div class="result-summary">
      <h3>Annual Savings</h3>
      <p class="savings-amount">$${savings.toFixed(2)}</p>
      <p>Based on your inputs:</p>
      <ul>
        <li>EV Cost: $${evCost.toFixed(2)}</li>
        <li>ICE Cost: $${iceCost.toFixed(2)}</li>
      </ul>
    </div>
  `;

  // Update charts (placeholder)
  updateSavingsCharts(evCost, iceCost);
}

function updateSavingsCharts(evCost, iceCost) {
  const fuelChart = document.getElementById('fuel-savings');
  const maintenanceChart = document.getElementById('maintenance-savings');

  // Placeholder for chart implementation
  fuelChart.innerHTML = `<div class="chart-placeholder">Fuel Savings Chart</div>`;
  maintenanceChart.innerHTML = `<div class="chart-placeholder">Maintenance Savings Chart</div>`;
}

// Emissions Calculator
function updateEmissionsChart() {
  const carType = document.getElementById('car-comparison').value;
  const emissions = {
    small: { ice: 120, ev: 30 },
    medium: { ice: 180, ev: 45 },
    large: { ice: 250, ev: 60 }
  };
  
  const data = emissions[carType];
  const savings = data.ice - data.ev;
  
  const chart = document.getElementById('emissions-chart');
  chart.innerHTML = `
    <div class="emissions-bar">
      <div class="bar ice" style="width: ${(data.ice / 250) * 100}%">
        ${data.ice}g/km
      </div>
      <div class="bar ev" style="width: ${(data.ev / 250) * 100}%">
        ${data.ev}g/km
      </div>
    </div>
    <p class="savings">Annual CO₂ savings: ${savings * 15000 / 1000} tonnes</p>
  `;
}
