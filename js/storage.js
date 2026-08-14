(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  const STORAGE_KEY = 'osr-manager-save';
  const PREFERENCES_KEY = 'osr-manager-preferences';

  NS.storage = {
    // Preferencias de la aplicación (locales al navegador/origen), separadas
    // por completo del guardado de campaña: no viajan en el JSON exportado
    // ni afectan a qué campaña está cargada. Todas las campañas comparten
    // estas mismas preferencias en este navegador.
    loadPreferences: function () {
      try {
        const raw = localStorage.getItem(PREFERENCES_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (error) {
        return {};
      }
    },

    savePreferences: function (preferences) {
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences || {}));
      } catch (error) {
        // localStorage puede no estar disponible (privado/bloqueado): no
        // debe romper la app por una preferencia no esencial.
      }
    },

    // Única ruta central de guardado. F2, Archivo → Guardar, Nueva
    // campaña, Cargar demo e Importar pasan todos por aquí, así que
    // meta.lastSavedAt siempre refleja una escritura real en localStorage,
    // nunca un simple cambio de estado en memoria.
    save: function (state) {
      if (!state.meta) state.meta = {};
      state.meta.lastSavedAt = new Date().toISOString();
      const payload = JSON.stringify(state, null, 2);
      localStorage.setItem(STORAGE_KEY, payload);
      NS.addLog(state, 'Partida guardada en el navegador.');
      return state.meta.lastSavedAt;
    },

    load: function () {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== 1) {
          throw new Error('Versión de estado no compatible.');
        }
        return parsed;
      } catch (error) {
        console.error('Error al cargar:', error);
        return null;
      }
    },

    exportCampaign: function (state, filename) {
      const safeName = (filename || state.campaign.name || 'campana').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      NS.addLog(state, 'Campaña exportada.');
      return true;
    },

    importCampaign: function (file, callback) {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || parsed.schemaVersion !== 1) {
            throw new Error('JSON inválido o incompatible.');
          }
          if (typeof callback === 'function') {
            callback(parsed);
          }
        } catch (error) {
          alert('No se pudo importar la campaña: ' + error.message);
        }
      };
      reader.readAsText(file);
    }
  };
})();
