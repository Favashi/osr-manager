(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  const LIBRARY_KEY = 'osr-manager-library';

  const ACTOR_KINDS = { monster: 'monsters', npc: 'npcs' };

  function emptyLibrary() {
    return { monsters: [], npcs: [], encounters: [] };
  }

  // Biblioteca: contenido global del navegador/origen, en su PROPIA clave
  // de localStorage — nunca dentro de `state`, así que nunca viaja en un
  // export/import de campaña (esa separación es automática: storage.js
  // solo serializa `state`).
  function loadLibrary() {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      if (!raw) return emptyLibrary();
      const parsed = JSON.parse(raw);
      return {
        monsters: Array.isArray(parsed.monsters) ? parsed.monsters : [],
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs : [],
        encounters: Array.isArray(parsed.encounters) ? parsed.encounters : []
      };
    } catch (error) {
      return emptyLibrary();
    }
  }

  function saveLibrary(library) {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library || emptyLibrary()));
    } catch (error) {
      // localStorage puede no estar disponible (privado/bloqueado): no debe
      // romper el Codex, el registro simplemente no persistirá.
    }
  }

  function campaignCollection(state, kind) {
    if (!state.customContent) state.customContent = { monsters: [], npcs: [], encounters: [] };
    const key = ACTOR_KINDS[kind];
    if (!Array.isArray(state.customContent[key])) state.customContent[key] = [];
    return state.customContent[key];
  }

  function campaignEncounters(state) {
    if (!state.customContent) state.customContent = { monsters: [], npcs: [], encounters: [] };
    if (!Array.isArray(state.customContent.encounters)) state.customContent.encounters = [];
    return state.customContent.encounters;
  }

  function withScope(record, scope) {
    const copy = Object.assign({}, record);
    copy.scope = scope;
    return copy;
  }

  // Biblioteca + campaña combinadas, sin duplicar: cada registro vive en
  // EXACTAMENTE un array (el propio saveActor se encarga de moverlo si el
  // ámbito cambia), así que concatenar ambos nunca repite un id.
  function listActors(state, kind) {
    const key = ACTOR_KINDS[kind];
    if (!key) return [];
    const library = loadLibrary();
    const libraryItems = (library[key] || []).map(function (r) { return withScope(r, 'library'); });
    const campaignItems = campaignCollection(state, kind).map(function (r) { return withScope(r, 'campaign'); });
    return libraryItems.concat(campaignItems);
  }

  function listEncounters(state) {
    const library = loadLibrary();
    const libraryItems = (library.encounters || []).map(function (r) { return withScope(r, 'library'); });
    const campaignItems = campaignEncounters(state).map(function (r) { return withScope(r, 'campaign'); });
    return libraryItems.concat(campaignItems);
  }

  function getActorById(state, id) {
    if (!id) return null;
    const kinds = Object.keys(ACTOR_KINDS);
    for (let i = 0; i < kinds.length; i++) {
      const found = listActors(state, kinds[i]).find(function (r) { return r.id === id; });
      if (found) return found;
    }
    return null;
  }

  function getEncounterById(state, id) {
    if (!id) return null;
    return listEncounters(state).find(function (r) { return r.id === id; }) || null;
  }

  // Upsert por id: si el registro ya existe en cualquiera de los dos
  // ámbitos se retira de ahí antes de reinsertarlo en el ámbito destino —
  // así un cambio de ámbito al editar nunca deja una copia duplicada atrás.
  function saveActor(state, kind, model, scope) {
    const key = ACTOR_KINDS[kind];
    if (!key) throw new Error('Tipo de actor desconocido: ' + kind);
    const library = loadLibrary();
    const libCol = library[key];
    const campCol = campaignCollection(state, kind);

    const libIdx = libCol.findIndex(function (r) { return r.id === model.id; });
    if (libIdx !== -1) libCol.splice(libIdx, 1);
    const campIdx = campCol.findIndex(function (r) { return r.id === model.id; });
    if (campIdx !== -1) campCol.splice(campIdx, 1);

    const record = Object.assign({}, model);
    delete record.scope;

    if (scope === 'library') {
      libCol.push(record);
      saveLibrary(library);
    } else {
      campCol.push(record);
    }
    return record;
  }

  function deleteActor(state, kind, id) {
    const key = ACTOR_KINDS[kind];
    if (!key) return false;
    const library = loadLibrary();
    const libCol = library[key];
    const libIdx = libCol.findIndex(function (r) { return r.id === id; });
    if (libIdx !== -1) {
      libCol.splice(libIdx, 1);
      saveLibrary(library);
      return true;
    }
    const campCol = campaignCollection(state, kind);
    const campIdx = campCol.findIndex(function (r) { return r.id === id; });
    if (campIdx !== -1) {
      campCol.splice(campIdx, 1);
      return true;
    }
    return false;
  }

  function saveEncounter(state, model, scope) {
    const library = loadLibrary();
    const libCol = library.encounters;
    const campCol = campaignEncounters(state);

    const libIdx = libCol.findIndex(function (r) { return r.id === model.id; });
    if (libIdx !== -1) libCol.splice(libIdx, 1);
    const campIdx = campCol.findIndex(function (r) { return r.id === model.id; });
    if (campIdx !== -1) campCol.splice(campIdx, 1);

    const record = Object.assign({}, model, { scope: scope === 'library' ? 'library' : 'campaign' });

    if (scope === 'library') {
      libCol.push(record);
      saveLibrary(library);
    } else {
      campCol.push(record);
    }
    return record;
  }

  function deleteEncounter(state, id) {
    const library = loadLibrary();
    const libIdx = library.encounters.findIndex(function (r) { return r.id === id; });
    if (libIdx !== -1) {
      library.encounters.splice(libIdx, 1);
      saveLibrary(library);
      return true;
    }
    const campCol = campaignEncounters(state);
    const campIdx = campCol.findIndex(function (r) { return r.id === id; });
    if (campIdx !== -1) {
      campCol.splice(campIdx, 1);
      return true;
    }
    return false;
  }

  NS.repository = {
    listActors: listActors,
    getActorById: getActorById,
    saveActor: saveActor,
    deleteActor: deleteActor,
    listEncounters: listEncounters,
    getEncounterById: getEncounterById,
    saveEncounter: saveEncounter,
    deleteEncounter: deleteEncounter
  };
})();
