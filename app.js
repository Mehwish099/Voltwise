/**
 * VoltWise - Application Controller & Interactive UI Logic
 * Modern, Clean, Fully Interactive EV Fleet Energy Platform
 * Includes: EV Command Centre, 48-Slot Timeline Simulator, Smart Decision Explanations,
 * What-If Emergency Simulator, and SDG Impact Dashboard.
 */

(function () {
  'use strict';

  // --- Global Application State ---
  const state = {
    fleet: [],
    siteConfig: JSON.parse(JSON.stringify(VoltWiseEngine.DEFAULT_CONFIG)),
    tariffs: VoltWiseEngine.getDefaultTariffs(),
    activeSchedule: [],
    baselineSchedule: [],
    optimizedMetrics: null,
    baselineMetrics: null,
    comparison: null,
    currentScenarioName: 'Live Operational Mode',
    previousMetrics: null,
    charts: {},
    chartJsAvailable: typeof Chart !== 'undefined',
    heatmapSettings: {
      mode: 'vehicles',       // 'vehicles' or 'chargers'
      vehicleFilter: 'all',
      chargerFilter: 'all',
      activityFilter: 'all',   // 'all', 'charging', 'idle'
      timeWindow: 'all',       // 'all', 'peak', 'offpeak', 'morning'
      resolution: 1            // 1 = 15m, 2 = 30m, 4 = 1h
    },
    timeline: {
      currentSlot: 0,
      isPlaying: false,
      timer: null,
      speedMs: 800
    }
  };

  // --- DOM Elements Cache ---
  const el = {};

  function cacheDom() {
    el.navItems = document.querySelectorAll('.nav-item');
    el.views = document.querySelectorAll('.page-view');
    el.toastContainer = document.getElementById('toastContainer');
    el.liveBadge = document.getElementById('liveBadge');
    
    // Command Ribbon Elements
    el.ribbonActiveFleet = document.getElementById('ribbonActiveFleet');
    el.ribbonReadiness = document.getElementById('ribbonReadiness');
    el.ribbonSiteLoad = document.getElementById('ribbonSiteLoad');
    el.ribbonAvoidedPeak = document.getElementById('ribbonAvoidedPeak');

    // KPI Cards
    el.kpiFleetSize = document.getElementById('kpiFleetSize');
    el.kpiReqEnergy = document.getElementById('kpiReqEnergy');
    el.kpiGridEnergy = document.getElementById('kpiGridEnergy');
    el.kpiCost = document.getElementById('kpiCost');
    el.kpiPeakDemand = document.getElementById('kpiPeakDemand');
    el.kpiCompleted = document.getElementById('kpiCompleted');
    el.kpiSavings = document.getElementById('kpiSavings');
    el.alertsList = document.getElementById('alertsList');

    // Dashboard & Fleet Sections
    el.dashboardContent = document.getElementById('dashboardContent');
    el.dashboardEmptyState = document.getElementById('dashboardEmptyState');
    el.fleetTableBody = document.getElementById('fleetTableBody');
    el.fleetEmptyState = document.getElementById('fleetEmptyState');
    el.fleetTableCard = document.getElementById('fleetTableCard');

    // Heatmap Elements
    el.heatmapContainer = document.getElementById('heatmapContainer');
    el.heatmapTable = document.getElementById('heatmapTable');
    el.heatmapTableFull = document.getElementById('heatmapTableFull');
    el.heatmapTooltip = document.getElementById('heatmapTooltip');
    el.heatmapModeSelect = document.getElementById('heatmapModeSelect');
    el.heatmapVehicleFilter = document.getElementById('heatmapVehicleFilter');
    el.heatmapChargerFilter = document.getElementById('heatmapChargerFilter');
    el.heatmapActivityFilter = document.getElementById('heatmapActivityFilter');
    el.heatmapTimeWindow = document.getElementById('heatmapTimeWindow');
    el.heatmapEmptyState = document.getElementById('heatmapEmptyState');
    el.heatmapWrapper = document.getElementById('heatmapWrapper');

    // Timeline Simulator Elements
    el.timelineScrubber = document.getElementById('timelineScrubber');
    el.timelineClockDisplay = document.getElementById('timelineClockDisplay');
    el.timelineSlotLabel = document.getElementById('timelineSlotLabel');
    el.timelineTariffDisplay = document.getElementById('timelineTariffDisplay');
    el.timelinePlayBtn = document.getElementById('timelinePlayBtn');
    el.timelineLoadBar = document.getElementById('timelineLoadBar');
    el.timelineLoadText = document.getElementById('timelineLoadText');
    el.timelineBaysGrid = document.getElementById('timelineBaysGrid');

    // Schedule Table
    el.scheduleTableBody = document.getElementById('scheduleTableBody');
    el.scheduleFilter = document.getElementById('scheduleFilter');
    el.scheduleAuditBadge = document.getElementById('scheduleAuditBadge');
    el.scheduleEmptyState = document.getElementById('scheduleEmptyState');
    el.scheduleTableCard = document.getElementById('scheduleTableCard');

    // Modals
    el.vehicleModal = document.getElementById('vehicleModal');
    el.vehicleForm = document.getElementById('vehicleForm');
    el.modalTitle = document.getElementById('modalTitle');
    el.vId = document.getElementById('vId');
    el.vName = document.getElementById('vName');
    el.vCapacity = document.getElementById('vCapacity');
    el.vCurrentSoc = document.getElementById('vCurrentSoc');
    el.vTargetSoc = document.getElementById('vTargetSoc');
    el.vMaxPower = document.getElementById('vMaxPower');
    el.vDepartureTime = document.getElementById('vDepartureTime');
    el.vPriority = document.getElementById('vPriority');

    // Charger Modal
    el.chargerModal = document.getElementById('chargerModal');
    el.chargerForm = document.getElementById('chargerForm');
    el.chargerModalTitle = document.getElementById('chargerModalTitle');
    el.chId = document.getElementById('chId');
    el.chName = document.getElementById('chName');
    el.chPower = document.getElementById('chPower');
    el.chAvailable = document.getElementById('chAvailable');
    el.chargersListContainer = document.getElementById('chargersListContainer');

    // Decision Modal Elements
    el.decisionModal = document.getElementById('decisionModal');
    el.decisionModalTitle = document.getElementById('decisionModalTitle');
    el.decisionRiskBadge = document.getElementById('decisionRiskBadge');
    el.decisionHeadline = document.getElementById('decisionHeadline');
    el.decisionUrgency = document.getElementById('decisionUrgency');
    el.decisionEconomics = document.getElementById('decisionEconomics');
    el.decisionHardware = document.getElementById('decisionHardware');
    el.decisionSlotsList = document.getElementById('decisionSlotsList');

    // Emergency Simulator
    el.emergencyDeltaContainer = document.getElementById('emergencyDeltaContainer');

    // Tariff Modal & Inputs
    el.tariffPeakInput = document.getElementById('tariffPeakInput');
    el.tariffShoulderInput = document.getElementById('tariffShoulderInput');
    el.tariffOffPeakInput = document.getElementById('tariffOffPeakInput');
    el.tariffMorningInput = document.getElementById('tariffMorningInput');
  }

  // --- Initialisation ---
  function init() {
    cacheDom();
    loadFromLocalStorage();
    setupNavigation();
    setupEventListeners();
    recalculateAll();
  }

  // --- Core Recalculation Engine ---
  function recalculateAll() {
    if (state.fleet.length > 0) {
      state.activeSchedule = VoltWiseEngine.runOptimizedScheduler(state.fleet, state.siteConfig, state.tariffs);
      state.optimizedMetrics = VoltWiseEngine.computeMetrics(state.activeSchedule, state.fleet, state.siteConfig, state.tariffs);

      state.baselineSchedule = VoltWiseEngine.runBaselineScheduler(state.fleet, state.siteConfig, state.tariffs);
      state.baselineMetrics = VoltWiseEngine.computeMetrics(state.baselineSchedule, state.fleet, state.siteConfig, state.tariffs);

      state.comparison = VoltWiseEngine.compareSchedules(state.baselineMetrics, state.optimizedMetrics);
    } else {
      state.activeSchedule = [];
      state.baselineSchedule = [];
      state.optimizedMetrics = null;
      state.baselineMetrics = null;
      state.comparison = null;
    }

    renderHeaderStatus();
    renderCommandRibbon();
    renderDashboard();
    renderTimeline();
    renderFleetTable();
    renderChargersList();
    renderHeatmap();
    renderScheduleTable();
    renderReports();
    renderAuditBadge();
    saveToLocalStorage();
  }

  // --- Header Status Badge ---
  function renderHeaderStatus() {
    if (!el.liveBadge) return;
    if (state.fleet.length > 0) {
      el.liveBadge.className = 'live-badge';
      el.liveBadge.innerHTML = `<span class="live-pulse"></span> LIVE FLEET: ${state.fleet.length} VEHICLES ACTIVE`;
    } else {
      el.liveBadge.className = 'live-badge empty-state';
      el.liveBadge.innerHTML = `<span>○</span> EMPTY DEPOT — AWAITING USER INPUT`;
    }
  }

  // --- Command Centre Ribbon ---
  function renderCommandRibbon() {
    if (!el.ribbonActiveFleet) return;
    if (state.fleet.length === 0 || !state.optimizedMetrics) {
      el.ribbonActiveFleet.textContent = '0 EVs Connected';
      el.ribbonReadiness.textContent = '--%';
      el.ribbonSiteLoad.textContent = `0.0 / ${state.siteConfig.sitePowerLimit} kW (0%)`;
      el.ribbonAvoidedPeak.textContent = '0.0 kWh';
      return;
    }

    const opt = state.optimizedMetrics;
    const comp = state.comparison;

    el.ribbonActiveFleet.textContent = `${opt.fleetSize} Commercial EVs`;
    el.ribbonReadiness.textContent = `${opt.completionRatePct}% Targets Met`;
    
    const peakPct = Math.round((opt.peakDemandKw / state.siteConfig.sitePowerLimit) * 100);
    el.ribbonSiteLoad.textContent = `${opt.peakDemandKw} / ${state.siteConfig.sitePowerLimit} kW (${peakPct}%)`;

    const avoidedKwh = comp?.sdgImpact?.avoidedPeakGridEnergyKwh || 0;
    el.ribbonAvoidedPeak.textContent = `${avoidedKwh} kWh Shifted`;
  }

  // --- Dashboard Rendering ---
  function renderDashboard() {
    const hasData = state.fleet.length > 0 && state.optimizedMetrics;

    if (!hasData) {
      if (el.dashboardContent) el.dashboardContent.style.display = 'none';
      if (el.dashboardEmptyState) el.dashboardEmptyState.style.display = 'flex';

      el.kpiFleetSize.textContent = '0 Vehicles';
      el.kpiReqEnergy.textContent = '0.0 kWh';
      el.kpiGridEnergy.textContent = '0.0 kWh';
      el.kpiCost.textContent = '₹0.00';
      el.kpiPeakDemand.textContent = '0.0 kW';
      el.kpiCompleted.textContent = '--';
      el.kpiSavings.textContent = 'Awaiting fleet data';
      if (el.alertsList) el.alertsList.innerHTML = '';
      return;
    }

    if (el.dashboardContent) el.dashboardContent.style.display = 'block';
    if (el.dashboardEmptyState) el.dashboardEmptyState.style.display = 'none';

    const opt = state.optimizedMetrics;
    const comp = state.comparison;

    el.kpiFleetSize.textContent = `${opt.fleetSize} Vehicles`;
    el.kpiReqEnergy.textContent = `${opt.totalBatteryEnergyRequired.toFixed(1)} kWh`;
    el.kpiGridEnergy.textContent = `${opt.totalGridEnergyConsumed.toFixed(1)} kWh`;
    el.kpiCost.textContent = `₹${opt.totalElectricityCostInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    el.kpiPeakDemand.textContent = `${opt.peakDemandKw.toFixed(1)} kW`;
    el.kpiCompleted.textContent = `${opt.completedVehiclesCount} / ${opt.fleetSize}`;

    if (comp && comp.cost.savingsInr >= 0) {
      el.kpiSavings.innerHTML = `<span class="delta-badge delta-positive">Save ₹${comp.cost.savingsInr.toFixed(0)} (${comp.cost.savingsPct}%)</span> vs Baseline`;
    } else if (comp) {
      el.kpiSavings.innerHTML = `<span class="delta-badge delta-negative">+₹${Math.abs(comp.cost.savingsInr).toFixed(0)}</span> vs Baseline`;
    }

    renderSmartAlerts();
    renderCharts();
  }

  // --- Smart Operational Alerts ---
  function renderSmartAlerts() {
    if (!el.alertsList) return;
    if (!state.optimizedMetrics) {
      el.alertsList.innerHTML = '';
      return;
    }

    const alerts = [];
    const opt = state.optimizedMetrics;

    // Check incomplete vehicles
    opt.vehicleResults.forEach(v => {
      if (!v.isCompleted) {
        alerts.push({
          type: 'danger',
          icon: '⚠️',
          text: `<strong>${v.name} (${v.id})</strong> requires ${v.unfulfilledEnergyKwh} kWh more. ${v.statusReason}`
        });
      }
    });

    // Check charger outages
    const offlineChargers = state.siteConfig.chargers.filter(c => c.available === false);
    if (offlineChargers.length > 0) {
      alerts.push({
        type: 'warning',
        icon: '🔧',
        text: `<strong>Capacity Alert:</strong> ${offlineChargers.map(c => c.name).join(', ')} is marked offline. Depot throughput is reduced.`
      });
    }

    // Check site power limit constraint
    const maxChargerTotalPower = state.siteConfig.chargers.filter(c => c.available !== false).reduce((sum, c) => sum + c.ratedPower, 0);
    if (state.siteConfig.sitePowerLimit < maxChargerTotalPower) {
      alerts.push({
        type: 'info',
        icon: '⚡',
        text: `<strong>Active Site Cap:</strong> Depot connection limit is ${state.siteConfig.sitePowerLimit} kW (chargers capable of ${maxChargerTotalPower} kW). Optimiser is actively shaving peaks.`
      });
    }

    // All fulfilled
    if (opt.incompleteVehiclesCount === 0 && opt.fleetSize > 0) {
      alerts.push({
        type: 'success',
        icon: '✅',
        text: `<strong>All Operational Targets Met:</strong> 100% of vehicles are scheduled to achieve their target SOC before departure deadlines!`
      });
    }

    el.alertsList.innerHTML = alerts.map(a => `
      <div class="alert-item alert-${a.type}" style="margin-bottom: 0.5rem;">
        <span style="font-size: 1.15rem;">${a.icon}</span>
        <div>${a.text}</div>
      </div>
    `).join('');
  }

  // --- Visual Charts ---
  function renderCharts() {
    if (!state.chartJsAvailable || !state.optimizedMetrics) return;

    renderDemandChart();
    renderTariffChart();
  }

  function renderDemandChart() {
    const canvas = document.getElementById('demandChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = [];
    for (let t = 0; t < state.siteConfig.totalSlots; t++) {
      labels.push(VoltWiseEngine.slotToTime(t, state.siteConfig.planningStartHour, state.siteConfig.slotMinutes));
    }

    if (state.charts.demand) {
      state.charts.demand.destroy();
    }

    state.charts.demand = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Baseline Uncoordinated Demand (kW)',
            data: state.baselineMetrics ? state.baselineMetrics.powerPerSlot : [],
            borderColor: '#94a3b8',
            backgroundColor: 'rgba(148, 163, 184, 0.1)',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            fill: true
          },
          {
            label: 'VoltWise Optimised Demand (kW)',
            data: state.optimizedMetrics ? state.optimizedMetrics.powerPerSlot : [],
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.25)',
            borderWidth: 2.5,
            pointRadius: 0,
            fill: true
          },
          {
            label: `Site Limit (${state.siteConfig.sitePowerLimit} kW)`,
            data: new Array(state.siteConfig.totalSlots).fill(state.siteConfig.sitePowerLimit),
            borderColor: '#ef4444',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Site Power Demand (kW)' }
          },
          x: {
            title: { display: true, text: 'Time Slot' },
            ticks: { maxTicksLimit: 12 }
          }
        }
      }
    });
  }

  function renderTariffChart() {
    const canvas = document.getElementById('tariffChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = [];
    for (let t = 0; t < state.siteConfig.totalSlots; t++) {
      labels.push(VoltWiseEngine.slotToTime(t, state.siteConfig.planningStartHour, state.siteConfig.slotMinutes));
    }

    if (state.charts.tariff) {
      state.charts.tariff.destroy();
    }

    state.charts.tariff = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Electricity Tariff (₹/kWh)',
            data: state.tariffs,
            backgroundColor: state.tariffs.map(val => val >= 8.0 ? 'rgba(239, 68, 68, 0.7)' : (val <= 4.0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(245, 158, 11, 0.7)')),
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Rate (₹/kWh)' }
          },
          x: {
            title: { display: true, text: 'Time of Day' },
            ticks: { maxTicksLimit: 12 }
          }
        }
      }
    });
  }

  // ==========================================================================
  // REAL-TIME CHARGING TIMELINE SIMULATOR
  // ==========================================================================
  function renderTimeline() {
    if (!el.timelineScrubber || state.fleet.length === 0 || !state.activeSchedule) return;

    const t = state.timeline.currentSlot;
    const timeStr = VoltWiseEngine.slotToTime(t, state.siteConfig.planningStartHour, state.siteConfig.slotMinutes);
    const tariff = state.tariffs[t] || 0;

    // Update scrubber and clock displays
    el.timelineScrubber.value = t;
    if (el.timelineClockDisplay) el.timelineClockDisplay.textContent = timeStr;
    if (el.timelineSlotLabel) el.timelineSlotLabel.textContent = `Slot ${t + 1} of 48`;
    if (el.timelineTariffDisplay) {
      const tariffTag = tariff >= 8 ? '🔴 Peak' : (tariff <= 4 ? '🟢 Off-Peak' : '🟡 Shoulder');
      el.timelineTariffDisplay.innerHTML = `Tariff: <strong>₹${tariff.toFixed(2)}/kWh</strong> (${tariffTag})`;
    }

    // Active allocations in current slot
    const activeInSlot = state.activeSchedule.filter(s => s.slot === t);
    const totalPowerInSlot = activeInSlot.reduce((sum, s) => sum + s.powerKw, 0);

    // Update Depot Load Bar
    if (el.timelineLoadBar) {
      const loadPct = Math.min(100, (totalPowerInSlot / state.siteConfig.sitePowerLimit) * 100);
      el.timelineLoadBar.style.width = `${loadPct}%`;
      if (el.timelineLoadText) {
        el.timelineLoadText.textContent = `${totalPowerInSlot.toFixed(1)} kW / ${state.siteConfig.sitePowerLimit} kW (${loadPct.toFixed(0)}% grid cap)`;
      }
    }

    // Render Live Bay Cards
    if (el.timelineBaysGrid) {
      el.timelineBaysGrid.innerHTML = state.siteConfig.chargers.map(ch => {
        const isOffline = ch.available === false;
        const alloc = activeInSlot.find(s => s.chargerId === ch.id);

        if (isOffline) {
          return `
            <div class="bay-card bay-outage">
              <div class="bay-header">
                <span class="bay-name">${ch.name}</span>
                <span class="badge-tag badge-high">Outage</span>
              </div>
              <div style="font-size: 0.8rem; color: #b91c1c; padding: 0.5rem 0;">
                Hardware maintenance or inverter offline.
              </div>
            </div>
          `;
        }

        if (alloc) {
          // Calculate SOC at slot t
          const v = state.fleet.find(item => item.id === alloc.vehicleId);
          const energyDeliveredUpToSlot = state.activeSchedule
            .filter(s => s.vehicleId === alloc.vehicleId && s.slot <= t)
            .reduce((sum, s) => sum + s.batteryEnergyKwh, 0);
          const currentLiveSoc = v && v.batteryCapacity > 0
            ? Math.min(100, v.currentSoc + (energyDeliveredUpToSlot / v.batteryCapacity) * 100)
            : 0;

          return `
            <div class="bay-card bay-active">
              <div class="bay-header">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span class="bay-pulse"></span>
                  <span class="bay-name">${ch.name}</span>
                </div>
                <span class="badge-tag badge-normal">Charging</span>
              </div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #0284c7; margin-bottom: 0.35rem;">
                ${alloc.vehicleId} • ${alloc.vehicleName}
              </div>
              <div class="bay-metric">
                <span>Power Draw:</span>
                <strong>${alloc.powerKw} kW</strong>
              </div>
              <div class="bay-metric">
                <span>Current SOC:</span>
                <strong>${currentLiveSoc.toFixed(1)}% / target ${v?.targetSoc || 85}%</strong>
              </div>
              <div class="bay-metric">
                <span>Slot Cost:</span>
                <span>₹${alloc.costInr.toFixed(2)}</span>
              </div>
            </div>
          `;
        }

        return `
          <div class="bay-card">
            <div class="bay-header">
              <span class="bay-name">${ch.name}</span>
              <span class="badge-tag badge-low">Idle</span>
            </div>
            <div style="font-size: 0.82rem; color: var(--text-muted); padding: 0.5rem 0;">
              Standing by. Awaiting low-tariff window or queue dispatch.
            </div>
          </div>
        `;
      }).join('');
    }
  }

  function setTimelineSlot(slot) {
    state.timeline.currentSlot = Math.max(0, Math.min(47, parseInt(slot, 10)));
    renderTimeline();
  }

  function stepTimeline(delta) {
    const next = state.timeline.currentSlot + delta;
    if (next >= 48) state.timeline.currentSlot = 0;
    else if (next < 0) state.timeline.currentSlot = 47;
    else state.timeline.currentSlot = next;
    renderTimeline();
  }

  function togglePlayTimeline() {
    state.timeline.isPlaying = !state.timeline.isPlaying;

    if (state.timeline.isPlaying) {
      if (el.timelinePlayBtn) el.timelinePlayBtn.textContent = '⏸ Pause';
      state.timeline.timer = setInterval(() => {
        state.timeline.currentSlot = (state.timeline.currentSlot + 1) % 48;
        renderTimeline();
      }, state.timeline.speedMs);
    } else {
      if (el.timelinePlayBtn) el.timelinePlayBtn.textContent = '▶ Play Simulation';
      if (state.timeline.timer) {
        clearInterval(state.timeline.timer);
        state.timeline.timer = null;
      }
    }
  }

  function setTimelineSpeed(ms) {
    state.timeline.speedMs = ms;
    if (state.timeline.isPlaying) {
      clearInterval(state.timeline.timer);
      state.timeline.timer = setInterval(() => {
        state.timeline.currentSlot = (state.timeline.currentSlot + 1) % 48;
        renderTimeline();
      }, state.timeline.speedMs);
    }
    showToast(`Simulation speed adjusted`, 'info');
  }

  // ==========================================================================
  // HEATMAP COMPONENT
  // ==========================================================================
  function renderHeatmap() {
    if (!el.heatmapTable) return;

    const hasData = state.fleet.length > 0 && state.activeSchedule.length > 0;
    if (!hasData) {
      if (el.heatmapEmptyState) el.heatmapEmptyState.style.display = 'flex';
      if (el.heatmapWrapper) el.heatmapWrapper.style.display = 'none';
      return;
    }

    if (el.heatmapEmptyState) el.heatmapEmptyState.style.display = 'none';
    if (el.heatmapWrapper) el.heatmapWrapper.style.display = 'block';

    const settings = state.heatmapSettings;
    const totalSlots = state.siteConfig.totalSlots;

    let startSlot = 0;
    let endSlot = totalSlots - 1;
    if (settings.timeWindow === 'peak') {
      startSlot = 0; endSlot = 11;
    } else if (settings.timeWindow === 'offpeak') {
      startSlot = 12; endSlot = 39;
    } else if (settings.timeWindow === 'morning') {
      startSlot = 40; endSlot = 47;
    }

    let rows = [];
    if (settings.mode === 'vehicles') {
      rows = state.fleet.slice();
      if (settings.vehicleFilter !== 'all') {
        rows = rows.filter(v => v.id === settings.vehicleFilter);
      }
    } else {
      rows = state.siteConfig.chargers.slice();
      if (settings.chargerFilter !== 'all') {
        rows = rows.filter(c => c.id === settings.chargerFilter);
      }
    }

    let theadHtml = '<thead><tr><th class="row-header">Entity / Interval</th>';
    for (let t = startSlot; t <= endSlot; t += settings.resolution) {
      const timeStr = VoltWiseEngine.slotToTime(t, state.siteConfig.planningStartHour, state.siteConfig.slotMinutes);
      const tariff = state.tariffs[t];
      const tariffBadge = tariff >= 8 ? '🔴' : (tariff <= 4 ? '🟢' : '🟡');
      theadHtml += `<th title="Slot ${t}: ${timeStr} | Tariff: ₹${tariff.toFixed(2)}/kWh">${timeStr}<br><span style="font-size: 0.65rem;">${tariffBadge}</span></th>`;
    }
    theadHtml += '</tr></thead>';

    let tbodyHtml = '<tbody>';
    rows.forEach(entity => {
      const isVehicleMode = settings.mode === 'vehicles';
      const entityId = entity.id;
      const entityName = entity.name;

      tbodyHtml += `<tr><td class="row-header" title="${entityName}"><strong>${entityId}</strong><br><small style="color: var(--text-muted); font-size: 0.72rem;">${entityName}</small></td>`;

      for (let t = startSlot; t <= endSlot; t += settings.resolution) {
        let alloc = null;
        if (isVehicleMode) {
          alloc = state.activeSchedule.find(s => s.slot === t && s.vehicleId === entityId);
        } else {
          alloc = state.activeSchedule.find(s => s.slot === t && s.chargerId === entityId);
        }

        const power = alloc ? alloc.powerKw : 0;
        const isCharging = power > 0;

        if (settings.activityFilter === 'charging' && !isCharging) {
          tbodyHtml += `<td class="heatmap-cell cell-idle" style="opacity: 0.25;"></td>`;
          continue;
        }
        if (settings.activityFilter === 'idle' && isCharging) {
          tbodyHtml += `<td class="heatmap-cell cell-idle" style="opacity: 0.25;"></td>`;
          continue;
        }

        let cellClass = 'cell-idle';
        if (power > 0 && power <= 7.4) cellClass = 'cell-low';
        else if (power > 7.4 && power <= 15) cellClass = 'cell-medium';
        else if (power > 15 && power <= 22) cellClass = 'cell-high';
        else if (power > 22) cellClass = 'cell-extreme';

        let extraClasses = '';
        if (isVehicleMode) {
          if (t === entity.departureSlot) extraClasses += ' cell-departure';
          if (alloc && alloc.remainingDeficitKwh <= 0.05) extraClasses += ' cell-complete';
        }

        const cellData = alloc ? JSON.stringify({
          slot: t,
          time: alloc.timeLabel,
          vId: alloc.vehicleId,
          vName: alloc.vehicleName,
          chId: alloc.chargerId,
          chName: alloc.chargerName,
          power: alloc.powerKw,
          gridKwh: alloc.gridEnergyKwh,
          battKwh: alloc.batteryEnergyKwh,
          tariff: alloc.tariffInrPerKwh,
          cost: alloc.costInr,
          deficit: alloc.remainingDeficitKwh
        }).replace(/"/g, '&quot;') : '';

        const displayText = power > 0 ? `${Math.round(power)}` : '';
        tbodyHtml += `<td class="heatmap-cell ${cellClass} ${extraClasses}" data-slot="${t}" data-alloc="${cellData}">${displayText}</td>`;
      }
      tbodyHtml += '</tr>';
    });
    tbodyHtml += '</tbody>';

    if (el.heatmapTable) el.heatmapTable.innerHTML = theadHtml + tbodyHtml;
    if (el.heatmapTableFull) el.heatmapTableFull.innerHTML = theadHtml + tbodyHtml;

    setupHeatmapTooltips();
    updateHeatmapFilterDropdowns();
  }

  function setupHeatmapTooltips() {
    const cells = document.querySelectorAll('.heatmap-cell');
    cells.forEach(cell => {
      cell.addEventListener('mouseenter', (e) => {
        const raw = cell.getAttribute('data-alloc');
        if (!raw) return;
        const d = JSON.parse(raw);
        el.heatmapTooltip.innerHTML = `
          <div style="font-weight: 800; color: #38bdf8; font-size: 0.85rem; margin-bottom: 0.35rem;">
            Slot ${d.slot} • ${d.time}
          </div>
          <div><strong>Vehicle:</strong> ${d.vId} (${d.vName})</div>
          <div><strong>Charger:</strong> ${d.chName}</div>
          <div style="margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px solid #334155;">
            <div>⚡ <strong>Power:</strong> ${d.power} kW</div>
            <div>🔋 <strong>Delivered:</strong> ${d.battKwh} kWh</div>
            <div>💰 <strong>Cost:</strong> ₹${d.cost} (at ₹${d.tariff}/kWh)</div>
            <div>🎯 <strong>Remaining Deficit:</strong> ${d.deficit} kWh</div>
          </div>
        `;
        el.heatmapTooltip.style.display = 'block';
      });

      cell.addEventListener('mousemove', (e) => {
        el.heatmapTooltip.style.left = `${e.clientX + 14}px`;
        el.heatmapTooltip.style.top = `${e.clientY + 14}px`;
      });

      cell.addEventListener('mouseleave', () => {
        el.heatmapTooltip.style.display = 'none';
      });
    });
  }

  function updateHeatmapFilterDropdowns() {
    if (el.heatmapVehicleFilter && el.heatmapVehicleFilter.options.length <= 1) {
      state.fleet.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.id} - ${v.name}`;
        el.heatmapVehicleFilter.appendChild(opt);
      });
    }

    if (el.heatmapChargerFilter && el.heatmapChargerFilter.options.length <= 1) {
      state.siteConfig.chargers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.id} - ${c.name}`;
        el.heatmapChargerFilter.appendChild(opt);
      });
    }
  }

  // --- Fleet Manager Rendering with Risk Indicators & Decision Inspector ---
  function renderFleetTable() {
    if (!el.fleetTableBody) return;

    const hasFleet = state.fleet.length > 0;
    if (!hasFleet) {
      if (el.fleetTableCard) el.fleetTableCard.style.display = 'none';
      if (el.fleetEmptyState) el.fleetEmptyState.style.display = 'flex';
      return;
    }

    if (el.fleetTableCard) el.fleetTableCard.style.display = 'block';
    if (el.fleetEmptyState) el.fleetEmptyState.style.display = 'none';

    el.fleetTableBody.innerHTML = state.fleet.map(v => {
      const req = VoltWiseEngine.calculateRequiredBatteryEnergy(v);
      const depTime = VoltWiseEngine.slotToTime(v.departureSlot, state.siteConfig.planningStartHour, state.siteConfig.slotMinutes);
      const res = state.optimizedMetrics?.vehicleResults?.find(r => r.id === v.id);
      const isComplete = res ? res.isCompleted : true;
      const priorityClass = v.priority === 'High' ? 'badge-high' : (v.priority === 'Low' ? 'badge-low' : 'badge-normal');

      // Risk level chip
      let riskChip = '<span class="risk-chip risk-safe">🟢 Safe</span>';
      if (res?.riskScore === 'Infeasible') riskChip = '<span class="risk-chip risk-infeasible">🚨 Infeasible</span>';
      else if (res?.riskScore === 'Critical') riskChip = '<span class="risk-chip risk-critical">🔴 Critical</span>';
      else if (res?.riskScore === 'Moderate') riskChip = '<span class="risk-chip risk-moderate">🟡 Moderate</span>';

      return `
        <tr>
          <td><strong>${v.id}</strong></td>
          <td>${v.name}</td>
          <td>${v.batteryCapacity} kWh</td>
          <td>
            <div class="soc-bar-container">
              <span>${v.currentSoc}%</span>
              <div class="soc-bar-track">
                <div class="soc-bar-fill" style="width: ${v.currentSoc}%;"></div>
                <div class="soc-bar-target" style="left: ${v.targetSoc}%;" title="Target: ${v.targetSoc}%"></div>
              </div>
              <span>🎯 ${v.targetSoc}%</span>
            </div>
          </td>
          <td><strong>${req.toFixed(1)} kWh</strong></td>
          <td>${v.maxPower} kW</td>
          <td>${depTime} <small style="color: var(--text-muted);">(Slot ${v.departureSlot})</small></td>
          <td><span class="badge-tag ${priorityClass}">${v.priority || 'Normal'}</span></td>
          <td>${riskChip}</td>
          <td>
            ${isComplete 
              ? `<span class="status-complete">✓ On Track</span>` 
              : `<span class="status-incomplete" title="${res?.statusReason || ''}">⚠️ Shortfall</span>`}
          </td>
          <td>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" onclick="VoltWiseApp.openDecisionModal('${v.id}')" title="Inspect Smart Scheduling Decision">💡 Decision</button>
              <button class="btn btn-secondary btn-sm" onclick="VoltWiseApp.editVehicle('${v.id}')">Edit</button>
              <button class="btn btn-secondary btn-sm" onclick="VoltWiseApp.cloneVehicle('${v.id}')" title="Duplicate Vehicle">Clone</button>
              <button class="btn btn-danger btn-sm" onclick="VoltWiseApp.deleteVehicle('${v.id}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- Smart Charging Decision Inspector Modal ---
  function openDecisionModal(vehicleId) {
    const vResult = state.optimizedMetrics?.vehicleResults?.find(r => r.id === vehicleId);
    if (!vResult || !vResult.decision) {
      alert('Decision rationale is not available for this vehicle.');
      return;
    }
    const d = vResult.decision;

    if (el.decisionModalTitle) el.decisionModalTitle.textContent = `Smart Decision Trail: ${vResult.id} (${vResult.name})`;
    
    if (el.decisionRiskBadge) {
      el.decisionRiskBadge.className = `risk-chip ${d.riskScore === 'Safe' ? 'risk-safe' : (d.riskScore === 'Moderate' ? 'risk-moderate' : 'risk-critical')}`;
      el.decisionRiskBadge.textContent = d.riskLabel;
    }

    if (el.decisionHeadline) el.decisionHeadline.textContent = d.headline;
    if (el.decisionUrgency) el.decisionUrgency.textContent = d.urgencyRationale;
    if (el.decisionEconomics) el.decisionEconomics.textContent = d.tariffEconomics;
    if (el.decisionHardware) el.decisionHardware.textContent = d.siteImpact;

    if (el.decisionSlotsList) {
      const slots = state.activeSchedule.filter(s => s.vehicleId === vehicleId);
      if (slots.length === 0) {
        el.decisionSlotsList.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No charging slots required or allocated.</span>';
      } else {
        el.decisionSlotsList.innerHTML = slots.map(s => `
          <span class="badge-tag badge-normal" style="margin: 0.15rem; font-size: 0.75rem;" title="Bay: ${s.chargerName} | Grid: ${s.gridEnergyKwh} kWh | Tariff: ₹${s.tariffInrPerKwh}">
            Slot ${s.slot} (${s.timeLabel}) • ${s.powerKw} kW • ₹${s.tariffInrPerKwh}/kWh • ${s.decisionTag || 'Charging'}
          </span>
        `).join(' ');
      }
    }

    if (el.decisionModal) el.decisionModal.classList.add('active');
  }

  // --- What-If Emergency Simulator ---
  function triggerEmergency(emergencyType) {
    state.previousMetrics = state.optimizedMetrics ? JSON.parse(JSON.stringify(state.optimizedMetrics)) : null;

    switch (emergencyType) {
      case 'curtailment':
        state.currentScenarioName = '🚨 EMERGENCY: 50% Grid Capacity Curtailment (30 kW)';
        state.siteConfig.sitePowerLimit = 30.0;
        showToast('Emergency Applied: Transformer derated to 30 kW', 'danger');
        break;

      case 'outage':
        state.currentScenarioName = '🚨 EMERGENCY: Charger 2 Inverter Hardware Failure';
        if (state.siteConfig.chargers.length > 1) {
          state.siteConfig.chargers[1].available = false;
        }
        showToast('Emergency Applied: Charger 2 marked offline', 'danger');
        break;

      case 'rush':
        state.currentScenarioName = '🚨 EMERGENCY: Morning Rush Deployment (Deadlines -2 Hours)';
        state.fleet.forEach(v => {
          v.departureSlot = Math.max(16, v.departureSlot - 8);
        });
        showToast('Emergency Applied: Departure deadlines pulled forward 2 hours', 'danger');
        break;

      case 'spike':
        state.currentScenarioName = '🚨 EMERGENCY: Grid Crisis Tariff Spike (₹16/kWh)';
        for (let t = 0; t < 12; t++) {
          state.tariffs[t] = 16.0;
        }
        showToast('Emergency Applied: Peak electricity tariff jumped to ₹16.00/kWh', 'warning');
        break;

      case 'surge':
        state.currentScenarioName = '🚨 EMERGENCY: Unplanned Fleet Surge (+3 Delivery Vans)';
        const baseNum = state.fleet.length + 1;
        state.fleet.push({
          id: `SURGE-${baseNum}`,
          name: `Unplanned Cargo Van ${baseNum}`,
          batteryCapacity: 65,
          currentSoc: 20,
          targetSoc: 85,
          maxPower: 22,
          departureSlot: 40,
          priority: 'High'
        });
        showToast('Emergency Applied: Unplanned surge vehicle arrived at depot', 'warning');
        break;
    }

    recalculateAll();
    renderEmergencyDelta();
  }

  function renderEmergencyDelta() {
    if (!el.emergencyDeltaContainer || !state.previousMetrics || !state.optimizedMetrics) return;

    const prev = state.previousMetrics;
    const curr = state.optimizedMetrics;
    const costDiff = curr.totalElectricityCostInr - prev.totalElectricityCostInr;
    const peakDiff = curr.peakDemandKw - prev.peakDemandKw;
    const completionDiff = curr.completedVehiclesCount - prev.completedVehiclesCount;

    el.emergencyDeltaContainer.innerHTML = `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-md); padding: 1.25rem; margin-top: 1rem;">
        <div style="font-weight: 800; color: #991b1b; font-size: 0.95rem; margin-bottom: 0.5rem;">
          ⚠️ Emergency Disruption Impact Analysis
        </div>
        <div class="metric-row">
          <span>Electricity Cost Impact:</span>
          <strong>${costDiff >= 0 ? `+₹${costDiff.toFixed(2)}` : `-₹${Math.abs(costDiff).toFixed(2)}`}</strong>
        </div>
        <div class="metric-row">
          <span>Peak Grid Demand Impact:</span>
          <strong>${peakDiff >= 0 ? `+${peakDiff.toFixed(1)} kW` : `${peakDiff.toFixed(1)} kW`}</strong>
        </div>
        <div class="metric-row">
          <span>Completed Vehicles:</span>
          <strong>${curr.completedVehiclesCount} / ${curr.fleetSize} (${completionDiff >= 0 ? `+${completionDiff}` : `${completionDiff}`} vs prior)</strong>
        </div>
        <div class="metric-row">
          <span>Unfulfilled Battery Energy:</span>
          <strong>${curr.unfulfilledEnergyKwh} kWh remaining</strong>
        </div>
      </div>
    `;
  }

  function applyWhatIfCustom() {
    state.previousMetrics = state.optimizedMetrics ? JSON.parse(JSON.stringify(state.optimizedMetrics)) : null;
    const powerInput = document.getElementById('whatifSitePower');
    const multInput = document.getElementById('whatifTariffMultiplier');
    const power = powerInput ? parseFloat(powerInput.value) : 60;
    const mult = multInput ? parseFloat(multInput.value) : 1.0;

    if (!isNaN(power) && power > 0) state.siteConfig.sitePowerLimit = power;
    if (!isNaN(mult) && mult > 0) {
      state.tariffs = VoltWiseEngine.getDefaultTariffs().map(t => +(t * mult).toFixed(2));
    }
    state.currentScenarioName = `Custom What-If (${power} kW Cap, ${mult}x Tariffs)`;
    showToast(`Applied custom scenario: ${power} kW cap, ${mult}x tariffs`, 'info');
    recalculateAll();
    renderEmergencyDelta();
  }

  function resetWhatIf() {
    state.siteConfig = JSON.parse(JSON.stringify(VoltWiseEngine.DEFAULT_CONFIG));
    state.tariffs = VoltWiseEngine.getDefaultTariffs();
    state.currentScenarioName = 'Live Operational Mode';
    if (el.emergencyDeltaContainer) el.emergencyDeltaContainer.innerHTML = '';
    showToast('Reset scenario to standard live depot settings', 'success');
    recalculateAll();
  }

  // --- Chargers List Rendering ---
  function renderChargersList() {
    if (!el.chargersListContainer) return;

    el.chargersListContainer.innerHTML = state.siteConfig.chargers.map(ch => `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <strong>${ch.name}</strong>
            <span class="badge-tag ${ch.available !== false ? 'badge-normal' : 'badge-high'}">${ch.available !== false ? 'Online' : 'Outage'}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">
            ID: <code>${ch.id}</code> | Rated Power: <strong>${ch.ratedPower} kW</strong>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="VoltWiseApp.toggleChargerOnline('${ch.id}')">
            ${ch.available !== false ? 'Set Outage' : 'Set Online'}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="VoltWiseApp.editCharger('${ch.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="VoltWiseApp.deleteCharger('${ch.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // --- Schedule Table Rendering ---
  function renderScheduleTable() {
    if (!el.scheduleTableBody) return;

    const hasData = state.activeSchedule.length > 0;
    if (!hasData) {
      if (el.scheduleTableCard) el.scheduleTableCard.style.display = 'none';
      if (el.scheduleEmptyState) el.scheduleEmptyState.style.display = 'flex';
      return;
    }

    if (el.scheduleTableCard) el.scheduleTableCard.style.display = 'block';
    if (el.scheduleEmptyState) el.scheduleEmptyState.style.display = 'none';

    const filterVal = el.scheduleFilter ? el.scheduleFilter.value : 'all';
    let filtered = state.activeSchedule;

    if (filterVal && filterVal !== 'all') {
      filtered = state.activeSchedule.filter(s => s.vehicleId === filterVal || s.chargerId === filterVal);
    }

    el.scheduleTableBody.innerHTML = filtered.map(item => `
      <tr>
        <td><strong>Slot ${item.slot}</strong></td>
        <td>${item.timeLabel}</td>
        <td><strong>${item.vehicleId}</strong> - ${item.vehicleName}</td>
        <td><span class="badge-tag badge-normal">${item.chargerName}</span></td>
        <td>${item.powerKw.toFixed(1)} kW</td>
        <td>${item.gridEnergyKwh.toFixed(2)} kWh</td>
        <td>${item.batteryEnergyKwh.toFixed(2)} kWh</td>
        <td>₹${item.tariffInrPerKwh.toFixed(2)}</td>
        <td><strong>₹${item.costInr.toFixed(2)}</strong></td>
        <td><span class="badge-tag badge-low">${item.decisionTag || 'Optimized'}</span></td>
      </tr>
    `).join('');
  }

  // --- Audit Badge ---
  function renderAuditBadge() {
    if (!el.scheduleAuditBadge) return;
    if (state.fleet.length === 0) {
      el.scheduleAuditBadge.innerHTML = '';
      return;
    }
    const val = VoltWiseEngine.validateSchedule(state.activeSchedule, state.fleet, state.siteConfig);
    if (val.isValid) {
      el.scheduleAuditBadge.innerHTML = `<span class="delta-badge delta-positive">✓ Physical Constraints: 100% Valid (0 Violations)</span>`;
    } else {
      el.scheduleAuditBadge.innerHTML = `<span class="delta-badge delta-negative">⚠️ Violation: ${val.violations[0]}</span>`;
    }
  }

  // --- Reports View with Enhanced SDG Impact Dashboard ---
  function renderReports() {
    const rTable = document.getElementById('reportsComparisonTable');
    if (!rTable) return;

    if (state.fleet.length === 0 || !state.optimizedMetrics) {
      rTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">No fleet data available. Add vehicles to generate baseline comparison audit.</td></tr>`;
      return;
    }

    const base = state.baselineMetrics;
    const opt = state.optimizedMetrics;
    const comp = state.comparison;

    rTable.innerHTML = `
      <tr>
        <td><strong>Total Electricity Cost</strong></td>
        <td>₹${base.totalElectricityCostInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td><strong>₹${opt.totalElectricityCostInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
        <td><span class="delta-badge ${comp.cost.savingsInr >= 0 ? 'delta-positive' : 'delta-negative'}">${comp.cost.savingsInr >= 0 ? `Save ₹${comp.cost.savingsInr.toFixed(2)} (${comp.cost.savingsPct}%)` : `+₹${Math.abs(comp.cost.savingsInr).toFixed(2)}`}</span></td>
      </tr>
      <tr>
        <td><strong>Peak Site Demand</strong></td>
        <td>${base.peakDemandKw.toFixed(1)} kW</td>
        <td><strong>${opt.peakDemandKw.toFixed(1)} kW</strong></td>
        <td><span class="delta-badge ${comp.peakDemand.reductionKw >= 0 ? 'delta-positive' : 'delta-neutral'}">${comp.peakDemand.reductionKw >= 0 ? `-${comp.peakDemand.reductionKw.toFixed(1)} kW (${comp.peakDemand.reductionPct}%)` : `+${Math.abs(comp.peakDemand.reductionKw).toFixed(1)} kW`}</span></td>
      </tr>
      <tr>
        <td><strong>Vehicles Completed on Deadline</strong></td>
        <td>${base.completedVehiclesCount} / ${base.fleetSize}</td>
        <td><strong>${opt.completedVehiclesCount} / ${opt.fleetSize}</strong></td>
        <td>${opt.completedVehiclesCount >= base.completedVehiclesCount ? '✓ Targets Met' : '⚠️ Lower throughput'}</td>
      </tr>
      <tr>
        <td><strong>Battery Energy Delivered</strong></td>
        <td>${base.totalBatteryEnergyDelivered.toFixed(1)} kWh</td>
        <td><strong>${opt.totalBatteryEnergyDelivered.toFixed(1)} kWh</strong></td>
        <td>Target: ${base.totalBatteryEnergyRequired.toFixed(1)} kWh</td>
      </tr>
      <tr>
        <td><strong>Unfulfilled Energy Deficit</strong></td>
        <td>${base.unfulfilledEnergyKwh.toFixed(1)} kWh</td>
        <td><strong>${opt.unfulfilledEnergyKwh.toFixed(1)} kWh</strong></td>
        <td>${opt.unfulfilledEnergyKwh === 0 ? '0 kWh (100% Satisfied)' : 'Restricted by limits'}</td>
      </tr>
      <tr>
        <td><strong>Grid Energy Consumed</strong></td>
        <td>${base.totalGridEnergyConsumed.toFixed(1)} kWh</td>
        <td><strong>${opt.totalGridEnergyConsumed.toFixed(1)} kWh</strong></td>
        <td>Efficiency: ${Math.round(state.siteConfig.chargingEfficiency * 100)}%</td>
      </tr>
      <tr>
        <td><strong>Estimated Grid CO₂e Emissions</strong></td>
        <td>${base.estimatedEmissionsKg.toFixed(1)} kg</td>
        <td><strong>${opt.estimatedEmissionsKg.toFixed(1)} kg</strong></td>
        <td>${comp.emissions.deltaKg.toFixed(1)} kg delta</td>
      </tr>
    `;

    // Render SDG Metrics Cards
    const avoidedKwh = comp?.sdgImpact?.avoidedPeakGridEnergyKwh || 0;
    const cleanKm = comp?.sdgImpact?.cleanTransitKm || 0;
    const peakShaveKw = comp?.peakDemand?.reductionKw || 0;

    const sdgAvoidedEl = document.getElementById('sdgAvoidedPeakEnergy');
    const sdgPeakEl = document.getElementById('sdgPeakShaved');
    const sdgCleanKmEl = document.getElementById('sdgCleanKm');
    const sdgCarbonEl = document.getElementById('sdgCarbonDelta');

    if (sdgAvoidedEl) sdgAvoidedEl.textContent = `${avoidedKwh} kWh`;
    if (sdgPeakEl) sdgPeakEl.textContent = `${peakShaveKw} kW (${comp.peakDemand.reductionPct}%)`;
    if (sdgCleanKmEl) sdgCleanKmEl.textContent = `${cleanKm.toLocaleString()} km`;
    if (sdgCarbonEl) sdgCarbonEl.textContent = `${comp.emissions.deltaKg} kg CO₂e`;
  }

  // ==========================================================================
  // VEHICLE CRUD OPERATIONS
  // ==========================================================================
  function openAddVehicleModal() {
    el.modalTitle.textContent = 'Add Electric Vehicle / Cart';
    el.vId.value = `EV-0${state.fleet.length + 1}`;
    el.vId.readOnly = false;
    el.vName.value = '';
    el.vCapacity.value = '60';
    el.vCurrentSoc.value = '20';
    el.vTargetSoc.value = '85';
    el.vMaxPower.value = '22';
    el.vDepartureTime.value = '04:00';
    el.vPriority.value = 'Normal';
    el.vehicleModal.classList.add('active');
  }

  function editVehicle(vehicleId) {
    const v = state.fleet.find(item => item.id === vehicleId);
    if (!v) return;

    el.modalTitle.textContent = `Edit Vehicle: ${v.id}`;
    el.vId.value = v.id;
    el.vId.readOnly = true;
    el.vName.value = v.name;
    el.vCapacity.value = v.batteryCapacity;
    el.vCurrentSoc.value = v.currentSoc;
    el.vTargetSoc.value = v.targetSoc;
    el.vMaxPower.value = v.maxPower;
    el.vDepartureTime.value = VoltWiseEngine.slotToTime(v.departureSlot, state.siteConfig.planningStartHour, state.siteConfig.slotMinutes);
    el.vPriority.value = v.priority || 'Normal';
    el.vehicleModal.classList.add('active');
  }

  function cloneVehicle(vehicleId) {
    const v = state.fleet.find(item => item.id === vehicleId);
    if (!v) return;
    const clone = Object.assign({}, v, {
      id: `${v.id}-copy`,
      name: `${v.name} (Copy)`
    });
    state.fleet.push(clone);
    showToast(`Cloned vehicle to ${clone.id}`, 'info');
    recalculateAll();
  }

  function saveVehicleForm(e) {
    e.preventDefault();

    const id = el.vId.value.trim();
    const name = el.vName.value.trim();
    const batteryCapacity = parseFloat(el.vCapacity.value);
    const currentSoc = parseFloat(el.vCurrentSoc.value);
    const targetSoc = parseFloat(el.vTargetSoc.value);
    const maxPower = parseFloat(el.vMaxPower.value);
    const timeStr = el.vDepartureTime.value.trim();
    const priority = el.vPriority.value;

    const departureSlot = VoltWiseEngine.timeToSlot(timeStr, state.siteConfig.planningStartHour, state.siteConfig.slotMinutes, state.siteConfig.totalSlots);

    const vehicleObj = {
      id,
      name,
      batteryCapacity,
      currentSoc,
      targetSoc,
      maxPower,
      departureSlot: departureSlot === -1 ? 40 : departureSlot,
      priority
    };

    const errors = VoltWiseEngine.validateVehicle(vehicleObj, state.siteConfig.totalSlots);
    if (errors.length > 0) {
      alert(`Validation Error:\n• ${errors.join('\n• ')}`);
      return;
    }

    const idx = state.fleet.findIndex(v => v.id === id);
    if (idx >= 0) {
      state.fleet[idx] = vehicleObj;
      showToast(`Updated vehicle ${id}`, 'info');
    } else {
      if (state.fleet.some(v => v.id === id)) {
        alert(`Vehicle ID "${id}" is already in use. Please enter a unique ID.`);
        return;
      }
      state.fleet.push(vehicleObj);
      showToast(`Added vehicle ${id}`, 'success');
    }

    closeModal();
    recalculateAll();
  }

  function deleteVehicle(vehicleId) {
    if (confirm(`Remove vehicle ${vehicleId} from fleet?`)) {
      state.fleet = state.fleet.filter(v => v.id !== vehicleId);
      showToast(`Removed vehicle ${vehicleId}`, 'warning');
      recalculateAll();
    }
  }

  // ==========================================================================
  // CHARGER CRUD OPERATIONS
  // ==========================================================================
  function openAddChargerModal() {
    el.chargerModalTitle.textContent = 'Add Charging Station / Bay';
    el.chId.value = `CH-0${state.siteConfig.chargers.length + 1}`;
    el.chId.readOnly = false;
    el.chName.value = `Bay ${String.fromCharCode(65 + state.siteConfig.chargers.length)}`;
    el.chPower.value = '22.0';
    el.chAvailable.checked = true;
    el.chargerModal.classList.add('active');
  }

  function editCharger(chargerId) {
    const ch = state.siteConfig.chargers.find(c => c.id === chargerId);
    if (!ch) return;

    el.chargerModalTitle.textContent = `Edit Charger: ${ch.id}`;
    el.chId.value = ch.id;
    el.chId.readOnly = true;
    el.chName.value = ch.name;
    el.chPower.value = ch.ratedPower;
    el.chAvailable.checked = ch.available !== false;
    el.chargerModal.classList.add('active');
  }

  function saveChargerForm(e) {
    e.preventDefault();
    const id = el.chId.value.trim();
    const name = el.chName.value.trim();
    const ratedPower = parseFloat(el.chPower.value);
    const available = el.chAvailable.checked;

    const chargerObj = { id, name, ratedPower, available };
    const errors = VoltWiseEngine.validateCharger(chargerObj);
    if (errors.length > 0) {
      alert(`Validation Error:\n• ${errors.join('\n• ')}`);
      return;
    }

    const idx = state.siteConfig.chargers.findIndex(c => c.id === id);
    if (idx >= 0) {
      state.siteConfig.chargers[idx] = chargerObj;
      showToast(`Updated charger ${id}`, 'info');
    } else {
      if (state.siteConfig.chargers.some(c => c.id === id)) {
        alert(`Charger ID "${id}" is already in use.`);
        return;
      }
      state.siteConfig.chargers.push(chargerObj);
      showToast(`Added charger ${id}`, 'success');
    }

    closeModal();
    recalculateAll();
  }

  function deleteCharger(chargerId) {
    if (state.siteConfig.chargers.length <= 1) {
      alert('At least one charger must remain available.');
      return;
    }
    if (confirm(`Delete charger ${chargerId}?`)) {
      state.siteConfig.chargers = state.siteConfig.chargers.filter(c => c.id !== chargerId);
      showToast(`Deleted charger ${chargerId}`, 'warning');
      recalculateAll();
    }
  }

  function toggleChargerOnline(chargerId) {
    const ch = state.siteConfig.chargers.find(c => c.id === chargerId);
    if (ch) {
      ch.available = !(ch.available !== false);
      showToast(`${ch.name} is now ${ch.available ? 'Online' : 'Outage'}`, ch.available ? 'info' : 'danger');
      recalculateAll();
    }
  }

  // ==========================================================================
  // TARIFF & SITE SETTINGS
  // ==========================================================================
  function applyCustomTariffs() {
    const peak = parseFloat(el.tariffPeakInput.value) || 9.5;
    const shoulder = parseFloat(el.tariffShoulderInput.value) || 6.2;
    const offPeak = parseFloat(el.tariffOffPeakInput.value) || 3.6;
    const morning = parseFloat(el.tariffMorningInput.value) || 6.5;

    state.tariffs = VoltWiseEngine.generateTierTariffs(peak, shoulder, offPeak, morning);
    showToast('Applied custom electricity tariff structure', 'success');
    recalculateAll();
  }

  function updateSiteSettings() {
    const pLimit = parseFloat(document.getElementById('settingSitePower').value);
    const eff = parseFloat(document.getElementById('settingEfficiency').value) / 100.0;
    const emissions = parseFloat(document.getElementById('settingEmissions').value);

    if (!isNaN(pLimit) && pLimit > 0) state.siteConfig.sitePowerLimit = pLimit;
    if (!isNaN(eff) && eff > 0 && eff <= 1) state.siteConfig.chargingEfficiency = eff;
    if (!isNaN(emissions) && emissions >= 0) state.siteConfig.gridEmissionFactor = emissions;

    showToast('Updated site parameters and grid capacity', 'success');
    recalculateAll();
  }

  // ==========================================================================
  // DATA MANAGEMENT (BACKUP, IMPORT, CLEAR, TEMPLATE)
  // ==========================================================================
  function clearAllData() {
    if (confirm('Are you sure you want to clear all fleet vehicles? This resets the depot to a clean empty state.')) {
      state.fleet = [];
      localStorage.removeItem('voltwise_user_data');
      showToast('Depot cleared. All data reset to empty state.', 'info');
      recalculateAll();
    }
  }

  function loadStarterTemplate() {
    state.fleet = JSON.parse(JSON.stringify(VoltWiseEngine.DEFAULT_FLEET));
    showToast('Loaded 8-vehicle commercial fleet template', 'success');
    recalculateAll();
  }

  function exportDataJson() {
    const data = {
      fleet: state.fleet,
      siteConfig: state.siteConfig,
      tariffs: state.tariffs,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VoltWise_Configuration_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Configuration exported as JSON', 'success');
  }

  function importDataJson(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (data.fleet && Array.isArray(data.fleet)) state.fleet = data.fleet;
        if (data.siteConfig) state.siteConfig = Object.assign({}, VoltWiseEngine.DEFAULT_CONFIG, data.siteConfig);
        if (data.tariffs && Array.isArray(data.tariffs)) state.tariffs = data.tariffs;
        showToast('Configuration imported successfully', 'success');
        recalculateAll();
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  }

  function saveToLocalStorage() {
    try {
      const payload = {
        fleet: state.fleet,
        siteConfig: state.siteConfig,
        tariffs: state.tariffs
      };
      localStorage.setItem('voltwise_user_data', JSON.stringify(payload));
    } catch (e) {
      console.warn('LocalStorage unavailable:', e);
    }
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem('voltwise_user_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.fleet && Array.isArray(parsed.fleet)) state.fleet = parsed.fleet;
        if (parsed.siteConfig) state.siteConfig = Object.assign({}, VoltWiseEngine.DEFAULT_CONFIG, parsed.siteConfig);
        if (parsed.tariffs) state.tariffs = parsed.tariffs;
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  // --- CSV Exports ---
  function downloadScheduleCsv() {
    if (state.activeSchedule.length === 0) {
      alert('No schedule data available to export.');
      return;
    }
    const csvContent = VoltWiseEngine.generateScheduleCsv(state.activeSchedule, 'Live User Fleet');
    downloadFile(csvContent, `VoltWise_Schedule_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast('Schedule CSV downloaded', 'success');
  }

  function downloadComparisonCsv() {
    if (!state.comparison) {
      alert('No comparison data available.');
      return;
    }
    const csvContent = VoltWiseEngine.generateComparisonCsv(state.comparison, state.baselineMetrics, state.optimizedMetrics, 'Live User Fleet');
    downloadFile(csvContent, `VoltWise_Comparison_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast('Comparison CSV downloaded', 'success');
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  function closeModal() {
    if (el.vehicleModal) el.vehicleModal.classList.remove('active');
    if (el.chargerModal) el.chargerModal.classList.remove('active');
    if (el.decisionModal) el.decisionModal.classList.remove('active');
  }

  function showToast(message, type = 'info') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger') icon = '🚨';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }

  // --- Navigation & View Switching ---
  function setupNavigation() {
    el.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = item.getAttribute('data-view');
        switchView(targetView);
      });
    });
  }

  function switchView(viewId) {
    el.navItems.forEach(item => {
      if (item.getAttribute('data-view') === viewId) item.classList.add('active');
      else item.classList.remove('active');
    });

    el.views.forEach(view => {
      if (view.id === viewId) view.classList.add('active');
      else view.classList.remove('active');
    });

    if (viewId === 'view-dashboard') {
      setTimeout(renderCharts, 50);
    }
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    if (el.vehicleForm) el.vehicleForm.addEventListener('submit', saveVehicleForm);
    if (el.chargerForm) el.chargerForm.addEventListener('submit', saveChargerForm);

    // Heatmap Filter Listeners
    if (el.heatmapModeSelect) {
      el.heatmapModeSelect.addEventListener('change', (e) => {
        state.heatmapSettings.mode = e.target.value;
        renderHeatmap();
      });
    }
    if (el.heatmapVehicleFilter) {
      el.heatmapVehicleFilter.addEventListener('change', (e) => {
        state.heatmapSettings.vehicleFilter = e.target.value;
        renderHeatmap();
      });
    }
    if (el.heatmapChargerFilter) {
      el.heatmapChargerFilter.addEventListener('change', (e) => {
        state.heatmapSettings.chargerFilter = e.target.value;
        renderHeatmap();
      });
    }
    if (el.heatmapActivityFilter) {
      el.heatmapActivityFilter.addEventListener('change', (e) => {
        state.heatmapSettings.activityFilter = e.target.value;
        renderHeatmap();
      });
    }
    if (el.heatmapTimeWindow) {
      el.heatmapTimeWindow.addEventListener('change', (e) => {
        state.heatmapSettings.timeWindow = e.target.value;
        renderHeatmap();
      });
    }
    if (el.scheduleFilter) {
      el.scheduleFilter.addEventListener('change', renderScheduleTable);
    }
  }

  // Expose API for HTML controls
  window.VoltWiseApp = {
    init,
    switchView,
    openAddVehicleModal,
    editVehicle,
    cloneVehicle,
    deleteVehicle,
    openAddChargerModal,
    editCharger,
    deleteCharger,
    toggleChargerOnline,
    closeModal,
    openDecisionModal,
    triggerEmergency,
    setTimelineSlot,
    stepTimeline,
    togglePlayTimeline,
    setTimelineSpeed,
    applyCustomTariffs,
    updateSiteSettings,
    clearAllData,
    loadStarterTemplate,
    exportDataJson,
    importDataJson,
    downloadScheduleCsv,
    downloadComparisonCsv,
    printReport,
    applyWhatIfCustom,
    resetWhatIf,
    recalculateAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
