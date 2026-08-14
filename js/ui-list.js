(function () {
  const NS = (window.OSRApp = window.OSRApp || {});
  NS.ui = NS.ui || {};

  // ---------------------------------------------------------------------
  // Patrón reutilizable de lista/búsqueda (preparado para el Codex:
  // Monstruos, Conjuros, Tablas...). Funciones puras, sin DOM: cada
  // consumidor decide cómo pintarlas. Sustring case-insensitive, sin
  // dependencias — nada de fuzzy search ni librerías externas.
  // ---------------------------------------------------------------------

  // Minúsculas + recorta + colapsa espacios repetidos, para que "Goblin",
  // "goblin" y "  GOBLIN  " comparen igual.
  NS.ui.normalizeSearchText = function (value) {
    return String(value === null || value === undefined ? '' : value)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  };

  // Filtra items por subcadena (case-insensitive) sobre getText(item).
  // Sin query -> devuelve una copia completa de la lista, nunca la
  // referencia original.
  NS.ui.filterBySearch = function (items, query, getText) {
    const list = Array.isArray(items) ? items : [];
    const needle = NS.ui.normalizeSearchText(query);
    if (!needle) return list.slice();
    return list.filter(function (item) {
      const haystack = NS.ui.normalizeSearchText(getText ? getText(item) : item);
      return haystack.indexOf(needle) !== -1;
    });
  };

  // "0 resultados" / "1 resultado" / "12 resultados".
  NS.ui.formatResultCount = function (count) {
    const n = Number(count) || 0;
    return n + (n === 1 ? ' resultado' : ' resultados');
  };

  // Navegación de listas por teclado: dado el índice actual y la longitud
  // de la lista, calcula el nuevo índice para ArrowUp/ArrowDown/Home/End.
  // Devuelve null si la tecla no es de navegación o la lista está vacía
  // (el llamante decide qué hacer en ese caso, p.ej. no interceptar la
  // tecla). No conoce el DOM: el llamante aplica scrollIntoView aparte.
  NS.ui.nextListIndex = function (key, currentIndex, length) {
    const total = Number(length) || 0;
    if (total <= 0) return null;
    const clampedCurrent = Math.min(Math.max(Number(currentIndex) || 0, 0), total - 1);
    if (key === 'ArrowDown') return Math.min(total - 1, clampedCurrent + 1);
    if (key === 'ArrowUp') return Math.max(0, clampedCurrent - 1);
    if (key === 'Home') return 0;
    if (key === 'End') return total - 1;
    return null;
  };
})();
