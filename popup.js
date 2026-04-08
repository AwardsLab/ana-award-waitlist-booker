// ─── ANA Award Booker — Popup Script ─────────────────────────────────────────
// © 里程研究所 AwardLab
// ─────────────────────────────────────────────────────────────────────────────

function selectFlight(index) {
  index = parseInt(index) || 0;
  document.querySelectorAll('.flight-option').forEach(function(el) {
    el.classList.toggle('selected', parseInt(el.dataset.index) === index);
  });
  saveSettings();
}

function getSelectedFlightIndex() {
  var selected = document.querySelector('.flight-option.selected');
  return selected ? parseInt(selected.dataset.index) : 0;
}

function toggleCheckbox() {
  var cb = document.getElementById('travelArranger');
  cb.checked = !cb.checked;
  saveSettings();
}

function saveSettings() {
  var settings = {
    origin: document.getElementById('origin').value,
    destination: document.getElementById('destination').value,
    departureDate: document.getElementById('departureDate').value,
    phone: document.getElementById('phone').value,
    travelArranger: document.getElementById('travelArranger').checked,
    selectedFlightIndex: getSelectedFlightIndex()
  };
  chrome.storage.local.set({ anaSettings: settings });

  // Show saved badge briefly
  var badge = document.getElementById('savedBadge');
  badge.classList.add('show');
  setTimeout(function() { badge.classList.remove('show'); }, 1500);
}

function loadSettings() {
  chrome.storage.local.get(['anaSettings', 'anaStep', 'anaStatus'], function(result) {
    var s = result.anaSettings || {};
    document.getElementById('origin').value = s.origin || '';
    document.getElementById('destination').value = s.destination || '';
    document.getElementById('departureDate').value = s.departureDate || '';
    document.getElementById('phone').value = s.phone || '';
    document.getElementById('travelArranger').checked = s.travelArranger || false;
    selectFlight(s.selectedFlightIndex || 0);

    // Restore status
    var step = result.anaStep || 0;
    var status = result.anaStatus || 'idle';
    updateStatus(status, step);
  });
}

function updateStatus(status, step) {
  var dot = document.getElementById('statusDot');
  var text = document.getElementById('statusText');

  var stepLabels = [
    'Filling search form...',
    'Selecting flight...',
    'Confirming flight...',
    'Next page...',
    'Selecting passenger...',
    'Entering phone...',
    'Confirming booking...',
    'Submitting waitlist...'
  ];

  dot.className = 'status-dot ' + status;
  text.className = 'status-text ' + status;

  if (status === 'idle') {
    text.textContent = 'Navigate to ANA search page, then Start';
  } else if (status === 'running') {
    text.textContent = stepLabels[step] || 'Running...';
    document.getElementById('btnStart').disabled = true;
  } else if (status === 'done') {
    text.textContent = '✓ Waitlist submitted!';
    document.getElementById('btnStart').disabled = false;
  } else if (status === 'error') {
    text.textContent = '✕ Error — check the page';
    document.getElementById('btnStart').disabled = false;
  }

  // Update step pips
  for (var i = 0; i < 8; i++) {
    var pip = document.getElementById('pip' + i);
    if (!pip) continue;
    pip.className = 'step-pip';
    if (i < step) pip.classList.add('done');
    else if (i === step && status === 'running') pip.classList.add('active');
    else if (i === step && status === 'error') pip.classList.add('error');
  }
}

function startBooking() {
  saveSettings();

  chrome.storage.local.get('anaSettings', function(result) {
    var s = result.anaSettings || {};

    // Validate
    if (!s.origin || !s.destination || !s.departureDate || !s.phone) {
      alert('Please fill in all fields before starting.');
      return;
    }

    // Format date for the script
    var d = new Date(s.departureDate);
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var year = String(d.getFullYear());
    var yearShort = String(d.getFullYear()).slice(2);
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var dayName = days[d.getDay()];
    var hiddenDate = year + month + day;
    var displayDate = month + '/' + day + '/' + yearShort + ' (' + dayName + ')';

    var origin = s.origin.toUpperCase();
    var destination = s.destination.toUpperCase();

    // Display name map for common airports
    var airportNames = {
      'TYO': 'Tokyo (All)', 'NRT': 'Tokyo (Narita)', 'HND': 'Tokyo (Haneda)',
      'OSA': 'Osaka (All)', 'KIX': 'Osaka (Kansai)', 'ITM': 'Osaka (Itami)',
      'SFO': 'San Francisco', 'LAX': 'Los Angeles', 'JFK': 'New York (JFK)',
      'EWR': 'New York (Newark)', 'ORD': 'Chicago', 'SEA': 'Seattle',
      'LHR': 'London (Heathrow)', 'CDG': 'Paris', 'SYD': 'Sydney',
      'SIN': 'Singapore', 'BKK': 'Bangkok', 'HKG': 'Hong Kong'
    };

    var config = {
      origin: origin,
      originDisplay: airportNames[origin] || origin,
      destination: destination,
      destinationDisplay: airportNames[destination] || destination,
      hiddenDate: hiddenDate,
      displayDate: displayDate,
      phone: s.phone,
      travelArranger: s.travelArranger || false,
      selectedFlightIndex: s.selectedFlightIndex || 0
    };

    chrome.storage.local.set({
      anaStep: 0,
      anaStatus: 'running',
      anaConfig: config
    }, function() {
      updateStatus('running', 0);

      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        var tab = tabs[0];
        if (!tab) {
          alert('No active tab found.');
          return;
        }

        if (tab.url && tab.url.includes('www.ana.co.jp')) {
          // Already on ANA — inject content script to kick off step 0.
          // The guard in content.js prevents double execution if manifest
          // injection already ran; it just updates the run ID.
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
        } else {
          // Navigate to ANA homepage — user should be logged in already.
          // background.js will handle injection after the page loads.
          chrome.tabs.update(tab.id, { url: 'https://www.ana.co.jp/en/us/' });
        }
      });
    });
  });
}

function resetBooking() {
  chrome.storage.local.set({ anaStep: 0, anaStatus: 'idle', anaConfig: null, anaError: null });
  updateStatus('idle', 0);
  document.getElementById('btnStart').disabled = false;
}

// ─── Tab check — show gate screen if not on ANA ──────────────────────────────
function checkCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs[0];
    var onAna = tab && tab.url && (
      tab.url.includes('www.ana.co.jp') ||
      tab.url.includes('aswbe-i.ana.co.jp')
    );
    document.getElementById('gateScreen').classList.toggle('hidden', !!onAna);
    document.getElementById('mainForm').classList.toggle('hidden', !onAna);
    document.getElementById('stepProgress').classList.toggle('hidden', !onAna);
    document.getElementById('actionsBar').classList.toggle('hidden', !onAna);
  });
}

// ─── Listen for status updates from content script ───────────────────────────
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.anaStep || changes.anaStatus) {
    chrome.storage.local.get(['anaStep', 'anaStatus'], function(result) {
      updateStatus(result.anaStatus || 'idle', result.anaStep || 0);
    });
  }
});

// ─── Auto-save on input change ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  checkCurrentTab();

  // Input auto-save
  ['origin', 'destination', 'departureDate', 'phone'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', saveSettings);
    if (el) el.addEventListener('input', saveSettings);
  });

  // Flight selector buttons
  document.querySelectorAll('.flight-option').forEach(function(el) {
    el.addEventListener('click', function() { selectFlight(el.dataset.index); });
  });

  // Travel arranger checkbox row click
  document.getElementById('travelArrangerRow').addEventListener('click', function(e) {
    if (e.target.type !== 'checkbox') {
      var cb = document.getElementById('travelArranger');
      cb.checked = !cb.checked;
    }
    saveSettings();
  });
  document.getElementById('travelArranger').addEventListener('change', saveSettings);

  // Action buttons
  document.getElementById('btnStart').addEventListener('click', startBooking);
  document.getElementById('btnReset').addEventListener('click', resetBooking);
  document.getElementById('btnGoto').addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      var tab = tabs[0];
      if (tab) {
        chrome.tabs.update(tab.id, { url: 'https://www.ana.co.jp/en/us/' });
      }
    });
    window.close();
  });
});
