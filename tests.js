/**
 * VoltWise - Automated Testing & Verification Suite
 * Executes 21 rigorous test cases covering edge cases, physical constraints,
 * energy conservation, and optimization correctness.
 */

(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const Engine = isNode ? require('./engine.js') : window.VoltWiseEngine;

  const testResults = [];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion Failed: ${message}`);
    }
  }

  function runTest(name, fn) {
    try {
      fn();
      testResults.push({ name, passed: true, error: null });
      if (isNode) console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      testResults.push({ name, passed: false, error: err.message });
      if (isNode) console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    }
  }

  if (isNode) console.log('\n--- Running VoltWise Test Suite (24 Verification Tests) ---');

  // Test 1: Empty fleet
  runTest('1. Empty fleet handles cleanly without errors', () => {
    const sched = Engine.runOptimizedScheduler([], Engine.DEFAULT_CONFIG);
    assert(Array.isArray(sched) && sched.length === 0, 'Schedule for empty fleet should be empty array');
    const metrics = Engine.computeMetrics(sched, [], Engine.DEFAULT_CONFIG);
    assert(metrics.fleetSize === 0, 'Fleet size must be 0');
    assert(metrics.totalBatteryEnergyRequired === 0, 'Required energy must be 0');
    assert(metrics.totalElectricityCostInr === 0, 'Cost must be 0');
  });

  // Test 2: Vehicle already at target SOC
  runTest('2. Vehicle already at target SOC requires zero energy and zero charging', () => {
    const vehicle = {
      id: 'EV-FULL',
      name: 'Full Battery Car',
      batteryCapacity: 60,
      currentSoc: 80,
      targetSoc: 80,
      maxPower: 22,
      departureSlot: 30,
      priority: 'Normal'
    };
    const req = Engine.calculateRequiredBatteryEnergy(vehicle);
    assert(req === 0, `Required energy should be 0, got ${req}`);
    const sched = Engine.runOptimizedScheduler([vehicle], Engine.DEFAULT_CONFIG);
    assert(sched.length === 0, 'No charging slots should be scheduled');
    const metrics = Engine.computeMetrics(sched, [vehicle], Engine.DEFAULT_CONFIG);
    assert(metrics.completedVehiclesCount === 1, 'Vehicle already at target should count as completed');
  });

  // Test 3: Vehicle requiring zero additional energy (currentSoc > targetSoc)
  runTest('3. Target SOC lower than or equal to current SOC yields 0 kWh required', () => {
    const vehicle = {
      id: 'EV-OVER',
      name: 'Overcharged Car',
      batteryCapacity: 50,
      currentSoc: 90,
      targetSoc: 50,
      maxPower: 22,
      departureSlot: 30,
      priority: 'Normal'
    };
    const req = Engine.calculateRequiredBatteryEnergy(vehicle);
    assert(req === 0, `Required energy must be 0 when current >= target, got ${req}`);
  });

  // Test 4: Invalid SOC input validation
  runTest('4. Invalid SOC inputs correctly caught by validator', () => {
    const invalidV1 = { id: 'V1', name: 'Bad SOC', batteryCapacity: 50, currentSoc: -5, targetSoc: 80, maxPower: 11, departureSlot: 20 };
    const errs1 = Engine.validateVehicle(invalidV1, 48);
    assert(errs1.some(e => e.includes('Current SOC must be between 0% and 100%')), 'Must catch negative SOC');

    const invalidV2 = { id: 'V2', name: 'Bad Target', batteryCapacity: 50, currentSoc: 80, targetSoc: 60, maxPower: 11, departureSlot: 20 };
    const errs2 = Engine.validateVehicle(invalidV2, 48);
    assert(errs2.some(e => e.includes('cannot be less than Current SOC')), 'Must catch target < current');
  });

  // Test 5: Invalid battery capacity validation
  runTest('5. Invalid battery capacity (<= 0) correctly caught by validator', () => {
    const badCap = { id: 'V-ZERO', name: 'Zero Cap', batteryCapacity: 0, currentSoc: 20, targetSoc: 80, maxPower: 11, departureSlot: 20 };
    const errs = Engine.validateVehicle(badCap, 48);
    assert(errs.some(e => e.includes('Battery capacity must be greater than 0')), 'Must catch capacity <= 0');
  });

  // Test 6: Duplicate vehicle IDs
  runTest('6. Duplicate vehicle IDs rejected by fleet validator', () => {
    const fleet = [
      { id: 'EV-DUP', name: 'Car 1', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 11, departureSlot: 20 },
      { id: 'EV-DUP', name: 'Car 2', batteryCapacity: 60, currentSoc: 30, targetSoc: 80, maxPower: 11, departureSlot: 20 }
    ];
    const errs = Engine.validateFleet(fleet, 48);
    assert(errs.some(e => e.includes('Duplicate vehicle ID detected')), 'Must catch duplicate vehicle ID');
  });

  // Test 7: One vehicle and one charger
  runTest('7. Single vehicle with single charger charges accurately', () => {
    const vehicle = {
      id: 'EV-SOLO',
      name: 'Solo Car',
      batteryCapacity: 40,
      currentSoc: 25,
      targetSoc: 75, // needs 20 kWh
      maxPower: 22,
      departureSlot: 30,
      priority: 'Normal'
    };
    const config = Object.assign({}, Engine.DEFAULT_CONFIG, {
      chargers: [{ id: 'CH-1', name: 'Solo Charger', ratedPower: 22, available: true }],
      sitePowerLimit: 25
    });
    const sched = Engine.runOptimizedScheduler([vehicle], config);
    assert(sched.length > 0, 'Schedule must contain charging slots');
    const val = Engine.validateSchedule(sched, [vehicle], config);
    assert(val.isValid, `Schedule must be physically valid: ${val.violations.join(', ')}`);
    const metrics = Engine.computeMetrics(sched, [vehicle], config);
    assert(metrics.completedVehiclesCount === 1, 'Solo vehicle must complete charging');
    assert(Math.abs(metrics.totalBatteryEnergyDelivered - 20) < 0.1, `Delivered energy must match required 20 kWh, got ${metrics.totalBatteryEnergyDelivered}`);
  });

  // Test 8: Multiple vehicles competing for one charger
  runTest('8. Multiple vehicles competing for single charger respects exclusivity', () => {
    const fleet = [
      { id: 'EV-A', name: 'Van A', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 30, priority: 'High' },
      { id: 'EV-B', name: 'Van B', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 30, priority: 'Normal' }
    ];
    const config = Object.assign({}, Engine.DEFAULT_CONFIG, {
      chargers: [{ id: 'CH-1', name: 'Shared Charger', ratedPower: 22, available: true }],
      sitePowerLimit: 30
    });
    const sched = Engine.runOptimizedScheduler(fleet, config);
    const val = Engine.validateSchedule(sched, fleet, config);
    assert(val.isValid, `Exclusivity violated: ${val.violations.join(', ')}`);
  });

  // Test 9: Site power limit below total possible charger power
  runTest('9. Site power limit strictly caps total depot power across chargers', () => {
    const fleet = [
      { id: 'EV-1', name: 'Car 1', batteryCapacity: 60, currentSoc: 10, targetSoc: 90, maxPower: 22, departureSlot: 40, priority: 'Normal' },
      { id: 'EV-2', name: 'Car 2', batteryCapacity: 60, currentSoc: 10, targetSoc: 90, maxPower: 22, departureSlot: 40, priority: 'Normal' },
      { id: 'EV-3', name: 'Car 3', batteryCapacity: 60, currentSoc: 10, targetSoc: 90, maxPower: 22, departureSlot: 40, priority: 'Normal' }
    ];
    // 3 chargers x 22 kW = 66 kW potential demand, but site limit capped at 30 kW
    const config = Object.assign({}, Engine.DEFAULT_CONFIG, {
      chargers: [
        { id: 'CH-1', name: 'C1', ratedPower: 22, available: true },
        { id: 'CH-2', name: 'C2', ratedPower: 22, available: true },
        { id: 'CH-3', name: 'C3', ratedPower: 22, available: true }
      ],
      sitePowerLimit: 30.0
    });
    const sched = Engine.runOptimizedScheduler(fleet, config);
    const metrics = Engine.computeMetrics(sched, fleet, config);
    assert(metrics.peakDemandKw <= 30.001, `Peak demand ${metrics.peakDemandKw} kW exceeded site limit of 30 kW!`);
    const val = Engine.validateSchedule(sched, fleet, config);
    assert(val.isValid, `Violations found: ${val.violations.join(', ')}`);
  });

  // Test 10: Charger outage handling
  runTest('10. Charger marked unavailable is never assigned to any vehicle', () => {
    const fleet = [
      { id: 'EV-1', name: 'Car 1', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 30, priority: 'Normal' }
    ];
    const config = Object.assign({}, Engine.DEFAULT_CONFIG, {
      chargers: [
        { id: 'CH-OFFLINE', name: 'Broken Bay', ratedPower: 22, available: false },
        { id: 'CH-ONLINE', name: 'Working Bay', ratedPower: 22, available: true }
      ]
    });
    const sched = Engine.runOptimizedScheduler(fleet, config);
    assert(sched.every(item => item.chargerId !== 'CH-OFFLINE'), 'Offline charger was assigned!');
  });

  // Test 11: Impossible departure deadline detection
  runTest('11. Impossible departure deadline identified with explicit explanation', () => {
    // Vehicle needs 40 kWh, max power 11 kW, departure in only 2 slots (0.5 hour)!
    // Max possible energy in 0.5h is 11 * 0.5 * 0.9 = 4.95 kWh.
    const impossibleVehicle = {
      id: 'EV-TIGHT',
      name: 'Impossible Van',
      batteryCapacity: 50,
      currentSoc: 10,
      targetSoc: 90, // needs 40 kWh
      maxPower: 11,
      departureSlot: 2,
      priority: 'High'
    };
    const sched = Engine.runOptimizedScheduler([impossibleVehicle], Engine.DEFAULT_CONFIG);
    const metrics = Engine.computeMetrics(sched, [impossibleVehicle], Engine.DEFAULT_CONFIG);
    const result = metrics.vehicleResults[0];
    assert(!result.isCompleted, 'Vehicle should not be marked completed');
    assert(result.statusReason.includes('Infeasible deadline'), `Expected infeasible reason, got: ${result.statusReason}`);
  });

  // Test 12: Electricity price responsiveness (shifting away from peak)
  runTest('12. Optimiser shifts charging away from high peak periods when slack permits', () => {
    const fleet = [
      { id: 'EV-FLEX', name: 'Flexible Van', batteryCapacity: 40, currentSoc: 25, targetSoc: 75, maxPower: 22, departureSlot: 40, priority: 'Normal' }
    ];
    // High peak in slots 0-11 (tariff 9.5), cheap in slots 20-39 (tariff 3.6)
    const sched = Engine.runOptimizedScheduler(fleet, Engine.DEFAULT_CONFIG);
    const peakSlotsUsed = sched.filter(s => s.slot < 12).length;
    assert(peakSlotsUsed === 0, `Flexible vehicle should not charge during peak slots (0-11), but charged in ${peakSlotsUsed} peak slots!`);
  });

  // Test 13: Charging efficiency below 100%
  runTest('13. Charging efficiency correctly accounts for conversion losses', () => {
    const battEnergy = 18; // kWh
    const efficiency = 0.90;
    const gridEnergy = Engine.calculateGridEnergy(battEnergy, efficiency);
    assert(Math.abs(gridEnergy - 20) < 0.001, `Grid energy should be 20 kWh at 90% efficiency, got ${gridEnergy}`);
  });

  // Test 14: Correct baseline and optimised cost calculation
  runTest('14. Baseline vs Optimised cost comparison correctly calculates savings', () => {
    const baseMetrics = { totalElectricityCostInr: 1000, peakDemandKw: 60, completedVehiclesCount: 8, fleetSize: 8, totalBatteryEnergyRequired: 200, totalBatteryEnergyDelivered: 200, unfulfilledEnergyKwh: 0, totalGridEnergyConsumed: 222.2, estimatedEmissionsKg: 160 };
    const optMetrics = { totalElectricityCostInr: 750, peakDemandKw: 44, completedVehiclesCount: 8, fleetSize: 8, totalBatteryEnergyRequired: 200, totalBatteryEnergyDelivered: 200, unfulfilledEnergyKwh: 0, totalGridEnergyConsumed: 222.2, estimatedEmissionsKg: 160 };
    const comp = Engine.compareSchedules(baseMetrics, optMetrics);
    assert(comp.cost.savingsInr === 250, `Cost savings should be 250, got ${comp.cost.savingsInr}`);
    assert(comp.cost.savingsPct === 25.0, `Savings percent should be 25.0%, got ${comp.cost.savingsPct}%`);
  });

  // Test 15: Peak demand calculation accuracy
  runTest('15. Peak demand accurately identifies maximum concurrent power', () => {
    const mockSchedule = [
      { slot: 1, vehicleId: 'V1', chargerId: 'C1', powerKw: 22, gridEnergyKwh: 5.5, batteryEnergyKwh: 4.95, costInr: 20 },
      { slot: 1, vehicleId: 'V2', chargerId: 'C2', powerKw: 11, gridEnergyKwh: 2.75, batteryEnergyKwh: 2.47, costInr: 10 },
      { slot: 2, vehicleId: 'V1', chargerId: 'C1', powerKw: 22, gridEnergyKwh: 5.5, batteryEnergyKwh: 4.95, costInr: 20 }
    ];
    const fleet = [
      { id: 'V1', name: 'V1', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 20 },
      { id: 'V2', name: 'V2', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 20 }
    ];
    const metrics = Engine.computeMetrics(mockSchedule, fleet, Engine.DEFAULT_CONFIG);
    assert(metrics.peakDemandKw === 33, `Peak demand in slot 1 should be 22 + 11 = 33 kW, got ${metrics.peakDemandKw}`);
  });

  // Test 16: Charger exclusivity verification
  runTest('16. Schedule validator flags duplicate vehicle on single charger', () => {
    const illegalSchedule = [
      { slot: 5, vehicleId: 'V1', chargerId: 'CH-1', powerKw: 11, gridEnergyKwh: 2.75, batteryEnergyKwh: 2.47 },
      { slot: 5, vehicleId: 'V2', chargerId: 'CH-1', powerKw: 11, gridEnergyKwh: 2.75, batteryEnergyKwh: 2.47 }
    ];
    const fleet = [
      { id: 'V1', name: 'V1', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 20 },
      { id: 'V2', name: 'V2', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 20 }
    ];
    const val = Engine.validateSchedule(illegalSchedule, fleet, Engine.DEFAULT_CONFIG);
    assert(!val.isValid, 'Validator must fail when two vehicles share a charger in the same slot');
    assert(val.violations.some(v => v.includes('multiple vehicles simultaneously')), 'Must identify charger sharing');
  });

  // Test 17: Vehicle exclusivity verification
  runTest('17. Schedule validator flags single vehicle assigned to two chargers', () => {
    const illegalSchedule = [
      { slot: 5, vehicleId: 'V1', chargerId: 'CH-1', powerKw: 11, gridEnergyKwh: 2.75, batteryEnergyKwh: 2.47 },
      { slot: 5, vehicleId: 'V1', chargerId: 'CH-2', powerKw: 11, gridEnergyKwh: 2.75, batteryEnergyKwh: 2.47 }
    ];
    const fleet = [
      { id: 'V1', name: 'V1', batteryCapacity: 50, currentSoc: 20, targetSoc: 80, maxPower: 22, departureSlot: 20 }
    ];
    const val = Engine.validateSchedule(illegalSchedule, fleet, Engine.DEFAULT_CONFIG);
    assert(!val.isValid, 'Validator must fail when a vehicle is assigned to two chargers');
    assert(val.violations.some(v => v.includes('multiple chargers simultaneously')), 'Must identify vehicle sharing chargers');
  });

  // Test 18: State serialization & roundtrip (localStorage readiness)
  runTest('18. State serialization roundtrip preserves numeric precision and structure', () => {
    const originalFleet = Engine.DEFAULT_FLEET;
    const serialized = JSON.stringify(originalFleet);
    const restored = JSON.parse(serialized);
    assert(restored.length === originalFleet.length, 'Restored fleet length must match');
    assert(restored[0].id === originalFleet[0].id, 'Restored vehicle ID must match');
    assert(restored[0].batteryCapacity === originalFleet[0].batteryCapacity, 'Numeric values must preserve exact equality');
  });

  // Test 19: CSV Export generation
  runTest('19. CSV exporter outputs valid RFC 4180 format with correct headers', () => {
    const sched = Engine.runOptimizedScheduler(Engine.DEFAULT_FLEET.slice(0, 2), Engine.DEFAULT_CONFIG);
    const csv = Engine.generateScheduleCsv(sched, 'Unit Test Scenario');
    assert(typeof csv === 'string' && csv.length > 50, 'CSV string must be generated');
    const lines = csv.split('\r\n');
    assert(lines[0].includes('Scenario') && lines[0].includes('Vehicle ID'), 'Headers must include Scenario and Vehicle ID');
    assert(lines.length > 1, 'CSV must contain data rows');
  });

  // Test 20: Dynamic recalculation on tariff and fleet modifications
  runTest('20. Dynamic modification of tariff immediately shifts scheduling and costs', () => {
    const flatTariffHigh = new Array(48).fill(10.0);
    const flatTariffLow = new Array(48).fill(2.0);
    const schedHigh = Engine.runOptimizedScheduler(Engine.DEFAULT_FLEET.slice(0, 3), Engine.DEFAULT_CONFIG, flatTariffHigh);
    const schedLow = Engine.runOptimizedScheduler(Engine.DEFAULT_FLEET.slice(0, 3), Engine.DEFAULT_CONFIG, flatTariffLow);
    const metHigh = Engine.computeMetrics(schedHigh, Engine.DEFAULT_FLEET.slice(0, 3), Engine.DEFAULT_CONFIG, flatTariffHigh);
    const metLow = Engine.computeMetrics(schedLow, Engine.DEFAULT_FLEET.slice(0, 3), Engine.DEFAULT_CONFIG, flatTariffLow);
    assert(metHigh.totalElectricityCostInr > metLow.totalElectricityCostInr * 4, 'High tariff schedule cost should be ~5x low tariff');
  });

  // Test 21: Full Default Fleet Schedule Validation
  runTest('21. Full 8-vehicle default fleet generates 100% physically valid schedule', () => {
    const sched = Engine.runOptimizedScheduler(Engine.DEFAULT_FLEET, Engine.DEFAULT_CONFIG);
    assert(sched.length > 0, 'Schedule must not be empty');
    const val = Engine.validateSchedule(sched, Engine.DEFAULT_FLEET, Engine.DEFAULT_CONFIG);
    assert(val.isValid, `Default fleet schedule had violations: ${val.violations.join('; ')}`);
    const metrics = Engine.computeMetrics(sched, Engine.DEFAULT_FLEET, Engine.DEFAULT_CONFIG);
    assert(metrics.completedVehiclesCount >= 7, `Expected at least 7 of 8 completed, got ${metrics.completedVehiclesCount}`);
  });

  // Test 22: Smart Decision Explanation Generation
  runTest('22. Smart Charging Decision generator produces explainable rationale & risk tags', () => {
    const v = { id: 'TEST-EV', name: 'Delivery Van', batteryCapacity: 60, currentSoc: 20, targetSoc: 85, maxPower: 22, departureSlot: 40, priority: 'Normal' };
    const sched = Engine.runOptimizedScheduler([v], Engine.DEFAULT_CONFIG);
    const decision = Engine.analyzeVehicleDecision(v, sched, Engine.DEFAULT_CONFIG, Engine.getDefaultTariffs());
    assert(typeof decision === 'object' && decision !== null, 'Decision should be an object');
    assert(typeof decision.headline === 'string' && decision.headline.length > 5, 'Headline rationale must exist');
    assert(typeof decision.urgencyRationale === 'string', 'Urgency rationale must exist');
    assert(typeof decision.tariffEconomics === 'string', 'Tariff economics must exist');
    assert(['Safe', 'Moderate', 'Critical', 'Infeasible'].includes(decision.riskScore), 'Risk score must be recognized category');
  });

  // Test 23: SDG Impact Metric Quantitative Calculations
  runTest('23. SDG impact calculations correctly evaluate avoided peak energy and clean transit km', () => {
    const sched = Engine.runOptimizedScheduler(Engine.DEFAULT_FLEET, Engine.DEFAULT_CONFIG);
    const baseSched = Engine.runBaselineScheduler(Engine.DEFAULT_FLEET, Engine.DEFAULT_CONFIG);
    const optMetrics = Engine.computeMetrics(sched, Engine.DEFAULT_FLEET, Engine.DEFAULT_CONFIG);
    const baseMetrics = Engine.computeMetrics(baseSched, Engine.DEFAULT_FLEET, Engine.DEFAULT_CONFIG);
    const comp = Engine.compareSchedules(baseMetrics, optMetrics);
    
    assert(comp.sdgImpact, 'sdgImpact object must be present in comparison');
    assert(typeof comp.sdgImpact.avoidedPeakGridEnergyKwh === 'number', 'Avoided peak grid energy must be numeric');
    assert(comp.sdgImpact.avoidedPeakGridEnergyKwh >= 0, 'Avoided peak energy should be non-negative');
    assert(typeof comp.sdgImpact.cleanTransitKm === 'number', 'Clean transit km must be numeric');
    assert(comp.sdgImpact.cleanTransitKm > 0, 'Clean transit km should be positive for non-empty fleet');
  });

  // Test 24: What-If 50% Grid Curtailment Physical Validation
  runTest('24. What-If 50% grid curtailment respects halved site connection limit', () => {
    const curtailedConfig = Object.assign({}, Engine.DEFAULT_CONFIG, { sitePowerLimit: 30.0 });
    const sched = Engine.runOptimizedScheduler(Engine.DEFAULT_FLEET, curtailedConfig);
    const val = Engine.validateSchedule(sched, Engine.DEFAULT_FLEET, curtailedConfig);
    assert(val.isValid, `Curtailment schedule must remain 100% valid: ${val.violations.join('; ')}`);
    const metrics = Engine.computeMetrics(sched, Engine.DEFAULT_FLEET, curtailedConfig);
    assert(metrics.peakDemandKw <= 30.001, `Peak demand ${metrics.peakDemandKw} kW exceeded 30 kW limit`);
  });

  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;

  if (isNode) {
    console.log(`\n==============================================`);
    console.log(`Test Execution Summary: ${passedCount} Passed, ${failedCount} Failed (Total ${testResults.length})`);
    console.log(`==============================================\n`);
  }

  // Export results for browser test runner
  if (!isNode) {
    window.VoltWiseTestResults = {
      results: testResults,
      passedCount,
      failedCount,
      totalCount: testResults.length
    };
  }
})();
