(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  // Esqueleto compartido por createEmptyCampaign() y createDemoCampaign():
  // toda la forma de datos que el resto de la app necesita (motores de
  // Mazmorra/Exterior/Combate, Ruleset Core), sin ningún personaje/luz/
  // efecto/hex de ejemplo. Esos datos de demostración viven únicamente en
  // createDemoCampaign(), nunca en el estado inicial real de la app.
  function buildBaseState() {
    const state = {
      schemaVersion: 1,
      campaign: {
        name: '',
        adventure: '',
        currentMode: 'dungeon',
        rulesetId: 'generic',
        customRuleset: null
      },
      worldTime: {
        day: 1,
        hour: 8,
        minute: 0
      },
      party: [],
      playerSummary: {
        totalCharacters: 0,
        totalHp: 0,
        maxHp: 0
      },
      // Contenido personalizado (Statblock Importer + Codex): pertenece a
      // la campaña, no a preferencias globales — viaja en el JSON
      // exportado y sobrevive a guardar/recargar/importar igual que el
      // resto del estado. El Codex combina esto con la Biblioteca global
      // (localStorage aparte, ver js/repository.js) sin duplicar registros.
      customContent: {
        monsters: [],
        npcs: [],
        encounters: []
      },
      dungeon: {
        turn: 0,
        encounterCounter: 0,
        restCounter: 0,
        restWarned: false,
        rules: {
          turnDurationMinutes: 10,
          encounterEveryTurns: 2,
          encounterRoll: '1d6',
          encounterResults: [1],
          restEveryTurns: 6,
          restDurationTurns: 1,
          explorationActions: [
            { id: 'search', label: 'Buscar', consumesTurn: true, logText: 'El grupo busca en la zona.' },
            { id: 'listen', label: 'Escuchar', consumesTurn: false, logText: 'El grupo escucha con atención.' },
            { id: 'force-door', label: 'Forzar', consumesTurn: true, logText: 'El grupo fuerza una puerta.' }
          ]
        },
        lightSources: [],
        effects: [],
        encounterTable: {
          name: 'Encuentros nivel 1',
          dice: '1d6',
          entries: [
            { range: '1-2', text: 'Goblins', quantity: '2d4' },
            { range: '3-4', text: 'Esqueletos', quantity: '1d6' },
            { range: '5', text: 'Mercader', quantity: '1' },
            { range: '6', text: 'Sin encuentro', quantity: '0' }
          ]
        },
        lastEncounter: null,
        // Ayuda puramente textual para recordar dónde está el grupo ahora
        // mismo — NO es un mapa ni un grafo de salas. Todos los campos son
        // opcionales.
        location: {
          name: '',
          level: '',
          reference: '',
          notes: ''
        }
      },
      wilderness: {
        terrain: 'forest',
        hex: '0,0',
        coords: { q: 0, r: 0 },
        movementRemaining: 6,
        foodWarned: false,
        foodEmptyWarned: false,
        waterWarned: false,
        waterEmptyWarned: false,
        terrainModifiers: {
          plains: 1,
          forest: 1.5,
          hills: 1.5,
          mountains: 2,
          swamp: 2
        },
        terrainTable: [
          { range: '1-2', terrain: 'forest' },
          { range: '3-4', terrain: 'plains' },
          { range: '5', terrain: 'hills' },
          { range: '6', terrain: 'swamp' }
        ],
        travel: {
          hours: 0,
          distance: 0,
          weather: 'Claro',
          food: 2,
          water: 2,
          fatigue: 0
        },
        rules: {
          travelHoursPerStep: 4,
          movementPerDay: 6,
          explorationHours: 2,
          huntHours: 3,
          huntDice: '1d6',
          huntSuccessThreshold: 4,
          huntFoodYield: 2,
          campHours: 8,
          campFatigueRecovery: 3,
          fatiguePerStep: 1,
          fatigueMax: 5,
          foodPerCharacterPerDay: 1,
          waterPerCharacterPerDay: 1,
          climates: ['Claro', 'Bruma', 'Lluvia ligera', 'Viento fuerte', 'Niebla']
        },
        hexes: [
          {
            id: '0,0',
            q: 0,
            r: 0,
            terrain: 'forest',
            discovered: true,
            visited: true,
            name: '',
            locations: [],
            notes: '',
            gmNotes: '',
            encounters: []
          }
        ]
      },
      combat: {
        active: false,
        round: 0,
        currentTurn: 0,
        previousMode: null,
        selectedId: null,
        initiativeDice: '1d6',
        initiativeHighestFirst: true,
        combatants: []
      },
      rules: {
        initiative: {
          type: 'individual',
          dice: '1d6',
          highestFirst: true
        },
        morale: {
          enabled: true,
          dice: '2d6',
          table: [
            { range: '2-3', result: 'Huida inmediata' },
            { range: '4-5', result: 'Cauto / reacio' },
            { range: '6-8', result: 'Se mantiene firme' },
            { range: '9-10', result: 'Ataque decidido' },
            { range: '11-12', result: 'Lucha a muerte' }
          ]
        },
        reaction: {
          enabled: true,
          dice: '2d6',
          table: [
            { range: '2-3', result: 'Hostil' },
            { range: '4-5', result: 'Desconfiado' },
            { range: '6-8', result: 'Neutral' },
            { range: '9-10', result: 'Amistoso' },
            { range: '11-12', result: 'Colaborador' }
          ]
        },
        monsterLibrary: [
          { id: 'goblin', name: 'Goblin', type: 'monster', hp: 5, ac: 13, quantity: '2d4', note: 'Ladrón y emboscador' },
          { id: 'skeleton', name: 'Esqueleto', type: 'monster', hp: 6, ac: 13, quantity: '1d6', note: 'Muerto sin alma' },
          { id: 'bandit', name: 'Bandido', type: 'monster', hp: 8, ac: 13, quantity: '1d4', note: 'Mercenario de carretera' },
          { id: 'wolf', name: 'Lobo', type: 'monster', hp: 10, ac: 13, quantity: '1d3', note: 'Depredador de la noche' },
          { id: 'cultist', name: 'Cultista', type: 'monster', hp: 7, ac: 12, quantity: '1d4', note: 'Fanático de un rito oscuro' }
        ],
        npcDirectory: [
          { id: 'merchant', name: 'Mercader', type: 'npc', role: 'Comerciante', note: 'Busca un trato rentable' },
          { id: 'hermit', name: 'Ermitaño', type: 'npc', role: 'Sabio local', note: 'Conoce secretos del bosque' },
          { id: 'guard', name: 'Guardia', type: 'npc', role: 'Protector', note: 'Responde a la ley y la paga' },
          { id: 'hunter', name: 'Cazador', type: 'npc', role: 'Explorador', note: 'Sabe seguir rastros' },
          { id: 'priest', name: 'Sacerdote', type: 'npc', role: 'Clérigo', note: 'Puede ayudar con curaciones' }
        ],
        encounterTemplates: [
          { key: 'goblins', name: 'Goblins', source: 'monsterLibrary', entry: 'goblin' },
          { key: 'esqueletos', name: 'Esqueletos', source: 'monsterLibrary', entry: 'skeleton' },
          { key: 'mercader', name: 'Mercader', source: 'npcDirectory', entry: 'merchant' }
        ]
      },
      sessionLog: [
        'La campaña comienza.'
      ],
      ui: {
        lastMessage: 'Campaña lista.'
      },
      meta: {
        lastSavedAt: null
      }
    };

    // Los valores de dungeon.rules/wilderness.rules/rules.initiative etc.
    // arriba son solo la forma; el contenido real lo aporta el ruleset
    // "generic" (mismo comportamiento que tenía la app antes de Ruleset
    // Core). Ver js/rules/generic.js y js/rules/resolver.js#applyToState.
    NS.rules.applyToState(state, 'generic');

    return state;
  }

  // Estado con el que arranca la app cuando no hay ninguna campaña
  // guardada: válido para todos los motores, sin ningún dato de ejemplo.
  NS.createEmptyCampaign = function () {
    const state = buildBaseState();
    NS.recalculatePartySummary(state);
    return state;
  };

  // Plantilla explícita de campaña de demostración (Archivo → Cargar
  // demo...). Cada llamada construye un estado nuevo e independiente: no
  // comparte arrays/objetos entre invocaciones, así que jugar/modificar la
  // demo cargada nunca altera la plantilla.
  NS.createDemoCampaign = function () {
    const state = buildBaseState();

    state.campaign.name = 'Campaña de demostración';
    state.campaign.adventure = 'La Marca del Este';
    state.campaign.createdFrom = 'demo';

    state.party.push({
      id: 'pc-1',
      name: 'Borin',
      player: 'DJ',
      class: 'Guerrero',
      level: 1,
      hpCurrent: 12,
      hpMax: 12,
      armorClass: 14,
      movement: 120,
      status: 'Listo',
      notes: ''
    });

    state.dungeon.lightSources.push({
      id: 'light-1',
      name: 'Antorcha',
      carrier: 'Borin',
      durationInitial: 20,
      durationRemaining: 20,
      lit: true,
      warnedLow: false,
      exhausted: false
    });

    state.dungeon.effects.push({
      id: 'effect-1',
      name: 'Bendición',
      targetIds: ['pc-1'],
      duration: 2,
      initialDuration: 2,
      unit: 'turnos',
      active: true
    });

    const startHex = state.wilderness.hexes[0];
    startHex.name = 'Bosque de la Marca';
    startHex.locations = ['Sendero antiguo'];
    startHex.notes = 'Pistas de paso humanoide.';
    startHex.gmNotes = 'Hay una cabaña vacía a dos hexes.';

    NS.recalculatePartySummary(state);
    return state;
  };

  NS.cloneState = function (state) {
    return JSON.parse(JSON.stringify(state));
  };

  NS.recalculatePartySummary = function (state) {
    const totalHp = state.party.reduce(function (sum, hero) {
      return sum + Number(hero.hpCurrent || 0);
    }, 0);
    const maxHp = state.party.reduce(function (sum, hero) {
      return sum + Number(hero.hpMax || 0);
    }, 0);

    state.playerSummary = {
      totalCharacters: state.party.length,
      totalHp: totalHp,
      maxHp: maxHp
    };
  };

  NS.buildLogEntry = function (message) {
    const stamp = new Date();
    const h = String(stamp.getHours()).padStart(2, '0');
    const m = String(stamp.getMinutes()).padStart(2, '0');
    return '[' + h + ':' + m + '] ' + message;
  };

  NS.addLog = function (state, message) {
    state.sessionLog.push(NS.buildLogEntry(message));
    state.ui.lastMessage = message;
    if (state.sessionLog.length > 200) {
      state.sessionLog = state.sessionLog.slice(-200);
    }
  };

  NS.matchesRange = function (value, rangeString) {
    if (!rangeString) return false;
    const pieces = String(rangeString).split('-');
    if (pieces.length === 2) {
      const start = Number(pieces[0]);
      const end = Number(pieces[1]);
      return value >= start && value <= end;
    }
    return Number(rangeString) === value;
  };

  NS.findTableResult = function (state, tableKey, value) {
    const table = (state && state.rules && state.rules[tableKey] && state.rules[tableKey].table) || [];
    for (let i = 0; i < table.length; i += 1) {
      const entry = table[i];
      if (NS.matchesRange(value, entry.range)) {
        return entry.result;
      }
    }
    return 'Indiferente';
  };

  NS.resolveEncounterDetail = function (state, label) {
    const normalized = String(label || '').trim().toLowerCase();
    const singular = normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
    const matchesName = function (entry) {
      const name = entry.name.toLowerCase();
      const id = entry.id.toLowerCase();
      return name === normalized || id === normalized || name === singular || id === singular;
    };
    const monsterMatch = (state.rules && state.rules.monsterLibrary || []).find(matchesName);
    if (monsterMatch) {
      return {
        type: 'monster',
        name: monsterMatch.name,
        quantity: monsterMatch.quantity || '1',
        hp: monsterMatch.hp || 5,
        ac: monsterMatch.ac || 12,
        note: monsterMatch.note || ''
      };
    }

    const npcMatch = (state.rules && state.rules.npcDirectory || []).find(matchesName);
    if (npcMatch) {
      return {
        type: 'npc',
        name: npcMatch.name,
        role: npcMatch.role || 'PNJ',
        note: npcMatch.note || ''
      };
    }

    return {
      type: 'mixed',
      name: label || 'Entidad',
      quantity: '1',
      hp: 5,
      ac: 12,
      note: ''
    };
  };

  NS.rollMoraleCheck = function (state) {
    const roll = NS.roll(state.rules && state.rules.morale && state.rules.morale.dice ? state.rules.morale.dice : '2d6');
    return {
      roll: roll,
      result: NS.findTableResult(state, 'morale', roll.total),
      summary: 'Moral ' + roll.total + ': ' + NS.findTableResult(state, 'morale', roll.total)
    };
  };

  NS.rollReactionCheck = function (state) {
    const roll = NS.roll(state.rules && state.rules.reaction && state.rules.reaction.dice ? state.rules.reaction.dice : '2d6');
    return {
      roll: roll,
      result: NS.findTableResult(state, 'reaction', roll.total),
      summary: 'Reacción ' + roll.total + ': ' + NS.findTableResult(state, 'reaction', roll.total)
    };
  };
})();
