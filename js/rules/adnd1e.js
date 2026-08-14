(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  NS.rules.register({
    id: 'adnd1e',
    name: 'AD&D 1e',
    family: 'adnd',
    version: 1,
    extends: 'generic',
    overrides: {
      features: { descendingAC: true, ascendingAC: false },
      combat: {
        armorClass: { mode: 'descending' },
        initiative: { type: 'individual' }
      }
    }
  });
})();
