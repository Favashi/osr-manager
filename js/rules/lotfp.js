(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  NS.rules.register({
    id: 'lotfp',
    name: 'Lamentations of the Flame Princess',
    family: 'bx',
    version: 1,
    extends: 'bx',
    overrides: {
      combat: { initiative: { type: 'individual' } }
    }
  });
})();
