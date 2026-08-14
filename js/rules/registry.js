(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  const registry = {};
  const order = [];

  NS.rules.register = function (profile) {
    if (!profile || !profile.id) throw new Error('Ruleset sin id.');
    if (registry[profile.id]) throw new Error('Ruleset duplicado: ' + profile.id);
    registry[profile.id] = profile;
    order.push(profile.id);
  };

  NS.rules.getRawProfile = function (id) {
    return registry[id] || null;
  };

  NS.rules.listProfiles = function () {
    return order.map(function (id) {
      return registry[id];
    });
  };

  NS.rules.familyLabels = {
    generic: 'Genérico',
    bx: 'B/X',
    odnd: 'OD&D',
    adnd: 'AD&D',
    custom: 'Personalizado'
  };

  NS.rules.familyLabel = function (family) {
    return NS.rules.familyLabels[family] || family || '—';
  };
})();
