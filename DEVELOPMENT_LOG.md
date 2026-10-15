# VoltWise ⚡ — Development Evidence & Hackathon Activity Log

This document serves as formal evidence of original engineering, design iterations, testing, and continuous implementation during the hackathon development lifecycle.

---

## Part 1: Official Screenshot Checklist (Capture for College / Judges)

Use the Windows Snipping Tool (**Win + Shift + S**) or **PrtScn** to capture each of the following moments directly on your screen and save them to a `screenshots/` folder:

- [ ] **Screenshot 1: Initial Application Shell & Dashboard**
  - *What to capture:* The full browser window showing the VoltWise dashboard, navigation sidebar, simulated data badge, and initial KPI cards.
- [ ] **Screenshot 2: Fleet Manager & Default 8-Vehicle Fleet**
  - *What to capture:* The table displaying the 8 simulated commercial EVs, battery capacities, live SOC progress bars, target markers, and departure deadlines.
- [ ] **Screenshot 3: Vehicle Input Validation Modal**
  - *What to capture:* The "Add New Vehicle" modal open with form inputs, demonstrating validation for positive battery capacities, valid SOC limits (0–100%), and departure times.
- [ ] **Screenshot 4: Power Demand Profile Chart**
  - *What to capture:* The Line Chart showing the baseline uncoordinated demand spike (grey dotted line) vs. the smoothed VoltWise optimized schedule (blue fill) under the red site power limit line.
- [ ] **Screenshot 5: Time-of-Day Tariff Structure**
  - *What to capture:* The bar chart showing the evening peak tariffs (red bars at ₹9.50/kWh) and the overnight super-off-peak valley (green bars at ₹3.60/kWh).
- [ ] **Screenshot 6: Baseline vs. Optimized Cost Comparison**
  - *What to capture:* The comparison card in the dashboard or reports showing the calculated electricity cost savings (₹ and %) and peak demand reduction.
- [ ] **Screenshot 7: What-If Lab — Tight Site Power Limit (Scenario B)**
  - *What to capture:* Scenario B selected, showing the 30 kW site cap applied, with the engine dynamically throttling charging allocations.
- [ ] **Screenshot 8: What-If Lab — Hardware Charger Outage (Scenario C)**
  - *What to capture:* Charger 2 toggled to "Outage / Hardware Fault" and the resulting operational capacity alert displayed in the alert list.
- [ ] **Screenshot 9: Infeasible Departure Deadline Detection**
  - *What to capture:* An edited vehicle with a tight turnaround showing the red shortfall badge and the explicit infeasibility reason string.
- [ ] **Screenshot 10: Automated Test Suite Results (100% Pass)**
  - *What to capture:* Either the terminal running `node tests.js` showing `Test Execution Summary: 21 Passed, 0 Failed`, or the browser test runner (`tests.html`).
- [ ] **Screenshot 11: CSV Schedule Export**
  - *What to capture:* The downloaded `VoltWise_Schedule_*.csv` file opened in Microsoft Excel or VS Code showing the 15-minute slot allocations.
- [ ] **Screenshot 12: Executive Printable Report**
  - *What to capture:* The browser print preview window (`Ctrl + P`) displaying the clean, formatted VoltWise executive audit report.

---

## Part 2: Development Activity Timeline & Engineering Log

| Phase & Timestamp | Feature Implemented | Files Modified | Test Performed | Result | Bug Fixed / Engineering Decision |
|---|---|---|---|---|---|
| **Phase 1: Mathematical Foundations** | Energy formulas, conversion efficiency, 48-slot TOD tariff representation | `engine.js` | Test 1, 2, 3, 13 (Battery deficit, zero need, 90% efficiency) | All Passed (0 errors) | Decided to cap final partial slots so vehicles never pull excess kWh from the grid once target SOC is met. |
| **Phase 2: Core Scheduling Heuristic** | Discrete-time 15-min greedy heuristic with Urgency Slack lookahead | `engine.js` | Test 7, 8, 9, 10, 12 (Solo car, competing cars, site limits, outages) | All Passed | Replaced simple FIFO queue with dynamic Slack scoring: vehicles at risk of missing deadlines override tariff avoidance. |
| **Phase 3: Constraint Validator & Test Suite** | 8-law physical constraint auditor & 21-case test runner | `engine.js`, `tests.js`, `tests.html` | Tests 1–21 executed via `node tests.js` | **21 / 21 Passed** | Fixed potential floating-point precision issue by adding a 0.001 kW tolerance in power constraint validation. |
| **Phase 4: User Interface & Dashboard** | App shell, navigation, KPI cards, Chart.js graphs with fallback | `index.html`, `style.css`, `app.js` | Browser responsiveness check & Chart.js CDN offline fallback | Verified clean layout | Implemented graceful fallback for canvas elements in case CDN is blocked or laptop is offline. |
| **Phase 5: What-If Scenario Lab** | 7 preset operational scenarios, custom sliders, hardware outage toggles | `index.html`, `app.js` | Scenario A through G switching & delta comparison | Verified instant recalculation | Added `previousMetrics` tracking so fleet operators can see exact cost and demand deltas between scenarios. |
| **Phase 6: Reporting & Persistence** | LocalStorage state backup, RFC 4180 CSV exports, print stylesheet | `app.js`, `style.css` | Test 18 (LocalStorage roundtrip), Test 19 (CSV generation) | Passed | Used native browser Blob API for instantaneous offline CSV downloads without external libraries. |

---

## Part 3: Statement of Original Contribution

This application was created by the team for the hackathon without copying external third-party repository codebases:
1. **Algorithmic Innovation:** Formulated the **Urgency Slack Heuristic** ($S(t) = \text{SlotsRemaining} - \text{SlotsNeeded}$) balancing time-of-day tariff price minimization against vehicle departure risk.
2. **Deterministic Constraint Architecture:** Implemented a separate, non-negotiable verification module (`validateSchedule`) that validates 100% adherence to physical grid and charger hardware limitations.
3. **Honest Baseline Accounting:** Built an authentic uncoordinated baseline (ASAP charging) to calculate real savings rather than relying on fabricated percentages or mock data.
4. **Accessible Energy-Tech Design System:** Handcrafted a responsive, accessible web UI adhering to modern design principles, including support for screen readers, keyboard navigation, and browser printing.
