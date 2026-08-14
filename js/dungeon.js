(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  function advanceClockByMinutes(state, minutes) {
    state.worldTime.minute += minutes;
    while (state.worldTime.minute >= 60) {
      state.worldTime.minute -= 60;
      state.worldTime.hour += 1;
    }
    while (state.worldTime.hour >= 24) {
      state.worldTime.hour -= 24;
      state.worldTime.day += 1;
    }
  }

  function consumeLightSources(state, minutes) {
    state.dungeon.lightSources.forEach(function (source) {
      if (source.exhausted || !source.lit || source.durationRemaining <= 0) return;
      source.durationRemaining = Math.max(0, source.durationRemaining - minutes);
      if (source.durationRemaining <= 0) {
        source.lit = false;
        source.exhausted = true;
        source.warnedLow = false;
        NS.addLog(state, 'La ' + source.name + ' de ' + source.carrier + ' se agota.');
      } else if (source.durationRemaining <= 10 && !source.warnedLow) {
        source.warnedLow = true;
        NS.addLog(state, 'A la ' + source.name + ' de ' + source.carrier + ' le queda poco tiempo.');
      }
    });
  }

  function updateExplorationEffects(state, minutes, options) {
    const opts = options || {};
    (state.dungeon.effects || []).forEach(function (effect) {
      if (!effect.active) return;
      if (effect.unit === 'turnos' && opts.skipTurnBasedUnits) return;
      if (effect.unit !== 'turnos' && effect.unit !== 'minutos' && effect.unit !== 'horas' && effect.unit !== 'dias') return;
      const decrement = effect.unit === 'turnos' ? 1
        : effect.unit === 'minutos' ? minutes
        : effect.unit === 'horas' ? minutes / 60
        : minutes / 1440;
      effect.duration = Math.max(0, effect.duration - decrement);
      if (effect.duration <= 0) {
        effect.active = false;
        NS.addLog(state, 'Finaliza ' + effect.name + ' sobre ' + effect.character + '.');
      }
    });
  }

  NS.dungeon = {
    advanceClockByMinutes: advanceClockByMinutes,
    consumeLightSources: consumeLightSources,
    updateExplorationEffects: updateExplorationEffects,

    toggleLightSource: function (state, sourceId) {
      const source = state.dungeon.lightSources.find(function (item) {
        return item.id === sourceId;
      });
      if (!source || source.exhausted) return null;
      source.lit = !source.lit;
      if (source.lit) {
        source.warnedLow = false;
        NS.addLog(state, 'Se enciende la ' + source.name + ' de ' + source.carrier + '.');
      } else {
        NS.addLog(state, 'La ' + source.name + ' de ' + source.carrier + ' se apaga.');
      }
      return source;
    },

    advanceDungeonTurn: function (state, options) {
      const opts = options || {};
      const rules = state.dungeon.rules;
      const minutes = rules.turnDurationMinutes || 10;

      // 1. Incrementar turno
      state.dungeon.turn += 1;
      NS.addLog(state, 'Turno ' + state.dungeon.turn + '.');

      // 2. Avanzar reloj
      advanceClockByMinutes(state, minutes);

      // 3. Consumir fuentes de luz
      consumeLightSources(state, minutes);

      // 4. Actualizar efectos temporales (turnos/minutos/horas/días; nunca rondas de combate)
      updateExplorationEffects(state, minutes);

      // 5. Actualizar contador de descanso
      state.dungeon.restCounter = (state.dungeon.restCounter || 0) + 1;
      if (state.dungeon.restCounter >= (rules.restEveryTurns || 6) && !state.dungeon.restWarned) {
        state.dungeon.restWarned = true;
        NS.addLog(state, 'El grupo debería descansar.');
      }

      // 6-8. Actualizar contador de encuentro y chequear si corresponde
      state.dungeon.encounterCounter = (state.dungeon.encounterCounter || 0) + 1;
      if (state.dungeon.encounterCounter >= (rules.encounterEveryTurns || 2)) {
        state.dungeon.encounterCounter = 0;
        if (!opts.skipEncounterCheck) {
          NS.dungeon.checkEncounter(state);
        }
      }

      // 9. El estado queda listo; el renderizado lo dispara quien llama a esta función.
      return state;
    },

    checkEncounter: function (state) {
      const rules = state.dungeon.rules;
      let roll;
      try {
        roll = NS.roll(rules.encounterRoll || '1d6');
      } catch (error) {
        NS.addLog(state, 'Error en el chequeo de encuentro: ' + error.message);
        return null;
      }
      const hit = (rules.encounterResults || []).indexOf(roll.total) !== -1;

      if (!hit) {
        NS.addLog(state, 'Chequeo de encuentro: sin encuentro.');
        return null;
      }

      const pending = state.dungeon.lastEncounter;
      const hasPendingEncounter = !!(pending && Number(pending.quantity || 0) > 0);
      if (hasPendingEncounter) {
        NS.addLog(state, 'Nuevo indicio de encuentro, pero el grupo ya se enfrenta a uno pendiente.');
        return pending;
      }

      const result = NS.dungeon.generateEncounter(state);
      state.dungeon.lastEncounter = result;
      NS.addLog(state, 'Encuentro: ' + result.summary + '.');
      return result;
    },

    rest: function (state) {
      const rules = state.dungeon.rules;
      const turns = Math.max(1, Number(rules.restDurationTurns) || 1);
      for (let i = 0; i < turns; i += 1) {
        NS.dungeon.advanceDungeonTurn(state);
      }
      state.dungeon.restCounter = 0;
      state.dungeon.restWarned = false;
      NS.addLog(state, 'El grupo descansa.');
      return state;
    },

    performAction: function (state, actionId) {
      const action = (state.dungeon.rules.explorationActions || []).find(function (entry) {
        return entry.id === actionId;
      });
      if (!action) return null;
      NS.addLog(state, action.logText || (action.label + '.'));
      if (action.consumesTurn) {
        NS.dungeon.advanceDungeonTurn(state);
      }
      return action;
    },

    generateEncounter: function (state) {
      const table = state.dungeon.encounterTable;
      const roll = NS.roll(table.dice || '1d6');
      let selected = null;

      for (let i = 0; i < table.entries.length; i += 1) {
        const entry = table.entries[i];
        if (NS.dungeon.matchesRange(roll.total, entry.range)) {
          selected = entry;
          break;
        }
      }

      let quantityTotal = 0;
      if (selected && selected.quantity) {
        if (/^\d+$/.test(String(selected.quantity))) {
          quantityTotal = Number(selected.quantity);
        } else {
          try {
            quantityTotal = NS.roll(selected.quantity).total;
          } catch (error) {
            quantityTotal = 0;
          }
        }
      }
      const summary = (selected && selected.text) ? selected.text : 'Ningún encuentro';
      const detail = selected && selected.text ? NS.resolveEncounterDetail(state, selected.text) : { type: 'none', name: 'Ningún encuentro', quantity: '0' };
      const moraleRoll = selected && selected.text && quantityTotal > 0 ? NS.rollMoraleCheck(state) : null;
      const reactionRoll = selected && selected.text && detail.type === 'npc' ? NS.rollReactionCheck(state) : null;

      return {
        roll: roll,
        table: table.name,
        result: selected ? selected.text : 'Ningún encuentro',
        quantity: quantityTotal,
        summary: summary + ' (' + quantityTotal + ')',
        distance: 0,
        type: detail.type,
        entity: detail.name,
        hp: detail.hp || 0,
        ac: detail.ac || 0,
        role: detail.role || '',
        note: detail.note || '',
        reaction: reactionRoll ? reactionRoll.summary : null,
        morale: moraleRoll ? moraleRoll.summary : null,
        encounterName: detail.name || summary
      };
    },

    matchesRange: function (value, rangeString) {
      if (!rangeString) return false;
      const pieces = String(rangeString).split('-');
      if (pieces.length === 2) {
        const start = Number(pieces[0]);
        const end = Number(pieces[1]);
        return value >= start && value <= end;
      }
      return Number(rangeString) === value;
    }
  };
})();
