(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  // Base de la familia B/X. El resto de la familia (OSE, Marca del Este,
  // BECMI, LotFP) extiende de "bx", no de "generic" directamente.
  NS.rules.register({
    id: 'bx',
    name: 'B/X (D&D Básico/Experto)',
    family: 'bx',
    version: 1,
    extends: 'generic',
    overrides: {
      features: { descendingAC: true, ascendingAC: false },
      combat: { armorClass: { mode: 'descending' } }
    }
  });
})();
