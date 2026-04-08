// ─── ANA Award Booker — Background Service Worker ────────────────────────────
// © 里程研究所 AwardLab
// ─────────────────────────────────────────────────────────────────────────────
// Background service worker
//
// content.js is auto-injected by manifest.json content_scripts on every page
// load matching the host patterns. We do NOT re-inject from here because
// double injection causes ANA's CSRF tokens to be consumed twice, producing
// the "E_G02F25_0005" error (session invalidation).
//
// The only case where we need programmatic injection is when popup.js starts
// the automation on an already-loaded page — popup.js handles that directly.

chrome.runtime.onInstalled.addListener(function() {
  console.log('[ANA Booker] Extension installed');
});
