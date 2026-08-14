(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  // Perfil raíz y fallback seguro: reproduce exactamente el comportamiento
  // que ya tenía OSR Manager antes de Ruleset Core. El resto de perfiles
  // heredan de aquí (extends) y solo declaran sus diferencias (overrides).
  NS.rules.register({
    id: 'generic',
    name: 'OSR Genérico',
    family: 'generic',
    version: 1,

    features: {
      morale: true,
      reaction: true,
      surprise: false,
      retainers: false,
      sideInitiative: false,
      individualInitiative: true,
      ascendingAC: true,
      descendingAC: false
    },

    dungeon: {
      turnDurationMinutes: 10,
      encounter: { intervalTurns: 2, dice: '1d6', triggerResults: [1] },
      rest: { intervalTurns: 6, durationTurns: 1 }
    },

    wilderness: {
      movement: { perDay: 6, travelHoursPerStep: 4 },
      terrain: { movementCosts: { plains: 1, forest: 1.5, hills: 1.5, mountains: 2, swamp: 2 } },
      encounters: {},
      resources: { foodPerCharacterPerDay: 1, waterPerCharacterPerDay: 1 }
    },

    combat: {
      initiative: { type: 'individual', dice: '1d6', highestFirst: true },
      armorClass: { mode: 'ascending' },
      morale: { enabled: true, dice: '2d6' },
      reaction: { enabled: true, dice: '2d6', tableId: 'generic' },
      surprise: { enabled: false, dice: null, triggerResults: [] },
      zeroHP: { behavior: 'out_of_combat' }
    },

    characters: {
      savingThrows: { schema: 'pending', categories: [] },
      movement: {}
    },

    monsters: {
      armorClass: {},
      hitDice: {},
      morale: {},
      movement: {},
      numberAppearing: {}
    }
  });
})();
