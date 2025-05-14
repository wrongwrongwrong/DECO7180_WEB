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

  // Hamburger menu functionality
  const hamburger = document.querySelector('.hamburger');
  const navLinksContainer = document.querySelector('.nav-links');
  if (hamburger && navLinksContainer) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navLinksContainer.classList.toggle('open');
      const expanded = hamburger.classList.contains('active');
      hamburger.setAttribute('aria-expanded', expanded);
    });
    // Optional: close menu when a link is clicked (mobile UX)
    navLinksContainer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          hamburger.classList.remove('active');
          navLinksContainer.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }
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

function searchByPostcode(query) {
  // Remove any extra spaces and normalize the query
  query = query.trim().replace(/\s+/g, ' ');
  
  // Add state context if not present
  if (!query.toLowerCase().includes('australia') && !query.toLowerCase().includes('au')) {
    query += ', Australia';
  }
  
  // Use OpenCage geocoding service with the provided API key
  fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=f05911fa42934260a19bec4058143407`)
    .then(response => response.json())
    .then(data => {
      if (data.results && data.results.length > 0) {
        // Sort results by relevance score
        const sortedResults = data.results.sort((a, b) => b.confidence - a.confidence);
        
        // Find the most relevant result in Australia
        const australianResult = sortedResults.find(result => 
          result.components.country_code === 'au'
        );

        if (australianResult) {
          const { lat, lng } = australianResult.geometry;
          map.setView([lat, lng], 12);
          fetchChargingStations(lat, lng, 20); // Search within 20km
          
          // Update the search input with the formatted address
          const searchInput = document.getElementById('location-search');
          if (searchInput) {
            searchInput.value = australianResult.formatted;
          }
        } else {
          showError('Location not found in Australia. Please try a different address.');
        }
      } else {
        showError('Location not found. Please try a different address.');
      }
    })
    .catch(error => {
      console.error('Geocoding error:', error);
      showError('Error searching for location. Please try again.');
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

      // Format connector types, removing empty entries and duplicates
      const connectorTypes = [...new Set(charger.connectorTypes.filter(type => type && type.trim()))];
      
      // Format pricing information
      const pricingInfo = charger.pricing ? 
        `Pricing: ${charger.pricing}` : 
        'Pricing: Not listed';

      const marker = L.marker([charger.latitude, charger.longitude], { icon })
        .bindPopup(`
          <div class="charger-popup">
            <strong>${charger.name || 'Charging Station'}</strong>
            <div class="charger-details">
              ${charger.address ? `<div class="detail-item"><i class="fas fa-map-marker-alt"></i> ${charger.address}</div>` : ''}
              ${charger.powerKW ? `<div class="detail-item"><i class="fas fa-bolt"></i> ${charger.powerKW}kW</div>` : ''}
              ${charger.distance ? `<div class="detail-item"><i class="fas fa-route"></i> ${charger.distance.toFixed(1)}km away</div>` : ''}
            </div>
            <div class="popup-note">
              <small><i class="fas fa-info-circle"></i> Some information may be limited based on available data</small>
            </div>
          </div>
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
  const state = (document.getElementById('state-select').value || '').toUpperCase();
  if (!state) return;

  /* Official links + current incentives (May 2025) */
  const rebates = {
    NSW: {
      purchase: 'None',
      stampDuty: 'Standard',
      registration: 'Standard',
      fbt: 'Exempt (federal)',
      url: 'https://www.revenue.nsw.gov.au/grants-schemes/electric-vehicle-rebate'
    },
    VIC: {
      purchase: 'None',
      stampDuty: 'Standard',
      registration: 'Standard',
      fbt: 'Exempt (federal)',
      url: 'https://www.energy.vic.gov.au/renewable-energy/zero-emission-vehicles'
    },
    QLD: {
      purchase: '$6,000 rebate (≤$68k, income-tested)',
      stampDuty: 'Discounted',
      registration: 'Standard',
      fbt: 'Exempt (federal)',
      url: 'https://www.qrida.qld.gov.au/program/queensland-zero-emission-vehicle-rebate-scheme'
    },
    SA: {
      purchase: '$3,000 rebate',
      stampDuty: 'Exempt',
      registration: '3 years free',
      fbt: 'Exempt (federal)',
      url: 'https://www.treasury.sa.gov.au/Growing-South-Australia/incentives-for-electric-vehicles'
    },
    WA: {
      purchase: '$3,500 rebate (until 10 May 2025)',
      stampDuty: 'Standard',
      registration: 'Standard',
      fbt: 'Exempt (federal)',
      url: 'https://www.transport.wa.gov.au/projects/zero-emission-vehicle-zev-rebate.asp'
    },
    TAS: {
      purchase: '$2,000 rebate (375 places)',
      stampDuty: 'Standard',
      registration: '3 years free',
      fbt: 'Exempt (federal)',
      url: 'https://recfit.tas.gov.au/what_is_recfit/climate_change/electric_vehicles/support/rebate_guidelines'
    },
    ACT: {
      purchase: 'None',
      stampDuty: 'Exempt',
      registration: 'Discounted',
      fbt: 'Exempt (federal)',
      url: 'https://www.accesscanberra.act.gov.au/driving-transport-and-parking/registration/incentives-for-low-and-zero-emissions-vehicles'
    },
    NT: {
      purchase: 'None',
      stampDuty: 'Waived ≤$50k',
      registration: 'Free (to 30 Jun 2027)',
      fbt: 'Exempt (federal)',
      url: 'https://nt.gov.au/driving/rego/getting-an-nt-registration/get-electric-vehicle-registration-and-stamp-duty-concessions'
    }
  };

  /* Fallback if state missing */
  const r = rebates[state] || {
    purchase: 'Check local government',
    stampDuty: 'Check',
    registration: 'Check',
    fbt: 'Exempt (federal)',
    url: '#'
  };

  document.getElementById('rebate-result').innerHTML = `
    <div class="rebate-summary">
      <h3>Incentives in ${state}</h3>
      <ul class="rebate-list">
        <li><strong>Up-front rebate:</strong> ${r.purchase}</li>
        <li><strong>Stamp Duty:</strong> ${r.stampDuty}</li>
        <li><strong>Registration:</strong> ${r.registration}</li>
        <li><strong>FBT (salary-sacrifice):</strong> ${r.fbt}</li>
      </ul>
      <a href="${r.url}" target="_blank" rel="noopener noreferrer" class="btn secondary" style="margin-top:0.75rem;">
        More details
      </a>
      <p class="note" style="font-size:0.75rem;margin-top:0.5rem;">Last updated May 2025</p>
    </div>`;
}

/* ——— Assumption constants (cited 10 May 2025) ——— */
const ASSUMPTIONS = {
  evEfficiency: { value: 0.15, text: '15 kWh/100 km (EVC factsheet 2024)' },
  iceEfficiency: { value: 0.08, text: '8 L/100 km (NTC fleet avg 2023)' },
  defaultFuelPrice: { value: 2.10, text: 'BITRE national ULP avg 2024-25' },
  defaultElecRate: { value: 0.25, text: 'AEMC residential avg 2024' }
};

/* ——— Energy Cost Savings calculator ——— */
function calcEnergySavings() {
  const km = clamp(+document.getElementById('km').value, 1000, 100000, 15000);
  const fuelPrice = clamp(+document.getElementById('fuelPrice').value,
                          1, 5, ASSUMPTIONS.defaultFuelPrice.value);
  const elecRate = clamp(+document.getElementById('elecRate').value,
                         0.10, 0.60, ASSUMPTIONS.defaultElecRate.value);

  const evCost  = km * ASSUMPTIONS.evEfficiency.value  * elecRate;
  const iceCost = km * ASSUMPTIONS.iceEfficiency.value * fuelPrice;
  const savings = iceCost - evCost;

  document.getElementById('energy-savings-result').innerHTML = `
    <div class="result-summary">
      <h3>Annual Savings</h3>
      <p class="savings-amount">$${savings.toFixed(0)}</p>
      <details class="method">
        <summary>Assumptions (tap)</summary>
        <ul>
          <li>${ASSUMPTIONS.evEfficiency.text}</li>
          <li>${ASSUMPTIONS.iceEfficiency.text}</li>
          <li>${ASSUMPTIONS.defaultFuelPrice.text}</li>
          <li>${ASSUMPTIONS.defaultElecRate.text}</li>
        </ul>
      </details>
    </div>`;
}

/* Utility: keep numbers in a sensible range or fall back */
function clamp(value, min, max, fallback = 0) {
  const n = Number(value);
  return isFinite(n) && n >= min && n <= max ? n : fallback;
}

/* ——— Emissions Savings visualiser ——— */
function updateEmissionsChart() {
  /* user inputs */
  const cls       = document.getElementById('car-comparison').value;      // small | medium | large
  const annualKm  = clamp(+document.getElementById('emissions-km').value,
                          1_000, 100_000, 15_000);

  /* constants (publicly sourced) */
  const ICE_FACTORS = { small: 120, medium: 180, large: 250 }; // g CO₂ / km  — NTC 2023
  const EV_CO2      = 30;                                      // g CO₂ / km  — CSIRO 2024 grid-avg

  /* maths */
  const iceCO2     = ICE_FACTORS[cls];
  const savedPerKm = iceCO2 - EV_CO2;                          // grams saved each km
  const annualTons = (savedPerKm * annualKm) / 1e6;            // convert g → tonnes

  /* bar lengths as % of largest ICE class */
  const maxScale   = Math.max(...Object.values(ICE_FACTORS));
  const iceWidth   = (iceCO2 / maxScale) * 100;
  const evWidth    = (EV_CO2  / maxScale) * 100;

  /* inject HTML */
  document.getElementById('emissions-chart').innerHTML = `
    <div class="bars">
      <div class="bar ice" style="width:${iceWidth}%">
        <span>${iceCO2} g/km&nbsp;(ICE)</span>
      </div>
      <div class="bar ev" style="width:${evWidth}%">
        <span>${EV_CO2} g/km&nbsp;(EV)</span>
      </div>
    </div>

    <p class="headline">
      <span class="figure">${annualTons.toFixed(1)} t</span>
      CO₂ saved / year
    </p>

    <details class="method">
      <summary>Methodology</summary>
      <ul>
        <li>ICE intensity: National Transport Commission "Light-Vehicle Emissions", 2023</li>
        <li>EV intensity: CSIRO grid-average Scope 2, 2024</li>
        <li>Annual distance: ${annualKm.toLocaleString()} km (user input)</li>
      </ul>
    </details>`;
}



