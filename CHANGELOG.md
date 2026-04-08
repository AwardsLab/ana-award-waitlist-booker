# Changelog — ANA Award Booker · 里程研究所 AwardLab

## v1.0 — 2026-03-30

- Automated ANA award waitlist booking flow (one-way, Business Class)
- Popup UI: origin, destination, date, flight preference (1st/2nd/3rd), phone, travel arranger toggle
- 9-step automation: search → flight select → confirm popup → passenger info → prebook dialog → confirm page → submit waitlist
- Gate screen: redirects to ANA award search if popup is opened on a non-ANA page
- Step progress bar and status indicator in popup
- Audio cues on completion (success chord) and error only
- Duplicate-execution guard to prevent CSRF token double-consumption (`E_G02F25_0005`)
- Settings auto-saved to `chrome.storage.local`; sensitive run-time data cleared after booking completes
- Watermark: © 里程研究所 AwardLab
