(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  function parseExpression(expression) {
    const normalized = String(expression || '1d6').trim();
    const match = /^([0-9]*)d([0-9]+)([+-][0-9]+)?$/i.exec(normalized);

    if (!match) {
      throw new Error('Expresión de dado inválida: ' + expression);
    }

    const count = Number(match[1] || '1');
    const sides = Number(match[2]);
    const modifier = Number(match[3] || '0');

    if (!Number.isFinite(count) || !Number.isFinite(sides) || sides <= 0) {
      throw new Error('Parámetros del dado no válidos: ' + expression);
    }

    return {
      expression: normalized,
      count,
      sides,
      modifier
    };
  }

  NS.parseDiceExpression = parseExpression;

  NS.roll = function (expression) {
    const parsed = parseExpression(expression);
    const rolls = [];
    let sum = 0;

    for (let i = 0; i < parsed.count; i += 1) {
      const value = Math.floor(Math.random() * parsed.sides) + 1;
      rolls.push(value);
      sum += value;
    }

    const total = sum + parsed.modifier;

    return {
      expression: parsed.expression,
      rolls: rolls,
      modifier: parsed.modifier,
      total: total
    };
  };

  NS.rollPool = function (expression) {
    return NS.roll(expression);
  };
})();
