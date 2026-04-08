// ─── ANA Award Booker — Content Script ───────────────────────────────────────
// Runs on every ANA award booking page and executes the right step
// © 里程研究所 AwardLab — https://github.com/awardlab

// ─── Execution guard — hard block duplicate ACTIVE instances on the same page ─
// content.js can be loaded by manifest content_scripts AND by popup.js
// executeScript. If both fire while status is "running", we get double form
// submissions which invalidate ANA's CSRF tokens ("E_G02F25_0005" error).
//
// Key insight: the guard must NOT block when the first injection exited early
// (status wasn't "running" yet). It only blocks when a step is actively executing.
(function() {

function playErrorSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.setValueAtTime(150, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function playDoneSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var notes = [523, 659, 784, 1047]; // C E G C — success chord
    notes.forEach(function(freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.4);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
  } catch(e) {}
}

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function waitForElement(selector, timeout) {
  timeout = timeout || 15000;
  return new Promise(function(resolve, reject) {
    var interval = 100;
    var elapsed = 0;
    var timer = setInterval(function() {
      var el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        clearInterval(timer);
        resolve(el);
      }
      elapsed += interval;
      if (elapsed >= timeout) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for: ' + selector));
      }
    }, interval);
  });
}

// Like waitForElement but doesn't require visibility — for modal buttons
function waitForElementExists(selector, timeout) {
  timeout = timeout || 15000;
  return new Promise(function(resolve, reject) {
    var interval = 100;
    var elapsed = 0;
    var timer = setInterval(function() {
      var el = document.querySelector(selector);
      if (el) {
        clearInterval(timer);
        resolve(el);
      }
      elapsed += interval;
      if (elapsed >= timeout) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for: ' + selector));
      }
    }, interval);
  });
}

// Safe click — disables the element after clicking to prevent double submission
function safeClick(el, label) {
  if (!el) return false;
  if (el.dataset.anaClicked) {
    console.warn('[ANA Booker] ⚠️ BLOCKED double-click on:', label || el.name || el.id);
    return false;
  }
  el.dataset.anaClicked = 'true';
  el.click();
  console.log('[ANA Booker] ✅ Clicked:', label || el.name || el.id);
  return true;
}

function clickVisibleConfirm() {
  var btns = document.querySelectorAll('input[value="Confirm"]');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].offsetParent !== null) {
      return safeClick(btns[i], 'visible Confirm');
    }
  }
  console.warn('[ANA Booker] ⚠️ No visible Confirm button found');
  return false;
}

function setStep(step) {
  return new Promise(function(resolve) {
    chrome.storage.local.set({ anaStep: step }, resolve);
  });
}

function setStatus(status) {
  return new Promise(function(resolve) {
    chrome.storage.local.set({ anaStatus: status }, resolve);
  });
}

function setError(msg) {
  playErrorSound();
  console.error('[ANA Booker] ❌', msg);
  return new Promise(function(resolve) {
    chrome.storage.local.set({ anaStatus: 'error', anaError: msg }, resolve);
  });
}

// ─── Detect which page we're on ───────────────────────────────────────────────
function detectPage() {
  var url = window.location.href;

  // DOM-first detection (more reliable than URL for AJAX pages)
  if (document.querySelector('input#purchaseButton')) return 'confirm';
  if (document.querySelector('input[type="checkbox"][id^="passengers:"]')) return 'passenger';
  if (document.querySelector('i.radio.outbound')) return 'flight_select';
  if (document.querySelector('input#departureAirportCode\\:field_pctext')) return 'search';

  // URL fallback
  if (url.includes('award_search_roundtrip_input')) return 'search';
  if (url.includes('award_search_roundtrip_result')) return 'flight_select';
  if (url.includes('award_search_roundtrip_passenger') || url.includes('pax')) return 'passenger';
  if (url.includes('award_search_roundtrip_confirm') || url.includes('confirm')) return 'confirm';
  if (url.includes('award_search_roundtrip_complete') || url.includes('complete')) return 'complete';

  return 'unknown';
}

// ─── Main runner ──────────────────────────────────────────────────────────────
console.log('[ANA Booker] Content script loaded on:', window.location.href);

chrome.storage.local.get(['anaStatus', 'anaStep', 'anaConfig'], function(result) {
  console.log('[ANA Booker] Storage read — status:', result.anaStatus, '| step:', result.anaStep, '| config:', result.anaConfig ? 'found' : 'MISSING');

  if (result.anaStatus !== 'running') {
    console.log('[ANA Booker] Not running, skipping. Status was:', result.anaStatus);
    return;
  }
  if (!result.anaConfig) {
    console.log('[ANA Booker] No config found, skipping');
    return;
  }

  // ── Guard: only one active execution per page ──
  // We check HERE (after confirming status=running) so that idle injections
  // don't block later injections triggered by popup.js after user clicks Start.
  if (window.__anaBookerActive) {
    console.log('[ANA Booker] BLOCKED — another instance is already executing on this page');
    return;
  }
  window.__anaBookerActive = true;

  // Reset guard on page unload so next page navigation can run
  window.addEventListener('beforeunload', function() {
    window.__anaBookerActive = false;
  });

  var config = result.anaConfig;
  var step = result.anaStep || 0;
  var url = window.location.href;

  // Smart page detection — override step if URL/DOM tells us where we actually are
  function detectStepFromPage() {
    // DOM-based detection is most reliable
    if (document.querySelector('input#purchaseButton')) return 6;
    if (document.querySelector('input[type="checkbox"][id^="passengers:"]')) return 4;

    // URL-based detection
    if (url.includes('award_search_roundtrip_input')) return 1;
    if (url.includes('award_search_roundtrip_result')) {
      // Could be step 2 (selecting) or step 3 (confirming) — both on result page
      // If a confirm popup is visible, we're on step 3
      var confirmBtn = document.querySelector('input[value="Confirm"]');
      if (confirmBtn && confirmBtn.offsetParent !== null) return 3;
      return 2;
    }
    if (url.includes('award_mandatory_passenger_information')) return 4;
    if (url.includes('award_payment_information')) return 6;
    if (url.includes('award_reservation_purchase_complete')) return 9;
    return null;
  }

  var detectedStep = detectStepFromPage();
  if (detectedStep !== null && detectedStep !== step) {
    console.warn('[ANA Booker] ⚠️ Step mismatch — stored step:', step, '| detected from page:', detectedStep, '— using detected');
    step = detectedStep;
    chrome.storage.local.set({ anaStep: step });
  }

  console.log('[ANA Booker] Step:', step, '| URL:', url);

  delay(800).then(function() {
    if (step === 0) runLandingPage(config);
    else if (step === 1) runSearchPage(config);
    else if (step === 2) runFlightSelectPage(config);
    else if (step === 3) runFlightConfirmPopup(config);
    else if (step === 4) runPassengerPage(config);
    else if (step === 5) runPrebookDialog(config);
    else if (step === 6) runConfirmPage(config);
    else if (step === 8 || step === 9) runCompletePage();
    else if (url.includes('purchase_complete') || url.includes('reservation_complete')) runCompletePage();
    else console.log('[ANA Booker] ℹ️ Step', step, '— waiting for next page load');
  });
});

// ─── Step 0: ANA Landing Page → Click Flight Awards tab → Click Award Reservation ─
function runLandingPage(config) {
  console.log('[ANA Booker] Step 0: Clicking Flight Awards tab...');

  waitForElement('li.be-wws-secondary-tab__item span')
  .then(function() {
    // Find the Flight Awards tab by its text content
    var tabs = document.querySelectorAll('li.be-wws-secondary-tab__item');
    var flightAwardsTab = null;
    tabs.forEach(function(tab) {
      if (tab.textContent.trim() === 'Flight Awards') {
        flightAwardsTab = tab;
      }
    });
    if (flightAwardsTab) {
      flightAwardsTab.click();
      console.log('[ANA Booker] ✅ Clicked Flight Awards tab');
    } else {
      console.warn('[ANA Booker] ⚠️ Flight Awards tab not found, continuing anyway');
    }
    return delay(800);
  })
  .then(function() {
    return waitForElement('a[data-scclick-element="reserve-award_txt_flightAwardReservations"]');
  })
  .then(function(link) {
    console.log('[ANA Booker] ✅ Found Award Reservation link');
    return setStep(1).then(function() {
      // Force same-tab navigation to avoid session issues
      window.location.href = link.href;
    });
  })
  .catch(function(err) { setError(err.message); });
}

// ─── Step 1: Search Form ──────────────────────────────────────────────────────
function fillField(hiddenSelector, textSelector, hiddenVal, textVal) {
  var hidden = document.querySelector(hiddenSelector);
  var text = document.querySelector(textSelector);
  if (hidden && text) {
    hidden.value = hiddenVal;
    text.value = textVal;
    text.setAttribute('data-currentvalue', textVal);
    text.dispatchEvent(new Event('focus', { bubbles: true }));
    text.dispatchEvent(new Event('change', { bubbles: true }));
    text.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }
  return false;
}

function verifySearchForm(config) {
  var originHidden = document.querySelector('input#departureAirportCode\\:field');
  var destHidden = document.querySelector('input#arrivalAirportCode\\:field');
  var dateHidden = document.querySelector('input#awardDepartureDate\\:field');
  return originHidden && originHidden.value === config.origin &&
         destHidden && destHidden.value === config.destination &&
         dateHidden && dateHidden.value === config.hiddenDate;
}

function runSearchPage(config) {
  console.log('[ANA Booker] Step 1: Search form — attempt starting...');

  // Click one way first
  var oneWay = document.querySelector('li#onewayButton a');
  if (oneWay) { oneWay.click(); console.log('[ANA Booker] ✅ One way clicked'); }

  // Fill all fields with a delay between each, then verify and retry until correct
  function fillAndVerify(attempt) {
    attempt = attempt || 1;
    console.log('[ANA Booker] Filling fields, attempt', attempt);

    return delay(600)
    .then(function() {
      fillField('input#departureAirportCode\\:field', 'input#departureAirportCode\\:field_pctext', config.origin, config.originDisplay);
    })
    .then(function() { return delay(600); })
    .then(function() {
      fillField('input#arrivalAirportCode\\:field', 'input#arrivalAirportCode\\:field_pctext', config.destination, config.destinationDisplay);
    })
    .then(function() { return delay(600); })
    .then(function() {
      fillField('input#awardDepartureDate\\:field', 'input#awardDepartureDate\\:field_pctext', config.hiddenDate, config.displayDate);
    })
    .then(function() { return delay(400); })
    .then(function() {
      var select = document.querySelector('select#boardingClass');
      if (select) { select.value = 'CFF2'; select.dispatchEvent(new Event('change', { bubbles: true })); }
      if (config.travelArranger) {
        var cb = document.querySelector('input#travelArranger');
        if (cb && !cb.checked) cb.click();
      }
    })
    .then(function() { return delay(800); })
    .then(function() {
      // Re-set hidden fields right before verifying (ANA JS may have cleared them)
      var oH = document.querySelector('input#departureAirportCode\\:field');
      var dH = document.querySelector('input#arrivalAirportCode\\:field');
      var dtH = document.querySelector('input#awardDepartureDate\\:field');
      var dtT = document.querySelector('input#awardDepartureDate\\:field_pctext');
      if (oH) oH.value = config.origin;
      if (dH) dH.value = config.destination;
      if (dtH) { dtH.value = config.hiddenDate; if (dtT) dtT.value = config.displayDate; }

      var verified = verifySearchForm(config);
      console.log('[ANA Booker] Verify attempt', attempt, '— origin:', oH && oH.value, '| dest:', dH && dH.value, '| date:', dtH && dtH.value, '| ok:', verified);

      if (!verified && attempt < 5) {
        console.warn('[ANA Booker] ⚠️ Verification failed, retrying...');
        return fillAndVerify(attempt + 1);
      }

      // Click Search
      var btn = document.querySelector('input[type="submit"][value="Search"]');
      if (btn) {
        return setStep(2).then(function() {
          safeClick(btn, 'Search button');
        });
      } else {
        setError('Step 1: Search button not found');
      }
    });
  }

  fillAndVerify(1).catch(function(err) { setError('Step 1 failed: ' + err.message); });
}

// ─── Step 2: Flight Selection ─────────────────────────────────────────────────
function runFlightSelectPage(config) {
  console.log('[ANA Booker] Step 2: Selecting flight...');

  // If we're still on the search form, it means Search failed — retry
  if (window.location.href.includes('award_search_roundtrip_input')) {
    console.warn('[ANA Booker] ⚠️ Still on search form — Search must have failed, retrying...');
    setStep(1).then(function() {
      delay(1000).then(function() { runSearchPage(config); });
    });
    return;
  }

  waitForElement('i.radio.outbound', 20000)
  .then(function() { return delay(500); })
  .then(function() {
    var flights = document.querySelectorAll('i.radio.outbound');
    var index = config.selectedFlightIndex || 0;

    if (flights.length === 0) {
      setError('No flights found on page');
      return;
    }

    var targetFlight = flights[index] || flights[0];
    if (index >= flights.length) {
      console.warn('[ANA Booker] ⚠️ Flight index ' + index + ' not available, using first flight');
    }

    targetFlight.closest('td.selectItineraryCheck').click();
    console.log('[ANA Booker] ✅ Selected flight', index + 1, 'of', flights.length);
  })
  .then(function() { return delay(500); })
  .then(function() { return waitForElement('input#nextButton'); })
  .then(function(btn) {
    return setStep(3).then(function() {
      safeClick(btn, 'Next (flight select)');
      // Chain directly into step 3 — same page, no re-injection needed
      return delay(500).then(function() { runFlightConfirmPopup(config); });
    });
  })
  .catch(function(err) { setError('Step 2 failed: ' + err.message); });
}

// ─── Step 3: Confirm popup + Next button (same page) ─────────────────────────
function runFlightConfirmPopup(config) {
  console.log('[ANA Booker] Step 3: Handling confirm popup + Next...');

  waitForElementExists('input[value="Confirm"]')
  .then(function() { return delay(500); })
  .then(function() {
    // Try clicking by direct query instead of visibility check
    var btns = document.querySelectorAll('input[value="Confirm"]');
    var btn = null;
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].name && btns[i].name.includes('cmnDynamicMessageWindow')) {
        btn = btns[i];
        break;
      }
    }
    // Fallback: just grab first Confirm button
    if (!btn) btn = btns[0];

    if (btn) {
      safeClick(btn, 'Confirm popup (name=' + btn.name + ')');
    } else {
      setError('Step 3: No Confirm button found');
      return;
    }
    return delay(800);
  })
  .then(function() {
    // Wait for Next button to become available (popup may take time to close)
    return waitForElement('input#nextButton', 10000);
  })
  .then(function(nextBtn) {
    return setStep(4).then(function() {
      safeClick(nextBtn, 'Next (to passenger page)');
    });
  })
  .catch(function(err) { setError('Step 3 failed: ' + err.message); });
}

// ─── Step 4: Passenger + Phone ────────────────────────────────────────────────
function runPassengerPage(config) {
  console.log('[ANA Booker] Step 4: Passenger page...');

  waitForElementExists('input[type="checkbox"][id^="passengers:"]')
  .then(function() { return delay(1000); }) // extra wait for page to be interactive
  .then(function() {
    var checkboxes = document.querySelectorAll('input[type="checkbox"][id^="passengers:"]');
    console.log('[ANA Booker] Found', checkboxes.length, 'passenger checkboxes');
    var first = checkboxes[0];
    if (first) {
      if (!first.checked) {
        first.click();
        first.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[ANA Booker] ✅ Passenger checked, id=' + first.id + ' checked=' + first.checked);
      } else {
        console.log('[ANA Booker] ℹ️ Passenger already checked');
      }
    } else {
      console.warn('[ANA Booker] ⚠️ No passenger checkboxes found');
    }
  })
  .then(function() { return delay(500); })
  .then(function() {
    console.log('[ANA Booker] Looking for country select...');
    return waitForElementExists('select[id*="passengerSmsCountry"]');
  })
  .then(function(select) {
    select.value = 'US';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[ANA Booker] ✅ USA/Canada selected');
  })
  .then(function() { return delay(500); })
  .then(function() {
    console.log('[ANA Booker] Looking for phone field...');
    return waitForElementExists('input[id*="flightStatusNotificationContactPointSmsDescription"]');
  })
  .then(function(input) {
    input.value = config.phone;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    console.log('[ANA Booker] ✅ Phone entered:', config.phone);
  })
  .then(function() { return delay(500); })
  .then(function() {
    console.log('[ANA Booker] Looking for Next button...');
    return waitForElementExists('input#next');
  })
  .then(function(btn) {
    return setStep(5).then(function() {
      safeClick(btn, 'Next (passenger page)');
      // Chain directly — prebook dialog appears on the same page
      return delay(500).then(function() { runPrebookDialog(config); });
    });
  })
  .catch(function(err) { setError('Step 4 failed: ' + err.message); });
}

// ─── Step 5: Prebook dialog ───────────────────────────────────────────────────
function runPrebookDialog(config) {
  console.log('[ANA Booker] Step 5: Waiting for prebook dialog...');

  waitForElementExists('input[name*="prebookConfirmDialog"][value="OK"]', 8000)
  .then(function(okBtn) {
    safeClick(okBtn, 'Prebook OK');
    return setStep(6);
    // Page will navigate — step 6 runs on the new page
  })
  .catch(function() {
    // Dialog didn't appear — we may have already passed it, skip to step 6
    console.warn('[ANA Booker] ⚠️ Prebook dialog not found, skipping to step 6');
    setStep(6).then(function() {
      delay(500).then(function() { runConfirmPage(config); });
    });
  });
}

// ─── Step 6: Confirm + Waitlist ───────────────────────────────────────────────
function runConfirmPage(config) {
  console.log('[ANA Booker] Step 6: Confirm page...');

  delay(500)
  .then(function() {
    // Handle any visible Confirm dialogs first
    clickVisibleConfirm();
    return delay(500);
  })
  .then(function() { return waitForElement('input[id*="detailRuleMessageCheckbox"]'); })
  .then(function(checkbox) {
    if (!checkbox.checked) {
      checkbox.click();
      console.log('[ANA Booker] ✅ Agreement checked');
    } else {
      console.log('[ANA Booker] ℹ️ Already checked');
    }
  })
  .then(function() { return delay(500); })
  .then(function() { return waitForElement('input#purchaseButton'); })
  .then(function(btn) {
    return setStep(7).then(function() {
      safeClick(btn, 'Waitlisting Request (purchase)');
    });
  })
  .then(function() { return waitForElementExists('input[name*="purchaseDialog"][value="OK"]'); })
  .then(function(okBtn) {
    return setStep(8).then(function() {
      safeClick(okBtn, 'Purchase dialog OK');
      playDoneSound();
    });
  })
  .catch(function(err) { setError(err.message); });
}

// ─── Page: Complete ───────────────────────────────────────────────────────────
function runCompletePage() {
  console.log('[ANA Booker] ✅ DONE! Waitlist submitted.');
  playDoneSound();
  chrome.storage.local.set({ anaStatus: 'done', anaStep: 9, anaConfig: null });
}

})(); // end execution guard IIFE
