(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  // Sin diferencias mecánicas confirmadas todavía respecto a B/X: hereda tal
  // cual. Ampliar overrides cuando se confirmen reglas concretas del manual.
  NS.rules.register({
    id: 'becmi',
    name: 'BECMI',
    family: 'bx',
    version: 1,
    extends: 'bx',
    overrides: {}
  });
})();
