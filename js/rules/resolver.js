(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepClone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function deepMerge(target, source) {
    const result = isPlainObject(target) ? Object.assign({}, target) : {};
    Object.keys(source || {}).forEach(function (key) {
      const sourceValue = source[key];
      const targetValue = result[key];
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = deepClone(sourceValue);
      }
    });
    return result;
  }

  // Resuelve un perfil registrado siguiendo su cadena extends -> overrides.
  // El perfil raíz (sin "extends", p.ej. "generic") aporta su contenido
  // directamente; el resto solo declara overrides parciales sobre su base.
  function resolveRaw(id, visited) {
    if (visited.indexOf(id) !== -1) {
      console.error('Ciclo de herencia en ruleset:', id, visited);
      return null;
    }
    const profile = NS.rules.getRawProfile(id);
    if (!profile) return null;

    let resolved;
    if (profile.extends) {
      const base = resolveRaw(profile.extends, visited.concat([id]));
      resolved = base ? deepMerge(base, profile.overrides || {}) : deepClone(profile.overrides || {});
    } else {
      const content = {};
      Object.keys(profile).forEach(function (key) {
        if (key === 'id' || key === 'name' || key === 'family' || key === 'version' || key === 'extends' || key === 'overrides') return;
        content[key] = profile[key];
      });
      resolved = deepClone(content);
    }
    resolved.id = profile.id;
    resolved.name = profile.name;
    resolved.family = profile.family;
    resolved.version = profile.version || 1;
    return resolved;
  }

  // Ruleset completamente resuelto por id de catálogo (sin overrides de
  // campaña). Útil para el desplegable "Reglas..." y para previsualizar.
  NS.rules.resolveRuleset = function (rulesetId) {
    return resolveRaw(rulesetId, []) || resolveRaw('generic', []);
  };

  // Ruleset resuelto de la campaña activa: aplica también
  // campaign.customRuleset cuando rulesetId === "custom". El resto de la
  // app debe consultar siempre esta función, nunca perfiles sueltos.
  NS.rules.getActiveRuleset = function (state) {
    const campaign = (state && state.campaign) || {};
    const rulesetId = campaign.rulesetId || 'generic';

    if (rulesetId === 'custom' && campaign.customRuleset) {
      const custom = campaign.customRuleset;
      const base = resolveRaw(custom.baseId || 'generic', []) || resolveRaw('generic', []);
      const resolved = deepMerge(base, custom.overrides || {});
      resolved.id = 'custom';
      resolved.name = custom.name || 'Personalizado';
      resolved.family = base.family;
      resolved.version = base.version;
      resolved.customBaseId = custom.baseId || 'generic';
      return resolved;
    }

    const resolved = resolveRaw(rulesetId, []);
    if (resolved) return resolved;

    console.warn('Ruleset desconocido "' + rulesetId + '", usando OSR Genérico.');
    return resolveRaw('generic', []);
  };

  NS.rules.get = function (state, path) {
    const ruleset = NS.rules.getActiveRuleset(state);
    return String(path || '').split('.').reduce(function (acc, key) {
      return (acc && acc[key] !== undefined) ? acc[key] : undefined;
    }, ruleset);
  };

  // Vuelca los valores del ruleset activo sobre los campos mutables que ya
  // consumen los motores existentes (dungeon.js/wilderness.js/combat.js
  // leen state.dungeon.rules/state.wilderness.rules/state.rules en cada
  // acción, sin cambios en este pack). Así el motor "consulta el ruleset"
  // indirectamente y el cambio surte efecto en la siguiente acción
  // (turno/viaje/combate), sin reescribir los motores existentes.
  NS.rules.applyToState = function (state, rulesetId, customConfig) {
    state.campaign.rulesetId = rulesetId;
    if (rulesetId === 'custom' && customConfig) {
      state.campaign.customRuleset = customConfig;
    }

    const ruleset = NS.rules.getActiveRuleset(state);

    state.dungeon.rules.turnDurationMinutes = ruleset.dungeon.turnDurationMinutes;
    state.dungeon.rules.encounterEveryTurns = ruleset.dungeon.encounter.intervalTurns;
    state.dungeon.rules.encounterRoll = ruleset.dungeon.encounter.dice;
    state.dungeon.rules.encounterResults = (ruleset.dungeon.encounter.triggerResults || []).slice();
    state.dungeon.rules.restEveryTurns = ruleset.dungeon.rest.intervalTurns;
    state.dungeon.rules.restDurationTurns = ruleset.dungeon.rest.durationTurns;

    state.wilderness.rules.movementPerDay = ruleset.wilderness.movement.perDay;
    state.wilderness.rules.travelHoursPerStep = ruleset.wilderness.movement.travelHoursPerStep;
    state.wilderness.rules.foodPerCharacterPerDay = ruleset.wilderness.resources.foodPerCharacterPerDay;
    state.wilderness.rules.waterPerCharacterPerDay = ruleset.wilderness.resources.waterPerCharacterPerDay;
    state.wilderness.terrainModifiers = Object.assign({}, ruleset.wilderness.terrain.movementCosts);

    state.rules.initiative = {
      type: ruleset.combat.initiative.type,
      dice: ruleset.combat.initiative.dice,
      highestFirst: ruleset.combat.initiative.highestFirst
    };
    state.rules.morale.enabled = ruleset.combat.morale.enabled;
    state.rules.morale.dice = ruleset.combat.morale.dice;
    state.rules.reaction.enabled = ruleset.combat.reaction.enabled;
    state.rules.reaction.dice = ruleset.combat.reaction.dice;

    return ruleset;
  };

  // Preparado para doble representación de CA (ascendente/descendente) sin
  // migrar los datos existentes: si armorClass ya es un objeto
  // {ascending, descending} lo resuelve según el modo del ruleset activo;
  // si es el número plano actual, lo devuelve tal cual.
  NS.rules.getDisplayArmorClass = function (entity, ruleset) {
    if (!entity) return undefined;
    const raw = entity.armorClass;
    if (raw && typeof raw === 'object') {
      const mode = (ruleset && ruleset.combat && ruleset.combat.armorClass && ruleset.combat.armorClass.mode) || 'ascending';
      if (mode === 'descending' && raw.descending !== undefined) return raw.descending;
      if (raw.ascending !== undefined) return raw.ascending;
      return undefined;
    }
    return raw;
  };
})();
