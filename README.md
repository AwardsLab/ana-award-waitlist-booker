# ANA Award Booker — 里程研究所 AwardLab

A Chrome extension that automates ANA (All Nippon Airways) flight award waitlist bookings.

## What It Does

Fills out and submits the ANA award waitlist booking flow automatically — from the search form through final confirmation — so you don't have to click through every step manually.

**Booking flow automated (9 steps):**
1. Navigate to Award Reservation page
2. Fill search form (origin, destination, date, cabin class)
3. Select preferred flight from results
4. Confirm flight selection popup
5. Select passenger and enter phone number
6. Handle pre-book confirmation dialog
7. Check terms agreement and submit waitlist request
8. Confirm purchase dialog

## Prerequisites

- Google Chrome browser
- You must be **logged in to your ANA account** before starting
- ANA award search must be for **one-way, Business Class (C)** — the extension sets cabin class to `CFF2` automatically

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the folder containing these files

The ANA Award Booker icon will appear in your Chrome toolbar.

## Usage

1. Click the extension icon to open the popup
2. Fill in the fields:

| Field | Description | Example |
|---|---|---|
| **From** | Origin airport code | `TYO`, `NRT`, `HND` |
| **To** | Destination airport code | `SFO`, `LAX`, `JFK` |
| **Date** | Departure date | `2026-03-30` |
| **Flight Preference** | Which flight to select if multiple are shown | 1st / 2nd / 3rd |
| **Phone Number** | US phone number for SMS flight status (no country code) | `6501234567` |
| **Travel Arranger** | Check this if booking on behalf of another person | — |

3. Make sure you are on `www.ana.co.jp` and logged in
4. Click **▶ Start Booking**

The extension will navigate the pages automatically. Watch the progress bar at the bottom of the popup.

### Status Indicators

| Color | Meaning |
|---|---|
| Gray | Idle / ready |
| Green (pulsing) | Running |
| Blue | Done — waitlist submitted |
| Red | Error — check the page |

If an error occurs, open Chrome DevTools on the ANA page and check the console for `[ANA Booker]` messages.

5. Click **✕ Reset** to clear the status and start over. Phone number is cleared on reset for privacy.

## Supported Airport Codes

The extension includes display name mappings for common airports:

| Code | Name |
|---|---|
| TYO | Tokyo (All) |
| NRT | Tokyo (Narita) |
| HND | Tokyo (Haneda) |
| OSA | Osaka (All) |
| KIX | Osaka (Kansai) |
| SFO | San Francisco |
| LAX | Los Angeles |
| JFK | New York (JFK) |
| EWR | New York (Newark) |
| ORD | Chicago |
| SEA | Seattle |
| LHR | London (Heathrow) |
| CDG | Paris |
| SYD | Sydney |
| SIN | Singapore |
| BKK | Bangkok |
| HKG | Hong Kong |

Any other valid IATA code can be entered — it just won't have a display name substitution.

## Notes

- Settings (origin, destination, date, flight preference, travel arranger) are saved automatically between sessions. Phone number is cleared on reset.
- The extension only activates on `aswbe-i.ana.co.jp` and `www.ana.co.jp`.
- A duplicate-execution guard prevents double form submissions that would trigger ANA's CSRF error `E_G02F25_0005`.
- Audio cues play on each step (progress beep) and on completion (success chord) or error.
