# MineShield — Frontend Client

## Overview
React single-page application built with Vite for the MineShield Mining Compliance and Audit Platform.

## Core Features
1. **Live Dashboard & Real-Time Analytics**:
   - Total e-TPs issued, active en-route passes, consumed passes, and flagged infractions.
   - Live quarry extraction quota progress bar against legal limits.
   - Real-time checkpost scan event log.
2. **Quarry Escrow & e-TP Issuance (Leaseholder)**:
   - Live royalty escrow balance and advance fund deposit.
   - Instant royalty fee computation with atomic balance deduction.
   - Official e-TP Pass Certificate rendering with HMAC-SHA256 QR token.
3. **Checkpost Guard Verification Scanner**:
   - Location-aware checkpoint scanning (Riverbank Alpha vs Crusher Highway Beta).
   - Route-time feasibility calculation (`transit_elapsed < min_required` triggers `VELOCITY_VIOLATION`).
   - Single-scan pass consumption (`CONSUMED` status prevents reuse).
   - Offline mode toggle with local storage queue and batch reconciliation.
4. **Fraud Alert System**:
   - Flashing red modal alert upon duplicate pass reuse attempt with automatic ₹10,000 fine and vehicle blacklisting.
5. **Compliance, Watchlist & Audit Ledger (Officer / Auditor)**:
   - High-infraction vehicle watchlist management.
   - Violation penalties ledger with adjudication controls.
   - System audit trail.
6. **Live Viva 5-Step Demo Mode**:
   - Direct interactive execution of the 5-step evaluator demonstration flow.

## Running the Frontend
```bash
# Install dependencies
npm.cmd install

# Build production bundle
npm.cmd run build

# Start development server
npm.cmd run dev
```
The frontend dev server runs at `http://localhost:5173`.
