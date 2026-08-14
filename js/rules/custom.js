(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  // Entrada de catálogo para el desplegable "Reglas...". Cuando la campaña
  // no tiene todavía campaign.customRuleset, se resuelve como copia de
  // "generic" (fallback seguro, sin overrides propios).
  NS.rules.register({
    id: 'custom',
    name: 'Personalizado',
    family: 'custom',
    version: 1,
    extends: 'generic',
    overrides: {}
  });

  // Construye la configuración de ruleset personalizado vinculada a una
  // campaña concreta: {baseId, name, overrides}. No registra nada en el
  // catálogo global; se guarda en campaign.customRuleset (ver
  // rules/resolver.js applyToState / getActiveRuleset).
  NS.rules.createCustomConfig = function (baseId, name, overrides) {
    return {
      baseId: baseId || 'generic',
      name: name || 'Personalizado',
      overrides: overrides || {}
    };
  };
})();
