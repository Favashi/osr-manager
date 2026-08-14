(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  function makeCombatantId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  function findCombatant(state, id) {
    return state.combat.combatants.find(function (entry) {
      return entry.id === id;
    }) || null;
  }

  function syncCombatantToParty(state, combatant) {
    if (!combatant || combatant.sourceType !== 'character') return;
    const character = state.party.find(function (member) {
      return member.id === combatant.sourceId;
    });
    if (!character) return;
    character.hpCurrent = combatant.hpCurrent;
    character.hpMax = combatant.hpMax;
  }

  function canAct(combatant) {
    return !!combatant && !combatant.defeated && !combatant.withdrawn;
  }

  function applyRoundEffects(state) {
    (state.dungeon.effects || []).forEach(function (effect) {
      if (!effect.active || effect.unit !== 'rondas') return;
      effect.duration = Math.max(0, Number(effect.duration || 0) - 1);
      if (effect.duration <= 0) {
        effect.active = false;
        NS.addLog(state, 'Finaliza ' + effect.name + ' sobre ' + effect.character + '.');
      }
    });
  }

  function applyRoundStatuses(state) {
    state.combat.combatants.forEach(function (combatant) {
      combatant.status = (combatant.status || []).filter(function (status) {
        if (status.durationType !== 'rounds') return true;
        status.remaining = Math.max(0, Number(status.remaining || 0) - 1);
        if (status.remaining <= 0) {
          NS.addLog(state, 'Finaliza ' + status.name + ' sobre ' + combatant.name + '.');
          return false;
        }
        return true;
      });
    });
  }

  function advanceRound(state) {
    state.combat.round += 1;
    applyRoundEffects(state);
    applyRoundStatuses(state);
    NS.addLog(state, 'Comienza ronda ' + state.combat.round + '.');
  }

  function resetCombat(state) {
    state.combat = {
      active: false,
      round: 0,
      currentTurn: 0,
      previousMode: null,
      selectedId: null,
      initiativeDice: (state.rules.initiative && state.rules.initiative.dice) || '1d6',
      initiativeHighestFirst: !(state.rules.initiative && state.rules.initiative.highestFirst === false),
      combatants: []
    };
  }

  function addPartyMembers(state) {
    state.party.forEach(function (character) {
      state.combat.combatants.push({
        id: 'combatant-' + character.id,
        sourceId: character.id,
        sourceType: 'character',
        name: character.name,
        side: 'party',
        initiative: null,
        armorClass: Number(character.armorClass) || 10,
        hpCurrent: Number(character.hpCurrent) || 0,
        hpMax: Number(character.hpMax) || 1,
        status: [],
        defeated: Number(character.hpCurrent) <= 0,
        withdrawn: false,
        createdIndex: state.combat.combatants.length
      });
    });
  }

  function addEncounterCreatures(state, encounter) {
    if (!encounter) return;
    const quantity = Number(encounter.quantity || 0);
    if (quantity <= 0) return;
    const baseName = encounter.entity || encounter.result || 'Enemigo';
    const hp = Math.max(1, Number(encounter.hp) || 1);
    const ac = Number(encounter.ac) || 10;
    const sourceType = encounter.type === 'npc' ? 'npc' : 'monster';
    for (let i = 1; i <= quantity; i += 1) {
      state.combat.combatants.push({
        id: makeCombatantId('combatant'),
        sourceId: baseName.toLowerCase(),
        sourceType: sourceType,
        name: baseName + (quantity > 1 ? ' #' + i : ''),
        side: 'enemy',
        initiative: null,
        armorClass: ac,
        hpCurrent: hp,
        hpMax: hp,
        status: [],
        defeated: false,
        withdrawn: false,
        createdIndex: state.combat.combatants.length
      });
    }
  }

  NS.combat = {
    canAct: canAct,
    findCombatant: findCombatant,

    startFromEncounter: function (state, encounter, previousMode) {
      resetCombat(state);
      addPartyMembers(state);
      addEncounterCreatures(state, encounter);
      state.combat.active = true;
      state.combat.previousMode = previousMode || null;
      state.combat.selectedId = state.combat.combatants.length ? state.combat.combatants[0].id : null;
      const foeName = encounter && (encounter.result || encounter.entity);
      NS.addLog(state, 'Comienza combate' + (foeName ? ' contra ' + foeName + '.' : '.'));
      return state;
    },

    startManual: function (state, previousMode) {
      resetCombat(state);
      addPartyMembers(state);
      state.combat.active = true;
      state.combat.previousMode = previousMode || null;
      state.combat.selectedId = state.combat.combatants.length ? state.combat.combatants[0].id : null;
      NS.addLog(state, 'Comienza combate.');
      return state;
    },

    addCombatant: function (state, data) {
      const hpMax = Math.max(1, Number(data.hpMax) || 1);
      const hpCurrent = Math.min(hpMax, Math.max(0, Number(data.hpCurrent === '' || data.hpCurrent === undefined ? hpMax : data.hpCurrent)));
      const hasInitiative = data.initiative !== '' && data.initiative !== null && data.initiative !== undefined && !Number.isNaN(Number(data.initiative));
      const combatant = {
        id: makeCombatantId('combatant'),
        sourceId: null,
        sourceType: 'npc',
        name: data.name,
        side: data.side || 'enemy',
        initiative: hasInitiative ? Number(data.initiative) : null,
        armorClass: Number(data.armorClass) || 10,
        hpCurrent: hpCurrent,
        hpMax: hpMax,
        status: [],
        defeated: hpCurrent <= 0,
        withdrawn: false,
        createdIndex: state.combat.combatants.length
      };
      state.combat.combatants.push(combatant);
      if (!state.combat.selectedId) state.combat.selectedId = combatant.id;
      NS.addLog(state, combatant.name + ' se une al combate.');
      return combatant;
    },

    rollInitiative: function (state) {
      const combat = state.combat;
      if (!combat.active || !combat.combatants.length) return null;
      const dice = combat.initiativeDice || '1d6';
      combat.combatants.forEach(function (combatant) {
        combatant.initiative = NS.roll(dice).total;
      });
      const highestFirst = combat.initiativeHighestFirst !== false;
      combat.combatants.sort(function (a, b) {
        const diff = highestFirst ? (b.initiative - a.initiative) : (a.initiative - b.initiative);
        if (diff !== 0) return diff;
        return a.createdIndex - b.createdIndex;
      });
      combat.round = 1;
      let firstIndex = combat.combatants.findIndex(canAct);
      if (firstIndex === -1) firstIndex = 0;
      combat.currentTurn = firstIndex;
      combat.selectedId = combat.combatants[firstIndex] ? combat.combatants[firstIndex].id : null;
      NS.addLog(state, 'Se tira iniciativa (' + dice + ').');
      NS.addLog(state, 'Comienza ronda 1.');
      return combat.combatants;
    },

    nextTurn: function (state) {
      const combat = state.combat;
      if (!combat.active || !combat.combatants.length || combat.round < 1) return null;
      const total = combat.combatants.length;
      let idx = combat.currentTurn;
      let steps = 0;
      let wrapped = false;
      do {
        idx += 1;
        steps += 1;
        if (idx >= total) {
          idx = 0;
          wrapped = true;
        }
      } while (!canAct(combat.combatants[idx]) && steps <= total);

      if (wrapped) {
        advanceRound(state);
      }

      combat.currentTurn = idx;
      const current = combat.combatants[idx];
      if (current) combat.selectedId = current.id;
      return current;
    },

    nextRound: function (state) {
      const combat = state.combat;
      if (!combat.active || !combat.combatants.length) return null;
      advanceRound(state);
      let firstIndex = combat.combatants.findIndex(canAct);
      if (firstIndex === -1) firstIndex = 0;
      combat.currentTurn = firstIndex;
      const current = combat.combatants[firstIndex];
      if (current) combat.selectedId = current.id;
      return combat.round;
    },

    selectCombatant: function (state, id) {
      if (!findCombatant(state, id)) return;
      state.combat.selectedId = id;
    },

    selectAdjacent: function (state, direction) {
      const combat = state.combat;
      if (!combat.combatants.length) return null;
      const currentIndex = combat.combatants.findIndex(function (entry) {
        return entry.id === combat.selectedId;
      });
      let nextIndex = currentIndex === -1 ? 0 : currentIndex + direction;
      if (nextIndex < 0) nextIndex = combat.combatants.length - 1;
      if (nextIndex >= combat.combatants.length) nextIndex = 0;
      combat.selectedId = combat.combatants[nextIndex].id;
      return combat.combatants[nextIndex];
    },

    applyDamageToCombatant: function (state, id, damage) {
      const target = findCombatant(state, id);
      if (!target) return null;
      const amount = Math.max(0, Number(damage) || 0);
      target.hpCurrent = Math.max(0, Number(target.hpCurrent || 0) - amount);
      NS.addLog(state, target.name + ' recibe ' + amount + ' puntos de daño.');
      if (target.hpCurrent === 0 && !target.defeated) {
        target.defeated = true;
        NS.addLog(state, target.name + ' queda derrotado.');
      }
      syncCombatantToParty(state, target);
      return target;
    },

    healCombatant: function (state, id, amount) {
      const target = findCombatant(state, id);
      if (!target) return null;
      const healAmount = Math.max(0, Number(amount) || 0);
      target.hpCurrent = Math.min(Number(target.hpMax || target.hpCurrent), Number(target.hpCurrent || 0) + healAmount);
      NS.addLog(state, target.name + ' recupera ' + healAmount + ' PG.');
      if (target.hpCurrent > 0 && target.defeated) {
        target.defeated = false;
      }
      syncCombatantToParty(state, target);
      return target;
    },

    addStatus: function (state, id, statusName, durationRounds) {
      const target = findCombatant(state, id);
      const name = String(statusName || '').trim();
      if (!target || !name) return null;
      target.status = target.status || [];
      const hasDuration = durationRounds !== undefined && durationRounds !== null && durationRounds !== '' && Number(durationRounds) > 0;
      const existing = target.status.find(function (entry) {
        return entry.name === name;
      });
      if (existing) {
        if (hasDuration) {
          existing.durationType = 'rounds';
          existing.remaining = Number(durationRounds);
        }
      } else {
        target.status.push({
          name: name,
          durationType: hasDuration ? 'rounds' : 'none',
          remaining: hasDuration ? Number(durationRounds) : null
        });
      }
      NS.addLog(state, target.name + ' recibe estado ' + name + (hasDuration ? ' (' + durationRounds + 'r)' : '') + '.');
      return target;
    },

    removeStatus: function (state, id, statusName) {
      const target = findCombatant(state, id);
      if (!target) return null;
      target.status = (target.status || []).filter(function (entry) {
        return entry.name !== statusName;
      });
      NS.addLog(state, 'Finaliza ' + statusName + ' sobre ' + target.name + '.');
      return target;
    },

    withdrawCombatant: function (state, id) {
      const target = findCombatant(state, id);
      if (!target || target.withdrawn) return null;
      target.withdrawn = true;
      NS.addLog(state, target.name + ' se retira del combate.');
      return target;
    },

    endCombat: function (state) {
      const combat = state.combat;
      combat.combatants.forEach(function (combatant) {
        syncCombatantToParty(state, combatant);
      });
      combat.active = false;
      const previousMode = combat.previousMode || 'dungeon';
      combat.previousMode = null;
      NS.addLog(state, 'Termina combate.');
      return previousMode;
    }
  };
})();
