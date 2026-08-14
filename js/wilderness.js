(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  function coordKey(q, r) {
    return q + ',' + r;
  }

  // Mismos offsets axiales que usaba randomDirection(); nombrados una vez aquí
  // para reutilizarlos en el popup de viaje y en previewTravel/travel.
  const HEX_DIRECTIONS = [
    { key: 'E', label: 'Este', abbr: 'E', dx: 1, dy: 0 },
    { key: 'W', label: 'Oeste', abbr: 'O', dx: -1, dy: 0 },
    { key: 'SE', label: 'Sureste', abbr: 'SE', dx: 0, dy: 1 },
    { key: 'NW', label: 'Noroeste', abbr: 'NO', dx: 0, dy: -1 },
    { key: 'NE', label: 'Noreste', abbr: 'NE', dx: 1, dy: -1 },
    { key: 'SW', label: 'Suroeste', abbr: 'SO', dx: -1, dy: 1 }
  ];

  const TERRAIN_LABELS = {
    forest: 'Bosque',
    plains: 'Llanuras',
    hills: 'Colinas',
    mountains: 'Montañas',
    swamp: 'Pantano',
    desert: 'Desierto'
  };

  function terrainLabel(key) {
    return TERRAIN_LABELS[key] || key || 'Desconocido';
  }

  function terrainByRoll(state, roll) {
    const table = state.wilderness.terrainTable || [
      { range: '1-2', terrain: 'forest' },
      { range: '3-4', terrain: 'plains' },
      { range: '5', terrain: 'hills' },
      { range: '6', terrain: 'swamp' }
    ];

    for (let i = 0; i < table.length; i += 1) {
      const entry = table[i];
      const items = String(entry.range).split('-');
      if (items.length === 2) {
        const start = Number(items[0]);
        const end = Number(items[1]);
        if (roll >= start && roll <= end) return entry.terrain;
      } else if (Number(entry.range) === roll) {
        return entry.terrain;
      }
    }

    return state.wilderness.terrain || 'forest';
  }

  function ensureHex(state, id) {
    if (!state.wilderness.hexes) {
      state.wilderness.hexes = [];
    }

    let hexa = state.wilderness.hexes.find(function (hex) {
      return hex.id === id;
    });

    if (!hexa) {
      const parts = String(id || '0,0').split(',');
      const q = Number(parts[0] || 0);
      const r = Number(parts[1] || 0);
      hexa = {
        id: id || coordKey(q, r),
        q: q,
        r: r,
        terrain: state.wilderness.terrain || 'forest',
        discovered: true,
        visited: false,
        name: '',
        locations: [],
        notes: '',
        gmNotes: '',
        encounters: []
      };
      state.wilderness.hexes.push(hexa);
    }

    return hexa;
  }

  function randomClimate(state) {
    const climates = (state.wilderness.rules && state.wilderness.rules.climates) || ['Claro'];
    const index = NS.roll('1d' + climates.length).total - 1;
    return climates[index];
  }

  function reportResourceLevel(state, resourceName, value, warnFlagKey, emptyFlagKey) {
    if (value <= 0) {
      if (!state.wilderness[emptyFlagKey]) {
        state.wilderness[emptyFlagKey] = true;
        NS.addLog(state, 'El grupo se ha quedado sin ' + resourceName + '.');
      }
      return;
    }
    state.wilderness[emptyFlagKey] = false;
    if (value <= 1) {
      if (!state.wilderness[warnFlagKey]) {
        state.wilderness[warnFlagKey] = true;
        NS.addLog(state, 'Queda ' + resourceName + ' para ' + value + ' día' + (value === 1 ? '' : 's') + '.');
      }
    } else {
      state.wilderness[warnFlagKey] = false;
    }
  }

  function processNewDays(state, daysElapsed) {
    const rules = state.wilderness.rules;
    const partySize = Math.max(1, state.party.length);
    const foodCost = (rules.foodPerCharacterPerDay || 1) * partySize;
    const waterCost = (rules.waterPerCharacterPerDay || 1) * partySize;

    for (let i = 0; i < daysElapsed; i += 1) {
      state.wilderness.movementRemaining = rules.movementPerDay || 6;
      state.wilderness.travel.food = Math.max(0, (state.wilderness.travel.food || 0) - foodCost);
      state.wilderness.travel.water = Math.max(0, (state.wilderness.travel.water || 0) - waterCost);
    }

    reportResourceLevel(state, 'comida', state.wilderness.travel.food, 'foodWarned', 'foodEmptyWarned');
    reportResourceLevel(state, 'agua', state.wilderness.travel.water, 'waterWarned', 'waterEmptyWarned');
  }

  // Motor de tiempo centralizado: reutiliza exactamente la misma lógica de reloj,
  // luz y efectos que usa Mazmorra (NS.dungeon.*), y añade el consumo diario de
  // recursos propio de Exterior. Los efectos en "turnos" (de mazmorra) nunca se
  // tocan desde aquí.
  function advanceWildernessTime(state, minutes) {
    const dayBefore = state.worldTime.day;
    NS.dungeon.advanceClockByMinutes(state, minutes);
    NS.dungeon.consumeLightSources(state, minutes);
    NS.dungeon.updateExplorationEffects(state, minutes, { skipTurnBasedUnits: true });
    const daysElapsed = state.worldTime.day - dayBefore;
    if (daysElapsed > 0) {
      processNewDays(state, daysElapsed);
    }
  }

  function raiseFatigue(state) {
    const rules = state.wilderness.rules;
    state.wilderness.travel.fatigue = Math.min(
      rules.fatigueMax || 5,
      (state.wilderness.travel.fatigue || 0) + (rules.fatiguePerStep || 1)
    );
  }

  NS.wilderness = {
    ensureHex: ensureHex,

    getCurrentHex: function (state) {
      const currentId = state.wilderness.hex || '0,0';
      return ensureHex(state, currentId);
    },

    moveToHex: function (state, q, r) {
      const id = coordKey(q, r);
      const hexa = ensureHex(state, id);
      state.wilderness.coords = { q: q, r: r };
      state.wilderness.hex = id;
      state.wilderness.terrain = hexa.terrain || state.wilderness.terrain || 'forest';
      hexa.visited = true;
      hexa.discovered = true;
      return hexa;
    },

    HEX_DIRECTIONS: HEX_DIRECTIONS,
    terrainLabel: terrainLabel,

    // Puramente de lectura: nunca debe mutar state (no usa ensureHex, que crea
    // hexes). El popup de viaje se apoya en esto para su vista previa en vivo.
    previewTravel: function (state, directionKey) {
      const direction = HEX_DIRECTIONS.find(function (item) {
        return item.key === directionKey;
      });
      if (!direction) return null;

      const rules = state.wilderness.rules;
      const current = NS.wilderness.getCurrentHex(state);
      const currentTerrain = current.terrain || state.wilderness.terrain || 'forest';
      const cost = state.wilderness.terrainModifiers[currentTerrain] || 1;

      const fromQ = (state.wilderness.coords && state.wilderness.coords.q) || 0;
      const fromR = (state.wilderness.coords && state.wilderness.coords.r) || 0;
      const nextQ = fromQ + direction.dx;
      const nextR = fromR + direction.dy;
      const nextId = coordKey(nextQ, nextR);

      const knownHex = (state.wilderness.hexes || []).find(function (hex) {
        return hex.id === nextId;
      });
      const known = !!(knownHex && knownHex.discovered);

      const movementBefore = state.wilderness.movementRemaining || 0;
      const movementAfter = Math.max(0, movementBefore - cost);

      return {
        direction: direction,
        from: { q: fromQ, r: fromR },
        to: { q: nextQ, r: nextR },
        hexId: nextId,
        known: known,
        terrain: known ? (knownHex.terrain || currentTerrain) : null,
        cost: cost,
        movementBefore: movementBefore,
        movementAfter: movementAfter,
        sufficient: movementBefore >= cost
      };
    },

    travel: function (state, directionKey) {
      const preview = NS.wilderness.previewTravel(state, directionKey);
      if (!preview) {
        NS.addLog(state, 'Dirección de viaje no válida.');
        return { blocked: true };
      }
      if (!preview.sufficient) {
        NS.addLog(state, 'No queda movimiento suficiente para viajar hoy.');
        return { blocked: true };
      }

      const rules = state.wilderness.rules;
      const current = NS.wilderness.getCurrentHex(state);
      const currentTerrain = current.terrain || state.wilderness.terrain || 'forest';
      const isFirstVisit = !ensureHex(state, preview.hexId).visited;

      NS.addLog(state, 'El grupo viaja hacia el ' + preview.direction.label + '.');
      NS.addLog(state, 'Viaja por ' + terrainLabel(currentTerrain) + '.');
      advanceWildernessTime(state, (rules.travelHoursPerStep || 4) * 60);

      const nextHex = NS.wilderness.moveToHex(state, preview.to.q, preview.to.r);
      if (isFirstVisit) {
        nextHex.terrain = terrainByRoll(state, NS.roll('1d6').total);
      }
      state.wilderness.terrain = nextHex.terrain;

      state.wilderness.movementRemaining = Math.max(0, (state.wilderness.movementRemaining || 0) - preview.cost);
      state.wilderness.travel.distance = (state.wilderness.travel.distance || 0) + preview.cost;
      state.wilderness.travel.weather = randomClimate(state);
      raiseFatigue(state);

      NS.addLog(state, 'Movimiento restante: ' + state.wilderness.movementRemaining + '/' + (rules.movementPerDay || 6) + '.');
      NS.addLog(state, 'El grupo entra en el hex ' + nextHex.id + '.');

      NS.dungeon.checkEncounter(state);

      return { hex: nextHex, cost: preview.cost };
    },

    explore: function (state) {
      const rules = state.wilderness.rules;
      const hexa = NS.wilderness.getCurrentHex(state);
      const roll = NS.roll('1d6');

      advanceWildernessTime(state, (rules.explorationHours || 2) * 60);
      hexa.visited = true;
      hexa.discovered = true;
      raiseFatigue(state);

      if (roll.total <= 2) {
        hexa.locations = hexa.locations || [];
        const discovery = 'Posible sendero oculto';
        if (hexa.locations.indexOf(discovery) === -1) hexa.locations.push(discovery);
        NS.addLog(state, 'Descubre: ' + discovery + '.');
      } else if (roll.total <= 4) {
        hexa.gmNotes = hexa.gmNotes || 'Rastro reciente de humanoides.';
        NS.addLog(state, 'Exploración: rastros y señales recientes.');
      } else {
        NS.addLog(state, 'Exploración: sin novedades destacables.');
      }

      NS.dungeon.checkEncounter(state);

      return { roll: roll, hex: hexa };
    },

    hunt: function (state) {
      const rules = state.wilderness.rules;
      const roll = NS.roll(rules.huntDice || '1d6');

      advanceWildernessTime(state, (rules.huntHours || 3) * 60);
      raiseFatigue(state);

      if (roll.total >= (rules.huntSuccessThreshold || 4)) {
        const gained = rules.huntFoodYield || 2;
        state.wilderness.travel.food = (state.wilderness.travel.food || 0) + gained;
        state.wilderness.foodWarned = false;
        state.wilderness.foodEmptyWarned = false;
        NS.addLog(state, 'Caza: obtiene ' + gained + ' raciones de comida.');
      } else {
        NS.addLog(state, 'Caza: no encuentran presa.');
      }

      NS.dungeon.checkEncounter(state);

      return roll;
    },

    camp: function (state, hours) {
      const rules = state.wilderness.rules;
      const duration = Math.max(1, Number(hours) || rules.campHours || 8);

      advanceWildernessTime(state, duration * 60);
      state.wilderness.travel.fatigue = Math.max(0, (state.wilderness.travel.fatigue || 0) - (rules.campFatigueRecovery || 3));
      state.wilderness.travel.weather = randomClimate(state);

      NS.addLog(state, 'El grupo acampa durante ' + duration + ' horas.');
      NS.dungeon.checkEncounter(state);

      return { hours: duration };
    }
  };
})();
