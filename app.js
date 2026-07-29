/* =========================================================
   SCOTLAND FAMILY ROAD TRIP — app.js
   Vanilla JS SPA. No build step, no framework, works from
   file:// or GitHub Pages. Data lives in data/itinerary.json.
   Personal edits (families, expenses, packing, notes) persist
   in localStorage on each device — see README for the v2
   cloud-sync plan.
   ========================================================= */

const STORAGE_KEYS = {
  families: 'sfrt_families',
  expenses: 'sfrt_expenses',
  packing:  'sfrt_packing',
  notes:    'sfrt_notes',
  settings: 'sfrt_settings',
  identity: 'sfrt_identity',
  sharing:  'sfrt_sharing',
  meals:    'sfrt_meals',
  weatherCache: 'sfrt_weather_cache'
};

let TRIP = null; // loaded from data/itinerary.json

/* ---------------- Boot ---------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  TRIP = await loadTripData();
  setupNav();
  setupMoreMenu();
  setupIdentity();
  initFirebase();
  setupSharingToggle();
  updateLocationStatusUI();
  renderHome();
  renderReadiness();
  renderItinerary();
  renderFamilies();
  setupExpenseForm();
  renderExpenses();
  renderAccommodation();
  renderPacking();
  loadNotes();
  loadSettings();
  tickCountdown();
  setInterval(tickCountdown, 60 * 1000);
  loadWeather();
  loadForecastScreen();
  renderCurrentLegCard();
  if (isSharing()) startSharing();
});

async function loadTripData() {
  try {
    const res = await fetch('data/itinerary.json');
    return await res.json();
  } catch (err) {
    console.error('Could not load itinerary.json', err);
    return { project: {}, meetingPoints: [], travelPath: [], accommodation: [], itinerary: [], families: [], expenseCategories: [], packingCategories: {} };
  }
}

/* ---------------- Navigation ---------------- */

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showScreen(btn.dataset.screen, btn);
      if (btn.dataset.screen === 'screen-map') {
        initMapIfNeeded();
        setTimeout(() => { if (liveMap) liveMap.invalidateSize(); }, 60);
      }
    });
  });
}

function showScreen(id, navBtn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (navBtn) navBtn.classList.add('active');
  else {
    // if navigating to a top-level screen programmatically, sync nav highlight
    const match = document.querySelector(`.nav-btn[data-screen="${id}"]`);
    if (match) match.classList.add('active');
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function setupMoreMenu() {
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sub-screen').forEach(s => s.style.display = 'none');
      document.getElementById(item.dataset.open).style.display = 'block';
      document.getElementById(item.dataset.open).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ---------------- Countdown ---------------- */

function tickCountdown() {
  const chip = document.getElementById('countdownChip');
  if (!TRIP.project || !TRIP.project.start_date) return;
  const start = new Date(TRIP.project.start_date + 'T09:00:00');
  const end = new Date(TRIP.project.end_date + 'T18:00:00');
  const now = new Date();

  if (now < start) {
    const diffDays = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    chip.textContent = `T-${diffDays}d`;
  } else if (now >= start && now <= end) {
    const dayNum = Math.min(TRIP.project.duration_days, Math.floor((now - start) / (1000*60*60*24)) + 1);
    chip.textContent = `DAY ${dayNum} OF ${TRIP.project.duration_days}`;
  } else {
    chip.textContent = 'TRIP COMPLETE';
  }
}

/* ---------------- Home: Travel Path ---------------- */

function renderHome() {
  const road = document.getElementById('travelPathRoad');
  road.innerHTML = '';
  const currentIndex = getCurrentPathIndex();

  TRIP.travelPath.forEach((stop, i) => {
    const div = document.createElement('div');
    let cls = 'road-stop';
    if (i < currentIndex) cls += ' is-done';
    if (i === currentIndex) cls += ' is-current';
    if (stop.icon === 'fuel' || stop.icon === 'coffee') cls += ' is-stop';
    div.className = cls;
    div.innerHTML = `<div class="road-stop__label">${iconEmoji(stop.icon)} ${stop.label}</div>`;
    road.appendChild(div);
  });

  // Today's plan
  const todayDiv = document.getElementById('todayPlan');
  const today = getTodayItineraryDay();
  if (today) {
    todayDiv.innerHTML = `
      <div style="font-family:var(--font-display); font-size:1.05rem; margin-bottom:4px;">
        Day ${today.day}: ${today.title}
      </div>
      <div class="muted">${today.route.join(' → ')}</div>
      ${today.attractions.map(a => attractionChipHTML(a)).join('')}
    `;
  } else {
    todayDiv.innerHTML = `<div class="muted">Trip hasn't started yet — check the Itinerary tab to see the full plan.</div>`;
  }

  document.getElementById('statDistance').textContent = '~950';
  document.getElementById('statNights').textContent = TRIP.itinerary.length - 1;

  // Tonight's accommodation
  const accomDiv = document.getElementById('homeAccom');
  const stay = getTonightAccommodation();
  accomDiv.innerHTML = stay ? accomCardHTML(stay) : `<div class="muted">No accommodation booked for tonight.</div>`;
}

function iconEmoji(icon) {
  const map = { home: '🏠', fuel: '⛽', bed: '🏨', mountain: '🏔', castle: '🏰', house: '🏡', coffee: '☕' };
  return map[icon] || '📍';
}

function attractionChipHTML(a) {
  if (a.lat && a.lng) {
    const url = `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`;
    return `<a class="attraction-chip" href="${url}" target="_blank" rel="noopener">${a.name}</a>`;
  }
  return `<span class="attraction-chip">${a.name}</span>`;
}

function getCurrentPathIndex() {
  if (!TRIP.project.start_date) return 0;
  const start = new Date(TRIP.project.start_date + 'T00:00:00');
  const now = new Date();
  if (now < start) return 0;
  const dayNum = Math.floor((now - start) / (1000*60*60*24));
  // rough mapping of trip day -> travel path index
  const map = [0, 3, 4, 4, 6, 6, 8];
  return map[Math.min(dayNum, map.length - 1)] || 0;
}

function getTodayItineraryDay() {
  if (!TRIP.project.start_date) return null;
  const start = new Date(TRIP.project.start_date + 'T00:00:00');
  const now = new Date();
  const dayNum = Math.floor((now - start) / (1000*60*60*24)) + 1;
  return TRIP.itinerary.find(d => d.day === dayNum) || null;
}

function getTonightAccommodation() {
  const dayNum = (getTodayItineraryDay() || {}).day || 1;
  return TRIP.accommodation.find(a => a.day.includes(dayNum)) || TRIP.accommodation[0] || null;
}

function accomCardHTML(stay) {
  const mapsUrl = stay.lat && stay.lng
    ? `https://www.google.com/maps/search/?api=1&query=${stay.lat},${stay.lng}`
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(stay.address);
  const statusBadge = stay.confirmed
    ? `<span style="color:#7EAE8C;">✓ Confirmed</span>`
    : `<span style="color:#D8A73B;">◐ Needs confirming</span>`;
  return `
    <div class="accom-card__row"><span>Status</span><b>${statusBadge}</b></div>
    <div class="accom-card__row"><span>City</span><b>${stay.city}</b></div>
    <div class="accom-card__row"><span>Address</span><b>${stay.address}</b></div>
    ${stay.host ? `<div class="accom-card__row"><span>Host</span><b>${stay.host}${stay.contact ? ' · ' + stay.contact : ''}</b></div>` : ''}
    ${stay.checkIn ? `<div class="accom-card__row"><span>Check-in / out</span><b>${stay.checkIn} / ${stay.checkOut}</b></div>` : ''}
    <div class="action-row">
      <a class="btn btn--small" href="${mapsUrl}" target="_blank" rel="noopener">Navigate</a>
    </div>
  `;
}

/* ---------------- Itinerary ---------------- */

function renderItinerary() {
  const list = document.getElementById('dayList');
  list.innerHTML = '';
  TRIP.itinerary.forEach(day => {
    const el = document.createElement('div');
    el.className = 'day';
    el.innerHTML = `
      <div class="day__head">
        <div class="day__head-left">
          <div class="day__badge">DAY ${day.day}</div>
          <div>
            <div class="day__title">${day.title}</div>
            <div class="day__route">${day.route.join(' → ')} ${day.departureTime ? `· departs ${day.departureTime}` : ''}</div>
          </div>
        </div>
        <svg class="day__chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      </div>
      <div class="day__body">
        ${day.overnight ? `<div class="muted">🏨 Overnight: ${day.overnight}</div>` : ''}
        <div>
          ${day.attractions.length
            ? day.attractions.map(a => attractionChipHTML(a)).join('')
            : '<div class="muted" style="margin-top:8px;">No fixed attractions — travel day.</div>'}
        </div>

        <div class="packing-group__title" style="margin-top:16px;">Legs & timing</div>
        <div id="legs-day-${day.day}" class="muted">Tap to load distance, drive time and ETA…</div>

        <div class="packing-group__title" style="margin-top:16px;">Meals</div>
        <div class="meal-row"><label>Breakfast</label><input data-day="${day.day}" data-meal="breakfast" value="${escapeAttr(mealValue(day,'breakfast'))}" placeholder="e.g. Airbnb / cafe"></div>
        <div class="meal-row"><label>Lunch</label><input data-day="${day.day}" data-meal="lunch" value="${escapeAttr(mealValue(day,'lunch'))}" placeholder="e.g. on the road"></div>
        <div class="meal-row"><label>Dinner</label><input data-day="${day.day}" data-meal="dinner" value="${escapeAttr(mealValue(day,'dinner'))}" placeholder="e.g. Airbnb / restaurant"></div>

        <div class="action-row">
          <a class="btn btn--small btn--ghost" target="_blank" rel="noopener"
             href="https://www.google.com/maps/dir/${day.route.map(encodeURIComponent).join('/')}">
             View Route
          </a>
        </div>
      </div>
    `;

    let legsLoaded = false;
    el.querySelector('.day__head').addEventListener('click', async () => {
      el.classList.toggle('open');
      if (el.classList.contains('open') && !legsLoaded) {
        legsLoaded = true;
        const container = el.querySelector(`#legs-day-${day.day}`);
        container.textContent = 'Calculating…';
        const legs = await computeDayLegs(day);
        container.innerHTML = renderLegsHTML(day, legs);
      }
    });

    el.querySelectorAll('.meal-row input').forEach(input => {
      input.addEventListener('change', () => saveMeal(day, input.dataset.meal, input.value));
    });

    list.appendChild(el);
  });
}

/* ---------------- Families ---------------- */

function loadFamilies() {
  const saved = localStorage.getItem(STORAGE_KEYS.families);
  return saved ? JSON.parse(saved) : TRIP.families;
}

function saveFamilies(families) {
  localStorage.setItem(STORAGE_KEYS.families, JSON.stringify(families));
}

function renderFamilies() {
  const families = loadFamilies();
  const list = document.getElementById('familyList');
  list.innerHTML = '';

  families.forEach((fam) => {
    const card = document.createElement('div');
    card.className = 'card family-card';
    card.innerHTML = `
      <div class="card__title">
        <svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3"/><path d="M2 21v-2a5 5 0 015-5h4a5 5 0 015 5v2"/></svg>
        ${fam.name}
      </div>
      <div class="family-field-grid">
        <div class="field"><label>Name</label><input data-f="name" value="${escapeAttr(fam.name)}"></div>
        <div class="field"><label>Vehicle</label><input data-f="vehicle" value="${escapeAttr(fam.vehicle)}"></div>
        <div class="field"><label>Adults</label><input type="number" min="0" data-f="adults" value="${fam.adults}"></div>
        <div class="field"><label>Children</label><input type="number" min="0" data-f="children" value="${fam.children}"></div>
        <div class="field"><label>Driver</label><input data-f="driver" value="${escapeAttr(fam.driver)}"></div>
        <div class="field"><label>Backup driver</label><input data-f="backupDriver" value="${escapeAttr(fam.backupDriver)}"></div>
        <div class="field"><label>Starting postcode</label><input data-f="startingPostcode" value="${escapeAttr(fam.startingPostcode)}"></div>
        <div class="field"><label>Phone</label><input data-f="phone" value="${escapeAttr(fam.phone)}"></div>
        <div class="field"><label>Leave home (Day 1)</label><input type="time" data-f="recommendedLeaveHome" value="${escapeAttr(fam.recommendedLeaveHome || '')}"></div>
      </div>
      <div class="muted" style="font-size:0.7rem; margin-top:2px;">Rough estimate for the 08:00 Moto Knutsford meet — update it yourself once you've checked your own live Google Maps time via Navigate below.</div>
      <div class="action-row">
        <a class="btn btn--small" target="_blank" rel="noopener" data-navigate-postcode
           href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Moto Knutsford Services')}&origin=${encodeURIComponent(fam.startingPostcode || '')}">
          Navigate to Moto Knutsford
        </a>
      </div>
    `;
    card.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.f;
        let val = input.value;
        if (input.type === 'number') val = parseInt(val, 10) || 0;
        fam[key] = val;
        saveFamilies(families);
        renderFamilies(); // re-render to refresh Navigate link + card title + expense dropdown
        renderExpenses();
        populateExpenseFamilyOptions();
        renderReadiness();
      });
    });
    list.appendChild(card);
  });
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

/* ---------------- Expenses ---------------- */

function loadExpenses() {
  const saved = localStorage.getItem(STORAGE_KEYS.expenses);
  return saved ? JSON.parse(saved) : [];
}

function saveExpenses(expenses) {
  localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(expenses));
}

function setupExpenseForm() {
  populateExpenseCategoryOptions();
  populateExpenseFamilyOptions();

  document.getElementById('expenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const note = document.getElementById('expNote').value.trim();
    const category = document.getElementById('expCategory').value;
    const amount = parseFloat(document.getElementById('expAmount').value);
    const family = document.getElementById('expFamily').value;
    if (!note || !amount) return;

    const expenses = loadExpenses();
    expenses.push({ id: Date.now(), note, category, amount, family, date: new Date().toISOString() });
    saveExpenses(expenses);
    e.target.reset();
    populateExpenseFamilyOptions();
    renderExpenses();
  });
}

function populateExpenseCategoryOptions() {
  const sel = document.getElementById('expCategory');
  sel.innerHTML = TRIP.expenseCategories.map(c => `<option value="${c}">${capitalize(c)}</option>`).join('');
}

function populateExpenseFamilyOptions() {
  const sel = document.getElementById('expFamily');
  const families = loadFamilies();
  sel.innerHTML = families.map(f => `<option value="${escapeAttr(f.name)}">${f.name}</option>`).join('');
}

function renderExpenses() {
  const expenses = loadExpenses();
  const families = loadFamilies();
  const listEl = document.getElementById('expenseList');

  if (!expenses.length) {
    listEl.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      <div>No expenses logged yet.</div>
    </div>`;
  } else {
    listEl.innerHTML = expenses.slice().reverse().map(exp => `
      <div class="expense-item">
        <div class="expense-item__meta">
          <span class="expense-item__cat">${capitalize(exp.category)} · ${exp.family}</span>
          <span class="expense-item__note">${escapeAttr(exp.note)}</span>
        </div>
        <span class="expense-item__amount">£${exp.amount.toFixed(2)}</span>
      </div>
    `).join('');
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perFamily = families.length ? total / families.length : 0;

  const paidByFamily = {};
  families.forEach(f => paidByFamily[f.name] = 0);
  expenses.forEach(e => { paidByFamily[e.family] = (paidByFamily[e.family] || 0) + e.amount; });

  const summaryLines = families.map(f => {
    const paid = paidByFamily[f.name] || 0;
    const balance = paid - perFamily;
    const sign = balance >= 0 ? '+' : '';
    return `${f.name.padEnd(12, ' ')} paid £${paid.toFixed(2).padStart(7,' ')}  →  ${sign}£${balance.toFixed(2)}`;
  }).join('\n');

  document.getElementById('expenseSummary').innerHTML =
    `Total spent: £${total.toFixed(2)}\nEqual split (${families.length} families): £${perFamily.toFixed(2)} each\n\n${summaryLines}\n\n(+ owed back · − still owes group)`
      .replace(/\n/g, '<br>');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------------- Accommodation (More tab) ---------------- */

function renderAccommodation() {
  const list = document.getElementById('accomList');
  list.innerHTML = TRIP.accommodation.map(stay => `
    <div class="card">
      <div class="accom-card__badge">DAY ${stay.day.join(' & ')}</div>
      ${accomCardHTML(stay)}
    </div>
  `).join('');
}

/* ---------------- Packing ---------------- */

function loadPackingState() {
  const saved = localStorage.getItem(STORAGE_KEYS.packing);
  return saved ? JSON.parse(saved) : {};
}

function savePackingState(state) {
  localStorage.setItem(STORAGE_KEYS.packing, JSON.stringify(state));
}

function renderPacking() {
  const state = loadPackingState();
  const container = document.getElementById('packList');
  container.innerHTML = '';

  let total = 0, checked = 0;

  Object.entries(TRIP.packingCategories).forEach(([cat, items]) => {
    const group = document.createElement('div');
    group.className = 'packing-group';
    const title = document.createElement('div');
    title.className = 'packing-group__title';
    title.textContent = cat.replace(/_/g, ' ');
    group.appendChild(title);

    items.forEach(item => {
      total++;
      const itemKey = `${cat}::${item}`;
      const isChecked = !!state[itemKey];
      if (isChecked) checked++;

      const row = document.createElement('div');
      row.className = 'pack-item' + (isChecked ? ' checked' : '');
      row.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''}><span class="pack-item__label">${item}</span>`;
      row.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') row.querySelector('input').click();
      });
      row.querySelector('input').addEventListener('change', (e) => {
        state[itemKey] = e.target.checked;
        savePackingState(state);
        row.classList.toggle('checked', e.target.checked);
        updatePackingProgress();
        renderReadiness();
      });
      group.appendChild(row);
    });

    container.appendChild(group);
  });

  updatePackingProgress();
}

function updatePackingProgress() {
  const state = loadPackingState();
  let total = 0, checked = 0;
  Object.entries(TRIP.packingCategories).forEach(([cat, items]) => {
    items.forEach(item => {
      total++;
      if (state[`${cat}::${item}`]) checked++;
    });
  });
  document.getElementById('packProgressLabel').textContent = `${checked} of ${total} packed`;
  document.getElementById('packProgressFill').style.width = total ? `${(checked/total)*100}%` : '0%';
}

/* ---------------- Notes ---------------- */

function loadNotes() {
  const area = document.getElementById('notesArea');
  area.value = localStorage.getItem(STORAGE_KEYS.notes) || '';
  area.addEventListener('input', () => localStorage.setItem(STORAGE_KEYS.notes, area.value));
}

/* ---------------- Settings ---------------- */

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEYS.settings);
  const settings = saved ? JSON.parse(saved) : {};
  document.getElementById('settingsBreakdown').value = settings.breakdown || '';
  if (settings.breakdown) document.getElementById('breakdownNumber').textContent = settings.breakdown;

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const value = document.getElementById('settingsBreakdown').value.trim();
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ breakdown: value }));
    document.getElementById('breakdownNumber').textContent = value || 'Add your number in Settings';
  });
}

/* ---------------- Trip Readiness ---------------- */

function renderReadiness() {
  const families = loadFamilies();
  const familiesDone = families.filter(f => f.driver && f.startingPostcode).length;

  const accomConfirmed = TRIP.accommodation.filter(a => a.confirmed).length;
  const accomTotal = TRIP.accommodation.length;

  const packState = loadPackingState();
  let packTotal = 0, packChecked = 0;
  Object.entries(TRIP.packingCategories).forEach(([cat, items]) => {
    items.forEach(item => {
      packTotal++;
      if (packState[`${cat}::${item}`]) packChecked++;
    });
  });

  const parts = [
    { label: 'Families', done: familiesDone, total: families.length },
    { label: 'Accommodation confirmed', done: accomConfirmed, total: accomTotal },
    { label: 'Packing', done: packChecked, total: packTotal }
  ];

  const overallDone = parts.reduce((s, p) => s + p.done, 0);
  const overallTotal = parts.reduce((s, p) => s + p.total, 0);
  const pct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0;

  document.getElementById('readinessLabel').textContent = `${pct}% ready for departure`;
  document.getElementById('readinessFill').style.width = `${pct}%`;

  document.getElementById('readinessDetails').innerHTML = parts.map(p => `
    <div class="accom-card__row">
      <span>${p.label}</span>
      <b>${p.done} / ${p.total}</b>
    </div>
  `).join('');
}

/* ---------------- Live weather (Open-Meteo, no API key) ---------------- */

const WMO = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫'], 48: ['Fog', '🌫'],
  51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'], 55: ['Heavy drizzle', '🌧'],
  61: ['Light rain', '🌦'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
  71: ['Light snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦'], 81: ['Rain showers', '🌧'], 82: ['Violent showers', '⛈'],
  95: ['Thunderstorm', '⛈'], 96: ['Thunderstorm', '⛈'], 99: ['Thunderstorm', '⛈']
};

function describeWeatherCode(code) {
  return WMO[code] || ['Unknown', '🌡'];
}

function getWeatherLocation() {
  // Prefer tonight's accommodation coords; fall back to Edinburgh as a sane Scotland default.
  const stay = getTonightAccommodation();
  if (stay && stay.lat && stay.lng) return { lat: stay.lat, lng: stay.lng, label: stay.city };
  return { lat: 55.9533, lng: -3.1883, label: 'Edinburgh' };
}

function getNextStopLocation() {
  const today = getTodayItineraryDay();
  if (!today) {
    const loc = TRIP.locations['Moto Knutsford'];
    return loc ? { lat: loc.lat, lng: loc.lng, label: 'Moto Knutsford (first stop)' } : null;
  }
  const nextDay = TRIP.itinerary.find(d => d.day === today.day + 1);
  if (!nextDay) return null; // last day — nothing after tonight
  const stay = TRIP.accommodation.find(a => a.day.includes(nextDay.day));
  if (stay) return { lat: stay.lat, lng: stay.lng, label: stay.city };
  const lastPoint = nextDay.route[nextDay.route.length - 1];
  const loc = TRIP.locations[lastPoint];
  return loc ? { lat: loc.lat, lng: loc.lng, label: lastPoint } : null;
}

async function fetchOpenMeteo(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  return await res.json();
}

function cacheWeather(kind, data, loc) {
  const store = JSON.parse(localStorage.getItem(STORAGE_KEYS.weatherCache) || '{}');
  store[kind] = { data, loc, ts: Date.now() };
  localStorage.setItem(STORAGE_KEYS.weatherCache, JSON.stringify(store));
}

function getCachedWeather(kind) {
  const store = JSON.parse(localStorage.getItem(STORAGE_KEYS.weatherCache) || '{}');
  return store[kind] || null;
}

function renderCurrentWeather(data, loc) {
  const [desc, emoji] = describeWeatherCode(data.current.weather_code);
  document.getElementById('weatherLocationLabel').textContent = loc.label;
  document.getElementById('weatherTemp').textContent = `${Math.round(data.current.temperature_2m)}°C`;
  document.getElementById('weatherEmoji').textContent = emoji;
  const hi = Math.round(data.daily.temperature_2m_max[0]);
  const lo = Math.round(data.daily.temperature_2m_min[0]);
  document.getElementById('weatherNote').textContent = `${desc} · ${hi}°/${lo}°`;

  const strip = document.getElementById('weatherStrip');
  strip.innerHTML = data.daily.time.slice(0, 5).map((date, i) => {
    const [, e] = describeWeatherCode(data.daily.weather_code[i]);
    const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
    return `
      <div style="flex:1; text-align:center; background:var(--glen-2); border-radius:8px; padding:8px 4px;">
        <div style="font-size:0.62rem; color:var(--mist); text-transform:uppercase;">${dayLabel}</div>
        <div style="font-size:1.1rem; margin:2px 0;">${e}</div>
        <div style="font-family:var(--font-mono); font-size:0.68rem; color:var(--stone);">${Math.round(data.daily.temperature_2m_max[i])}°/${Math.round(data.daily.temperature_2m_min[i])}°</div>
      </div>
    `;
  }).join('');
}

function renderNextWeather(data, loc) {
  document.getElementById('weatherNextLocationLabel').textContent = loc.label;
  const [desc, emoji] = describeWeatherCode(data.current ? data.current.weather_code : data.daily.weather_code[0]);
  const temp = data.current
    ? Math.round(data.current.temperature_2m)
    : Math.round((data.daily.temperature_2m_max[0] + data.daily.temperature_2m_min[0]) / 2);
  document.getElementById('weatherNextTemp').textContent = `${temp}°C`;
  document.getElementById('weatherNextEmoji').textContent = emoji;
  document.getElementById('weatherNextNote').textContent = desc;
}

async function loadWeather() {
  const loc = getWeatherLocation();
  const nextLoc = getNextStopLocation();

  try {
    const data = await fetchOpenMeteo(loc.lat, loc.lng);
    renderCurrentWeather(data, loc);
    cacheWeather('current', data, loc);
    document.getElementById('weatherStaleness').textContent = '';
  } catch (err) {
    const cached = getCachedWeather('current');
    if (cached) {
      renderCurrentWeather(cached.data, cached.loc);
      document.getElementById('weatherStaleness').textContent = `Offline — showing last update from ${timeAgo(cached.ts)}`;
    } else {
      document.getElementById('weatherNote').textContent = 'Could not load forecast — check your connection.';
    }
  }

  if (nextLoc) {
    try {
      const data2 = await fetchOpenMeteo(nextLoc.lat, nextLoc.lng);
      renderNextWeather(data2, nextLoc);
      cacheWeather('next', data2, nextLoc);
    } catch (err) {
      const cached2 = getCachedWeather('next');
      if (cached2) renderNextWeather(cached2.data, cached2.loc);
      else document.getElementById('weatherNextNote').textContent = 'Unavailable offline';
    }
  } else {
    document.getElementById('weatherNextLocationLabel').textContent = 'Trip complete';
    document.getElementById('weatherNextNote').textContent = '—';
    document.getElementById('weatherNextTemp').textContent = '--°C';
  }
}

async function loadForecastScreen() {
  const card = document.getElementById('forecastCard');
  try {
    const loc = getWeatherLocation();
    const data = await fetchOpenMeteo(loc.lat, loc.lng);
    cacheWeather('sixDay', data, loc);

    card.innerHTML = TRIP.itinerary.map((day, i) => {
      if (!data.daily.time[i]) {
        return `<div class="accom-card__row"><span>Day ${day.day} — ${day.title}</span><b class="muted">Beyond forecast range</b></div>`;
      }
      const [desc, emoji] = describeWeatherCode(data.daily.weather_code[i]);
      const hi = Math.round(data.daily.temperature_2m_max[i]);
      const lo = Math.round(data.daily.temperature_2m_min[i]);
      return `<div class="accom-card__row"><span>${emoji} Day ${day.day} — ${day.title}</span><b>${hi}° / ${lo}° · ${desc}</b></div>`;
    }).join('');
    card.innerHTML += `<p class="muted" style="margin-top:10px;">Forecast centred on ${loc.label}. Highland weather changes fast between Glencoe, Skye and Stirling — treat this as a guide, not a guarantee.</p>`;
  } catch (err) {
    const cached = getCachedWeather('sixDay');
    if (cached) {
      card.innerHTML = `<p class="muted">Offline — showing forecast last updated ${timeAgo(cached.ts)}.</p>`;
    } else {
      card.innerHTML = `<p class="muted">Could not load forecast — check your connection.</p>`;
    }
  }
}

function timeAgo(ts) {
  if (!ts) return 'unknown';
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

/* ---------------- Legs: distance / duration / ETA (OSRM, no API key) ---------------- */

function parseTimeToMinutes(hhmm) {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  return h * 60 + m;
}

function minutesToHHMM(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function fetchRoute(lat1, lng1, lat2, lng2) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok') return null;
    const route = data.routes[0];
    return { distanceMiles: route.distance / 1609.34, durationMin: route.duration / 60 };
  } catch (err) {
    return null;
  }
}

async function computeDayLegs(day) {
  const locs = TRIP.locations || {};
  const legs = [];
  for (let i = 0; i < day.route.length - 1; i++) {
    const a = day.route[i], b = day.route[i + 1];
    legs.push(locs[a] && locs[b] ? { from: a, to: b, fromLoc: locs[a], toLoc: locs[b] } : { from: a, to: b, unknown: true });
  }
  await Promise.all(legs.map(async (leg) => {
    if (leg.unknown) return;
    const r = await fetchRoute(leg.fromLoc.lat, leg.fromLoc.lng, leg.toLoc.lat, leg.toLoc.lng);
    leg.distanceMiles = r ? r.distanceMiles : null;
    leg.durationMin = r ? r.durationMin : null;
  }));
  return legs;
}

function renderLegsHTML(day, legs) {
  const startMin = parseTimeToMinutes(day.departureTime);
  let cumMin = 0, sinceBreak = 0;
  const rows = [];

  legs.forEach(leg => {
    if (leg.unknown) {
      rows.push(`
        <div class="leg-row"><div class="leg-endpoint">${leg.from}</div><span class="leg-arrow">→</span><div class="leg-endpoint">${leg.to}</div></div>
        <div class="muted" style="margin:4px 0 12px;">Distance varies by each family's starting point</div>
      `);
      return;
    }
    if (leg.durationMin == null) {
      rows.push(`
        <div class="leg-row"><div class="leg-endpoint">${leg.from}</div><span class="leg-arrow">→</span><div class="leg-endpoint">${leg.to}</div></div>
        <div class="muted" style="margin:4px 0 12px;">Couldn't calculate this leg — check your connection</div>
      `);
      return;
    }
    cumMin += leg.durationMin;
    sinceBreak += leg.durationMin;
    const eta = minutesToHHMM(startMin + cumMin);
    rows.push(`
      <div class="leg-row"><div class="leg-endpoint">${leg.from}</div><span class="leg-arrow">→</span><div class="leg-endpoint">${leg.to}</div></div>
      <div class="leg-stats"><span>Distance <b>${leg.distanceMiles.toFixed(0)} mi</b></span><span>Drive <b>${Math.round(leg.durationMin)} min</b></span><span>ETA <b>${eta}</b></span></div>
    `);
    if (sinceBreak >= TRIP.breakSettings.breakEveryMinutesMin) {
      cumMin += TRIP.breakSettings.breakDurationMinutes;
      rows.push(`<div class="break-note">Suggested ${TRIP.breakSettings.breakDurationMinutes}-min break here (~${Math.round(sinceBreak)} min of driving since the last stop)</div>`);
      sinceBreak = 0;
    }
  });

  return rows.join('') || '<div class="muted">No drivable legs today.</div>';
}

async function renderCurrentLegCard() {
  const day = getTodayItineraryDay() || TRIP.itinerary[0];
  const container = document.getElementById('currentLegCard');
  if (!day) { container.innerHTML = '<div class="muted">No itinerary loaded.</div>'; return; }
  container.innerHTML = '<div class="muted">Calculating distances…</div>';
  const legs = await computeDayLegs(day);
  container.innerHTML = `<div class="muted" style="margin-bottom:8px;">Day ${day.day} · departs ${day.departureTime || 'TBC'}</div>` + renderLegsHTML(day, legs);
}

/* ---------------- Meal plans (per-day, local edits) ---------------- */

function loadMealsState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.meals) || '{}');
}

function mealValue(day, type) {
  const state = loadMealsState();
  const key = `day${day.day}_${type}`;
  return state[key] !== undefined ? state[key] : ((day.meals && day.meals[type]) || '');
}

function saveMeal(day, type, value) {
  const state = loadMealsState();
  state[`day${day.day}_${type}`] = value;
  localStorage.setItem(STORAGE_KEYS.meals, JSON.stringify(state));
}

/* ---------------- Identity (who's using this device) ---------------- */

function getIdentity() {
  return localStorage.getItem(STORAGE_KEYS.identity);
}

function setIdentity(name) {
  localStorage.setItem(STORAGE_KEYS.identity, name);
}

function setupIdentity() {
  if (!getIdentity()) showIdentityOverlay();
  renderSettingsIdentity();
  const changeBtn = document.getElementById('changeIdentityBtn');
  if (changeBtn) changeBtn.addEventListener('click', showIdentityOverlay);
}

function showIdentityOverlay() {
  const overlay = document.getElementById('identityOverlay');
  const opts = document.getElementById('identityOptions');
  opts.innerHTML = '';
  loadFamilies().forEach(f => {
    const btn = document.createElement('button');
    btn.textContent = f.name;
    btn.addEventListener('click', () => {
      setIdentity(f.name);
      overlay.style.display = 'none';
      renderSettingsIdentity();
      updateLocationStatusUI();
    });
    opts.appendChild(btn);
  });
  overlay.style.display = 'flex';
}

function renderSettingsIdentity() {
  const el = document.getElementById('settingsIdentity');
  if (el) el.textContent = getIdentity() || 'Not set';
}

/* ---------------- Firebase (live location backend) ---------------- */

let fbDb = null;

function initFirebase() {
  if (typeof firebase === 'undefined' || typeof LIVE_LOCATION_ENABLED === 'undefined' || !LIVE_LOCATION_ENABLED) return;
  try {
    firebase.initializeApp(firebaseConfig);
    fbDb = firebase.database();
  } catch (err) {
    console.error('Firebase init failed', err);
  }
}

/* ---------------- Location sharing ---------------- */

let watchId = null;

function isSharing() {
  return localStorage.getItem(STORAGE_KEYS.sharing) === '1';
}

function setSharing(v) {
  localStorage.setItem(STORAGE_KEYS.sharing, v ? '1' : '0');
}

function updateLocationStatusUI() {
  const statusText = document.getElementById('locationStatusText');
  const btn = document.getElementById('toggleSharingBtn');
  if (!statusText || !btn) return;

  if (typeof LIVE_LOCATION_ENABLED === 'undefined' || !LIVE_LOCATION_ENABLED) {
    statusText.textContent = "Live location isn't connected yet — waiting on the Firebase database URL.";
    btn.style.display = 'none';
    return;
  }
  const id = getIdentity();
  if (!id) {
    statusText.textContent = 'Pick your family first (see Settings) to enable sharing.';
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-flex';
  if (isSharing()) {
    statusText.textContent = `Sharing as ${id}. The other families can see your last known position.`;
    btn.textContent = 'Turn off sharing';
  } else {
    statusText.textContent = 'Sharing is off. Turn it on to let the group see where you are.';
    btn.textContent = 'Turn on sharing';
  }
}

function setupSharingToggle() {
  const btn = document.getElementById('toggleSharingBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (isSharing()) stopSharing();
    else startSharing();
  });
}

function startSharing() {
  if (typeof LIVE_LOCATION_ENABLED === 'undefined' || !LIVE_LOCATION_ENABLED || !fbDb) {
    alert("Live location isn't connected yet — the Firebase database URL still needs adding.");
    return;
  }
  const id = getIdentity();
  if (!id) { showIdentityOverlay(); return; }
  if (!navigator.geolocation) { alert("This browser can't share location."); return; }

  let lastSent = 0;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastSent < 20000) return; // throttle to ~20s between writes
      lastSent = now;
      fbDb.ref('locations/' + id).set({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        ts: now
      });
    },
    (err) => console.error('Geolocation error', err),
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );

  setSharing(true);
  updateLocationStatusUI();
}

function stopSharing() {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  setSharing(false);
  updateLocationStatusUI();
}

/* ---------------- Live map (Leaflet + OpenStreetMap, no API key) ---------------- */

let liveMap = null;
const mapMarkers = {};

function initMapIfNeeded() {
  if (liveMap || typeof L === 'undefined') return;
  liveMap = L.map('liveMap').setView([56.6, -4.5], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(liveMap);

  if (typeof LIVE_LOCATION_ENABLED !== 'undefined' && LIVE_LOCATION_ENABLED && fbDb) {
    fbDb.ref('locations').on('value', (snapshot) => {
      const data = snapshot.val() || {};
      updateMapMarkers(data);
      renderFamilyLocationList(data);
    });
  } else {
    document.getElementById('familyLocationList').innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.5-7-11a7 7 0 0114 0c0 4.5-7 11-7 11z"/></svg>
      <div>Live location isn't connected yet.</div>
    </div>`;
  }
}

function updateMapMarkers(data) {
  Object.entries(data).forEach(([name, loc]) => {
    if (!loc || typeof loc.lat !== 'number') return;
    if (mapMarkers[name]) {
      mapMarkers[name].setLatLng([loc.lat, loc.lng]);
    } else {
      mapMarkers[name] = L.marker([loc.lat, loc.lng]).addTo(liveMap);
    }
    mapMarkers[name].bindPopup(`${name} · ${timeAgo(loc.ts)}`);
  });
}

function renderFamilyLocationList(data) {
  const container = document.getElementById('familyLocationList');
  const families = loadFamilies();
  container.innerHTML = families.map(f => {
    const loc = data[f.name];
    return `<div class="family-location-row">
      <span class="family-location-row__name">${f.name}</span>
      <span class="family-location-row__meta">${loc ? timeAgo(loc.ts) : 'No data yet'}</span>
    </div>`;
  }).join('');
}
