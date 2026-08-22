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

  function findPartyMember(party, id) {
    return party.find(function (member) { return member.id === id; }) || null;
  }

  // Presentación compacta del/de los objetivo(s) de un efecto en la
  // sidebar: 1 nombre -> el nombre; 2 -> "A, B"; 3+ -> "N objetivos" (evita
  // que nombres largos o grupos completos desborden el panel).
  function formatEffectTargets(effect, party) {
    const ids = Array.isArray(effect.targetIds) ? effect.targetIds : [];
    const names = ids.map(function (id) {
      const member = findPartyMember(party, id);
      return member ? member.name : null;
    }).filter(Boolean);
    if (!names.length) return 'Sin objetivos';
    if (names.length <= 2) return names.join(', ');
    return names.length + ' objetivos';
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

    // Aviso de procedimiento (igual que la oscuridad): informa, no penaliza
    // nada automáticamente. Descansar (acción de exploración) lo apaga.
    const restStatus = document.getElementById('restStatus');
    if (restStatus) restStatus.classList.toggle('hidden', !state.dungeon.restWarned);

    renderDungeonLocation();
    renderDungeonPlayerActions();

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
              '<span class="name"><strong>' + escapeHtml(source.name) + '</strong> - ' + escapeHtml(source.carrier) + '</span>' +
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
        item.className = 'list-item effect-row';
        item.dataset.effectId = effect.id;
        item.title = 'Ver detalle del efecto';
        item.innerHTML =
          '<div class="duration-block">' +
            '<div class="duration-row">' +
              '<span class="name"><strong>' + escapeHtml(effect.name) + '</strong> - ' + escapeHtml(formatEffectTargets(effect, state.party)) + '</span>' +
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
      'Comida: ' + (wilderness.travel.food || 0) + ' - Agua: ' + (wilderness.travel.water || 0) + '<br>' +
      'Fatiga: ' + (wilderness.travel.fatigue || 0) + ' - Movimiento: ' + (wilderness.movementRemaining || 0) + '/' + (wilderness.rules.movementPerDay || 6) + '<br>' +
      'Coordenadas: q' + coords.q + ' / r' + coords.r;
    document.getElementById('wildernessStatus').innerHTML = statusText;

    const hexText = '<strong>' + escapeHtml(hex.name || hex.id) + '</strong><br>' +
      'Terreno: ' + escapeHtml(NS.wilderness.terrainLabel(hex.terrain || wilderness.terrain)) + '<br>' +
      'Visitado: ' + (hex.visited ? 'Sí' : 'No') + ' - Descubierto: ' + (hex.discovered ? 'Sí' : 'No') + '<br>' +
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
      items.join('<span class="initiative-rail-sep">-&gt;</span>') +
      (hasAfter ? '<span class="initiative-rail-ellipsis">…</span>' : '');
  }

  // Reutilizable para cualquier barra de estado de modo construida a partir
  // de pares [etiqueta, valor] (por ahora solo Combate: Mazmorra/Exterior ya
  // funcionan bien con su HTML fijo actual, no hace falta migrarlos).
  function renderModeStatus(items) {
    return items.map(function (item) {
      return '<span><strong>' + item[0] + '</strong> ' + item[1] + '</span>';
    }).join('<span class="strip-divider">|</span>');
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
        '<span class="strip-divider">|</span>' +
        '<span>Esperando iniciativa</span>' +
        '<span class="strip-divider">|</span>' +
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
      label.textContent = state.campaign.adventure ? displayName + ' - ' + state.campaign.adventure : displayName;
    }
    if (status) {
      status.innerHTML = 'Día ' + state.worldTime.day + ' - ' + formatClock(state.worldTime.hour, state.worldTime.minute) +
        ' - <span class="mode-name-accent">' + modeLabel + '</span>';
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

  // --- Ajustes: tema visual --------------------------------------------
  // Preferencia de aplicación+navegador (misma capa que "No mostrar Acerca
  // de al iniciar"), nunca de campaña: no viaja en el JSON exportado.
  const THEMES = [
    { id: 'ega-blue', label: 'EGA Azul' },
    { id: 'amber', label: 'DOS Ámbar' },
    { id: 'mono', label: 'Monocromo' },
    { id: 'cga', label: 'CGA Retro' },
    { id: 'phosphor', label: 'Fósforo Verde' }
  ];
  const DEFAULT_THEME = 'ega-blue';
  let settingsSavedTheme = DEFAULT_THEME;
  let settingsSavedScanlines = false;

  function isValidTheme(themeId) {
    return THEMES.some(function (theme) { return theme.id === themeId; });
  }

  function getSavedTheme() {
    const saved = NS.storage.loadPreferences().theme;
    return isValidTheme(saved) ? saved : DEFAULT_THEME;
  }

  // Solo colores (custom.css consume esta variable vía [data-theme]): no
  // toca layout, dimensiones, fuente ni Normal/Maximizado.
  function applyTheme(themeId) {
    const resolved = isValidTheme(themeId) ? themeId : DEFAULT_THEME;
    document.documentElement.dataset.theme = resolved;
    return resolved;
  }

  // Scanlines (CRT): opt-in puramente decorativo, independiente del
  // tema — misma capa de preferencias que el tema, pero su propia clave.
  function getSavedScanlines() {
    return NS.storage.loadPreferences().scanlines === true;
  }

  function applyScanlines(enabled) {
    const resolved = enabled === true;
    document.documentElement.classList.toggle('scanlines-on', resolved);
    return resolved;
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    const overlap = document.getElementById('modalOverlap');
    if (!modal || !overlap) return;
    overlap.classList.add('active');
    modal.classList.add('active');
    // Sin esto, dos popups activos a la vez (p.ej. Codex -> Importar
    // statblock) se apilan por orden de aparición en el HTML, no por cuál
    // se abrió después: el que esté escrito más abajo en index.html
    // siempre pinta encima aunque se haya abierto primero. Mover el nodo
    // al final de su mismo padre (sin clonarlo: conserva listeners,
    // valores de formulario, dataset) hace que el último abierto quede
    // siempre arriba, que es el comportamiento esperado.
    modal.parentNode.appendChild(modal);
    focusFirstModalControl(modal);
  }

  // Si settingsModal se cierra sin pasar por "Aplicar" (X, Cancelar, Esc,
  // clic fuera), la vista previa en curso debe descartarse y volver
  // exactamente al tema guardado — cualquier ruta de cierre pasa por
  // closeModal/closeAllModals, así que basta revertir aquí una sola vez.
  function revertSettingsPreviewIfActive() {
    const modal = document.getElementById('settingsModal');
    if (modal && modal.classList.contains('active')) {
      applyTheme(settingsSavedTheme);
      applyScanlines(settingsSavedScanlines);
    }
  }

  function closeModal(id) {
    if (id === 'settingsModal') revertSettingsPreviewIfActive();
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
    if (!document.querySelector('.tui-modal.active')) {
      const overlap = document.getElementById('modalOverlap');
      if (overlap) overlap.classList.remove('active');
    }
  }

  function closeAllModals() {
    revertSettingsPreviewIfActive();
    document.querySelectorAll('.tui-modal.active').forEach(function (modal) {
      modal.classList.remove('active');
    });
    const overlap = document.getElementById('modalOverlap');
    if (overlap) overlap.classList.remove('active');
  }

  function openSettingsModal() {
    settingsSavedTheme = getSavedTheme();
    const select = document.getElementById('settingsThemeInput');
    if (select) select.value = settingsSavedTheme;
    applyTheme(settingsSavedTheme);

    settingsSavedScanlines = getSavedScanlines();
    const scanlinesInput = document.getElementById('settingsScanlinesInput');
    if (scanlinesInput) scanlinesInput.checked = settingsSavedScanlines;
    applyScanlines(settingsSavedScanlines);

    openModal('settingsModal');
  }

  // --- Statblock Importer 1.0 -------------------------------------------
  // Flujo: pegar -> analizar (js/statblock-parser.js) -> revisar/corregir
  // -> guardar en state.customContent.monsters/npcs. El parser nunca
  // guarda nada por sí solo; esta es la única ruta de guardado.
  let pendingStatblockModel = null;

  function openStatblockImportModal() {
    const textInput = document.getElementById('statblockTextInput');
    const typeInput = document.getElementById('statblockTypeInput');
    if (textInput) textInput.value = '';
    if (typeInput) typeInput.value = 'auto';
    openModal('statblockImportModal');
  }

  function nullableNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function nullableText(value) {
    const trimmed = String(value || '').trim();
    return trimmed || null;
  }

  function renderStatblockWarnings(warnings) {
    const container = document.getElementById('statblockWarningsList');
    if (!container) return;
    if (!warnings || !warnings.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    container.innerHTML = warnings.map(function (warning) {
      return '<div class="statblock-warning-item">⚠ ' + escapeHtml(warning) + '</div>';
    }).join('');
  }

  function renderStatblockAttackRow(attack) {
    const row = document.createElement('div');
    row.className = 'statblock-attack-row';
    row.innerHTML =
      '<input class="tui-input sb-attack-name" type="text" placeholder="Nombre" value="' + escapeHtml(attack && attack.name ? attack.name : '') + '" />' +
      '<input class="tui-input sb-attack-count" type="number" min="1" placeholder="Cant." value="' + (attack && attack.count !== null && attack.count !== undefined ? attack.count : '') + '" />' +
      '<input class="tui-input sb-attack-bonus" type="number" placeholder="Bono" value="' + (attack && attack.attackBonus !== null && attack.attackBonus !== undefined ? attack.attackBonus : '') + '" />' +
      '<input class="tui-input sb-attack-damage" type="text" placeholder="Daño" value="' + escapeHtml(attack && attack.damage ? attack.damage : '') + '" />' +
      '<button type="button" class="tui-button white-255 black-255-text sb-attack-remove" title="Eliminar ataque">X</button>';
    if (attack && attack.raw) row.dataset.raw = attack.raw;
    return row;
  }

  function renderStatblockAttacksList(attacks) {
    const list = document.getElementById('sbReviewAttacksList');
    if (!list) return;
    list.innerHTML = '';
    (attacks || []).forEach(function (attack) {
      list.appendChild(renderStatblockAttackRow(attack));
    });
  }

  function readStatblockAttacksFromForm() {
    return Array.from(document.querySelectorAll('#sbReviewAttacksList .statblock-attack-row')).map(function (row) {
      return {
        name: nullableText(row.querySelector('.sb-attack-name').value),
        count: nullableNumber(row.querySelector('.sb-attack-count').value),
        attackBonus: nullableNumber(row.querySelector('.sb-attack-bonus').value),
        damage: nullableText(row.querySelector('.sb-attack-damage').value),
        raw: row.dataset.raw || null
      };
    }).filter(function (attack) {
      return attack.name || attack.damage || attack.raw || attack.count !== null || attack.attackBonus !== null;
    });
  }

  function renderStatblockAbilityRow(ability) {
    const row = document.createElement('div');
    row.className = 'statblock-ability-row';
    row.innerHTML =
      '<input class="tui-input sb-ability-name" type="text" placeholder="Nombre" value="' + escapeHtml(ability && ability.name ? ability.name : '') + '" />' +
      '<input class="tui-input sb-ability-text" type="text" placeholder="Texto" value="' + escapeHtml(ability && ability.text ? ability.text : '') + '" />' +
      '<button type="button" class="tui-button white-255 black-255-text sb-ability-remove" title="Eliminar habilidad">X</button>';
    return row;
  }

  function renderStatblockAbilitiesList(abilities) {
    const list = document.getElementById('sbReviewAbilitiesList');
    if (!list) return;
    list.innerHTML = '';
    (abilities || []).forEach(function (ability) {
      list.appendChild(renderStatblockAbilityRow(ability));
    });
  }

  function readStatblockAbilitiesFromForm() {
    return Array.from(document.querySelectorAll('#sbReviewAbilitiesList .statblock-ability-row')).map(function (row) {
      return {
        name: nullableText(row.querySelector('.sb-ability-name').value),
        text: nullableText(row.querySelector('.sb-ability-text').value)
      };
    }).filter(function (ability) {
      return ability.name || ability.text;
    });
  }

  // Modelo vacío para "+ Nuevo" en el Codex: MISMO editor que la revisión
  // de un statblock importado, solo que sin datos y sin texto original.
  function createBlankStatblockModel(type) {
    return {
      id: NS.statblock.generateId(type, ''),
      type: type,
      name: null,
      armorClass: { descending: null, ascending: null },
      hitDice: { raw: null, formula: null },
      hitPoints: null,
      movement: null,
      attacks: [],
      thac0: null,
      baseAttackBonus: null,
      morale: { value: null, raw: null },
      alignment: null,
      xp: { value: null, raw: null },
      numberAppearing: { dungeon: null, wilderness: null },
      savingThrows: null,
      treasure: null,
      abilities: [],
      notes: null,
      source: { type: 'custom', originalStatblock: '' }
    };
  }

  // options.allowBack: false oculta "Volver" (no aplica si no venimos de
  // pegar un statblock, p.ej. Codex -> Nuevo/Editar). options.scope
  // preselecciona el ámbito (Biblioteca/Campaña) en el que ya vive el
  // registro al editar, o el destino por defecto al crear.
  function openStatblockReviewFromModel(model, warnings, options) {
    const opts = options || {};
    pendingStatblockModel = model;
    renderStatblockWarnings(warnings);

    document.getElementById('sbReviewNameInput').value = model.name || '';
    document.getElementById('sbReviewTypeInput').value = model.type === 'npc' ? 'npc' : 'monster';
    document.getElementById('sbReviewHdInput').value = model.hitDice.raw || '';
    document.getElementById('sbReviewHpInput').value = model.hitPoints === null ? '' : model.hitPoints;
    document.getElementById('sbReviewAcDescInput').value = model.armorClass.descending === null ? '' : model.armorClass.descending;
    document.getElementById('sbReviewAcAscInput').value = model.armorClass.ascending === null ? '' : model.armorClass.ascending;
    document.getElementById('sbReviewMovementInput').value = model.movement || '';
    document.getElementById('sbReviewThac0Input').value = model.thac0 || '';
    document.getElementById('sbReviewAlignmentInput').value = model.alignment || '';
    document.getElementById('sbReviewBaInput').value = model.baseAttackBonus === null ? '' : model.baseAttackBonus;
    document.getElementById('sbReviewMoraleValueInput').value = model.morale.value === null ? '' : model.morale.value;
    document.getElementById('sbReviewMoraleRawInput').value = model.morale.raw || '';
    document.getElementById('sbReviewXpValueInput').value = model.xp.value === null ? '' : model.xp.value;
    document.getElementById('sbReviewXpRawInput').value = model.xp.raw || '';
    document.getElementById('sbReviewNaDungeonInput').value = model.numberAppearing.dungeon || '';
    document.getElementById('sbReviewNaWildernessInput').value = model.numberAppearing.wilderness || '';
    document.getElementById('sbReviewSavesInput').value = model.savingThrows || '';
    document.getElementById('sbReviewTreasureInput').value = model.treasure || '';
    document.getElementById('sbReviewNotesInput').value = model.notes || '';
    document.getElementById('sbReviewOriginalText').value = model.source.originalStatblock || '';
    renderStatblockAttacksList(model.attacks);
    renderStatblockAbilitiesList(model.abilities);

    const backBtn = document.getElementById('sbReviewBackBtn');
    if (backBtn) backBtn.classList.toggle('hidden', opts.allowBack === false);

    const originalField = document.getElementById('sbReviewOriginalField');
    const hasOriginal = !!(model.source && model.source.originalStatblock);
    if (originalField) originalField.classList.toggle('hidden', !hasOriginal);

    const scope = opts.scope === 'library' ? 'library' : 'campaign';
    document.getElementById('sbReviewScopeLibrary').checked = scope === 'library';
    document.getElementById('sbReviewScopeCampaign').checked = scope === 'campaign';

    closeModal('statblockImportModal');
    openModal('statblockReviewModal');
  }

  function analyzeStatblock() {
    const textInput = document.getElementById('statblockTextInput');
    const typeInput = document.getElementById('statblockTypeInput');
    const text = textInput ? textInput.value : '';
    if (!text.trim()) return;
    const result = NS.statblock.parse(text, typeInput ? typeInput.value : 'auto');
    openStatblockReviewFromModel(result.model, result.warnings, { allowBack: true, scope: 'campaign' });
  }

  // Si el usuario corrige el valor numérico pero no toca el detalle, el
  // detalle se realinea con el valor (evita dejar un "raw" desfasado tipo
  // "7 (9 with king)" cuando ya no aplica). Si el detalle se edita a mano,
  // se respeta tal cual.
  function valueWithRawFromInputs(valueInput, rawInput) {
    const value = nullableNumber(valueInput.value);
    const rawText = nullableText(rawInput.value);
    return { value: value, raw: rawText || (value === null ? null : String(value)) };
  }

  function saveStatblockReview() {
    if (!pendingStatblockModel) return;
    const type = document.getElementById('sbReviewTypeInput').value === 'npc' ? 'npc' : 'monster';
    const model = {
      id: pendingStatblockModel.id,
      type: type,
      name: nullableText(document.getElementById('sbReviewNameInput').value),
      armorClass: {
        descending: nullableNumber(document.getElementById('sbReviewAcDescInput').value),
        ascending: nullableNumber(document.getElementById('sbReviewAcAscInput').value)
      },
      hitDice: {
        raw: nullableText(document.getElementById('sbReviewHdInput').value),
        formula: pendingStatblockModel.hitDice.formula
      },
      hitPoints: nullableNumber(document.getElementById('sbReviewHpInput').value),
      movement: nullableText(document.getElementById('sbReviewMovementInput').value),
      attacks: readStatblockAttacksFromForm(),
      thac0: nullableText(document.getElementById('sbReviewThac0Input').value),
      baseAttackBonus: nullableNumber(document.getElementById('sbReviewBaInput').value),
      morale: valueWithRawFromInputs(document.getElementById('sbReviewMoraleValueInput'), document.getElementById('sbReviewMoraleRawInput')),
      alignment: nullableText(document.getElementById('sbReviewAlignmentInput').value),
      xp: valueWithRawFromInputs(document.getElementById('sbReviewXpValueInput'), document.getElementById('sbReviewXpRawInput')),
      numberAppearing: {
        dungeon: nullableText(document.getElementById('sbReviewNaDungeonInput').value),
        wilderness: nullableText(document.getElementById('sbReviewNaWildernessInput').value)
      },
      savingThrows: nullableText(document.getElementById('sbReviewSavesInput').value),
      treasure: nullableText(document.getElementById('sbReviewTreasureInput').value),
      abilities: readStatblockAbilitiesFromForm(),
      notes: nullableText(document.getElementById('sbReviewNotesInput').value),
      source: pendingStatblockModel.source
    };

    const scopeInput = document.querySelector('input[name="sbReviewScope"]:checked');
    const scope = scopeInput && scopeInput.value === 'library' ? 'library' : 'campaign';
    NS.repository.saveActor(state, type, model, scope);
    NS.addLog(state, 'Contenido personalizado guardado: ' + (model.name || model.id) + '.');

    pendingStatblockModel = null;
    closeModal('statblockReviewModal');
    render();
    refreshCodexIfOpen();
  }

  // --- Codex MVP ----------------------------------------------------
  // Biblioteca (js/repository.js) para consultar/gestionar Monstruos,
  // PNJ y Encuentros. La UI nunca toca localStorage/state directamente:
  // todo pasa por NS.repository. Crear/editar Monstruos y PNJ reutiliza
  // el MISMO popup de revisión del Statblock Importer (openStatblock-
  // ReviewFromModel/saveStatblockReview), nunca un segundo editor.
  let codexActiveTab = 'monster';
  let codexSelectedId = null;
  let pendingCodexDelete = null; // { kind: 'monster'|'npc'|'encounter', id }
  let codexEncounterEditingId = null; // null = crear nuevo encuentro

  function getCodexFilteredItems() {
    const scopeFilterEl = document.getElementById('codexScopeFilter');
    const scopeFilter = scopeFilterEl ? scopeFilterEl.value : 'all';
    const searchInput = document.getElementById('codexSearchInput');
    const query = searchInput ? searchInput.value : '';

    let items = codexActiveTab === 'encounter'
      ? NS.repository.listEncounters(state)
      : NS.repository.listActors(state, codexActiveTab);

    if (scopeFilter !== 'all') {
      items = items.filter(function (item) { return item.scope === scopeFilter; });
    }
    return NS.ui.filterBySearch(items, query, function (item) { return item.name || ''; });
  }

  function formatActorSourceLabel(item) {
    return (item.source && item.source.type === 'custom') ? 'Personalizado' : '—';
  }

  function formatScopeLabel(scope) {
    return scope === 'library' ? 'Biblioteca' : 'Campaña';
  }

  function formatEncounterComposition(encounter) {
    const groups = Array.isArray(encounter.groups) ? encounter.groups : [];
    if (!groups.length) return 'Sin criaturas';
    return groups.map(function (group) {
      const actor = NS.repository.getActorById(state, group.actorId);
      const name = actor ? (actor.name || 'Sin nombre') : '[Contenido no disponible]';
      return (group.quantity || '?') + ' × ' + name;
    }).join(', ');
  }

  function renderCodexList() {
    const list = document.getElementById('codexList');
    if (!list) return;
    list.className = 'codex-list' + (codexActiveTab === 'encounter' ? ' codex-list--encounters' : '');

    const items = getCodexFilteredItems();
    const countEl = document.getElementById('codexResultCount');
    if (countEl) countEl.textContent = NS.ui.formatResultCount(items.length);

    if (!items.some(function (item) { return item.id === codexSelectedId; })) {
      codexSelectedId = null;
    }
    const editBtn = document.getElementById('codexEditBtn');
    const deleteBtn = document.getElementById('codexDeleteBtn');
    if (editBtn) editBtn.disabled = !codexSelectedId;
    if (deleteBtn) deleteBtn.disabled = !codexSelectedId;

    const importBtn = document.getElementById('codexImportBtn');
    if (importBtn) importBtn.classList.toggle('hidden', codexActiveTab === 'encounter');

    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'tui-empty-state';
      empty.textContent = codexActiveTab === 'monster' ? 'No hay monstruos disponibles.'
        : codexActiveTab === 'npc' ? 'No hay PNJ disponibles.'
        : 'No hay encuentros disponibles.';
      list.appendChild(empty);
      return;
    }

    const header = document.createElement('div');
    header.className = 'codex-row codex-row-header';
    header.innerHTML = codexActiveTab === 'encounter'
      ? '<span>Nombre</span><span>Composición</span><span>Ámbito</span>'
      : '<span>Nombre</span><span>DG</span><span>CA</span><span>Fuente</span><span>Ámbito</span>';
    list.appendChild(header);

    items.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'codex-row' + (item.id === codexSelectedId ? ' selected' : '');
      row.dataset.codexId = item.id;
      row.title = 'Ver detalle';
      if (codexActiveTab === 'encounter') {
        const composition = formatEncounterComposition(item);
        row.innerHTML =
          '<span class="codex-col-name" title="' + escapeHtml(item.name || '') + '">' + escapeHtml(item.name || 'Sin nombre') + '</span>' +
          '<span class="codex-col-composition" title="' + escapeHtml(composition) + '">' + escapeHtml(composition) + '</span>' +
          '<span title="' + escapeHtml(formatScopeLabel(item.scope)) + '">' + formatScopeLabel(item.scope) + '</span>';
      } else {
        const hd = item.hitDice && item.hitDice.raw ? item.hitDice.raw : '—';
        const ac = item.armorClass && item.armorClass.descending !== null && item.armorClass.descending !== undefined ? item.armorClass.descending : '—';
        const sourceLabel = formatActorSourceLabel(item);
        row.innerHTML =
          '<span class="codex-col-name" title="' + escapeHtml(item.name || '') + '">' + escapeHtml(item.name || 'Sin nombre') + '</span>' +
          '<span>' + escapeHtml(String(hd)) + '</span>' +
          '<span>' + escapeHtml(String(ac)) + '</span>' +
          '<span title="' + escapeHtml(sourceLabel) + '">' + escapeHtml(sourceLabel) + '</span>' +
          '<span title="' + escapeHtml(formatScopeLabel(item.scope)) + '">' + formatScopeLabel(item.scope) + '</span>';
      }
      list.appendChild(row);
    });
  }

  function setCodexTab(tab) {
    codexActiveTab = tab;
    codexSelectedId = null;
    const searchInput = document.getElementById('codexSearchInput');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.codex-tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.codexTab === tab);
    });
    renderCodexList();
  }

  function openCodexModal() {
    setCodexTab('monster');
    const scopeFilterEl = document.getElementById('codexScopeFilter');
    if (scopeFilterEl) scopeFilterEl.value = 'all';
    renderCodexList();
    openModal('codexModal');
  }

  // Reabre el listado si el popup del Codex sigue abierto detrás de otro
  // (statblock review, confirmación...): así lo guardado/eliminado
  // aparece "inmediatamente en el Codex" sin tener que cerrarlo y
  // reabrirlo a mano.
  function refreshCodexIfOpen() {
    const modal = document.getElementById('codexModal');
    if (modal && modal.classList.contains('active')) renderCodexList();
  }

  function openCodexDetailForSelected() {
    if (!codexSelectedId) return;
    if (codexActiveTab === 'encounter') {
      openCodexEncounterDetail(codexSelectedId);
    } else {
      openCodexActorDetail(codexSelectedId);
    }
  }

  // --- Ficha de Monstruo/PNJ (solo lectura) ---------------------------

  function formatFieldRow(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return '<div class="duration-row"><span class="encounter-field-label">' + escapeHtml(label) + '</span><span>' + escapeHtml(String(value)) + '</span></div>';
  }

  function renderActorDetailBody(actor) {
    const rows = [];
    rows.push('<div class="effect-detail-name">' + escapeHtml(actor.name || 'Sin nombre') + '</div>');
    rows.push('<div class="day-period">' + escapeHtml(formatActorSourceLabel(actor)) + ' - ' + escapeHtml(formatScopeLabel(actor.scope)) + '</div>');

    const stats = [];
    if (actor.hitDice && actor.hitDice.raw) stats.push(formatFieldRow('DG', actor.hitDice.raw));
    if (actor.hitPoints !== null && actor.hitPoints !== undefined) stats.push(formatFieldRow('PG', actor.hitPoints));
    if (actor.armorClass && (actor.armorClass.descending !== null && actor.armorClass.descending !== undefined)) {
      const ac = actor.armorClass.ascending !== null && actor.armorClass.ascending !== undefined
        ? actor.armorClass.descending + ' [' + actor.armorClass.ascending + ']'
        : String(actor.armorClass.descending);
      stats.push(formatFieldRow('CA', ac));
    }
    if (actor.movement) stats.push(formatFieldRow('MV', actor.movement));
    if (actor.thac0) stats.push(formatFieldRow('THAC0', actor.thac0));
    if (actor.baseAttackBonus !== null && actor.baseAttackBonus !== undefined) stats.push(formatFieldRow('BA', (actor.baseAttackBonus >= 0 ? '+' : '') + actor.baseAttackBonus));
    if (actor.morale && actor.morale.raw) stats.push(formatFieldRow('Moral', actor.morale.raw));
    if (actor.alignment) stats.push(formatFieldRow('AL', actor.alignment));
    if (actor.xp && actor.xp.raw) stats.push(formatFieldRow('PX', actor.xp.raw));
    if (actor.savingThrows) stats.push(formatFieldRow('Salvaciones', actor.savingThrows));
    if (actor.treasure) stats.push(formatFieldRow('Tesoro', actor.treasure));
    if (stats.length) rows.push('<div class="effect-detail-section">' + stats.join('') + '</div>');

    if (actor.numberAppearing && (actor.numberAppearing.dungeon || actor.numberAppearing.wilderness)) {
      const naRows = [];
      if (actor.numberAppearing.dungeon) naRows.push(formatFieldRow('Mazmorra', actor.numberAppearing.dungeon));
      if (actor.numberAppearing.wilderness) naRows.push(formatFieldRow('Exterior', actor.numberAppearing.wilderness));
      rows.push('<div class="effect-detail-section"><div class="encounter-header">Aparición</div>' + naRows.join('') + '</div>');
    }

    if (Array.isArray(actor.attacks) && actor.attacks.length) {
      const atkRows = actor.attacks.map(function (attack) {
        const label = attack.name || attack.raw || 'Ataque';
        const detail = attack.damage || attack.raw || '';
        return '<div class="list-item">' + escapeHtml(label) + (detail ? ' - ' + escapeHtml(detail) : '') + '</div>';
      }).join('');
      rows.push('<div class="effect-detail-section"><div class="encounter-header">Ataques</div>' + atkRows + '</div>');
    }

    if (Array.isArray(actor.abilities) && actor.abilities.length) {
      const abilityRows = actor.abilities.map(function (ability) {
        return '<div class="list-item"><strong>' + escapeHtml(ability.name || '') + '</strong>' + (ability.text ? ': ' + escapeHtml(ability.text) : '') + '</div>';
      }).join('');
      rows.push('<div class="effect-detail-section"><div class="encounter-header">Habilidades</div>' + abilityRows + '</div>');
    }

    if (actor.notes) {
      rows.push('<div class="effect-detail-section"><div class="encounter-header">Notas</div><div>' + escapeHtml(actor.notes) + '</div></div>');
    }

    rows.push(
      '<div class="modal-actions">' +
        '<button type="button" id="codexActorDetailEditBtn" class="tui-button white-255 black-255-text">Editar</button>' +
        '<button type="button" id="codexActorDetailDeleteBtn" class="tui-button white-255 black-255-text">Eliminar</button>' +
        '<button type="button" class="tui-button white-255 black-255-text btn-primary" data-close-modal>Cerrar</button>' +
      '</div>'
    );

    return rows.join('');
  }

  function openCodexActorDetail(id) {
    const actor = NS.repository.getActorById(state, id);
    if (!actor) return;
    document.getElementById('codexActorDetailBody').innerHTML = renderActorDetailBody(actor);
    openModal('codexActorDetailModal');
  }

  function openCodexNew() {
    if (codexActiveTab === 'encounter') {
      openCodexEncounterNew();
      return;
    }
    const scopeFilterEl = document.getElementById('codexScopeFilter');
    const defaultScope = scopeFilterEl && scopeFilterEl.value === 'library' ? 'library' : 'campaign';
    openStatblockReviewFromModel(createBlankStatblockModel(codexActiveTab), [], { allowBack: false, scope: defaultScope });
  }

  function openCodexEdit() {
    if (!codexSelectedId) return;
    if (codexActiveTab === 'encounter') {
      const encounter = NS.repository.getEncounterById(state, codexSelectedId);
      if (encounter) openCodexEncounterEdit(encounter);
      return;
    }
    const actor = NS.repository.getActorById(state, codexSelectedId);
    if (!actor) return;
    closeModal('codexActorDetailModal');
    openStatblockReviewFromModel(actor, [], { allowBack: false, scope: actor.scope });
  }

  function requestCodexDelete(kind, id) {
    const record = kind === 'encounter' ? NS.repository.getEncounterById(state, id) : NS.repository.getActorById(state, id);
    if (!record) return;
    pendingCodexDelete = { kind: kind, id: id };
    document.getElementById('codexDeleteConfirmBody').textContent = '¿Eliminar "' + (record.name || record.id) + '"?';
    closeModal('codexActorDetailModal');
    closeModal('codexEncounterDetailModal');
    openModal('codexDeleteConfirmModal');
  }

  function performCodexDelete() {
    if (!pendingCodexDelete) return;
    const name = (pendingCodexDelete.kind === 'encounter'
      ? NS.repository.getEncounterById(state, pendingCodexDelete.id)
      : NS.repository.getActorById(state, pendingCodexDelete.id));
    const label = name ? (name.name || name.id) : pendingCodexDelete.id;
    if (pendingCodexDelete.kind === 'encounter') {
      NS.repository.deleteEncounter(state, pendingCodexDelete.id);
    } else {
      NS.repository.deleteActor(state, pendingCodexDelete.kind, pendingCodexDelete.id);
    }
    NS.addLog(state, 'Contenido personalizado eliminado: ' + label + '.');
    pendingCodexDelete = null;
    codexSelectedId = null;
    closeModal('codexDeleteConfirmModal');
    renderCodexList();
  }

  // --- Encuentros ------------------------------------------------------

  function renderCodexEncounterCreatureRow(group) {
    const actor = group && group.actorId ? NS.repository.getActorById(state, group.actorId) : null;
    const name = group ? (actor ? (actor.name || 'Sin nombre') : '[Contenido no disponible]') : '';
    const row = document.createElement('div');
    row.className = 'statblock-attack-row codex-creature-row';
    row.dataset.actorId = group && group.actorId ? group.actorId : '';
    row.innerHTML =
      '<span class="codex-creature-name">' + escapeHtml(name) + '</span>' +
      '<input class="tui-input codex-creature-quantity" type="text" placeholder="1d4" value="' + escapeHtml(group && group.quantity ? group.quantity : '1') + '" />' +
      '<button type="button" class="tui-button white-255 black-255-text sb-attack-remove" title="Quitar criatura">X</button>';
    return row;
  }

  function renderCodexEncounterCreaturesList(groups) {
    const list = document.getElementById('codexEncounterCreaturesList');
    if (!list) return;
    list.innerHTML = '';
    (groups || []).forEach(function (group) {
      list.appendChild(renderCodexEncounterCreatureRow(group));
    });
  }

  function readCodexEncounterGroupsFromForm() {
    return Array.from(document.querySelectorAll('#codexEncounterCreaturesList .codex-creature-row'))
      .map(function (row) {
        return {
          actorId: row.dataset.actorId || null,
          quantity: nullableText(row.querySelector('.codex-creature-quantity').value) || '1'
        };
      })
      .filter(function (group) { return group.actorId; });
  }

  function openCodexEncounterNew() {
    codexEncounterEditingId = null;
    document.getElementById('codexEncounterEditLegend').textContent = 'Nuevo encuentro';
    document.getElementById('codexEncounterNameInput').value = '';
    document.getElementById('codexEncounterNotesInput').value = '';
    const scopeFilterEl = document.getElementById('codexScopeFilter');
    const defaultScope = scopeFilterEl && scopeFilterEl.value === 'library' ? 'library' : 'campaign';
    document.getElementById('codexEncounterScopeLibrary').checked = defaultScope === 'library';
    document.getElementById('codexEncounterScopeCampaign').checked = defaultScope !== 'library';
    renderCodexEncounterCreaturesList([]);
    openModal('codexEncounterEditModal');
  }

  function openCodexEncounterEdit(encounter) {
    codexEncounterEditingId = encounter.id;
    document.getElementById('codexEncounterEditLegend').textContent = 'Editar encuentro: ' + (encounter.name || '');
    document.getElementById('codexEncounterNameInput').value = encounter.name || '';
    document.getElementById('codexEncounterNotesInput').value = encounter.notes || '';
    document.getElementById('codexEncounterScopeLibrary').checked = encounter.scope === 'library';
    document.getElementById('codexEncounterScopeCampaign').checked = encounter.scope !== 'library';
    renderCodexEncounterCreaturesList(encounter.groups);
    closeModal('codexEncounterDetailModal');
    openModal('codexEncounterEditModal');
  }

  function saveCodexEncounter() {
    const name = nullableText(document.getElementById('codexEncounterNameInput').value);
    const groups = readCodexEncounterGroupsFromForm();
    const notes = nullableText(document.getElementById('codexEncounterNotesInput').value);
    const scopeInput = document.querySelector('input[name="codexEncounterScope"]:checked');
    const scope = scopeInput && scopeInput.value === 'library' ? 'library' : 'campaign';

    const model = {
      id: codexEncounterEditingId || ('encounter:custom:' + NS.statblock.slugify(name) + '-' + Date.now()),
      type: 'encounter',
      name: name,
      rulesetId: state.campaign.rulesetId || 'generic',
      groups: groups,
      notes: notes,
      scope: scope
    };

    NS.repository.saveEncounter(state, model, scope);
    NS.addLog(state, 'Encuentro guardado: ' + (name || model.id) + '.');

    codexEncounterEditingId = null;
    closeModal('codexEncounterEditModal');
    render();
    refreshCodexIfOpen();
  }

  function openCodexEncounterDetail(id) {
    const encounter = NS.repository.getEncounterById(state, id);
    if (!encounter) return;
    const groups = Array.isArray(encounter.groups) ? encounter.groups : [];
    const groupLines = groups.map(function (group) {
      const actor = NS.repository.getActorById(state, group.actorId);
      const name = actor ? (actor.name || 'Sin nombre') : '[Contenido no disponible]';
      return '<div class="list-item">' + escapeHtml(group.quantity || '?') + ' × ' + escapeHtml(name) + '</div>';
    }).join('');

    const body = document.getElementById('codexEncounterDetailBody');
    body.innerHTML =
      '<div class="effect-detail-name">' + escapeHtml(encounter.name || 'Sin nombre') + '</div>' +
      '<div class="day-period">' + formatScopeLabel(encounter.scope) + '</div>' +
      '<div class="effect-detail-section">' + (groupLines || '<div class="tui-empty-state">Sin criaturas.</div>') + '</div>' +
      (encounter.notes ? '<div class="effect-detail-section"><div class="encounter-header">Notas</div><div>' + escapeHtml(encounter.notes) + '</div></div>' : '') +
      '<div class="modal-actions">' +
        '<button type="button" id="codexEncounterDetailEditBtn" class="tui-button white-255 black-255-text">Editar</button>' +
        '<button type="button" id="codexEncounterDetailDeleteBtn" class="tui-button white-255 black-255-text">Eliminar</button>' +
        '<button type="button" class="tui-button white-255 black-255-text btn-primary" data-close-modal>Cerrar</button>' +
      '</div>';
    openModal('codexEncounterDetailModal');
  }

  // --- Buscador de criaturas para el editor de encuentros --------------

  function renderCodexCreatureSearchResults(query) {
    const results = document.getElementById('codexCreatureSearchResults');
    if (!results) return;
    const monsters = NS.repository.listActors(state, 'monster');
    const npcs = NS.repository.listActors(state, 'npc');
    const all = monsters.concat(npcs);
    const filtered = NS.ui.filterBySearch(all, query, function (item) { return item.name || ''; });

    results.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'tui-empty-state';
      empty.textContent = 'Sin resultados.';
      results.appendChild(empty);
      return;
    }
    filtered.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'list-item codex-creature-pick-row';
      row.dataset.actorId = item.id;
      row.title = 'Añadir al encuentro';
      row.textContent = (item.name || 'Sin nombre') + ' (' + formatScopeLabel(item.scope) + ')';
      results.appendChild(row);
    });
  }

  function openCodexCreatureSearch() {
    const input = document.getElementById('codexCreatureSearchInput');
    if (input) input.value = '';
    renderCodexCreatureSearchResults('');
    openModal('codexCreatureSearchModal');
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

  // Acciones de jugador (Buscar/Escuchar/Forzar/Descansar) al
  // mismo nivel que las de DJ (Avanzar/Encuentro), agrupadas
  // en su propio bloque dentro del panel Acciones — ya no viven detrás de
  // un popup aparte. La lista en sí sigue viniendo de Ruleset Core
  // (state.dungeon.rules.explorationActions), nada hardcodeado aquí.
  function renderDungeonPlayerActions() {
    const list = document.getElementById('dungeonPlayerActions');
    if (!list) return;
    list.innerHTML = '';
    const actions = state.dungeon.rules.explorationActions || [];
    actions.forEach(function (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tui-button white-255 black-255-text';
      btn.dataset.actionId = action.id;
      btn.textContent = action.label + (action.consumesTurn ? '' : ' (r)');
      if (!action.consumesTurn) btn.title = action.label + ' (rápido: no consume turno)';
      list.appendChild(btn);
    });
    // Descansar reutiliza el procedimiento central existente (NS.dungeon.rest,
    // el mismo que Herramientas -> Descanso corto): dura varios turnos y
    // reinicia el ciclo, así que no pasa por el performAction genérico de
    // arriba (pensado para acciones de 0-1 turno).
    const restBtn = document.createElement('button');
    restBtn.type = 'button';
    restBtn.className = 'tui-button white-255 black-255-text';
    restBtn.dataset.actionId = 'rest';
    restBtn.textContent = 'Descansar';
    list.appendChild(restBtn);
  }

  // Ubicación actual: ayuda textual, no un mapa. Solo campos disponibles.
  function renderDungeonLocation() {
    const box = document.getElementById('dungeonLocationSummary');
    if (!box) return;
    const location = state.dungeon.location || {};
    const lines = [];
    if (location.name) lines.push('<strong>' + escapeHtml(location.name) + '</strong>');
    if (location.level) lines.push('Nivel: ' + escapeHtml(location.level));
    if (location.reference) lines.push('Ref: ' + escapeHtml(location.reference));
    if (location.notes) lines.push('Notas: ' + escapeHtml(location.notes));
    box.innerHTML = lines.length ? lines.join('<br>') : 'Sin ubicación registrada.';
  }

  function openLocationModal() {
    const location = state.dungeon.location || {};
    document.getElementById('locationNameInput').value = location.name || '';
    document.getElementById('locationLevelInput').value = location.level || '';
    document.getElementById('locationReferenceInput').value = location.reference || '';
    document.getElementById('locationNotesInput').value = location.notes || '';
    openModal('locationModal');
  }

  function saveLocation() {
    const location = {
      name: document.getElementById('locationNameInput').value.trim(),
      level: document.getElementById('locationLevelInput').value.trim(),
      reference: document.getElementById('locationReferenceInput').value.trim(),
      notes: document.getElementById('locationNotesInput').value.trim()
    };
    state.dungeon.location = location;
    const logParts = [location.name, location.reference].filter(Boolean);
    NS.addLog(state, 'Ubicación: ' + (logParts.length ? logParts.join(' - ') : 'actualizada') + '.');
    closeModal('locationModal');
    render();
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
      'Iniciativa: ' + initiativeTypeLabel(ruleset.combat.initiative.type) + ' - ' + escapeHtml(ruleset.combat.initiative.dice) + '<br>' +
      'Mazmorra: ' + ruleset.dungeon.turnDurationMinutes + ' min/turno - encuentro cada ' + ruleset.dungeon.encounter.intervalTurns + ' turnos<br>' +
      'Moral: ' + (ruleset.combat.morale.enabled ? 'Sí' : 'No') + ' - Reacción: ' + (ruleset.combat.reaction.enabled ? 'Sí' : 'No');
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
      'Iniciativa: ' + initiativeTypeLabel(ruleset.combat.initiative.type) + ' - ' + escapeHtml(ruleset.combat.initiative.dice),
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
      openAddEffectModal();
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
    } else if (action === 'settings') {
      openSettingsModal();
    } else if (action === 'importStatblock') {
      openStatblockImportModal();
    } else if (action === 'codex') {
      openCodexModal();
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
    reconcileEffectTargets();
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

  // --- Efectos: crear/editar/detalle/eliminar --------------------------
  // editingEffectId !== null -> el popup effectModal está en modo edición
  // (mismo formulario reutilizado, ver openEditEffectModal). null -> modo
  // creación (openAddEffectModal).
  let editingEffectId = null;
  let detailEffectId = null;
  let pendingDeleteEffectId = null;

  function renderEffectTargetCheckboxes(selectedIds) {
    const list = document.getElementById('effectTargetsList');
    if (!list) return;
    list.innerHTML = '';
    if (!state.party.length) {
      const empty = document.createElement('div');
      empty.className = 'tui-empty-state';
      empty.textContent = 'No hay personajes en el grupo.';
      list.appendChild(empty);
      return;
    }
    state.party.forEach(function (member) {
      const label = document.createElement('label');
      label.className = 'tui-checkbox effect-target-checkbox';
      // Texto suelto, NO un <span>: el CSS vendor de TuiCss usa un selector
      // genérico ".tui-checkbox span" para el glifo [x]/[ ] (position:
      // absolute, 10x10px). Un <span> aquí para el nombre heredaría esas
      // reglas y se superpondría con el glifo (mismo patrón que ya usa el
      // checkbox "No mostrar al iniciar" de Acerca de: texto suelto).
      label.appendChild(document.createTextNode(member.name));
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'effect-target-input';
      input.value = member.id;
      input.checked = selectedIds.indexOf(member.id) !== -1;
      const box = document.createElement('span');
      label.appendChild(input);
      label.appendChild(box);
      list.appendChild(label);
    });
  }

  function getSelectedEffectTargetIds() {
    return Array.from(document.querySelectorAll('#effectTargetsList .effect-target-input:checked')).map(function (input) {
      return input.value;
    });
  }

  function resetEffectForm() {
    document.getElementById('effectNameInput').value = '';
    document.getElementById('effectDurationInput').value = '3';
    document.getElementById('effectUnitInput').value = 'turnos';
    document.getElementById('effectRemainingInput').value = '1';
    document.getElementById('effectTargetsError').classList.add('hidden');
  }

  function openAddEffectModal() {
    editingEffectId = null;
    resetEffectForm();
    document.getElementById('effectModalLegend').textContent = 'Añadir efecto';
    document.getElementById('effectConfirmBtn').textContent = 'Añadir';
    document.getElementById('effectRemainingField').classList.add('hidden');
    renderEffectTargetCheckboxes([]);
    openModal('effectModal');
  }

  function openEditEffectModal(effectId) {
    const effect = state.dungeon.effects.find(function (item) { return item.id === effectId; });
    if (!effect) return;
    editingEffectId = effectId;
    document.getElementById('effectTargetsError').classList.add('hidden');
    document.getElementById('effectModalLegend').textContent = 'Editar efecto: ' + effect.name;
    document.getElementById('effectConfirmBtn').textContent = 'Guardar cambios';
    document.getElementById('effectNameInput').value = effect.name;
    document.getElementById('effectDurationInput').value = Number(effect.initialDuration) || 1;
    document.getElementById('effectUnitInput').value = effect.unit || 'turnos';
    document.getElementById('effectRemainingInput').value = Math.max(0, Number(effect.duration) || 0);
    document.getElementById('effectRemainingField').classList.remove('hidden');
    renderEffectTargetCheckboxes(Array.isArray(effect.targetIds) ? effect.targetIds : []);
    closeModal('effectDetailModal');
    openModal('effectModal');
  }

  function saveEffectFromForm() {
    const nameInput = document.getElementById('effectNameInput');
    const durationInput = document.getElementById('effectDurationInput');
    const unitInput = document.getElementById('effectUnitInput');
    const remainingInput = document.getElementById('effectRemainingInput');
    const name = nameInput.value.trim();
    if (!name) return;

    const targetIds = getSelectedEffectTargetIds();
    if (!targetIds.length) {
      document.getElementById('effectTargetsError').classList.remove('hidden');
      return;
    }

    const maxDuration = Math.max(1, Number(durationInput.value) || 1);
    const unit = unitInput.value || 'turnos';

    if (editingEffectId) {
      const effect = state.dungeon.effects.find(function (item) { return item.id === editingEffectId; });
      if (!effect) { editingEffectId = null; closeModal('effectModal'); return; }
      effect.name = name;
      effect.targetIds = targetIds;
      effect.initialDuration = maxDuration;
      effect.duration = Math.max(0, Math.min(maxDuration, Number(remainingInput.value) || 0));
      effect.unit = unit;
      if (effect.duration <= 0) {
        effect.active = false;
        NS.addLog(state, 'Finaliza ' + effect.name + ' sobre ' + NS.dungeon.effectTargetsLabel(state, effect) + '.');
      } else {
        NS.addLog(state, 'Se edita ' + effect.name + '.');
      }
      editingEffectId = null;
    } else {
      const newEffect = {
        id: 'effect-' + Date.now(),
        name: name,
        targetIds: targetIds,
        duration: maxDuration,
        initialDuration: maxDuration,
        unit: unit,
        active: true
      };
      state.dungeon.effects.push(newEffect);
      NS.addLog(state, 'Se aplica ' + newEffect.name + ' a ' + NS.dungeon.effectTargetsLabel(state, newEffect) + '.');
    }

    resetEffectForm();
    closeModal('effectModal');
    render();
  }

  function openEffectDetail(effectId) {
    const effect = state.dungeon.effects.find(function (item) { return item.id === effectId; });
    if (!effect) return;
    detailEffectId = effectId;
    const names = (effect.targetIds || []).map(function (id) {
      const member = findPartyMember(state.party, id);
      return member ? member.name : null;
    }).filter(Boolean);
    const max = Number(effect.initialDuration) || 0;
    const current = Math.max(Number(effect.duration) || 0, 0);
    const body = document.getElementById('effectDetailBody');
    body.innerHTML =
      '<div class="effect-detail-name">' + escapeHtml(effect.name) + '</div>' +
      '<div class="effect-detail-section">' +
        '<div class="encounter-field-label">Objetivos</div>' +
        '<div class="compact-list">' + names.map(function (n) { return '<div class="list-item">' + escapeHtml(n) + '</div>'; }).join('') + '</div>' +
      '</div>' +
      '<div class="effect-detail-section">' +
        '<div class="encounter-field-label">Duración</div>' +
        '<div class="duration-block">' +
          '<div class="duration-row"><span>' + current + ' / ' + max + ' ' + escapeHtml(effect.unit) + '</span></div>' +
          renderAsciiProgress(current, max) +
        '</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button type="button" id="effectDetailEditBtn" class="tui-button white-255 black-255-text">Editar</button>' +
        '<button type="button" id="effectDetailDeleteBtn" class="tui-button white-255 black-255-text">Eliminar</button>' +
        '<button type="button" class="tui-button white-255 black-255-text btn-primary" data-close-modal>Cerrar</button>' +
      '</div>';
    openModal('effectDetailModal');
  }

  function requestDeleteEffect(effectId) {
    const effect = state.dungeon.effects.find(function (item) { return item.id === effectId; });
    if (!effect) return;
    const targetIds = Array.isArray(effect.targetIds) ? effect.targetIds : [];
    const hasRemaining = Number(effect.duration) > 0;
    const isMulti = targetIds.length > 1;
    if (!isMulti && !hasRemaining) {
      performDeleteEffect(effectId);
      return;
    }
    pendingDeleteEffectId = effectId;
    const names = targetIds.map(function (id) {
      const member = findPartyMember(state.party, id);
      return member ? member.name : null;
    }).filter(Boolean);
    const affected = isMulti ? ('a ' + names.length + ' personajes.') : (names.length ? ('a ' + names[0] + '.') : 'a sus objetivos.');
    document.getElementById('effectDeleteConfirmBody').innerHTML =
      '¿Eliminar "' + escapeHtml(effect.name) + '"?<br />El efecto dejará de aplicarse ' + escapeHtml(affected);
    closeModal('effectDetailModal');
    openModal('effectDeleteConfirmModal');
  }

  function performDeleteEffect(effectId) {
    const index = state.dungeon.effects.findIndex(function (item) { return item.id === effectId; });
    if (index === -1) return;
    const name = state.dungeon.effects[index].name;
    state.dungeon.effects.splice(index, 1);
    NS.addLog(state, 'Efecto eliminado: ' + name + '.');
    closeModal('effectDeleteConfirmModal');
    closeModal('effectDetailModal');
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
    // Campañas guardadas antes de "Ubicación actual": se crea vacía, nunca
    // se inventa dónde está el grupo.
    if (!dungeon.location) {
      dungeon.location = { name: '', level: '', reference: '', notes: '' };
    }
    (dungeon.lightSources || []).forEach(function (source) {
      if (source.warnedLow === undefined) source.warnedLow = false;
      if (source.exhausted === undefined) source.exhausted = false;
    });
    // Compat legacy: efectos guardados antes de multiobjetivo tenían
    // targetId (referencia singular) o character (nombre de texto suelto).
    // Se migran de forma transparente a targetIds[] la primera vez que se
    // cargan/importan, sin exigir ninguna acción manual.
    (dungeon.effects || []).forEach(function (effect) {
      if (Array.isArray(effect.targetIds)) return;
      let ids = [];
      if (effect.targetId) {
        ids = [effect.targetId];
      } else if (effect.character) {
        const match = state.party.find(function (member) { return member.name === effect.character; });
        if (match) ids = [match.id];
      }
      effect.targetIds = ids;
      delete effect.targetId;
      delete effect.character;
    });
  }

  // Defensivo: si un personaje deja de existir en el grupo, sus efectos no
  // deben romper el render. Se ejecuta en cada render() (coste trivial con
  // grupos pequeños); un efecto que se queda sin objetivos válidos se
  // retira de activos igual que si hubiera expirado por duración.
  function reconcileEffectTargets() {
    const partyIds = state.party.map(function (member) { return member.id; });
    state.dungeon.effects = state.dungeon.effects.filter(function (effect) {
      if (!Array.isArray(effect.targetIds)) return true;
      const before = effect.targetIds.length;
      effect.targetIds = effect.targetIds.filter(function (id) { return partyIds.indexOf(id) !== -1; });
      if (effect.targetIds.length) return true;
      if (before > 0 && effect.active) {
        NS.addLog(state, 'Efecto finalizado (sin objetivos válidos): ' + effect.name + '.');
      }
      return false;
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
    // Campañas guardadas antes del Statblock Importer/Codex no tienen
    // customContent (o no tienen encounters todavía): se crea vacío,
    // nunca se inventan monstruos/PNJ/encuentros.
    if (!state.customContent) {
      state.customContent = { monsters: [], npcs: [], encounters: [] };
    } else {
      if (!Array.isArray(state.customContent.monsters)) state.customContent.monsters = [];
      if (!Array.isArray(state.customContent.npcs)) state.customContent.npcs = [];
      if (!Array.isArray(state.customContent.encounters)) state.customContent.encounters = [];
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
  bindClick('effectConfirmBtn', saveEffectFromForm);
  bindClick('effectTargetsAllBtn', function () {
    document.querySelectorAll('#effectTargetsList .effect-target-input').forEach(function (input) {
      input.checked = true;
    });
  });
  bindClick('effectTargetsClearBtn', function () {
    document.querySelectorAll('#effectTargetsList .effect-target-input').forEach(function (input) {
      input.checked = false;
    });
  });
  bindClick('effectDeleteConfirmBtn', function () {
    performDeleteEffect(pendingDeleteEffectId);
  });

  document.addEventListener('click', function (event) {
    const row = event.target.closest('.effect-row');
    if (row) {
      openEffectDetail(row.dataset.effectId);
      return;
    }
    if (event.target.closest('#effectDetailEditBtn')) {
      openEditEffectModal(detailEffectId);
      return;
    }
    if (event.target.closest('#effectDetailDeleteBtn')) {
      requestDeleteEffect(detailEffectId);
    }
  });

  const settingsThemeSelectEl = document.getElementById('settingsThemeInput');
  if (settingsThemeSelectEl) {
    settingsThemeSelectEl.addEventListener('change', function () {
      applyTheme(settingsThemeSelectEl.value);
    });
  }

  const settingsScanlinesInputEl = document.getElementById('settingsScanlinesInput');
  if (settingsScanlinesInputEl) {
    settingsScanlinesInputEl.addEventListener('change', function () {
      applyScanlines(settingsScanlinesInputEl.checked);
    });
  }

  bindClick('settingsApplyBtn', function () {
    const chosen = settingsThemeSelectEl ? settingsThemeSelectEl.value : DEFAULT_THEME;
    const scanlinesChosen = settingsScanlinesInputEl ? settingsScanlinesInputEl.checked : false;
    const preferences = NS.storage.loadPreferences();
    preferences.theme = chosen;
    preferences.scanlines = scanlinesChosen;
    NS.storage.savePreferences(preferences);
    settingsSavedTheme = chosen;
    settingsSavedScanlines = scanlinesChosen;
    applyTheme(chosen);
    applyScanlines(scanlinesChosen);
    closeModal('settingsModal');
  });

  bindClick('statblockAnalyzeBtn', analyzeStatblock);
  bindClick('sbReviewSaveBtn', saveStatblockReview);
  bindClick('sbReviewBackBtn', function () {
    closeModal('statblockReviewModal');
    openModal('statblockImportModal');
  });
  bindClick('sbReviewAddAttackBtn', function () {
    const list = document.getElementById('sbReviewAttacksList');
    if (list) list.appendChild(renderStatblockAttackRow(null));
  });
  bindClick('sbReviewAddAbilityBtn', function () {
    const list = document.getElementById('sbReviewAbilitiesList');
    if (list) list.appendChild(renderStatblockAbilityRow(null));
  });

  document.addEventListener('click', function (event) {
    const removeAttackBtn = event.target.closest('.sb-attack-remove');
    if (removeAttackBtn) {
      const row = removeAttackBtn.closest('.statblock-attack-row');
      if (row) row.remove();
      return;
    }
    const removeAbilityBtn = event.target.closest('.sb-ability-remove');
    if (removeAbilityBtn) {
      const row = removeAbilityBtn.closest('.statblock-ability-row');
      if (row) row.remove();
    }
  });

  // --- Codex: wiring ----------------------------------------------------
  document.querySelectorAll('.codex-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setCodexTab(btn.dataset.codexTab);
    });
  });

  const codexSearchInputEl = document.getElementById('codexSearchInput');
  if (codexSearchInputEl) {
    codexSearchInputEl.addEventListener('input', renderCodexList);
  }
  const codexScopeFilterEl = document.getElementById('codexScopeFilter');
  if (codexScopeFilterEl) {
    codexScopeFilterEl.addEventListener('change', renderCodexList);
  }

  bindClick('codexNewBtn', openCodexNew);
  bindClick('codexImportBtn', openStatblockImportModal);
  bindClick('codexEditBtn', openCodexEdit);
  bindClick('codexDeleteBtn', function () {
    if (codexSelectedId) requestCodexDelete(codexActiveTab, codexSelectedId);
  });
  bindClick('codexDeleteConfirmBtn', performCodexDelete);
  bindClick('codexEncounterAddCreatureBtn', openCodexCreatureSearch);
  bindClick('codexEncounterSaveBtn', saveCodexEncounter);

  const codexCreatureSearchInputEl = document.getElementById('codexCreatureSearchInput');
  if (codexCreatureSearchInputEl) {
    codexCreatureSearchInputEl.addEventListener('input', function () {
      renderCodexCreatureSearchResults(codexCreatureSearchInputEl.value);
    });
  }

  document.addEventListener('click', function (event) {
    const codexRow = event.target.closest('.codex-row:not(.codex-row-header)');
    if (codexRow && codexRow.dataset.codexId) {
      codexSelectedId = codexRow.dataset.codexId;
      renderCodexList();
      openCodexDetailForSelected();
      return;
    }
    const creaturePickRow = event.target.closest('.codex-creature-pick-row');
    if (creaturePickRow && creaturePickRow.dataset.actorId) {
      const list = document.getElementById('codexEncounterCreaturesList');
      if (list) list.appendChild(renderCodexEncounterCreatureRow({ actorId: creaturePickRow.dataset.actorId, quantity: '1' }));
      closeModal('codexCreatureSearchModal');
      return;
    }
    if (event.target.closest('#codexActorDetailEditBtn')) {
      openCodexEdit();
      return;
    }
    if (event.target.closest('#codexActorDetailDeleteBtn')) {
      if (codexSelectedId) requestCodexDelete(codexActiveTab, codexSelectedId);
      return;
    }
    if (event.target.closest('#codexEncounterDetailEditBtn')) {
      openCodexEdit();
      return;
    }
    if (event.target.closest('#codexEncounterDetailDeleteBtn')) {
      if (codexSelectedId) requestCodexDelete('encounter', codexSelectedId);
    }
  });

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

  // Delegado a propósito (a diferencia de data-open-modal, que solo vive
  // en botones estáticos del HTML): varios popups de detalle construyen su
  // botón "Cerrar" con innerHTML en tiempo de ejecución (efectos, fichas
  // del Codex...), y un bindeo por elemento en el arranque nunca los
  // habría encontrado — el clic no habría hecho nada.
  document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-close-modal]');
    if (!trigger) return;
    const modal = trigger.closest('.tui-modal');
    if (modal) closeModal(modal.id);
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
      const sep = d.kind === 'd66' ? '->' : '=';
      lines.push(escapeHtml(d.notation) + ' -> [' + d.rolls.join(', ') + '] ' + sep + ' ' + d.subtotal);
    });
    lines.push('Total: ' + result.total);
    if (result.comparison) {
      lines.push(result.comparison.operator + ' ' + result.comparison.target +
        ' -> <span class="dice-comparison-' + (result.comparison.success ? 'success' : 'fail') + '">' +
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
        diceModal: 'diceRollBtn',
        settingsModal: 'settingsApplyBtn'
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

    const codexModalEl = document.getElementById('codexModal');
    if (codexModalEl && codexModalEl.classList.contains('active') && !isTypingTarget(event)) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const items = getCodexFilteredItems();
        const currentIndex = items.findIndex(function (item) { return item.id === codexSelectedId; });
        const nextIndex = NS.ui.nextListIndex(event.key, currentIndex === -1 ? 0 : currentIndex, items.length);
        if (nextIndex !== null) {
          codexSelectedId = items[nextIndex].id;
          renderCodexList();
          scrollSelectedRowIntoView('codexList');
        }
        return;
      }
      if (event.key === 'Enter' && codexSelectedId) {
        event.preventDefault();
        openCodexDetailForSelected();
        return;
      }
    }

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
    button.textContent = isCompact ? 'O' : 'o';
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

  bindClick('editLocationBtn', openLocationModal);
  bindClick('locationSaveBtn', saveLocation);

  const dungeonPlayerActionsEl = document.getElementById('dungeonPlayerActions');
  if (dungeonPlayerActionsEl) {
    dungeonPlayerActionsEl.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-action-id]');
      if (!btn) return;
      if (btn.dataset.actionId === 'rest') {
        NS.dungeon.rest(state);
      } else {
        NS.dungeon.performAction(state, btn.dataset.actionId);
      }
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

  applyTheme(getSavedTheme());
  applyScanlines(getSavedScanlines());

  tickClock();
  setInterval(tickClock, 1000);

  loadSavedState();
  setMode(currentMode);
  render();
  if (NS.storage.loadPreferences().hideAboutOnStartup !== true) {
    openAboutModal();
  }
})();
