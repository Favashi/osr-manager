(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.rules = NS.rules || {};

  NS.rules.register({
    id: 'ose',
    name: 'Old-School Essentials',
    family: 'bx',
    version: 1,
    extends: 'bx',
    overrides: {
      features: { ascendingAC: true, descendingAC: false },
      combat: { armorClass: { mode: 'ascending' } }
    }
  });
})();
