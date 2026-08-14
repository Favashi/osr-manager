(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  let state = NS.createEmptyCampaign();
  let currentMode = 'dungeon';
  let lastNonCombatMode = 'dungeon';

  function setMode(mode) {
    if (mode !== 'combat') lastNonCombatMode = mode;
    currentMode = mode;
    state.campaign.currentMode = mode;

    const appWindow = document.querySelector('.app-window');
    if (appWindow) {
      appWindow.classList.remove('mode-dungeon', 'mode-wilderness', 'mode-combat');
      appWindow.classList.add('mode-' + mode);
    }

    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    document.querySelectorAll('.view').forEach(function (view) {
      view.classList.toggle('active', view.id === mode + 'View');
    });

    document.querySelectorAll('.status-strip[data-mode]').forEach(function (strip) {
      strip.classList.toggle('active', strip.dataset.mode === mode);
    });

    render();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function classAbbrev(className) {
    return (className || 'Cla').trim().slice(0, 3);
  }

  function abbreviateUnit(unit) {
    if (unit === 'turnos') return 't';
    if (unit === 'rondas') return 'r';
    if (unit === 'minutos') return 'min';
    if (unit === 'horas') return 'h';
    return unit || '';
  }

  // Reutilizable para cualquier recurso con duración (luz, efectos y,
  // más adelante, hechizos/venenos/fatiga/viaje). Sin max válido no hay
  // estado de progreso: quien llama debe mostrar solo texto en ese caso.
  function getProgressState(current, max) {
    if (!Number.isFinite(max) || max <= 0) return null;
    const value = Math.max(0, Number(current) || 0);
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    if (percent <= 20) return 'critical';
    if (percent <= 50) return 'warning';
    return 'normal';
  }

  // Único generador de barras de progreso de la app: luz, efectos y
  // cualquier futura barra (fatiga, hechizos, veneno, viaje) pasan por aquí.
  // options.dimmed fuerza estilo neutro (apagada) manteniendo el % real.
  // Usa la barra nativa de TuiCss (.tui-progress-bar/.tui-progress), con el
  // ancho/color controlados por la clase .ascii-progress en custom.css.
  function renderAsciiProgress(current, max, options) {
    const opts = options || {};
    if (!Number.isFinite(max) || max <= 0) return '';
    const value = Math.max(0, Number(current) || 0);
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    const progressState = opts.dimmed ? 'dimmed' : (getProgressState(value, max) || 'normal');
    const stateClass = progressState === 'normal' ? '' : ' ' + progressState;
    return '<div class="tui-progress-bar ascii-progress' + stateClass + '">' +
      '<span class="tui-progress" style="width:' + percent + '%"></span>' +
      '</div>';
  }

  // Descriptor puramente visual de la hora del mundo — no implica luz solar
  // ni afecta reglas. Franjas fijas por ahora (Ruleset Core no define
  // todavía horarios propios); si algún día lo hace, esta es la única
  // función a la que habría que enchufarlo.
  function getDayPeriod(worldTime) {
    const hour = worldTime.hour;
    if (hour >= 20) return 'Noche';
    if (hour >= 12) return 'Tarde';
    if (hour >= 6) return 'Mañana';
    return 'Madrugada';
  }

  // Estado global derivado (nunca guardado): iluminado si al menos una
  // fuente está realmente encendida, no agotada y con duración > 0.
  function getLightingState(state) {
    const hasActiveLight = state.dungeon.lightSources.some(function (source) {
      return !source.exhausted && source.lit && Number(source.durationRemaining) > 0;
    });
    return hasActiveLight ? 'lit' : 'dark';
  }

  // Clock TUI compacto y reutilizable para cualquier contador procedural con
  // límite (encuentro, descanso, y en el futuro lo que haga falta).
  // <=10 de intervalo: un segmento por unidad (●/○). >10: barra compacta de
  // 10 segmentos proporcional (█/░); el número exacto siempre lo aporta el
  // texto de al lado, nunca solo el glifo.
  function renderClock(current, max) {
    const safeMax = Math.max(1, Number(max) || 1);
    const safeCurrent = Math.max(0, Math.min(safeMax, Number(current) || 0));
    if (safeMax <= 10) {
      return '●'.repeat(safeCurrent) + '○'.repeat(safeMax - safeCurrent);
    }
    const segments = 10;
    const filled = Math.round((safeCurrent / safeMax) * segments);
    return '█'.repeat(filled) + '░'.repeat(segments - filled);
  }

  function isTypingTarget(event) {
    const tag = (event.target && event.target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  // Patrón reutilizable: cuando la selección cambia por teclado, la fila
  // activa debe seguir visible sin saltos bruscos. "nearest" solo mueve el
  // scroll lo justo para que la fila entre en el contenedor, nunca recentra.
  function scrollSelectedRowIntoView(listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    const selected = list.querySelector('.selected');
    if (selected && typeof selected.scrollIntoView === 'function') {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderParty() {
    const list = document.getElementById('partyList');
    list.innerHTML = '';

    const countEl = document.getElementById('partyCount');
    if (countEl) countEl.textContent = '[' + state.party.length + ']';

    if (!state.party.length) {
      const empty = document.createElement('div');
      empty.className = 'tui-empty-state';
      empty.textContent = 'Ningún personaje.';
      list.appendChild(empty);
      return;
    }

    const header = document.createElement('div');
    header.className = 'party-row party-row-header';
    header.innerHTML =
      '<span class="party-name">NOMBRE</span>' +
      '<span class="party-class">CL/NV</span>' +
      '<span class="party-ac">CA</span>' +
      '<span class="party-hp">PG</span>';
    list.appendChild(header);

    const activeRuleset = NS.rules.getActiveRuleset(state);
    state.party.forEach(function (member) {
      const item = document.createElement('div');
      item.className = 'party-row';
      const displayAc = NS.rules.getDisplayArmorClass(member, activeRuleset);
      item.innerHTML =
        '<span class="party-name" title="' + escapeHtml(member.name) + '">' + escapeHtml(member.name) + '</span>' +
        '<span class="party-class">' + escapeHtml(classAbbrev(member.class)) + ' ' + (member.level || 1) + '</span>' +
        '<span class="party-ac">' + (displayAc != null ? displayAc : 10) + '</span>' +
        '<span class="party-hp">' + member.hpCurrent + '/' + member.hpMax + '</span>';
      list.appendChild(item);
    });
  }

  function renderTime() {
    const worldTime = state.worldTime;
    const period = getDayPeriod(worldTime);
    document.getElementById('dungeonTimeValue').textContent = formatClock(worldTime.hour, worldTime.minute);
    document.getElementById('dungeonPeriodValue').textContent = period;
    document.getElementById('wildernessDayValue').textContent = worldTime.day;
    document.getElementById('wildernessHourValue').textContent = formatClock(worldTime.hour, worldTime.minute);
    document.getElementById('wildernessPeriodValue').textContent = period;
  }

  function renderEncounterPanel(boxId, actionsId, startBtnId) {
    const encounter = state.dungeon.lastEncounter;
    const hasEncounter = !!(encounter && Number(encounter.quantity || 0) > 0);
    const combatActive = !!state.combat.active;
    const box = document.getElementById(boxId);
    const actions = document.getElementById(actionsId);
    const startBtn = document.getElementById(startBtnId);

    if (box) {
      if (combatActive) {
        box.textContent = 'Combate en curso.';
      } else if (!encounter) {
        box.textContent = 'Ningún encuentro.';
      } else if (!hasEncounter) {
        box.textContent = encounter.summary || 'Ningún encuentro.';
      } else {
        // Solo campos que el Encounter realmente aporta hoy (cantidad,
        // distancia, reacción/moral si el motor los tiró). Nada de
        // sorpresa/hostilidad inventadas: eso llegará con su propio motor.
        const name = encounter.entity || encounter.result || 'Encuentro';
        let html = '<div class="encounter-header">! ' + encounter.quantity + ' ' + escapeHtml(name) + '</div>';
        html += '<div class="encounter-fields">';
        html += '<div><span class="encounter-field-label">Cantidad</span><span>' + encounter.quantity + '</span></div>';
        html += '<div><span class="encounter-field-label">Distancia</span><span>' + (encounter.distance || 0) + ' m</span></div>';
        html += '</div>';
        if (encounter.reaction) html += '<div class="encounter-extra">' + escapeHtml(encounter.reaction) + '</div>';
        if (encounter.morale) html += '<div class="encounter-extra">' + escapeHtml(encounter.morale) + '</div>';
        box.innerHTML = html;
      }
    }
    if (actions) actions.classList.toggle('hidden', !hasEncounter && !combatActive);
    if (startBtn) startBtn.textContent = combatActive ? 'Ir al combate' : 'Iniciar combate';
  }

  function renderDungeonSummary() {
    const rules = state.dungeon.rules;
    const encounterInterval = rules.encounterEveryTurns || 2;
    const restInterval = rules.restEveryTurns || 6;
    const encounterCount = Math.min(state.dungeon.encounterCounter || 0, encounterInterval);
    const restCount = Math.min(state.dungeon.restCounter || 0, restInterval);

    document.getElementById('dungeonTurnValue').textContent = state.dungeon.turn;
    document.getElementById('dungeonEncounterValue').textContent = encounterCount + '/' + encounterInterval;
    document.getElementById('dungeonRestValue').textContent = restCount + '/' + restInterval;
    document.getElementById('dungeonEncounterClock').textContent = renderClock(encounterCount, encounterInterval);
    document.getElementById('dungeonRestClock').textContent = renderClock(restCount, restInterval);

    renderEncounterPanel('encounterSummary', 'encounterActions', 'startCombatBtn');

    const lightingStatus = document.getElementById('lightingStatus');
    if (lightingStatus) {
      const dark = getLightingState(state) === 'dark';
      lightingStatus.classList.toggle('hidden', !dark);
      lightingStatus.textContent = dark ? '! OSCURIDAD' : '';
    }

    const lightList = document.getElementById('lightSourcesList');
    lightList.innerHTML = '';
    const visibleLights = state.dungeon.lightSources.filter(function (source) {
      return !source.exhausted;
    });
    if (!visibleLights.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-row';
      empty.textContent = 'Ninguna fuente de luz.';
      lightList.appendChild(empty);
    } else {
      visibleLights.forEach(function (source) {
        const max = Number(source.durationInitial);
        const remaining = Math.max(Number(source.durationRemaining) || 0, 0);
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.lightId = source.id;
        item.innerHTML =
          '<div class="duration-block light-row" data-light-toggle="' + escapeHtml(source.id) + '" title="Encender/apagar">' +
            '<div class="duration-row">' +
              '<span class="name"><strong>' + escapeHtml(source.name) + '</strong> · ' + escapeHtml(source.carrier) + '</span>' +
              '<span class="remaining" title="' + (source.lit ? 'Encendida' : 'Apagada') + '">' + (source.lit ? '[E]' : '[A]') + ' ' + remaining + 'm</span>' +
            '</div>' +
            renderAsciiProgress(remaining, max, { dimmed: !source.lit }) +
          '</div>';
        lightList.appendChild(item);
      });
    }

    const effectsList = document.getElementById('effectsList');
    effectsList.innerHTML = '';
    const activeEffects = state.dungeon.effects.filter(function (effect) {
      return effect.active;
    });
    const effectsCountEl = document.getElementById('effectsCount');
    if (effectsCountEl) effectsCountEl.textContent = '[' + activeEffects.length + ']';
    if (!activeEffects.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-row';
      empty.textContent = 'Ningún efecto activo.';
      effectsList.appendChild(empty);
    } else {
      activeEffects.forEach(function (effect) {
        const max = Number(effect.initialDuration);
        const current = Math.max(Number(effect.duration) || 0, 0);
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML =
          '<div class="duration-block">' +
            '<div class="duration-row">' +
              '<span class="name"><strong>' + escapeHtml(effect.name) + '</strong> · ' + escapeHtml(effect.character) + '</span>' +
              '<span class="remaining">' + current + abbreviateUnit(effect.unit) + '</span>' +
            '</div>' +
            renderAsciiProgress(current, max) +
          '</div>';
        effectsList.appendChild(item);
      });
    }
  }

  function renderWilderness() {
    const wilderness = state.wilderness;
    const hex = NS.wilderness.getCurrentHex(state);

    const coords = wilderness.coords || { q: 0, r: 0 };
    document.getElementById('wildernessDayValue').textContent = state.worldTime.day;
    document.getElementById('wildernessHourValue').textContent = formatClock(state.worldTime.hour, state.worldTime.minute);
    document.getElementById('wildernessTerrainValue').textContent = NS.wilderness.terrainLabel(wilderness.terrain || 'forest');
    document.getElementById('wildernessHexValue').textContent = wilderness.hex || '0,0';

    const statusText = 'Clima: ' + (wilderness.travel.weather || 'Claro') + '<br>' +
      'Comida: ' + (wilderness.travel.food || 0) + ' · Agua: ' + (wilderness.travel.water || 0) + '<br>' +
      'Fatiga: ' + (wilderness.travel.fatigue || 0) + ' · Movimiento: ' + (wilderness.movementRemaining || 0) + '/' + (wilderness.rules.movementPerDay || 6) + '<br>' +
      'Coordenadas: q' + coords.q + ' / r' + coords.r;
    document.getElementById('wildernessStatus').innerHTML = statusText;

    const hexText = '<strong>' + escapeHtml(hex.name || hex.id) + '</strong><br>' +
      'Terreno: ' + escapeHtml(NS.wilderness.terrainLabel(hex.terrain || wilderness.terrain)) + '<br>' +
      'Visitado: ' + (hex.visited ? 'Sí' : 'No') + ' · Descubierto: ' + (hex.discovered ? 'Sí' : 'No') + '<br>' +
      'Ubicaciones: ' + ((hex.locations && hex.locations.length) ? escapeHtml(hex.locations.join(', ')) : 'Ninguna') + '<br>' +
      'Notas: ' + escapeHtml(hex.notes || 'Sin notas');
    document.getElementById('hexDetails').innerHTML = hexText;

    renderEncounterPanel('wildernessEncounterSummary', 'wildernessEncounterActions', 'wildernessStartCombatBtn');
  }

  function getCombatSelected() {
    return NS.combat.findCombatant(state, state.combat.selectedId);
  }

  function combatantStatusLabel(combatant) {
    const parts = (combatant.status || []).map(function (status) {
      return status.name + (status.durationType === 'rounds' ? ' ' + status.remaining + 'r' : '');
    });
    if (combatant.defeated) parts.unshift('Fuera de combate');
    if (combatant.withdrawn) parts.unshift('Retirado');
    return parts.join(', ') || '-';
  }

  // Deriva el rail del orden REAL del tracker (combat.combatants +
  // currentTurn) — nunca un segundo array de iniciativa. Marca al
  // combatiente con el turno actual, no al simplemente seleccionado en la
  // tabla. Con muchos combatientes muestra una ventana alrededor del actor
  // actual en vez de ensanchar la app.
  function renderInitiativeRail(combat, rolled) {
    const railEl = document.getElementById('initiativeRail');
    if (!railEl) return;

    if (!combat.active || !rolled || !combat.combatants.length) {
      railEl.classList.add('hidden');
      railEl.innerHTML = '';
      return;
    }

    const combatants = combat.combatants;
    const currentIndex = combat.currentTurn;
    const WINDOW = 3;
    let indexes = combatants.map(function (_, i) { return i; });
    let hasBefore = false;
    let hasAfter = false;
    if (combatants.length > WINDOW * 2 + 1) {
      const start = Math.max(0, currentIndex - WINDOW);
      const end = Math.min(combatants.length - 1, currentIndex + WINDOW);
      indexes = [];
      for (let i = start; i <= end; i += 1) indexes.push(i);
      hasBefore = start > 0;
      hasAfter = end < combatants.length - 1;
    }

    const items = indexes.map(function (i) {
      const combatant = combatants[i];
      const classes = ['initiative-rail-item'];
      if (i === currentIndex) classes.push('current');
      if (combatant.defeated || combatant.withdrawn) classes.push('inactive');
      return '<span class="' + classes.join(' ') + '">' + escapeHtml(combatant.name) + '</span>';
    });

    railEl.classList.remove('hidden');
    railEl.innerHTML =
      (hasBefore ? '<span class="initiative-rail-ellipsis">…</span>' : '') +
      items.join('<span class="initiative-rail-sep">→</span>') +
      (hasAfter ? '<span class="initiative-rail-ellipsis">…</span>' : '');
  }

  // Reutilizable para cualquier barra de estado de modo construida a partir
  // de pares [etiqueta, valor] (por ahora solo Combate: Mazmorra/Exterior ya
  // funcionan bien con su HTML fijo actual, no hace falta migrarlos).
  function renderModeStatus(items) {
    return items.map(function (item) {
      return '<span><strong>' + item[0] + '</strong> ' + item[1] + '</span>';
    }).join('<span class="strip-divider">│</span>');
  }

  // Responde "¿en qué punto está el combate?" (a diferencia del rail, que
  // responde "¿quién va después?"). "Actúa" usa SIEMPRE currentTurn, nunca
  // la selección manual de la tabla — son conceptos distintos a propósito.
  function renderCombatStatusStrip(combat, active, rolled, current) {
    const el = document.getElementById('combatStatusContent');
    if (!el) return;

    if (!active) {
      el.innerHTML = 'Sin combate activo';
      return;
    }

    const totalCombatants = combat.combatants.length;
    const activeList = combat.combatants.filter(function (c) { return !c.defeated && !c.withdrawn; });
    const activeCount = activeList.length;
    const activosValue = activeCount + '/' + totalCombatants;

    if (!rolled) {
      el.innerHTML =
        '<span><strong>Ronda</strong> ' + (combat.round || 0) + '</span>' +
        '<span class="strip-divider">│</span>' +
        '<span>Esperando iniciativa</span>' +
        '<span class="strip-divider">│</span>' +
        '<span><strong>Activos</strong> ' + activosValue + '</span>';
      return;
    }

    let turnPosition = activeCount ? 1 : 0;
    if (current) {
      const idx = activeList.indexOf(current);
      if (idx >= 0) turnPosition = idx + 1;
    }
    const actorName = current ? escapeHtml(current.name) : '—';

    el.innerHTML = renderModeStatus([
      ['Ronda', combat.round || 0],
      ['Turno', turnPosition + '/' + activeCount],
      ['Actúa', '<span class="combat-actor-name" title="' + actorName + '">' + actorName + '</span>'],
      ['Activos', activosValue]
    ]);
  }

  function renderCombat() {
    const combat = state.combat;
    const list = document.getElementById('combatantsList');
    const startActions = document.getElementById('combatStartActions');
    const rollInitiativeBtn = document.getElementById('rollInitiativeBtn');
    const nextTurnBtnEl = document.getElementById('nextTurnBtn');
    const nextRoundBtnEl = document.getElementById('nextRoundBtn');
    const addDamageBtnEl = document.getElementById('addDamageBtn');
    const healBtnEl = document.getElementById('healBtn');
    const addStatusBtnEl = document.getElementById('addStatusBtn');
    const withdrawBtnEl = document.getElementById('withdrawBtn');
    const endCombatBtnEl = document.getElementById('endCombatBtn');

    const active = !!combat.active;
    const rolled = active && combat.round >= 1;
    const current = rolled ? combat.combatants[combat.currentTurn] : null;

    renderInitiativeRail(combat, rolled);
    renderCombatStatusStrip(combat, active, rolled, current);

    const combatCountEl = document.getElementById('combatCount');
    if (combatCountEl) combatCountEl.textContent = active ? '[' + combat.combatants.length + ']' : '';

    list.innerHTML = '';

    if (!active) {
      list.innerHTML = '<div class="tui-empty-state">No hay combate activo.</div>';
    } else if (!combat.combatants.length) {
      list.innerHTML = '<div class="empty-row">Sin combatientes.</div>';
    } else {
      const header = document.createElement('div');
      header.className = 'combatant-row combatant-row-header';
      header.innerHTML =
        '<span class="col-ini">INI</span>' +
        '<span class="col-name">Combatiente</span>' +
        '<span class="col-ac">CA</span>' +
        '<span class="col-hp">PG</span>' +
        '<span class="col-status">Estado</span>';
      list.appendChild(header);

      const activeCombatRuleset = NS.rules.getActiveRuleset(state);
      combat.combatants.forEach(function (combatant, index) {
        const row = document.createElement('div');
        row.className = 'combatant-row' +
          (combatant.id === combat.selectedId ? ' selected' : '') +
          (combatant.defeated ? ' defeated' : '') +
          (combatant.withdrawn ? ' withdrawn' : '');
        row.dataset.combatantId = combatant.id;
        const combatantAc = NS.rules.getDisplayArmorClass(combatant, activeCombatRuleset);
        const isActor = rolled && index === combat.currentTurn;
        row.innerHTML =
          '<span class="col-ini">' + (combatant.initiative === null || combatant.initiative === undefined ? '-' : combatant.initiative) + '</span>' +
          '<span class="col-name" title="' + escapeHtml(combatant.name) + '">' + (isActor ? '<span class="tui-actor-marker">▸</span> ' : '') + escapeHtml(combatant.name) + '</span>' +
          '<span class="col-ac">' + (combatantAc != null ? combatantAc : '-') + '</span>' +
          '<span class="col-hp">' + combatant.hpCurrent + '/' + combatant.hpMax + '</span>' +
          '<span class="col-status">' + escapeHtml(combatantStatusLabel(combatant)) + '</span>';
        list.appendChild(row);
      });
    }

    if (startActions) {
      const hasCombatants = combat.combatants && combat.combatants.length > 0;
      startActions.classList.toggle('hidden', active || hasCombatants);
      startActions.style.display = (active || hasCombatants) ? 'none' : '';
    }

    if (rollInitiativeBtn) {
      const showRoll = active && !rolled;
      rollInitiativeBtn.classList.toggle('hidden', !showRoll);
      rollInitiativeBtn.disabled = !showRoll;
    }
    [nextTurnBtnEl, nextRoundBtnEl].forEach(function (btn) {
      if (!btn) return;
      btn.disabled = !rolled;
      btn.classList.toggle('disabled', !rolled);
    });
    [addDamageBtnEl, healBtnEl, addStatusBtnEl, withdrawBtnEl].forEach(function (btn) {
      if (!btn) return;
      const enabled = active && !!combat.selectedId;
      btn.disabled = !enabled;
      btn.classList.toggle('disabled', !enabled);
    });
    if (endCombatBtnEl) {
      endCombatBtnEl.disabled = !active;
      endCombatBtnEl.classList.toggle('disabled', !active);
    }
  }

  function renderLog() {
    const log = document.getElementById('sessionLog');
    log.innerHTML = '';
    state.sessionLog.slice().reverse().slice(0, 25).forEach(function (entry) {
      const item = document.createElement('div');
      item.className = 'log-entry';
      item.textContent = entry;
      log.appendChild(item);
    });
    if (!state.sessionLog.length) {
      log.innerHTML = '<div class="empty-row">La campaña comienza.</div>';
    }
  }

  function renderCampaignInfo() {
    document.getElementById('campaignNameInput').value = state.campaign.name;
    document.getElementById('adventureNameInput').value = state.campaign.adventure;

    const modeLabel = currentMode === 'dungeon' ? 'Mazmorra' : currentMode === 'wilderness' ? 'Exterior' : 'Combate';
    const label = document.getElementById('campaignBarLabel');
    const status = document.getElementById('campaignBarStatus');
    if (label) {
      const displayName = state.campaign.name || 'Sin campaña';
      label.textContent = state.campaign.adventure ? displayName + ' · ' + state.campaign.adventure : displayName;
    }
    if (status) {
      status.innerHTML = 'Día ' + state.worldTime.day + ' · ' + formatClock(state.worldTime.hour, state.worldTime.minute) +
        ' · <span class="mode-name-accent">' + modeLabel + '</span>';
    }
  }

  // Representa una escritura real en localStorage (meta.lastSavedAt), nunca
  // un simple cambio de estado en memoria. Sin segundos; fecha compacta si
  // el último guardado no es de hoy.
  function formatLastSaved(iso) {
    if (!iso) return 'Sin guardar';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Sin guardar';
    const now = new Date();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const sameDay = date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) return 'Guardado ' + hh + ':' + mm;
    const dd = String(date.getDate()).padStart(2, '0');
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    return 'Guardado ' + dd + '/' + mo + ' ' + hh + ':' + mm;
  }

  function updateLastSavedIndicator() {
    const el = document.getElementById('lastSavedIndicator');
    if (!el) return;
    el.textContent = formatLastSaved(state.meta && state.meta.lastSavedAt);
  }

  function showMenu(panelName) {
    const dropdown = document.getElementById('menuDropdown');
    const panels = dropdown.querySelectorAll('.dos-menu-panel');
    panels.forEach(function (panel) {
      const active = panel.dataset.menuPanel === panelName;
      panel.classList.toggle('is-open', active);
    });
    let activeTrigger = null;
    document.querySelectorAll('.dos-menu-trigger').forEach(function (trigger) {
      const isMatch = trigger.dataset.menu === panelName;
      trigger.classList.toggle('is-active', isMatch);
      if (isMatch) activeTrigger = trigger;
    });
    if (activeTrigger) {
      dropdown.style.left = activeTrigger.offsetLeft + 'px';
    }
    dropdown.classList.toggle('hidden', !panelName);
  }

  function closeMenu() {
    const dropdown = document.getElementById('menuDropdown');
    if (!dropdown) return;
    dropdown.classList.add('hidden');
    dropdown.querySelectorAll('.dos-menu-panel').forEach(function (panel) {
      panel.classList.remove('is-open');
    });
    document.querySelectorAll('.dos-menu-trigger').forEach(function (trigger) {
      trigger.classList.remove('is-active');
    });
  }

  // Criterio común de foco inicial: formulario/lista -> primer campo (que
  // será el buscador si el popup tiene uno, al ser el primero del DOM);
  // confirmación sin campos -> su acción principal (btn-primary), que ya es
  // la que Enter dispara en los popups de confirmación existentes.
  function focusFirstModalControl(modal) {
    const field = modal.querySelector('input, select, textarea');
    if (field) { field.focus(); return; }
    const primary = modal.querySelector('.btn-primary');
    if (primary) primary.focus();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    const overlap = document.getElementById('modalOverlap');
    if (!modal || !overlap) return;
    overlap.classList.add('active');
    modal.classList.add('active');
    focusFirstModalControl(modal);
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
    if (!document.querySelector('.tui-modal.active')) {
      const overlap = document.getElementById('modalOverlap');
      if (overlap) overlap.classList.remove('active');
    }
  }

  function closeAllModals() {
    document.querySelectorAll('.tui-modal.active').forEach(function (modal) {
      modal.classList.remove('active');
    });
    const overlap = document.getElementById('modalOverlap');
    if (overlap) overlap.classList.remove('active');
  }

  // "No mostrar al iniciar" es una preferencia de la app (localStorage
  // aparte), no de la campaña: todas las campañas la comparten en este
  // navegador y nunca viaja en el JSON exportado. El checkbox siempre
  // refleja el valor guardado, tanto al abrir automático como manual.
  function openAboutModal() {
    const checkbox = document.getElementById('aboutHideOnStartupInput');
    if (checkbox) checkbox.checked = NS.storage.loadPreferences().hideAboutOnStartup === true;
    openModal('aboutModal');
  }

  function openTablesModal() {
    const monsters = state.rules.monsterLibrary || [];
    const npcs = state.rules.npcDirectory || [];
    const morale = NS.rollMoraleCheck(state).summary;
    const reaction = NS.rollReactionCheck(state).summary;

    const monsterHtml = monsters.slice(0, 4).map(function (entry) {
      return '<div class="list-item">' + escapeHtml(entry.name) + ' (' + escapeHtml(entry.quantity || '1') + ')</div>';
    }).join('');
    const npcHtml = npcs.slice(0, 4).map(function (entry) {
      return '<div class="list-item">' + escapeHtml(entry.name) + ' (' + escapeHtml(entry.role) + ')</div>';
    }).join('');

    const body = document.getElementById('tablesModalBody');
    body.innerHTML =
      '<div class="tables-modal-section"><h4>Monstruos</h4><div class="compact-list">' + monsterHtml + '</div></div>' +
      '<div class="tables-modal-section"><h4>PNJ</h4><div class="compact-list">' + npcHtml + '</div></div>' +
      '<div class="tables-modal-section"><h4>Comprobaciones</h4><div class="compact-list">' +
        '<div class="list-item">' + escapeHtml(morale) + '</div>' +
        '<div class="list-item">' + escapeHtml(reaction) + '</div>' +
      '</div></div>';

    openModal('tablesModal');
  }

  // Calculadora de PX: herramienta neutral (no depende de rules.experience,
  // que todavía no existe). El tesoro es siempre PX manual — no asumimos
  // "1 po = 1 PX" ni ninguna conversión, así vale para cualquier ruleset.
  // No persiste en la campaña ni modifica personajes: solo calcula.
  function calculateXpSplit(monsterXp, treasureXp, otherXp, partySize) {
    const total = Math.max(0, Math.floor(monsterXp) || 0) +
      Math.max(0, Math.floor(treasureXp) || 0) +
      Math.max(0, Math.floor(otherXp) || 0);
    const safePartySize = Math.max(0, Math.floor(partySize) || 0);
    if (safePartySize <= 0) {
      return { total: total, partySize: 0, perCharacter: null, remainder: null };
    }
    return {
      total: total,
      partySize: safePartySize,
      perCharacter: Math.floor(total / safePartySize),
      remainder: total % safePartySize
    };
  }

  function renderXpResult() {
    const monsterXp = Number(document.getElementById('xpMonsterInput').value) || 0;
    const treasureXp = Number(document.getElementById('xpTreasureInput').value) || 0;
    const otherXp = Number(document.getElementById('xpOtherInput').value) || 0;
    const partySize = Number(document.getElementById('xpPartySizeInput').value) || 0;

    const result = calculateXpSplit(monsterXp, treasureXp, otherXp, partySize);
    const box = document.getElementById('xpResultBox');
    if (!box) return result;

    let html = 'Total: ' + result.total + ' PX';
    if (result.partySize <= 0) {
      html += '<br>Selecciona al menos 1 personaje.';
    } else {
      html += '<br>PX por personaje: ' + result.perCharacter;
      html += '<br>Resto: ' + result.remainder + ' PX';
    }
    box.innerHTML = html;
    return result;
  }

  function openXpCalculatorModal() {
    renderXpResult();
    openModal('xpCalculatorModal');
  }

  function openEncounterDetailsModal() {
    const encounter = state.dungeon.lastEncounter;
    const body = document.getElementById('encounterModalBody');
    if (!encounter) {
      body.textContent = 'Ningún encuentro.';
      openModal('encounterModal');
      return;
    }
    const lines = [];
    lines.push('<strong>' + escapeHtml(encounter.entity || encounter.result) + '</strong> (' + encounter.quantity + ')');
    lines.push('Tabla: ' + escapeHtml(encounter.table || '-'));
    lines.push('Tirada: ' + encounter.roll.total);
    lines.push('Distancia: ' + (encounter.distance || 0) + ' m');
    if (encounter.reaction) lines.push(escapeHtml(encounter.reaction));
    if (encounter.morale) lines.push(escapeHtml(encounter.morale));
    if (encounter.note) lines.push('Nota: ' + escapeHtml(encounter.note));
    body.innerHTML = lines.join('<br>');
    openModal('encounterModal');
  }

  function openLogModal() {
    const body = document.getElementById('logModalBody');
    body.innerHTML = '';
    const entries = state.sessionLog.slice().reverse();
    if (!entries.length) {
      body.innerHTML = '<div class="empty-row">La campaña comienza.</div>';
    } else {
      entries.forEach(function (entry) {
        const item = document.createElement('div');
        item.className = 'log-entry';
        item.textContent = entry;
        body.appendChild(item);
      });
    }
    openModal('logModal');
  }

  function openExplorationActionsModal() {
    const list = document.getElementById('explorationActionsList');
    list.innerHTML = '';
    const actions = state.dungeon.rules.explorationActions || [];
    if (!actions.length) {
      list.innerHTML = '<div class="empty-row">Sin acciones configuradas.</div>';
    } else {
      actions.forEach(function (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tui-button white-255 black-255-text';
        btn.dataset.actionId = action.id;
        btn.textContent = action.label + (action.consumesTurn ? '' : ' (rápido)');
        list.appendChild(btn);
      });
    }
    openModal('explorationActionsModal');
  }

  function openCombatDamageModal() {
    const target = getCombatSelected();
    if (!target) return;
    document.getElementById('combatDamageTarget').innerHTML =
      '<strong>' + escapeHtml(target.name) + '</strong><br>PG: ' + target.hpCurrent + ' / ' + target.hpMax;
    document.getElementById('combatDamageInput').value = '1';
    openModal('combatDamageModal');
  }

  function openCombatHealModal() {
    const target = getCombatSelected();
    if (!target) return;
    document.getElementById('combatHealTarget').innerHTML =
      '<strong>' + escapeHtml(target.name) + '</strong><br>PG: ' + target.hpCurrent + ' / ' + target.hpMax;
    document.getElementById('combatHealInput').value = '1';
    openModal('combatHealModal');
  }

  function renderCombatStatusList(target) {
    const list = document.getElementById('combatStatusList');
    list.innerHTML = '';
    const statuses = target.status || [];
    if (!statuses.length) {
      list.innerHTML = '<div class="empty-row">Sin estados.</div>';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'status-chip-list';
    statuses.forEach(function (status) {
      const label = status.name + (status.durationType === 'rounds' ? ' (' + status.remaining + 'r)' : '');
      const chip = document.createElement('span');
      chip.className = 'status-chip';
      chip.innerHTML = escapeHtml(label) + ' <button type="button" data-remove-status="' + escapeHtml(status.name) + '">x</button>';
      wrap.appendChild(chip);
    });
    list.appendChild(wrap);
  }

  function openCombatStatusModal() {
    const target = getCombatSelected();
    if (!target) return;
    document.getElementById('combatStatusTarget').innerHTML = '<strong>' + escapeHtml(target.name) + '</strong>';
    document.getElementById('combatStatusInput').value = '';
    document.getElementById('combatStatusDurationInput').value = '';
    renderCombatStatusList(target);
    openModal('combatStatusModal');
  }

  function initiativeTypeLabel(type) {
    if (type === 'side') return 'Por bandos';
    if (type === 'manual') return 'Manual';
    return 'Individual';
  }

  function armorClassModeLabel(mode) {
    return mode === 'descending' ? 'Descendente' : 'Ascendente';
  }

  function populateRulesetSelect(selectedId) {
    const select = document.getElementById('rulesetSelect');
    if (!select) return;
    select.innerHTML = '';
    NS.rules.listProfiles().forEach(function (profile) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      select.appendChild(option);
    });
    select.value = selectedId;
  }

  function renderRulesetSummary(rulesetId) {
    const box = document.getElementById('rulesetSummaryBox');
    if (!box) return;
    const ruleset = NS.rules.resolveRuleset(rulesetId);
    box.innerHTML =
      '<strong>' + escapeHtml(ruleset.name) + '</strong><br>' +
      'Familia: ' + escapeHtml(NS.rules.familyLabel(ruleset.family)) + '<br>' +
      'CA: ' + armorClassModeLabel(ruleset.combat.armorClass.mode) + '<br>' +
      'Iniciativa: ' + initiativeTypeLabel(ruleset.combat.initiative.type) + ' · ' + escapeHtml(ruleset.combat.initiative.dice) + '<br>' +
      'Mazmorra: ' + ruleset.dungeon.turnDurationMinutes + ' min/turno · encuentro cada ' + ruleset.dungeon.encounter.intervalTurns + ' turnos<br>' +
      'Moral: ' + (ruleset.combat.morale.enabled ? 'Sí' : 'No') + ' · Reacción: ' + (ruleset.combat.reaction.enabled ? 'Sí' : 'No');
  }

  function openRulesModal() {
    const activeRuleset = NS.rules.getActiveRuleset(state);
    populateRulesetSelect(activeRuleset.id);
    renderRulesetSummary(activeRuleset.id);
    openModal('rulesModal');
  }

  function renderRuleDetails(rulesetId) {
    const body = document.getElementById('ruleDetailsBody');
    if (!body) return;
    const ruleset = NS.rules.resolveRuleset(rulesetId);
    const lines = [
      '<strong>Sistema:</strong> ' + escapeHtml(ruleset.name),
      '<strong>Familia:</strong> ' + escapeHtml(NS.rules.familyLabel(ruleset.family)),
      '',
      '<strong>MAZMORRA</strong>',
      'Turno: ' + ruleset.dungeon.turnDurationMinutes + ' min',
      'Encuentros: cada ' + ruleset.dungeon.encounter.intervalTurns + ' turnos (' + escapeHtml(ruleset.dungeon.encounter.dice) + ', dispara con ' + ruleset.dungeon.encounter.triggerResults.join(', ') + ')',
      'Descanso: cada ' + ruleset.dungeon.rest.intervalTurns + ' turnos',
      '',
      '<strong>COMBATE</strong>',
      'Iniciativa: ' + initiativeTypeLabel(ruleset.combat.initiative.type) + ' · ' + escapeHtml(ruleset.combat.initiative.dice),
      'CA: ' + armorClassModeLabel(ruleset.combat.armorClass.mode),
      'Moral: ' + (ruleset.combat.morale.enabled ? 'Sí (' + escapeHtml(ruleset.combat.morale.dice) + ')' : 'No'),
      'Reacción: ' + (ruleset.combat.reaction.enabled ? 'Sí (' + escapeHtml(ruleset.combat.reaction.dice) + ')' : 'No'),
      '',
      '<strong>EXTERIOR</strong>',
      'Movimiento: ' + ruleset.wilderness.movement.perDay + ' hex/día'
    ];
    body.innerHTML = lines.join('<br>');
  }

  function openRuleCustomizeModal() {
    const select = document.getElementById('rulesetSelect');
    const selectedId = select ? select.value : 'generic';
    const baseId = selectedId === 'custom'
      ? ((state.campaign.customRuleset && state.campaign.customRuleset.baseId) || 'generic')
      : selectedId;
    const base = NS.rules.resolveRuleset(baseId);
    const modal = document.getElementById('ruleCustomizeModal');
    if (modal) modal.dataset.baseId = baseId;

    document.getElementById('customBaseLabel').textContent = 'Basado en: ' + base.name;

    const existingCustom = state.campaign.rulesetId === 'custom' ? state.campaign.customRuleset : null;
    document.getElementById('customNameInput').value = (existingCustom && existingCustom.name) || (state.campaign.name + ' (personalizado)');

    document.getElementById('customTurnDurationInput').value = base.dungeon.turnDurationMinutes;
    document.getElementById('customEncounterIntervalInput').value = base.dungeon.encounter.intervalTurns;
    document.getElementById('customEncounterDiceInput').value = base.dungeon.encounter.dice;
    document.getElementById('customEncounterTriggerInput').value = base.dungeon.encounter.triggerResults.join(',');
    document.getElementById('customRestIntervalInput').value = base.dungeon.rest.intervalTurns;

    document.getElementById('customInitiativeTypeSelect').value = base.combat.initiative.type;
    document.getElementById('customInitiativeDiceInput').value = base.combat.initiative.dice;
    document.getElementById('customACModeSelect').value = base.combat.armorClass.mode;

    document.getElementById('customMovementPerDayInput').value = base.wilderness.movement.perDay;
    const costs = base.wilderness.terrain.movementCosts || {};
    document.getElementById('customTerrainPlainsInput').value = costs.plains != null ? costs.plains : '';
    document.getElementById('customTerrainForestInput').value = costs.forest != null ? costs.forest : '';
    document.getElementById('customTerrainHillsInput').value = costs.hills != null ? costs.hills : '';
    document.getElementById('customTerrainMountainsInput').value = costs.mountains != null ? costs.mountains : '';
    document.getElementById('customTerrainSwampInput').value = costs.swamp != null ? costs.swamp : '';

    openModal('ruleCustomizeModal');
  }

  function parseTriggerResults(text) {
    return String(text || '').split(',')
      .map(function (piece) { return Number(piece.trim()); })
      .filter(function (n) { return Number.isFinite(n); });
  }

  function buildCustomOverridesFromForm() {
    return {
      dungeon: {
        turnDurationMinutes: Number(document.getElementById('customTurnDurationInput').value) || 10,
        encounter: {
          intervalTurns: Number(document.getElementById('customEncounterIntervalInput').value) || 2,
          dice: document.getElementById('customEncounterDiceInput').value.trim() || '1d6',
          triggerResults: parseTriggerResults(document.getElementById('customEncounterTriggerInput').value)
        },
        rest: {
          intervalTurns: Number(document.getElementById('customRestIntervalInput').value) || 6
        }
      },
      combat: {
        initiative: {
          type: document.getElementById('customInitiativeTypeSelect').value,
          dice: document.getElementById('customInitiativeDiceInput').value.trim() || '1d6'
        },
        armorClass: {
          mode: document.getElementById('customACModeSelect').value
        }
      },
      wilderness: {
        movement: {
          perDay: Number(document.getElementById('customMovementPerDayInput').value) || 6
        },
        terrain: {
          movementCosts: {
            plains: Number(document.getElementById('customTerrainPlainsInput').value) || 0,
            forest: Number(document.getElementById('customTerrainForestInput').value) || 0,
            hills: Number(document.getElementById('customTerrainHillsInput').value) || 0,
            mountains: Number(document.getElementById('customTerrainMountainsInput').value) || 0,
            swamp: Number(document.getElementById('customTerrainSwampInput').value) || 0
          }
        }
      }
    };
  }

  // Cambiar de sistema de reglas puede afectar cómo se interpretan datos ya
  // existentes en la campaña (personajes, combates, encuentros), así que se
  // pide confirmación antes de aplicar (ver #30 del pack). No se recalcula
  // ni se borra nada: applyToState solo cambia qué reglas rigen desde ahora.
  let pendingRulesetChange = null;

  function campaignHasProgress() {
    return state.party.length > 0 || state.dungeon.turn > 0 || state.combat.combatants.length > 0 || !!state.dungeon.lastEncounter;
  }

  function performRulesetChange(rulesetId, customConfig) {
    const ruleset = NS.rules.applyToState(state, rulesetId, customConfig);
    NS.addLog(state, 'Sistema de reglas: ' + ruleset.name + '.');
    render();
  }

  function requestRulesetChange(rulesetId, customConfig) {
    if (campaignHasProgress()) {
      pendingRulesetChange = { rulesetId: rulesetId, customConfig: customConfig };
      closeAllModals();
      openModal('ruleChangeConfirmModal');
      return;
    }
    closeAllModals();
    performRulesetChange(rulesetId, customConfig);
  }

  // Reutilizado por "Nueva campaña..." y "Cargar demo...": ambos sustituyen
  // por completo el estado activo, así que comparten el mismo aviso de
  // confirmación (si hay algo que perder) en vez de duplicar el flujo.
  let pendingCampaignReplace = null;

  function requestCampaignReplace(message, action) {
    if (campaignHasProgress()) {
      pendingCampaignReplace = action;
      const textEl = document.getElementById('replaceCampaignConfirmText');
      if (textEl) textEl.textContent = message;
      closeAllModals();
      openModal('replaceCampaignConfirmModal');
      return;
    }
    closeAllModals();
    action();
  }

  function activateCampaignState(newState) {
    state = newState;
    currentMode = state.campaign.currentMode || 'dungeon';
    lastNonCombatMode = currentMode === 'combat' ? 'dungeon' : currentMode;
    setMode(currentMode);
  }

  function openNewCampaignModal() {
    const nameInput = document.getElementById('newCampaignNameInput');
    const rulesetSelect = document.getElementById('newCampaignRulesetSelect');
    if (nameInput) nameInput.value = '';
    if (rulesetSelect) {
      rulesetSelect.innerHTML = '';
      NS.rules.listProfiles().forEach(function (profile) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name;
        rulesetSelect.appendChild(option);
      });
      rulesetSelect.value = 'generic';
    }
    openModal('newCampaignModal');
  }

  function createNewCampaignFromForm() {
    const nameInput = document.getElementById('newCampaignNameInput');
    const rulesetSelect = document.getElementById('newCampaignRulesetSelect');
    const name = nameInput ? nameInput.value.trim() : '';
    const rulesetId = rulesetSelect ? rulesetSelect.value : 'generic';

    const fresh = NS.createEmptyCampaign();
    fresh.campaign.name = name;
    NS.rules.applyToState(fresh, rulesetId, null);
    activateCampaignState(fresh);
    NS.addLog(state, 'Campaña creada.');
    NS.storage.save(state);
    render();
  }

  function loadDemoCampaign() {
    activateCampaignState(NS.createDemoCampaign());
    NS.addLog(state, 'Campaña de demostración cargada.');
    NS.storage.save(state);
    render();
  }

  function executeAction(action) {
    if (action === 'save') {
      NS.storage.save(state);
    } else if (action === 'export') {
      NS.storage.exportCampaign(state, state.campaign.name || 'campana');
    } else if (action === 'import') {
      const importInput = document.getElementById('importFileInput');
      if (importInput) importInput.click();
    } else if (action === 'newCampaign') {
      openNewCampaignModal();
    } else if (action === 'loadDemo') {
      requestCampaignReplace(
        'Esto sustituirá la campaña activa por los datos de demostración.',
        loadDemoCampaign
      );
    } else if (action === 'editCampaign') {
      openModal('campaignModal');
    } else if (action === 'addCharacter') {
      openModal('characterModal');
    } else if (action === 'addLight') {
      openModal('lightModal');
    } else if (action === 'addEffect') {
      openModal('effectModal');
    } else if (action === 'rest') {
      NS.dungeon.rest(state);
    } else if (action === 'dice') {
      openModal('diceModal');
    } else if (action === 'tables') {
      openTablesModal();
    } else if (action === 'rules') {
      openRulesModal();
    } else if (action === 'xpCalculator') {
      openXpCalculatorModal();
    } else if (action === 'help') {
      openModal('helpModal');
    } else if (action === 'shortcuts') {
      openModal('shortcutsModal');
    } else if (action === 'about') {
      openAboutModal();
    }

    render();
  }

  function formatClock(hour, minute) {
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }

  function render() {
    NS.recalculatePartySummary(state);
    renderCampaignInfo();
    updateLastSavedIndicator();
    renderParty();
    renderTime();
    renderDungeonSummary();
    renderWilderness();
    renderCombat();
    renderLog();
  }

  function addCharacterFromForm() {
    const nameInput = document.getElementById('pcNameInput');
    const name = nameInput.value.trim();
    if (!name) return;
    const newCharacter = {
      id: 'pc-' + Date.now(),
      name: name,
      player: 'Jugador',
      class: document.getElementById('pcClassInput').value.trim() || 'Clase',
      level: Number(document.getElementById('pcLevelInput').value || 1),
      hpCurrent: Number(document.getElementById('pcHpInput').value || 8),
      hpMax: Number(document.getElementById('pcHpInput').value || 8),
      armorClass: Number(document.getElementById('pcAcInput').value || 12),
      movement: 120,
      status: 'Listo',
      notes: ''
    };
    state.party.push(newCharacter);
    NS.addLog(state, 'Se añade al grupo a ' + newCharacter.name + '.');
    nameInput.value = '';
    document.getElementById('pcClassInput').value = '';
    document.getElementById('pcLevelInput').value = '1';
    document.getElementById('pcHpInput').value = '8';
    document.getElementById('pcAcInput').value = '12';
    closeModal('characterModal');
    render();
  }

  function addLightFromForm() {
    const nameInput = document.getElementById('lightNameInput');
    const carrierInput = document.getElementById('lightCarrierInput');
    const durationInput = document.getElementById('lightDurationInput');
    const name = nameInput.value.trim();
    if (!name) return;
    const duration = Math.max(1, Number(durationInput.value) || 20);
    const newLight = {
      id: 'light-' + Date.now(),
      name: name,
      carrier: carrierInput.value.trim() || 'Grupo',
      durationInitial: duration,
      durationRemaining: duration,
      lit: true,
      warnedLow: false,
      exhausted: false
    };
    state.dungeon.lightSources.push(newLight);
    NS.addLog(state, 'Se enciende ' + newLight.name + ' (' + newLight.carrier + ').');
    nameInput.value = '';
    carrierInput.value = '';
    durationInput.value = '20';
    closeModal('lightModal');
    render();
  }

  function addEffectFromForm() {
    const nameInput = document.getElementById('effectNameInput');
    const characterInput = document.getElementById('effectCharacterInput');
    const durationInput = document.getElementById('effectDurationInput');
    const unitInput = document.getElementById('effectUnitInput');
    const name = nameInput.value.trim();
    if (!name) return;
    const duration = Math.max(1, Number(durationInput.value) || 1);
    const newEffect = {
      id: 'effect-' + Date.now(),
      name: name,
      character: characterInput.value.trim() || 'Grupo',
      duration: duration,
      initialDuration: duration,
      unit: unitInput.value || 'turnos',
      active: true
    };
    state.dungeon.effects.push(newEffect);
    NS.addLog(state, 'Se aplica ' + newEffect.name + ' a ' + newEffect.character + '.');
    nameInput.value = '';
    characterInput.value = '';
    durationInput.value = '3';
    closeModal('effectModal');
    render();
  }

  function normalizeCombatState() {
    if (!state.combat) state.combat = NS.createEmptyCampaign().combat;
    if (state.combat.currentTurn === undefined) state.combat.currentTurn = 0;
    if (state.combat.previousMode === undefined) state.combat.previousMode = null;
    if (state.combat.selectedId === undefined) state.combat.selectedId = null;
    if (!state.combat.initiativeDice) state.combat.initiativeDice = '1d6';
    if (state.combat.initiativeHighestFirst === undefined) state.combat.initiativeHighestFirst = true;
    if (!Array.isArray(state.combat.combatants)) {
      state.combat.combatants = Array.isArray(state.combat.order) ? state.combat.order : [];
    }
    state.combat.combatants.forEach(function (combatant, index) {
      if (!Array.isArray(combatant.status)) {
        combatant.status = combatant.status ? [String(combatant.status)] : [];
      }
      combatant.status = combatant.status.map(function (entry) {
        if (typeof entry === 'string') {
          return { name: entry, durationType: 'none', remaining: null };
        }
        return entry;
      });
      if (combatant.defeated === undefined) {
        combatant.defeated = Number(combatant.hpCurrent || 0) <= 0;
      }
      if (combatant.withdrawn === undefined) combatant.withdrawn = false;
      if (combatant.createdIndex === undefined) combatant.createdIndex = index;
      if (!combatant.sourceType) {
        combatant.sourceType = combatant.type === 'pc' ? 'character' : 'monster';
      }
    });
  }

  function normalizeDungeonState() {
    const dungeon = state.dungeon;
    if (dungeon.encounterCounter === undefined) dungeon.encounterCounter = 0;
    if (dungeon.restCounter === undefined) dungeon.restCounter = 0;
    if (dungeon.restWarned === undefined) dungeon.restWarned = false;
    if (!dungeon.rules.restDurationTurns) dungeon.rules.restDurationTurns = 1;
    if (!Array.isArray(dungeon.rules.explorationActions)) {
      dungeon.rules.explorationActions = NS.createEmptyCampaign().dungeon.rules.explorationActions;
    }
    (dungeon.lightSources || []).forEach(function (source) {
      if (source.warnedLow === undefined) source.warnedLow = false;
      if (source.exhausted === undefined) source.exhausted = false;
    });
  }

  function normalizeWildernessState() {
    const wilderness = state.wilderness;
    const defaults = NS.createEmptyCampaign().wilderness;
    if (wilderness.movementRemaining === undefined) wilderness.movementRemaining = wilderness.rules.movementPerDay || 6;
    if (wilderness.foodWarned === undefined) wilderness.foodWarned = false;
    if (wilderness.foodEmptyWarned === undefined) wilderness.foodEmptyWarned = false;
    if (wilderness.waterWarned === undefined) wilderness.waterWarned = false;
    if (wilderness.waterEmptyWarned === undefined) wilderness.waterEmptyWarned = false;
    if (!wilderness.rules.travelHoursPerStep) wilderness.rules.travelHoursPerStep = defaults.rules.travelHoursPerStep;
    if (!wilderness.rules.movementPerDay) wilderness.rules.movementPerDay = defaults.rules.movementPerDay;
    if (!wilderness.rules.huntDice) wilderness.rules.huntDice = defaults.rules.huntDice;
    if (!wilderness.rules.huntSuccessThreshold) wilderness.rules.huntSuccessThreshold = defaults.rules.huntSuccessThreshold;
    if (!wilderness.rules.huntFoodYield) wilderness.rules.huntFoodYield = defaults.rules.huntFoodYield;
    if (!wilderness.rules.campHours) wilderness.rules.campHours = defaults.rules.campHours;
    if (!wilderness.rules.campFatigueRecovery) wilderness.rules.campFatigueRecovery = defaults.rules.campFatigueRecovery;
    if (!wilderness.rules.fatiguePerStep) wilderness.rules.fatiguePerStep = defaults.rules.fatiguePerStep;
    if (!wilderness.rules.fatigueMax) wilderness.rules.fatigueMax = defaults.rules.fatigueMax;
    if (!wilderness.rules.foodPerCharacterPerDay) wilderness.rules.foodPerCharacterPerDay = defaults.rules.foodPerCharacterPerDay;
    if (!wilderness.rules.waterPerCharacterPerDay) wilderness.rules.waterPerCharacterPerDay = defaults.rules.waterPerCharacterPerDay;
  }

  // Campañas guardadas antes de Ruleset Core no tienen campaign.rulesetId.
  // Se les asigna "OSR Genérico" (que reproduce el comportamiento previo)
  // sin tocar ningún otro dato ni forzar migración manual.
  function normalizeCampaignState() {
    if (!state.campaign.rulesetId) {
      state.campaign.rulesetId = 'generic';
    }
    if (state.campaign.customRuleset === undefined) {
      state.campaign.customRuleset = null;
    }
    // Campañas guardadas/exportadas antes de esta actualización no tienen
    // meta.lastSavedAt: el indicador debe mostrar "Sin guardar" hasta el
    // siguiente guardado real, nunca fallar.
    if (!state.meta) {
      state.meta = { lastSavedAt: null };
    } else if (state.meta.lastSavedAt === undefined) {
      state.meta.lastSavedAt = null;
    }
  }

  function loadSavedState() {
    const saved = NS.storage.load();
    if (saved) {
      state = saved;
      normalizeCampaignState();
      normalizeCombatState();
      normalizeDungeonState();
      normalizeWildernessState();
      currentMode = state.campaign.currentMode || 'dungeon';
      lastNonCombatMode = currentMode === 'combat' ? 'dungeon' : currentMode;
      setMode(currentMode);
      render();
      NS.addLog(state, 'Partida recuperada del navegador.');
      render();
    }
  }

  function bindClick(id, callback) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', callback);
    }
  }

  bindClick('importFileInput', function (event) {
    const [file] = event.target.files;
    if (!file) return;
    NS.storage.importCampaign(file, function (parsed) {
      state = parsed;
      normalizeCampaignState();
      normalizeCombatState();
      normalizeDungeonState();
      normalizeWildernessState();
      currentMode = state.campaign.currentMode || 'dungeon';
      lastNonCombatMode = currentMode === 'combat' ? 'dungeon' : currentMode;
      setMode(currentMode);
      render();
      NS.addLog(state, 'Campaña importada correctamente.');
      // La importación debe quedar realmente persistida en este navegador
      // (si no, se perdería al recargar); esto también estampa
      // meta.lastSavedAt al momento en que la importación queda guardada.
      NS.storage.save(state);
      render();
    });
    event.target.value = '';
  });

  bindClick('applyCampaignBtn', function () {
    const campaignNameInput = document.getElementById('campaignNameInput');
    const adventureNameInput = document.getElementById('adventureNameInput');
    if (!campaignNameInput || !adventureNameInput) return;
    state.campaign.name = campaignNameInput.value.trim() || 'Campaña sin nombre';
    state.campaign.adventure = adventureNameInput.value.trim() || 'Aventura sin nombre';
    NS.addLog(state, 'Datos de campaña actualizados.');
    closeModal('campaignModal');
    render();
  });

  bindClick('addCharacterConfirmBtn', addCharacterFromForm);
  bindClick('addLightConfirmBtn', addLightFromForm);
  bindClick('addEffectConfirmBtn', addEffectFromForm);

  const rulesetSelectEl = document.getElementById('rulesetSelect');
  if (rulesetSelectEl) {
    rulesetSelectEl.addEventListener('change', function () {
      renderRulesetSummary(rulesetSelectEl.value);
    });
  }

  bindClick('rulesetDetailsBtn', function () {
    const selectedId = rulesetSelectEl ? rulesetSelectEl.value : 'generic';
    renderRuleDetails(selectedId);
    openModal('ruleDetailsModal');
  });

  bindClick('rulesetCustomizeBtn', openRuleCustomizeModal);

  bindClick('rulesetApplyBtn', function () {
    const selectedId = rulesetSelectEl ? rulesetSelectEl.value : 'generic';
    if (selectedId === 'custom') {
      requestRulesetChange('custom', state.campaign.customRuleset || NS.rules.createCustomConfig('generic', 'Personalizado', {}));
    } else {
      requestRulesetChange(selectedId, null);
    }
  });

  bindClick('customApplyBtn', function () {
    const modal = document.getElementById('ruleCustomizeModal');
    const baseId = (modal && modal.dataset.baseId) || 'generic';
    const name = document.getElementById('customNameInput').value.trim() || 'Personalizado';
    const overrides = buildCustomOverridesFromForm();
    requestRulesetChange('custom', NS.rules.createCustomConfig(baseId, name, overrides));
  });

  bindClick('ruleChangeConfirmBtn', function () {
    if (pendingRulesetChange) {
      performRulesetChange(pendingRulesetChange.rulesetId, pendingRulesetChange.customConfig);
      pendingRulesetChange = null;
    }
    closeAllModals();
  });

  bindClick('newCampaignConfirmCreateBtn', function () {
    closeModal('newCampaignModal');
    requestCampaignReplace(
      'Crear una nueva campaña sustituirá la campaña activa en este navegador. Si quieres conservarla, expórtala antes.',
      createNewCampaignFromForm
    );
  });

  bindClick('replaceCampaignConfirmBtn', function () {
    if (pendingCampaignReplace) {
      pendingCampaignReplace();
      pendingCampaignReplace = null;
    }
    closeAllModals();
  });

  document.querySelectorAll('.dos-menu-trigger').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      const nextPanel = trigger.dataset.menu;
      const dropdown = document.getElementById('menuDropdown');
      if (!dropdown) return;
      const isOpen = !dropdown.classList.contains('hidden') && dropdown.querySelector('.dos-menu-panel.is-open') && dropdown.querySelector('.dos-menu-panel.is-open').dataset.menuPanel === nextPanel;
      if (isOpen) {
        closeMenu();
        return;
      }
      showMenu(nextPanel);
    });
  });

  document.querySelectorAll('[data-action]').forEach(function (actionButton) {
    actionButton.addEventListener('click', function () {
      const action = this.dataset.action;
      closeMenu();
      executeAction(action);
    });
  });

  document.querySelectorAll('[data-open-modal]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      openModal(trigger.dataset.openModal);
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      const modal = trigger.closest('.tui-modal');
      if (modal) closeModal(modal.id);
    });
  });

  bindClick('modalOverlap', closeAllModals);

  document.addEventListener('click', function (event) {
    const toggle = event.target.closest('[data-light-toggle]');
    if (!toggle) return;
    NS.dungeon.toggleLightSource(state, toggle.dataset.lightToggle);
    render();
  });

  bindClick('encounterDetailsBtn', openEncounterDetailsModal);
  bindClick('wildernessEncounterDetailsBtn', openEncounterDetailsModal);

  bindClick('logExpandBtn', openLogModal);

  ['xpMonsterInput', 'xpTreasureInput', 'xpOtherInput', 'xpPartySizeInput'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderXpResult);
  });

  bindClick('xpUseCurrentPartyBtn', function () {
    const input = document.getElementById('xpPartySizeInput');
    if (input) input.value = String(state.party.length);
    renderXpResult();
  });

  bindClick('xpCopyResultBtn', function () {
    const result = renderXpResult();
    const text = 'Total: ' + result.total + ' PX\n' +
      result.partySize + ' personajes\n' +
      (result.partySize > 0 ? result.perCharacter + ' PX/personaje\nResto: ' + result.remainder : 'Selecciona al menos 1 personaje.');
    const btn = document.getElementById('xpCopyResultBtn');
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(text).then(function () {
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = 'Copiado';
      setTimeout(function () { btn.textContent = original; }, 1200);
    }).catch(function () {
      // Sin permisos de portapapeles (habitual en file://): no bloquear la calculadora por esto.
    });
  });

  // Lanzador de Dados 2.0. El campo de expresión sigue siendo la fuente de
  // verdad; botones/cantidad/modificadores son solo atajos para construirlo
  // (nunca tiran automáticamente). El historial vive solo en memoria de
  // sesión — no contamina la campaña ni localStorage.
  let diceQuantity = 1;
  const diceHistory = [];
  const DICE_HISTORY_LIMIT = 20;

  function updateDiceQtyDisplay() {
    const el = document.getElementById('diceQtyValue');
    if (el) el.textContent = String(diceQuantity);
  }

  // Construye la expresión a partir del campo actual: si está vacío la
  // sustituye por "{cantidad}dN"; si ya tiene contenido, añade "+{cantidad}dN"
  // como un término más (permite construir expresiones compuestas a golpe
  // de botón, p.ej. 1d6+2d8).
  function insertDiceFace(sides) {
    const input = document.getElementById('diceExpressionInput');
    if (!input) return;
    const term = (diceQuantity > 1 ? diceQuantity : '') + 'd' + sides;
    const current = input.value.trim();
    input.value = current ? current + '+' + term : term;
  }

  // Modificador rápido: si la expresión ya termina en "+N"/"-N" literal,
  // acumula sobre ese número; si no, simplemente añade "+1"/"-1" al final
  // (fallback explícitamente aceptado por el pack si acumular se complica).
  function applyDiceModifier(delta) {
    const input = document.getElementById('diceExpressionInput');
    if (!input) return;
    const current = input.value || '';
    const match = current.match(/^(.*?)([+-])(\d+)$/);
    if (match) {
      const prefix = match[1];
      const existing = (match[2] === '+' ? 1 : -1) * Number(match[3]);
      const updated = existing + delta;
      input.value = updated === 0 ? prefix : prefix + (updated > 0 ? '+' : '-') + Math.abs(updated);
    } else {
      input.value = current + (delta > 0 ? '+' : '') + delta;
    }
  }

  function renderDiceResult(result) {
    const box = document.getElementById('diceResult');
    if (!box) return;
    const lines = ['<strong>' + escapeHtml(result.expression) + '</strong>'];
    result.dice.forEach(function (d) {
      const sep = d.kind === 'd66' ? '→' : '=';
      lines.push(escapeHtml(d.notation) + ' → [' + d.rolls.join(', ') + '] ' + sep + ' ' + d.subtotal);
    });
    lines.push('Total: ' + result.total);
    if (result.comparison) {
      lines.push(result.comparison.operator + ' ' + result.comparison.target +
        ' → <span class="dice-comparison-' + (result.comparison.success ? 'success' : 'fail') + '">' +
        (result.comparison.success ? 'ÉXITO' : 'FALLO') + '</span>');
    }
    box.innerHTML = lines.join('<br>');
  }

  function renderDiceHistory() {
    const list = document.getElementById('diceHistoryList');
    if (!list) return;
    list.innerHTML = '';
    if (!diceHistory.length) {
      list.innerHTML = '<div class="empty-row">Sin tiradas todavía.</div>';
      return;
    }
    diceHistory.forEach(function (entry) {
      const item = document.createElement('div');
      item.className = 'list-item dice-history-item';
      item.dataset.diceHistoryExpression = entry.expression;
      item.innerHTML =
        '<span class="dice-history-time">' + entry.time + '</span>' +
        '<span class="dice-history-expr">' + escapeHtml(entry.expression) + '</span>' +
        '<span class="dice-history-total">' + entry.total + '</span>';
      list.appendChild(item);
    });
  }

  function pushDiceHistory(result) {
    const now = new Date();
    diceHistory.unshift({
      time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      expression: result.expression,
      total: result.total
    });
    if (diceHistory.length > DICE_HISTORY_LIMIT) diceHistory.length = DICE_HISTORY_LIMIT;
    renderDiceHistory();
  }

  bindClick('diceRollBtn', function () {
    const input = document.getElementById('diceExpressionInput');
    const resultBox = document.getElementById('diceResult');
    const expression = (input.value || '1d20').trim();
    if (!expression) return;
    try {
      const result = NS.roll(expression);
      NS.addLog(state, 'Tirada ' + result.expression + ': ' + result.total + ' (' + result.rolls.join(', ') + ')');
      renderDiceResult(result);
      pushDiceHistory(result);
      render();
    } catch (error) {
      resultBox.textContent = error.message;
    }
  });

  bindClick('diceQtyMinusBtn', function () {
    diceQuantity = Math.max(1, diceQuantity - 1);
    updateDiceQtyDisplay();
  });

  bindClick('diceQtyPlusBtn', function () {
    diceQuantity = diceQuantity + 1;
    updateDiceQtyDisplay();
  });

  document.querySelectorAll('[data-dice-face]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      insertDiceFace(Number(btn.dataset.diceFace));
    });
  });

  document.querySelectorAll('[data-dice-modifier]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyDiceModifier(Number(btn.dataset.diceModifier));
    });
  });

  bindClick('diceHistoryClearBtn', function () {
    diceHistory.length = 0;
    renderDiceHistory();
  });

  bindClick('diceExpressionClearBtn', function () {
    const input = document.getElementById('diceExpressionInput');
    if (!input) return;
    input.value = '';
    input.focus();
  });

  document.addEventListener('click', function (event) {
    const item = event.target.closest('[data-dice-history-expression]');
    if (!item) return;
    const input = document.getElementById('diceExpressionInput');
    if (input) input.value = item.dataset.diceHistoryExpression;
  });

  bindClick('diceHelpBtn', function () {
    openModal('diceHelpModal');
  });

  const aboutHideOnStartupInput = document.getElementById('aboutHideOnStartupInput');
  if (aboutHideOnStartupInput) {
    aboutHideOnStartupInput.addEventListener('change', function () {
      const preferences = NS.storage.loadPreferences();
      preferences.hideAboutOnStartup = aboutHideOnStartupInput.checked;
      NS.storage.savePreferences(preferences);
    });
  }

  bindClick('menuToggleBtn', function () {
    const dropdown = document.getElementById('menuDropdown');
    if (!dropdown) return;
    const isOpen = !dropdown.classList.contains('hidden');
    if (isOpen) {
      closeMenu();
    } else {
      showMenu('file');
    }
  });

  document.addEventListener('click', function (event) {
    const container = document.querySelector('.dos-menu-container');
    if (container && !container.contains(event.target)) {
      closeMenu();
    }
  });

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeAllModals();
      return;
    }

    if (event.key === 'Enter') {
      const enterConfirmMap = {
        travelModal: 'travelConfirmBtn',
        newCampaignModal: 'newCampaignConfirmCreateBtn',
        replaceCampaignConfirmModal: 'replaceCampaignConfirmBtn',
        ruleChangeConfirmModal: 'ruleChangeConfirmBtn',
        diceModal: 'diceRollBtn'
      };
      for (const modalId in enterConfirmMap) {
        const modal = document.getElementById(modalId);
        if (modal && modal.classList.contains('active')) {
          const confirmBtn = document.getElementById(enterConfirmMap[modalId]);
          if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
          return;
        }
      }
    }

    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (currentMode === 'combat' && !isTypingTarget(event)) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        NS.combat.selectAdjacent(state, -1);
        render();
        scrollSelectedRowIntoView('combatantsList');
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        NS.combat.selectAdjacent(state, 1);
        render();
        scrollSelectedRowIntoView('combatantsList');
        return;
      }
      if (event.key === 'n' || event.key === 'N') {
        NS.combat.nextTurn(state);
        render();
        return;
      }
      if (event.key === 'd' || event.key === 'D') {
        openCombatDamageModal();
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        openCombatHealModal();
        return;
      }
    }

    if (event.key === 'F1') {
      executeAction('help');
    } else if (event.key === 'F2') {
      executeAction('save');
    } else if (event.key === 'F3') {
      executeAction('editCampaign');
    } else if (event.key === 'F4') {
      executeAction('addCharacter');
    } else if (event.key === 'F5') {
      executeAction('dice');
    } else if (event.key === 'F6') {
      executeAction('tables');
    } else if (event.key === 'F10') {
      const dropdown = document.getElementById('menuDropdown');
      if (dropdown) {
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) {
          showMenu('file');
        }
      }
    }
  });

  bindClick('windowSizeBtn', function () {
    const windowNode = document.querySelector('.app-window');
    const button = document.getElementById('windowSizeBtn');
    if (!windowNode || !button) return;
    const isCompact = windowNode.classList.toggle('maximized');
    button.textContent = isCompact ? '▣' : '▢';
    button.title = isCompact ? 'Restaurar ventana' : 'Minimizar ventana';
  });

  document.querySelectorAll('.mode-btn[data-mode]').forEach(function (button) {
    button.addEventListener('click', function () {
      setMode(button.dataset.mode);
    });
  });

  bindClick('advanceTurnBtn', function () {
    NS.dungeon.advanceDungeonTurn(state);
    render();
  });

  function performGenerateEncounter() {
    const result = NS.dungeon.generateEncounter(state);
    state.dungeon.lastEncounter = result;
    NS.addLog(state, 'Encuentro: ' + result.summary + '.');
    render();
  }

  function generateEncounterManual() {
    const pending = state.dungeon.lastEncounter;
    const hasPendingEncounter = !!(pending && Number(pending.quantity || 0) > 0);
    if (hasPendingEncounter) {
      const target = document.getElementById('replaceEncounterTarget');
      if (target) target.textContent = pending.summary;
      openModal('replaceEncounterModal');
      return;
    }
    performGenerateEncounter();
  }

  bindClick('generateEncounterBtn', generateEncounterManual);
  bindClick('wildernessGenerateEncounterBtn', generateEncounterManual);

  bindClick('replaceEncounterConfirmBtn', function () {
    closeModal('replaceEncounterModal');
    performGenerateEncounter();
  });

  bindClick('explorationActionsBtn', openExplorationActionsModal);

  const explorationActionsListEl = document.getElementById('explorationActionsList');
  if (explorationActionsListEl) {
    explorationActionsListEl.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-action-id]');
      if (!btn) return;
      NS.dungeon.performAction(state, btn.dataset.actionId);
      closeModal('explorationActionsModal');
      render();
    });
  }

  function startOrGoToCombat() {
    if (state.combat.active) {
      setMode('combat');
      return;
    }
    NS.combat.startFromEncounter(state, state.dungeon.lastEncounter, lastNonCombatMode);
    setMode('combat');
    render();
  }

  bindClick('startCombatBtn', startOrGoToCombat);
  bindClick('wildernessStartCombatBtn', startOrGoToCombat);

  bindClick('startCombatManualBtn', function () {
    NS.combat.startManual(state, lastNonCombatMode);
    render();
  });

  bindClick('rollInitiativeBtn', function () {
    NS.combat.rollInitiative(state);
    render();
  });

  bindClick('nextTurnBtn', function () {
    NS.combat.nextTurn(state);
    render();
  });

  bindClick('nextRoundBtn', function () {
    NS.combat.nextRound(state);
    render();
  });

  document.getElementById('combatantsList') && document.getElementById('combatantsList').addEventListener('click', function (event) {
    const row = event.target.closest('.combatant-row');
    if (!row || row.classList.contains('combatant-row-header')) return;
    const id = row.dataset.combatantId;
    if (!id || !state.combat.active) return;
    NS.combat.selectCombatant(state, id);
    render();
  });

  bindClick('addDamageBtn', openCombatDamageModal);
  bindClick('healBtn', openCombatHealModal);
  bindClick('addStatusBtn', openCombatStatusModal);

  bindClick('combatDamageConfirmBtn', function () {
    const target = getCombatSelected();
    if (!target) return;
    const amount = Number(document.getElementById('combatDamageInput').value) || 0;
    NS.combat.applyDamageToCombatant(state, target.id, amount);
    closeModal('combatDamageModal');
    render();
  });

  bindClick('combatHealConfirmBtn', function () {
    const target = getCombatSelected();
    if (!target) return;
    const amount = Number(document.getElementById('combatHealInput').value) || 0;
    NS.combat.healCombatant(state, target.id, amount);
    closeModal('combatHealModal');
    render();
  });

  bindClick('combatStatusAddBtn', function () {
    const target = getCombatSelected();
    if (!target) return;
    const input = document.getElementById('combatStatusInput');
    const durationInput = document.getElementById('combatStatusDurationInput');
    const name = input.value.trim();
    if (!name) return;
    NS.combat.addStatus(state, target.id, name, durationInput.value);
    input.value = '';
    durationInput.value = '';
    renderCombatStatusList(target);
    render();
  });

  document.querySelectorAll('.combat-status-quick').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const target = getCombatSelected();
      if (!target) return;
      const durationInput = document.getElementById('combatStatusDurationInput');
      NS.combat.addStatus(state, target.id, btn.dataset.status, durationInput.value);
      durationInput.value = '';
      renderCombatStatusList(target);
      render();
    });
  });

  const combatStatusListEl = document.getElementById('combatStatusList');
  if (combatStatusListEl) {
    combatStatusListEl.addEventListener('click', function (event) {
      const removeBtn = event.target.closest('[data-remove-status]');
      if (!removeBtn) return;
      const target = getCombatSelected();
      if (!target) return;
      NS.combat.removeStatus(state, target.id, removeBtn.dataset.removeStatus);
      renderCombatStatusList(target);
      render();
    });
  }

  bindClick('addCombatantConfirmBtn', function () {
    const nameInput = document.getElementById('combatantNameInput');
    const name = nameInput.value.trim();
    if (!name) return;
    NS.combat.addCombatant(state, {
      name: name,
      side: document.getElementById('combatantSideInput').value,
      armorClass: document.getElementById('combatantAcInput').value,
      hpCurrent: document.getElementById('combatantHpCurrentInput').value,
      hpMax: document.getElementById('combatantHpMaxInput').value,
      initiative: document.getElementById('combatantInitiativeInput').value
    });
    nameInput.value = '';
    document.getElementById('combatantAcInput').value = '10';
    document.getElementById('combatantHpCurrentInput').value = '4';
    document.getElementById('combatantHpMaxInput').value = '4';
    document.getElementById('combatantInitiativeInput').value = '';
    closeModal('addCombatantModal');
    render();
  });

  bindClick('withdrawBtn', function () {
    const target = getCombatSelected();
    if (!target) return;
    NS.combat.withdrawCombatant(state, target.id);
    render();
  });

  bindClick('endCombatBtn', function () {
    openModal('endCombatConfirmModal');
  });

  bindClick('endCombatConfirmBtn', function () {
    const previousMode = NS.combat.endCombat(state);
    closeModal('endCombatConfirmModal');
    setMode(previousMode);
    render();
  });

  let travelSelectedDirection = null;
  // Filas 2-3-2: dibuja la silueta de un hexágono (sin N/S, que no existen
  // como vecinos reales en la rejilla hexagonal). Este a la izquierda
  // (mirroreado a propósito, según pidió el usuario), centro = posición actual.
  const TRAVEL_COMPASS_ROWS = [
    ['NE', 'NW'],
    ['E', 'center', 'W'],
    ['SE', 'SW']
  ];

  function renderTravelDirectionButtons() {
    const container = document.getElementById('travelDirectionButtons');
    if (!container) return;
    container.innerHTML = '';
    TRAVEL_COMPASS_ROWS.forEach(function (row) {
      const rowEl = document.createElement('div');
      rowEl.className = 'travel-compass-row';
      row.forEach(function (key) {
        if (key === 'center') {
          const center = document.createElement('div');
          center.className = 'travel-compass-center';
          center.title = 'Posición actual';
          center.textContent = '[X]';
          rowEl.appendChild(center);
          return;
        }
        const direction = NS.wilderness.HEX_DIRECTIONS.find(function (item) {
          return item.key === key;
        });
        if (!direction) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tui-button white-255 black-255-text';
        btn.dataset.directionKey = key;
        btn.title = direction.label;
        btn.textContent = direction.abbr;
        rowEl.appendChild(btn);
      });
      container.appendChild(rowEl);
    });
  }

  function renderTravelPreview() {
    const box = document.getElementById('travelPreviewBox');
    const confirmBtn = document.getElementById('travelConfirmBtn');
    if (!box || !confirmBtn) return;

    document.querySelectorAll('#travelDirectionButtons button').forEach(function (btn) {
      btn.classList.toggle('btn-primary', btn.dataset.directionKey === travelSelectedDirection);
    });

    if (!travelSelectedDirection) {
      box.innerHTML = 'Selecciona una dirección.';
      confirmBtn.disabled = true;
      return;
    }

    const preview = NS.wilderness.previewTravel(state, travelSelectedDirection);
    if (!preview) {
      box.innerHTML = 'Dirección no válida.';
      confirmBtn.disabled = true;
      return;
    }

    const movementMax = state.wilderness.rules.movementPerDay || 6;
    const terrainText = preview.known ? escapeHtml(NS.wilderness.terrainLabel(preview.terrain)) : '???';
    let html =
      'Dirección: ' + escapeHtml(preview.direction.label) + '<br>' +
      'Desde: q' + preview.from.q + '/r' + preview.from.r + '<br>' +
      'Destino: q' + preview.to.q + '/r' + preview.to.r + '<br>' +
      'Terreno: ' + terrainText + '<br>' +
      'Coste: ' + preview.cost + '<br>' +
      'Movimiento actual: ' + preview.movementBefore + '/' + movementMax + '<br>' +
      'Después: ' + preview.movementAfter + '/' + movementMax;
    if (!preview.sufficient) {
      html += '<br><strong>MOVIMIENTO INSUFICIENTE</strong>';
    }
    box.innerHTML = html;
    confirmBtn.disabled = !preview.sufficient;
  }

  document.addEventListener('click', function (event) {
    const dirBtn = event.target.closest('#travelDirectionButtons button');
    if (!dirBtn) return;
    travelSelectedDirection = dirBtn.dataset.directionKey;
    renderTravelPreview();
  });

  bindClick('travelBtn', function () {
    travelSelectedDirection = null;
    renderTravelDirectionButtons();
    renderTravelPreview();
    openModal('travelModal');
  });

  bindClick('travelConfirmBtn', function () {
    if (!travelSelectedDirection) return;
    const preview = NS.wilderness.previewTravel(state, travelSelectedDirection);
    if (!preview || !preview.sufficient) return;
    NS.wilderness.travel(state, travelSelectedDirection);
    closeModal('travelModal');
    travelSelectedDirection = null;
    render();
  });

  bindClick('exploreBtn', function () {
    NS.wilderness.explore(state);
    render();
  });

  bindClick('huntBtn', function () {
    NS.wilderness.hunt(state);
    render();
  });

  bindClick('campBtn', function () {
    const input = document.getElementById('campHoursInput');
    if (input) input.value = String(state.wilderness.rules.campHours || 8);
    openModal('campModal');
  });

  bindClick('campConfirmBtn', function () {
    const input = document.getElementById('campHoursInput');
    const hours = input ? Number(input.value) : undefined;
    NS.wilderness.camp(state, hours);
    closeModal('campModal');
    render();
  });

  function tickClock() {
    const clock = document.getElementById('topClock');
    if (!clock) return;
    const now = new Date();
    clock.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(function (part) { return String(part).padStart(2, '0'); })
      .join(':');
  }

  tickClock();
  setInterval(tickClock, 1000);

  loadSavedState();
  setMode(currentMode);
  render();
  if (NS.storage.loadPreferences().hideAboutOnStartup !== true) {
    openAboutModal();
  }
})();
