(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  NS.rules.register({
    id: 'odnd',
    name: 'OD&D / 0e',
    family: 'odnd',
    version: 1,
    extends: 'generic',
    overrides: {
      features: { descendingAC: true, ascendingAC: false, individualInitiative: false, sideInitiative: true },
      combat: {
        armorClass: { mode: 'descending' },
        initiative: { type: 'side' }
      }
    }
  });
})();
