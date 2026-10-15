/**
 * VoltWise - Intelligent EV Fleet Charging Optimisation Platform
 * Core Energy Engine & Deterministic Scheduling Algorithm
 * 
 * Works in both Browser and Node.js environments.
 * Follows physical conservation laws and operational fleet constraints.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VoltWiseEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- Constants & Defaults ---
  const DEFAULT_CONFIG = {
    planningStartHour: 18,       // 18:00 (6:00 PM depot return)
    horizonHours: 12,            // 12-hour overnight window (18:00 to 06:00)
    slotMinutes: 15,             // 15-minute time slots (fine-grained control)
    totalSlots: 48,              // 12 * (60 / 15) = 48 slots
    sitePowerLimit: 60.0,        // kW total depot grid connection limit
    defaultChargerPower: 22.0,   // kW rated power per standard AC fast charger
    chargingEfficiency: 0.90,    // 90% AC-to-battery efficiency
    gridEmissionFactor: 0.72,    // kg CO2e / kWh (Simulated baseline grid factor)
    chargers: [
      { id: 'CH-1', name: 'Charger 1 (Bay A)', ratedPower: 22.0, available: true },
      { id: 'CH-2', name: 'Charger 2 (Bay B)', ratedPower: 22.0, available: true },
      { id: 'CH-3', name: 'Charger 3 (Bay C)', ratedPower: 22.0, available: true },
      { id: 'CH-4', name: 'Charger 4 (Bay D)', ratedPower: 22.0, available: true }
    ],
    solarProfile: new Array(48).fill(0) // kW renewable solar generation profile
  };

  // 8 Diverse simulated commercial EVs
  const DEFAULT_FLEET = [
    {
      id: 'EV-01',
      name: 'Urban Van Alpha',
      batteryCapacity: 60,   // kWh
      currentSoc: 25,        // %
      targetSoc: 85,         // % (needs 36.0 kWh)
      maxPower: 22,          // kW
      departureSlot: 36,     // 03:00 AM (Slot 36)
      priority: 'High'
    },
    {
      id: 'EV-02',
      name: 'Express Courier Beta',
      batteryCapacity: 50,
      currentSoc: 15,
      targetSoc: 90,         // % (needs 37.5 kWh)
      maxPower: 11,          // kW
      departureSlot: 44,     // 05:00 AM
      priority: 'Normal'
    },
    {
      id: 'EV-03',
      name: 'Logistics Hauler Gamma',
      batteryCapacity: 80,
      currentSoc: 40,
      targetSoc: 80,         // % (needs 32.0 kWh)
      maxPower: 22,
      departureSlot: 40,     // 04:00 AM
      priority: 'High'
    },
    {
      id: 'EV-04',
      name: 'Maintenance Shuttle Delta',
      batteryCapacity: 45,
      currentSoc: 30,
      targetSoc: 75,         // % (needs 20.25 kWh)
      maxPower: 11,
      departureSlot: 46,     // 05:30 AM
      priority: 'Low'
    },
    {
      id: 'EV-05',
      name: 'Delivery Van Epsilon',
      batteryCapacity: 65,
      currentSoc: 20,
      targetSoc: 85,         // % (needs 42.25 kWh)
      maxPower: 22,
      departureSlot: 38,     // 03:30 AM
      priority: 'Normal'
    },
    {
      id: 'EV-06',
      name: 'Executive Shuttle Zeta',
      batteryCapacity: 75,
      currentSoc: 50,
      targetSoc: 90,         // % (needs 30.0 kWh)
      maxPower: 22,
      departureSlot: 42,     // 04:30 AM
      priority: 'Normal'
    },
    {
      id: 'EV-07',
      name: 'Security Patrol Eta',
      batteryCapacity: 40,
      currentSoc: 60,
      targetSoc: 95,         // % (needs 14.0 kWh)
      maxPower: 7.4,         // kW
      departureSlot: 28,     // 01:00 AM (Early departure)
      priority: 'High'
    },
    {
      id: 'EV-08',
      name: 'Cargo Mover Theta',
      batteryCapacity: 90,
      currentSoc: 35,
      targetSoc: 85,         // % (needs 45.0 kWh)
      maxPower: 22,
      departureSlot: 47,     // 05:45 AM
      priority: 'Low'
    }
  ];

  // Default Time-of-Day Electricity Tariff Profile (in INR ₹/kWh)
  // Reflects real grid structure: High evening peak, low overnight valley, morning rise.
  function getDefaultTariffs() {
    const tariffs = new Array(48);
    for (let t = 0; t < 48; t++) {
      if (t >= 0 && t < 12) {
        // 18:00 - 21:00 (Evening Grid Peak)
        tariffs[t] = 9.50;
      } else if (t >= 12 && t < 20) {
        // 21:00 - 23:00 (Shoulder transition)
        tariffs[t] = 6.20;
      } else if (t >= 20 && t < 40) {
        // 23:00 - 04:00 (Super Off-Peak overnight valley)
        tariffs[t] = 3.60;
      } else if (t >= 40 && t < 44) {
        // 04:00 - 05:00 (Pre-morning base)
        tariffs[t] = 4.80;
      } else {
        // 05:00 - 06:00 (Morning shoulder)
        tariffs[t] = 6.50;
      }
    }
    return tariffs;
  }

  // Generates custom 48-slot tariff array from user-defined tier rates
  function generateTierTariffs(peakRate = 9.50, shoulderRate = 6.20, offPeakRate = 3.60, morningRate = 6.50) {
    const tariffs = new Array(48);
    for (let t = 0; t < 48; t++) {
      if (t >= 0 && t < 12) {
        tariffs[t] = Number(peakRate);
      } else if (t >= 12 && t < 20) {
        tariffs[t] = Number(shoulderRate);
      } else if (t >= 20 && t < 40) {
        tariffs[t] = Number(offPeakRate);
      } else if (t >= 40 && t < 44) {
        tariffs[t] = Number((offPeakRate + morningRate) / 2);
      } else {
        tariffs[t] = Number(morningRate);
      }
    }
    return tariffs;
  }

  function validateCharger(charger) {
    const errors = [];
    if (!charger) return ['Charger configuration is null or undefined.'];
    if (!charger.id || typeof charger.id !== 'string' || charger.id.trim() === '') {
      errors.push('Charger ID is required.');
    }
    if (!charger.name || typeof charger.name !== 'string' || charger.name.trim() === '') {
      errors.push('Charger name/bay is required.');
    }
    if (typeof charger.ratedPower !== 'number' || charger.ratedPower <= 0) {
      errors.push('Charger rated power must be greater than 0 kW.');
    }
    return errors;
  }

  // --- Time Helpers ---
  function slotToTime(slotIndex, startHour = 18, slotMinutes = 15) {
    const totalMinutes = startHour * 60 + slotIndex * slotMinutes;
    const normalizedMinutes = totalMinutes % (24 * 60);
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function timeToSlot(timeStr, startHour = 18, slotMinutes = 15, totalSlots = 48) {
    if (!timeStr || !timeStr.includes(':')) return -1;
    const [hStr, mStr] = timeStr.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    if (isNaN(hours) || isNaN(minutes)) return -1;

    let targetTotalMin = hours * 60 + minutes;
    const startTotalMin = startHour * 60;

    let diff = targetTotalMin - startTotalMin;
    if (diff < 0) {
      diff += 24 * 60; // Rollover past midnight
    }
    const slot = Math.floor(diff / slotMinutes);
    if (slot >= 0 && slot < totalSlots) {
      return slot;
    }
    return -1;
  }

  // --- Energy & Physics Calculations ---
  function calculateRequiredBatteryEnergy(vehicle) {
    if (!vehicle || typeof vehicle.batteryCapacity !== 'number') return 0;
    const socDelta = Math.max(0, (vehicle.targetSoc || 0) - (vehicle.currentSoc || 0));
    return (vehicle.batteryCapacity * socDelta) / 100.0;
  }

  function calculateGridEnergy(batteryEnergy, efficiency = 0.90) {
    if (efficiency <= 0) return 0;
    return batteryEnergy / efficiency;
  }

  // --- Vehicle & Fleet Validation ---
  function validateVehicle(vehicle, totalSlots = 48) {
    const errors = [];
    if (!vehicle) return ['Vehicle data is null or undefined.'];
    if (!vehicle.id || typeof vehicle.id !== 'string' || vehicle.id.trim() === '') {
      errors.push('Vehicle ID is required.');
    }
    if (!vehicle.name || typeof vehicle.name !== 'string' || vehicle.name.trim() === '') {
      errors.push('Vehicle name is required.');
    }
    if (typeof vehicle.batteryCapacity !== 'number' || vehicle.batteryCapacity <= 0) {
      errors.push('Battery capacity must be greater than 0 kWh.');
    }
    if (typeof vehicle.currentSoc !== 'number' || vehicle.currentSoc < 0 || vehicle.currentSoc > 100) {
      errors.push('Current SOC must be between 0% and 100%.');
    }
    if (typeof vehicle.targetSoc !== 'number' || vehicle.targetSoc < 0 || vehicle.targetSoc > 100) {
      errors.push('Target SOC must be between 0% and 100%.');
    }
    if (typeof vehicle.currentSoc === 'number' && typeof vehicle.targetSoc === 'number' && vehicle.targetSoc < vehicle.currentSoc) {
      errors.push(`Target SOC (${vehicle.targetSoc}%) cannot be less than Current SOC (${vehicle.currentSoc}%).`);
    }
    if (typeof vehicle.maxPower !== 'number' || vehicle.maxPower <= 0) {
      errors.push('Maximum charging power must be greater than 0 kW.');
    }
    if (typeof vehicle.departureSlot !== 'number' || vehicle.departureSlot <= 0 || vehicle.departureSlot >= totalSlots) {
      errors.push(`Departure slot must be between 1 and ${totalSlots - 1}.`);
    }
    return errors;
  }

  function validateFleet(fleet, totalSlots = 48) {
    const errors = [];
    if (!Array.isArray(fleet)) {
      return ['Fleet must be an array of vehicles.'];
    }
    const idSet = new Set();
    fleet.forEach((v, idx) => {
      const vErrors = validateVehicle(v, totalSlots);
      vErrors.forEach(err => errors.push(`Vehicle #${idx + 1} (${v?.id || 'Unknown'}): ${err}`));
      if (v && v.id) {
        if (idSet.has(v.id)) {
          errors.push(`Duplicate vehicle ID detected: "${v.id}". All vehicle IDs must be unique.`);
        }
        idSet.add(v.id);
      }
    });
    return errors;
  }

  // --- Physical Constraint Validator ---
  // Audits an entire generated schedule against all mandatory operational and grid laws.
  function validateSchedule(schedule, fleet, siteConfig) {
    const violations = [];
    const totalSlots = siteConfig.totalSlots || 48;
    const siteLimit = siteConfig.sitePowerLimit || 60;
    const efficiency = siteConfig.chargingEfficiency || 0.90;
    const dtHours = (siteConfig.slotMinutes || 15) / 60.0;

    const fleetMap = new Map();
    fleet.forEach(v => fleetMap.set(v.id, v));

    const chargerMap = new Map();
    (siteConfig.chargers || []).forEach(ch => chargerMap.set(ch.id, ch));

    const deliveredEnergyPerVehicle = new Map();
    fleet.forEach(v => deliveredEnergyPerVehicle.set(v.id, 0));

    // Group allocations by slot
    const slots = new Array(totalSlots).fill(null).map(() => []);
    schedule.forEach(entry => {
      if (entry.slot >= 0 && entry.slot < totalSlots) {
        slots[entry.slot].push(entry);
      } else {
        violations.push(`Allocation outside horizon: slot ${entry.slot} for vehicle ${entry.vehicleId}`);
      }
    });

    for (let t = 0; t < totalSlots; t++) {
      const entries = slots[t];
      let totalSlotPower = 0;
      const seenChargers = new Set();
      const seenVehicles = new Set();

      for (const item of entries) {
        const vehicle = fleetMap.get(item.vehicleId);
        const charger = chargerMap.get(item.chargerId);

        if (!vehicle) {
          violations.push(`Slot ${t}: Unknown vehicle ${item.vehicleId} assigned.`);
          continue;
        }
        if (!charger) {
          violations.push(`Slot ${t}: Unknown charger ${item.chargerId} assigned.`);
          continue;
        }

        // Constraint 1: Charger exclusivity (1 vehicle per charger per slot)
        if (seenChargers.has(item.chargerId)) {
          violations.push(`Slot ${t}: Charger ${item.chargerId} assigned to multiple vehicles simultaneously.`);
        }
        seenChargers.add(item.chargerId);

        // Constraint 2: Vehicle exclusivity (1 charger per vehicle per slot)
        if (seenVehicles.has(item.vehicleId)) {
          violations.push(`Slot ${t}: Vehicle ${item.vehicleId} assigned to multiple chargers simultaneously.`);
        }
        seenVehicles.add(item.vehicleId);

        // Constraint 3: Charger Outage
        if (charger.available === false) {
          violations.push(`Slot ${t}: Vehicle ${item.vehicleId} assigned to unavailable/outage charger ${item.chargerId}.`);
        }

        // Constraint 4: Vehicle Power Limit
        if (item.powerKw > vehicle.maxPower + 0.001) {
          violations.push(`Slot ${t}: Power ${item.powerKw.toFixed(2)} kW exceeds vehicle ${vehicle.id} max limit of ${vehicle.maxPower} kW.`);
        }

        // Constraint 5: Charger Power Limit
        if (item.powerKw > charger.ratedPower + 0.001) {
          violations.push(`Slot ${t}: Power ${item.powerKw.toFixed(2)} kW exceeds charger ${charger.id} rating of ${charger.ratedPower} kW.`);
        }

        // Constraint 6: Departure Deadline
        if (t >= vehicle.departureSlot) {
          violations.push(`Slot ${t}: Vehicle ${vehicle.id} charged after departure deadline (slot ${vehicle.departureSlot}).`);
        }

        totalSlotPower += item.powerKw;

        // Track energy
        const battDelivered = item.powerKw * dtHours * efficiency;
        deliveredEnergyPerVehicle.set(vehicle.id, (deliveredEnergyPerVehicle.get(vehicle.id) || 0) + battDelivered);
      }

      // Constraint 7: Site Power Limit
      if (totalSlotPower > siteLimit + 0.001) {
        violations.push(`Slot ${t}: Total site charging power ${totalSlotPower.toFixed(2)} kW exceeds site limit of ${siteLimit.toFixed(2)} kW.`);
      }
    }

    // Constraint 8: Non-overcharging
    fleet.forEach(v => {
      const req = calculateRequiredBatteryEnergy(v);
      const del = deliveredEnergyPerVehicle.get(v.id) || 0;
      if (del > req + 0.05) { // 0.05 kWh numerical tolerance
        violations.push(`Vehicle ${v.id} overcharged: received ${del.toFixed(2)} kWh but only requested ${req.toFixed(2)} kWh.`);
      }
    });

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  // --- Scheduler 1: Deterministic Greedy Optimiser (Tariff- & Deadline-Aware) ---
  /**
   * The VoltWise Optimiser:
   * 1. Evaluates each vehicle's remaining energy deficit at time slot t.
   * 2. Determines charging urgency (time slack until departure vs charging slots needed).
   * 3. Balances tariff savings against deadline risk:
   *    - High slack vehicles defer charging during peak tariff periods.
   *    - As deadline approaches (slack <= 1), urgency overrides tariff and charges immediately.
   * 4. Enforces site power limit by dynamically allocating power up to capacity.
   * 5. Deterministic tie-breaking ensures 100% reproducible results for identical inputs.
   */
  function runOptimizedScheduler(fleet, siteConfig, tariffs) {
    const config = Object.assign({}, DEFAULT_CONFIG, siteConfig);
    const totalSlots = config.totalSlots || 48;
    const siteLimit = config.sitePowerLimit || 60.0;
    const efficiency = config.chargingEfficiency || 0.90;
    const dtHours = (config.slotMinutes || 15) / 60.0;
    const effectiveTariffs = tariffs && tariffs.length === totalSlots ? tariffs : getDefaultTariffs();

    // Clone fleet state
    const vehicleState = fleet.map(v => {
      const requiredBatt = calculateRequiredBatteryEnergy(v);
      return {
        id: v.id,
        name: v.name,
        batteryCapacity: v.batteryCapacity,
        currentSoc: v.currentSoc,
        targetSoc: v.targetSoc,
        maxPower: v.maxPower,
        departureSlot: v.departureSlot,
        priority: v.priority || 'Normal',
        requiredBattEnergy: requiredBatt,
        deliveredBattEnergy: 0,
        remainingBattEnergy: requiredBatt,
        isCompleted: requiredBatt <= 0.001
      };
    });

    const activeChargers = (config.chargers || []).filter(ch => ch.available !== false);
    const schedule = [];

    // Precalculate average future tariffs for horizon lookahead
    const avgTariffAhead = new Array(totalSlots).fill(0);
    for (let t = 0; t < totalSlots; t++) {
      let sum = 0, count = 0;
      for (let k = t; k < totalSlots; k++) {
        sum += effectiveTariffs[k];
        count++;
      }
      avgTariffAhead[t] = count > 0 ? sum / count : effectiveTariffs[t];
    }

    for (let t = 0; t < totalSlots; t++) {
      let availableSitePower = siteLimit;
      const currentTariff = effectiveTariffs[t];
      const assignedChargers = new Set();

      // Find candidates eligible in this slot
      const candidates = vehicleState.filter(v => {
        return !v.isCompleted && v.remainingBattEnergy > 0.001 && t < v.departureSlot;
      });

      if (candidates.length === 0 || activeChargers.length === 0) {
        continue;
      }

      // Calculate Urgency & Scoring for each candidate
      const scoredCandidates = candidates.map(v => {
        const slotsUntilDeparture = v.departureSlot - t;
        // Slots needed at full vehicle power
        const maxEnergyPerSlot = v.maxPower * dtHours * efficiency;
        const slotsNeeded = Math.ceil(v.remainingBattEnergy / maxEnergyPerSlot);
        const slack = slotsUntilDeparture - slotsNeeded;

        // Base urgency: lower slack => higher urgency
        let urgencyScore = (100 - slack * 5);

        // Priority weighting
        if (v.priority === 'High') urgencyScore += 50;
        else if (v.priority === 'Low') urgencyScore -= 25;

        // Tariff penalty / incentive:
        // If vehicle has ample slack (slack >= 2) and current tariff is higher than future average,
        // reduce its priority so it defers charging to cheaper overnight slots.
        // If slack is tight (slack <= 1), do NOT penalize: deadline is paramount!
        if (slack >= 2) {
          const tariffPenalty = (currentTariff - avgTariffAhead[t]) * 15;
          urgencyScore -= tariffPenalty;
        } else if (slack <= 0) {
          // Critical deadline emergency: boost massively
          urgencyScore += 500;
        }

        return {
          vehicle: v,
          slack,
          slotsNeeded,
          urgencyScore,
          remainingBattEnergy: v.remainingBattEnergy
        };
      });

      // Deterministic sort:
      // 1. Critical urgency (slack <= 0)
      // 2. Highest urgencyScore
      // 3. Remaining energy deficit (larger need first)
      // 4. Vehicle ID (lexicographical tie-breaker)
      scoredCandidates.sort((a, b) => {
        const aCritical = a.slack <= 0 ? 1 : 0;
        const bCritical = b.slack <= 0 ? 1 : 0;
        if (aCritical !== bCritical) return bCritical - aCritical;

        if (Math.abs(b.urgencyScore - a.urgencyScore) > 0.001) {
          return b.urgencyScore - a.urgencyScore;
        }
        if (Math.abs(b.remainingBattEnergy - a.remainingBattEnergy) > 0.001) {
          return b.remainingBattEnergy - a.remainingBattEnergy;
        }
        return a.vehicle.id.localeCompare(b.vehicle.id);
      });

      // Filter out vehicles that have comfortable slack during high peak pricing (t < 12 and tariff >= 8.5)
      // unless available chargers would sit completely idle or slack is <= 2
      const readyToCharge = scoredCandidates.filter(item => {
        if (item.slack <= 1) return true; // Must charge
        // If tariff is high peak (>= 8.0) and vehicle has comfortable slack (>= 3), pause to shift load
        if (currentTariff >= 8.0 && item.slack >= 3) {
          return false;
        }
        return true;
      });

      // Available unassigned chargers sorted by rated power descending
      const freeChargers = activeChargers.slice().sort((a, b) => b.ratedPower - a.ratedPower);

      for (const item of readyToCharge) {
        if (availableSitePower <= 0.001 || freeChargers.length === 0) break;

        const v = item.vehicle;
        const charger = freeChargers.shift(); // Assign fastest available charger
        assignedChargers.add(charger.id);

        // Determine feasible power: min(vehicle limit, charger rating, available site limit)
        const maxFeasiblePower = Math.min(v.maxPower, charger.ratedPower, availableSitePower);

        // Power needed to finish remaining battery energy in this single slot
        const powerToFinish = v.remainingBattEnergy / (dtHours * efficiency);
        const allocatedPower = Math.min(maxFeasiblePower, powerToFinish);

        if (allocatedPower > 0.001) {
          const gridKwh = allocatedPower * dtHours;
          const battKwh = gridKwh * efficiency;

          // Update vehicle tracking
          v.deliveredBattEnergy += battKwh;
          v.remainingBattEnergy = Math.max(0, v.remainingBattEnergy - battKwh);
          if (v.remainingBattEnergy <= 0.001) {
            v.isCompleted = true;
          }

          availableSitePower -= allocatedPower;

          let decisionTag = 'Shoulder Window Charge';
          if (v.remainingBattEnergy <= 0.001) decisionTag = 'Final Top-up Completion';
          else if (item.slack <= 1) decisionTag = 'Urgent Deadline Override';
          else if (currentTariff <= 4.0) decisionTag = 'Super Off-Peak Valley Economy';
          else if (currentTariff >= 8.0) decisionTag = 'Peak Demand Relief Charge';

          schedule.push({
            slot: t,
            timeLabel: slotToTime(t, config.planningStartHour, config.slotMinutes),
            vehicleId: v.id,
            vehicleName: v.name,
            chargerId: charger.id,
            chargerName: charger.name,
            powerKw: Number(allocatedPower.toFixed(3)),
            gridEnergyKwh: Number(gridKwh.toFixed(4)),
            batteryEnergyKwh: Number(battKwh.toFixed(4)),
            tariffInrPerKwh: currentTariff,
            costInr: Number((gridKwh * currentTariff).toFixed(4)),
            remainingDeficitKwh: Number(v.remainingBattEnergy.toFixed(3)),
            decisionTag: decisionTag
          });
        }
      }
    }

    return schedule;
  }

  // --- Scheduler 2: Baseline / Uncoordinated (As Soon As Possible - ASAP) ---
  /**
   * The Uncoordinated Baseline represents standard dumb charging:
   * Vehicles plug in at slot 0 and charge at maximum possible power immediately
   * on first available chargers, completely ignoring electricity prices and peak hours.
   * Respects physical charger and site power limits for fair, realistic comparison.
   */
  function runBaselineScheduler(fleet, siteConfig, tariffs) {
    const config = Object.assign({}, DEFAULT_CONFIG, siteConfig);
    const totalSlots = config.totalSlots || 48;
    const siteLimit = config.sitePowerLimit || 60.0;
    const efficiency = config.chargingEfficiency || 0.90;
    const dtHours = (config.slotMinutes || 15) / 60.0;
    const effectiveTariffs = tariffs && tariffs.length === totalSlots ? tariffs : getDefaultTariffs();

    const vehicleState = fleet.map(v => {
      const requiredBatt = calculateRequiredBatteryEnergy(v);
      return {
        id: v.id,
        name: v.name,
        batteryCapacity: v.batteryCapacity,
        currentSoc: v.currentSoc,
        targetSoc: v.targetSoc,
        maxPower: v.maxPower,
        departureSlot: v.departureSlot,
        priority: v.priority || 'Normal',
        requiredBattEnergy: requiredBatt,
        deliveredBattEnergy: 0,
        remainingBattEnergy: requiredBatt,
        isCompleted: requiredBatt <= 0.001
      };
    });

    const activeChargers = (config.chargers || []).filter(ch => ch.available !== false);
    const schedule = [];

    for (let t = 0; t < totalSlots; t++) {
      let availableSitePower = siteLimit;
      const currentTariff = effectiveTariffs[t];

      // Vehicles requiring energy and not yet departed
      // Sorted strictly by arrival order (index in fleet) or departure deadline (standard FIFO / EDF)
      const waiting = vehicleState.filter(v => {
        return !v.isCompleted && v.remainingBattEnergy > 0.001 && t < v.departureSlot;
      });

      // Baseline greedy sort: earliest departure deadline, then vehicle index
      waiting.sort((a, b) => {
        if (a.departureSlot !== b.departureSlot) {
          return a.departureSlot - b.departureSlot;
        }
        return a.id.localeCompare(b.id);
      });

      const freeChargers = activeChargers.slice();

      for (const v of waiting) {
        if (availableSitePower <= 0.001 || freeChargers.length === 0) break;

        const charger = freeChargers.shift();
        const maxFeasiblePower = Math.min(v.maxPower, charger.ratedPower, availableSitePower);
        const powerToFinish = v.remainingBattEnergy / (dtHours * efficiency);
        const allocatedPower = Math.min(maxFeasiblePower, powerToFinish);

        if (allocatedPower > 0.001) {
          const gridKwh = allocatedPower * dtHours;
          const battKwh = gridKwh * efficiency;

          v.deliveredBattEnergy += battKwh;
          v.remainingBattEnergy = Math.max(0, v.remainingBattEnergy - battKwh);
          if (v.remainingBattEnergy <= 0.001) {
            v.isCompleted = true;
          }

          availableSitePower -= allocatedPower;

          schedule.push({
            slot: t,
            timeLabel: slotToTime(t, config.planningStartHour, config.slotMinutes),
            vehicleId: v.id,
            vehicleName: v.name,
            chargerId: charger.id,
            chargerName: charger.name,
            powerKw: Number(allocatedPower.toFixed(3)),
            gridEnergyKwh: Number(gridKwh.toFixed(4)),
            batteryEnergyKwh: Number(battKwh.toFixed(4)),
            tariffInrPerKwh: currentTariff,
            costInr: Number((gridKwh * currentTariff).toFixed(4)),
            remainingDeficitKwh: Number(v.remainingBattEnergy.toFixed(3))
          });
        }
      }
    }

    return schedule;
  }

  // --- Smart Charging Decision Explanation & Deadline Risk Analyzer ---
  function analyzeVehicleDecision(vehicle, schedule, siteConfig, tariffs) {
    const config = Object.assign({}, DEFAULT_CONFIG, siteConfig);
    const dtHours = (config.slotMinutes || 15) / 60.0;
    const efficiency = config.chargingEfficiency || 0.90;
    const req = calculateRequiredBatteryEnergy(vehicle);

    if (req <= 0.001) {
      return {
        riskScore: 'Completed',
        riskBadge: 'badge-normal',
        riskLabel: '🟢 Target Met',
        slack: vehicle.departureSlot,
        slotsNeededAtFull: 0,
        slotsAvailable: vehicle.departureSlot,
        headline: 'Vehicle entered depot with battery state at or above target threshold.',
        urgencyRationale: 'Zero additional energy required. No charging bay allocation was necessary.',
        tariffEconomics: 'Zero electricity cost incurred.',
        siteImpact: '0.0 kW depot grid demand.',
        chargingSlotsCount: 0,
        slotsUsed: []
      };
    }

    const vehicleAllocations = schedule.filter(s => s.vehicleId === vehicle.id);
    const slotsUsed = vehicleAllocations.map(s => s.slot);
    const delivered = vehicleAllocations.reduce((sum, s) => sum + s.batteryEnergyKwh, 0);
    const cost = vehicleAllocations.reduce((sum, s) => sum + s.costInr, 0);
    const avgTariff = vehicleAllocations.length > 0
      ? vehicleAllocations.reduce((sum, s) => sum + s.tariffInrPerKwh, 0) / vehicleAllocations.length
      : 0;

    const activeChargers = (config.chargers || []).filter(c => c.available !== false);
    const maxChargerPower = activeChargers.length > 0 ? Math.max(...activeChargers.map(c => c.ratedPower)) : 22.0;
    const maxFeasiblePower = Math.min(vehicle.maxPower, maxChargerPower);
    const maxPossibleEnergy = vehicle.departureSlot * maxFeasiblePower * dtHours * efficiency;

    const slotsNeededAtFull = Math.ceil(req / (maxFeasiblePower * dtHours * efficiency));
    const slack = vehicle.departureSlot - slotsNeededAtFull;

    let riskScore = 'Safe';
    let riskBadge = 'badge-normal';
    let riskLabel = '🟢 Low Risk';

    if (req > maxPossibleEnergy + 0.05) {
      riskScore = 'Infeasible';
      riskBadge = 'badge-high';
      riskLabel = '🚨 Infeasible Deadline';
    } else if (slack <= 0) {
      riskScore = 'Critical';
      riskBadge = 'badge-high';
      riskLabel = '🔴 Critical Urgency';
    } else if (slack <= 2) {
      riskScore = 'Moderate';
      riskBadge = 'badge-low';
      riskLabel = '🟡 Moderate Watchlist';
    }

    let headline = '';
    let urgencyRationale = '';
    let tariffEconomics = '';

    if (riskScore === 'Infeasible') {
      headline = `Physics Infeasible: Vehicle required ${req.toFixed(1)} kWh, but vehicle power limit (${vehicle.maxPower} kW) restricts intake to max ${maxPossibleEnergy.toFixed(1)} kWh before departure at slot ${vehicle.departureSlot}.`;
      urgencyRationale = `Turnaround window (${(vehicle.departureSlot * dtHours).toFixed(1)}h) is physically insufficient for this battery deficit.`;
      tariffEconomics = `Scheduled continuously at maximum rate to maximize state of charge before departure.`;
    } else if (slack <= 1) {
      headline = `Dispatched on Urgency: Urgency slack was tight (slack = ${slack}). Scheduler prioritized guaranteed morning departure over tariff avoidance.`;
      urgencyRationale = `Required ${slotsNeededAtFull} charging slots out of ${vehicle.departureSlot} available slots before deadline; charging was scheduled without waiting for super off-peak rates.`;
      tariffEconomics = `Charged at average rate of ₹${avgTariff.toFixed(2)}/kWh to ensure deadline compliance by ${slotToTime(vehicle.departureSlot, config.planningStartHour, config.slotMinutes)}.`;
    } else {
      headline = `Economic Load-Shifted: With ${slack} slots of dwell-time slack, charging was deferred away from the 18:00–21:00 peak (₹9.50/kWh) into the overnight super-off-peak valley (₹3.60/kWh).`;
      urgencyRationale = `Vehicle had ${slack} slots of flexible turnaround margin before departure deadline.`;
      const peakAvoidanceSavings = ((9.50 - avgTariff) * (delivered / efficiency));
      tariffEconomics = `Avoided peak grid pricing; scheduled during low-rate windows at average tariff of ₹${avgTariff.toFixed(2)}/kWh, saving an estimated ₹${Math.max(0, peakAvoidanceSavings).toFixed(2)}.`;
    }

    const assignedChargerIds = [...new Set(vehicleAllocations.map(s => s.chargerName || s.chargerId))];
    const peakAllocatedPower = vehicleAllocations.length > 0 ? Math.max(...vehicleAllocations.map(s => s.powerKw)) : 0;
    const siteImpact = `Assigned to ${assignedChargerIds.join(', ') || 'No bay'}; peak draw ${peakAllocatedPower.toFixed(1)} kW strictly respected site limit (${config.sitePowerLimit} kW).`;

    return {
      riskScore,
      riskBadge,
      riskLabel,
      slack,
      slotsNeededAtFull,
      slotsAvailable: vehicle.departureSlot,
      headline,
      urgencyRationale,
      tariffEconomics,
      siteImpact,
      deliveredBattKwh: Number(delivered.toFixed(2)),
      costInr: Number(cost.toFixed(2)),
      avgTariffInr: Number(avgTariff.toFixed(2)),
      chargingSlotsCount: vehicleAllocations.length,
      slotsUsed
    };
  }

  // --- Metrics & KPI Computation ---
  function computeMetrics(schedule, fleet, siteConfig, tariffs) {
    const config = Object.assign({}, DEFAULT_CONFIG, siteConfig);
    const totalSlots = config.totalSlots || 48;
    const efficiency = config.chargingEfficiency || 0.90;
    const emissionFactor = config.gridEmissionFactor || 0.72;
    const dtHours = (config.slotMinutes || 15) / 60.0;
    const effectiveTariffs = tariffs && tariffs.length === totalSlots ? tariffs : getDefaultTariffs();

    let totalGridEnergy = 0;
    let totalBatteryEnergyDelivered = 0;
    let totalElectricityCost = 0;
    let peakGridEnergyConsumed = 0;
    let offPeakGridEnergyConsumed = 0;

    const powerPerSlot = new Array(totalSlots).fill(0);
    const costPerSlot = new Array(totalSlots).fill(0);
    const vehicleDelivered = new Map();

    fleet.forEach(v => vehicleDelivered.set(v.id, 0));

    schedule.forEach(item => {
      totalGridEnergy += item.gridEnergyKwh;
      totalBatteryEnergyDelivered += item.batteryEnergyKwh;
      totalElectricityCost += item.costInr;

      if (item.slot >= 0 && item.slot < totalSlots) {
        powerPerSlot[item.slot] += item.powerKw;
        costPerSlot[item.slot] += item.costInr;

        // Peak energy (18:00 - 21:00) vs Off-peak energy (21:00 - 04:00)
        if (item.slot < 12) {
          peakGridEnergyConsumed += item.gridEnergyKwh;
        } else if (item.slot >= 20 && item.slot < 40) {
          offPeakGridEnergyConsumed += item.gridEnergyKwh;
        }
      }

      vehicleDelivered.set(item.vehicleId, (vehicleDelivered.get(item.vehicleId) || 0) + item.batteryEnergyKwh);
    });

    const peakDemandKw = Math.max(0, ...powerPerSlot);
    const totalBatteryEnergyRequired = fleet.reduce((sum, v) => sum + calculateRequiredBatteryEnergy(v), 0);
    const totalGridEnergyRequired = calculateGridEnergy(totalBatteryEnergyRequired, efficiency);

    // Vehicle completion audits & decision synthesis
    let completedVehiclesCount = 0;
    const vehicleResults = fleet.map(v => {
      const required = calculateRequiredBatteryEnergy(v);
      const delivered = vehicleDelivered.get(v.id) || 0;
      const unfulfilled = Math.max(0, required - delivered);
      const isCompleted = unfulfilled <= 0.05; // 0.05 kWh threshold

      if (isCompleted) completedVehiclesCount++;

      // Formulate explicit reasons for incomplete vehicles
      let statusReason = 'Target fully achieved.';
      if (!isCompleted) {
        const slotsAvailable = v.departureSlot;
        const maxEnergyPossible = slotsAvailable * v.maxPower * dtHours * efficiency;
        if (maxEnergyPossible < required) {
          statusReason = `Infeasible deadline: needed ${required.toFixed(1)} kWh but vehicle charging speed limit (${v.maxPower} kW) can only take max ${maxEnergyPossible.toFixed(1)} kWh before slot ${v.departureSlot}.`;
        } else {
          statusReason = `Charger or site power contention: site limit (${config.sitePowerLimit} kW) or charger availability prevented full charge before departure deadline.`;
        }
      }

      const endSoc = v.batteryCapacity > 0
        ? Math.min(100, Number((v.currentSoc + (delivered / v.batteryCapacity) * 100).toFixed(1)))
        : v.currentSoc;

      const decision = analyzeVehicleDecision(v, schedule, config, effectiveTariffs);

      return {
        id: v.id,
        name: v.name,
        batteryCapacity: v.batteryCapacity,
        initialSoc: v.currentSoc,
        targetSoc: v.targetSoc,
        finalSoc: endSoc,
        requiredEnergyKwh: Number(required.toFixed(2)),
        deliveredEnergyKwh: Number(delivered.toFixed(2)),
        unfulfilledEnergyKwh: Number(unfulfilled.toFixed(2)),
        isCompleted,
        statusReason,
        departureSlot: v.departureSlot,
        departureTime: slotToTime(v.departureSlot, config.planningStartHour, config.slotMinutes),
        riskScore: decision.riskScore,
        riskBadge: decision.riskBadge,
        riskLabel: decision.riskLabel,
        slack: decision.slack,
        decision: decision
      };
    });

    const unfulfilledEnergyTotal = Math.max(0, totalBatteryEnergyRequired - totalBatteryEnergyDelivered);
    const completionRatePct = fleet.length > 0 ? (completedVehiclesCount / fleet.length) * 100 : 100;
    const estimatedEmissionsKg = totalGridEnergy * emissionFactor;
    const cleanTransitKm = Number((totalBatteryEnergyDelivered / 0.25).toFixed(0)); // Standard 0.25 kWh/km

    return {
      fleetSize: fleet.length,
      totalBatteryEnergyRequired: Number(totalBatteryEnergyRequired.toFixed(2)),
      totalBatteryEnergyDelivered: Number(totalBatteryEnergyDelivered.toFixed(2)),
      totalGridEnergyConsumed: Number(totalGridEnergy.toFixed(2)),
      unfulfilledEnergyKwh: Number(unfulfilledEnergyTotal.toFixed(2)),
      totalElectricityCostInr: Number(totalElectricityCost.toFixed(2)),
      peakDemandKw: Number(peakDemandKw.toFixed(2)),
      completedVehiclesCount,
      incompleteVehiclesCount: fleet.length - completedVehiclesCount,
      completionRatePct: Number(completionRatePct.toFixed(1)),
      estimatedEmissionsKg: Number(estimatedEmissionsKg.toFixed(2)),
      powerPerSlot: powerPerSlot.map(p => Number(p.toFixed(2))),
      costPerSlot: costPerSlot.map(c => Number(c.toFixed(2))),
      peakGridEnergyConsumed: Number(peakGridEnergyConsumed.toFixed(2)),
      offPeakGridEnergyConsumed: Number(offPeakGridEnergyConsumed.toFixed(2)),
      cleanTransitKm,
      vehicleResults
    };
  }

  // --- Baseline vs Optimised Comparison ---
  function compareSchedules(baselineMetrics, optimizedMetrics) {
    const costSavingsInr = baselineMetrics.totalElectricityCostInr - optimizedMetrics.totalElectricityCostInr;
    const costSavingsPct = baselineMetrics.totalElectricityCostInr > 0
      ? (costSavingsInr / baselineMetrics.totalElectricityCostInr) * 100
      : 0;

    const peakReductionKw = baselineMetrics.peakDemandKw - optimizedMetrics.peakDemandKw;
    const peakReductionPct = baselineMetrics.peakDemandKw > 0
      ? (peakReductionKw / baselineMetrics.peakDemandKw) * 100
      : 0;

    const emissionsDeltaKg = baselineMetrics.estimatedEmissionsKg - optimizedMetrics.estimatedEmissionsKg;

    return {
      cost: {
        baseline: baselineMetrics.totalElectricityCostInr,
        optimized: optimizedMetrics.totalElectricityCostInr,
        savingsInr: Number(costSavingsInr.toFixed(2)),
        savingsPct: Number(costSavingsPct.toFixed(1))
      },
      peakDemand: {
        baseline: baselineMetrics.peakDemandKw,
        optimized: optimizedMetrics.peakDemandKw,
        reductionKw: Number(peakReductionKw.toFixed(2)),
        reductionPct: Number(peakReductionPct.toFixed(1))
      },
      completion: {
        baselineCompleted: baselineMetrics.completedVehiclesCount,
        optimizedCompleted: optimizedMetrics.completedVehiclesCount,
        totalFleet: baselineMetrics.fleetSize
      },
      energy: {
        required: baselineMetrics.totalBatteryEnergyRequired,
        baselineDelivered: baselineMetrics.totalBatteryEnergyDelivered,
        optimizedDelivered: optimizedMetrics.totalBatteryEnergyDelivered,
        baselineUnfulfilled: baselineMetrics.unfulfilledEnergyKwh,
        optimizedUnfulfilled: optimizedMetrics.unfulfilledEnergyKwh
      },
      emissions: {
        baselineKg: baselineMetrics.estimatedEmissionsKg,
        optimizedKg: optimizedMetrics.estimatedEmissionsKg,
        deltaKg: Number(emissionsDeltaKg.toFixed(2))
      },
      sdgImpact: {
        avoidedPeakGridEnergyKwh: Number(Math.max(0, (baselineMetrics.peakGridEnergyConsumed || 0) - (optimizedMetrics.peakGridEnergyConsumed || 0)).toFixed(2)),
        peakReductionKw: Number(peakReductionKw.toFixed(2)),
        cleanTransitKm: optimizedMetrics.cleanTransitKm || 0
      }
    };
  }

  // --- CSV Exporters ---
  function generateScheduleCsv(schedule, scenarioName = 'Default Scenario') {
    const headers = [
      'Scenario',
      'Slot',
      'Time',
      'Vehicle ID',
      'Vehicle Name',
      'Charger ID',
      'Charging Power (kW)',
      'Grid Energy (kWh)',
      'Battery Energy Delivered (kWh)',
      'Tariff (INR/kWh)',
      'Slot Cost (INR)',
      'Remaining Need (kWh)'
    ];

    const rows = schedule.map(item => [
      `"${scenarioName.replace(/"/g, '""')}"`,
      item.slot,
      `"${item.timeLabel}"`,
      `"${item.vehicleId}"`,
      `"${item.vehicleName.replace(/"/g, '""')}"`,
      `"${item.chargerId}"`,
      item.powerKw.toFixed(2),
      item.gridEnergyKwh.toFixed(4),
      item.batteryEnergyKwh.toFixed(4),
      item.tariffInrPerKwh.toFixed(2),
      item.costInr.toFixed(2),
      item.remainingDeficitKwh.toFixed(2)
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  function generateComparisonCsv(comparison, baselineMetrics, optimizedMetrics, scenarioName = 'Default Scenario') {
    const timestamp = new Date().toISOString();
    const headers = ['Scenario', 'Timestamp', 'Metric', 'Baseline Result', 'Optimised Result', 'Difference', 'Unit', 'Notes'];

    const data = [
      ['Total Electricity Cost', baselineMetrics.totalElectricityCostInr, optimizedMetrics.totalElectricityCostInr, comparison.cost.savingsInr, 'INR (₹)', `${comparison.cost.savingsPct}% savings`],
      ['Peak Site Demand', baselineMetrics.peakDemandKw, optimizedMetrics.peakDemandKw, comparison.peakDemand.reductionKw, 'kW', `${comparison.peakDemand.reductionPct}% peak shaved`],
      ['Vehicles Completed', baselineMetrics.completedVehiclesCount, optimizedMetrics.completedVehiclesCount, optimizedMetrics.completedVehiclesCount - baselineMetrics.completedVehiclesCount, 'Count', `Out of ${baselineMetrics.fleetSize} vehicles`],
      ['Battery Energy Delivered', baselineMetrics.totalBatteryEnergyDelivered, optimizedMetrics.totalBatteryEnergyDelivered, Number((optimizedMetrics.totalBatteryEnergyDelivered - baselineMetrics.totalBatteryEnergyDelivered).toFixed(2)), 'kWh', `Target requirement: ${baselineMetrics.totalBatteryEnergyRequired} kWh`],
      ['Unfulfilled Energy', baselineMetrics.unfulfilledEnergyKwh, optimizedMetrics.unfulfilledEnergyKwh, Number((baselineMetrics.unfulfilledEnergyKwh - optimizedMetrics.unfulfilledEnergyKwh).toFixed(2)), 'kWh', 'Lower is better'],
      ['Grid Energy Consumed', baselineMetrics.totalGridEnergyConsumed, optimizedMetrics.totalGridEnergyConsumed, Number((baselineMetrics.totalGridEnergyConsumed - optimizedMetrics.totalGridEnergyConsumed).toFixed(2)), 'kWh', 'Includes 90% charging efficiency losses'],
      ['Estimated Grid Emissions', baselineMetrics.estimatedEmissionsKg, optimizedMetrics.estimatedEmissionsKg, comparison.emissions.deltaKg, 'kg CO2e', 'Based on 0.72 kg CO2e/kWh factor']
    ];

    const rows = data.map(item => [
      `"${scenarioName.replace(/"/g, '""')}"`,
      `"${timestamp}"`,
      `"${item[0]}"`,
      item[1],
      item[2],
      item[3],
      `"${item[4]}"`,
      `"${item[5]}"`
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  // Public API Export
  return {
    DEFAULT_CONFIG,
    DEFAULT_FLEET,
    getDefaultTariffs,
    slotToTime,
    timeToSlot,
    calculateRequiredBatteryEnergy,
    calculateGridEnergy,
    validateVehicle,
    validateFleet,
    validateSchedule,
    runOptimizedScheduler,
    runBaselineScheduler,
    computeMetrics,
    compareSchedules,
    generateScheduleCsv,
    generateComparisonCsv,
    generateTierTariffs,
    validateCharger,
    analyzeVehicleDecision
  };
}));
