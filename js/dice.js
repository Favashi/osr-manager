(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  // ---------------------------------------------------------------------
  // Dice Engine 2.0
  //
  //   expresión (string)
  //        ↓ tokenize
  //   tokens
  //        ↓ parse
  //   AST
  //        ↓ evaluate
  //   resultado estructurado { total, dice[], breakdown, comparison, ... }
  //
  // Sin eval()/Function(). Parser recursivo de mano, limitado al dominio
  // de expresiones de dados. Es la única fuente de números aleatorios de
  // juego de la app: Mazmorra/Exterior/Combate/Ruleset Core llaman todos a
  // NS.roll(expression, options), nunca a Math.random() directamente.
  // ---------------------------------------------------------------------

  function DiceError(message) {
    this.name = 'DiceError';
    this.message = message;
  }
  DiceError.prototype = Object.create(Error.prototype);
  DiceError.prototype.constructor = DiceError;

  // Límites de seguridad: evitan expresiones absurdas (999999999d999999999)
  // sin pretender ser exhaustivos. Ajustables si algún ruleset lo necesita.
  const LIMITS = {
    maxExpressionLength: 200,
    maxQuantity: 1000,
    maxSides: 1000,
    maxParenDepth: 20
  };

  // -- normalización --------------------------------------------------
  // Minúsculas + sin espacios + "d%" -> "d100". Opcional: roll() ya
  // normaliza internamente, pero se expone para mostrar/testear por
  // separado (p.ej. antes de guardar en el historial).
  function normalizeDiceExpression(expression) {
    const input = expression === undefined || expression === null ? '' : String(expression);
    return input
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/d%/g, 'd100');
  }

  // -- tokenizer --------------------------------------------------------
  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const ch = source[i];

      if (ch >= '0' && ch <= '9') {
        let j = i;
        while (j < source.length && source[j] >= '0' && source[j] <= '9') j += 1;
        tokens.push({ type: 'NUMBER', value: Number(source.slice(i, j)) });
        i = j;
        continue;
      }

      if (ch === 'd') { tokens.push({ type: 'D' }); i += 1; continue; }
      if (ch === '%') { tokens.push({ type: 'PERCENT' }); i += 1; continue; }
      if (ch === '(') { tokens.push({ type: 'LPAREN' }); i += 1; continue; }
      if (ch === ')') { tokens.push({ type: 'RPAREN' }); i += 1; continue; }
      if (ch === '+') { tokens.push({ type: 'PLUS' }); i += 1; continue; }
      if (ch === '-') { tokens.push({ type: 'MINUS' }); i += 1; continue; }
      if (ch === '*') { tokens.push({ type: 'STAR' }); i += 1; continue; }
      if (ch === '/') { tokens.push({ type: 'SLASH' }); i += 1; continue; }

      if (ch === '<') {
        if (source[i + 1] === '=') { tokens.push({ type: 'COMP', value: '<=' }); i += 2; } else { tokens.push({ type: 'COMP', value: '<' }); i += 1; }
        continue;
      }
      if (ch === '>') {
        if (source[i + 1] === '=') { tokens.push({ type: 'COMP', value: '>=' }); i += 2; } else { tokens.push({ type: 'COMP', value: '>' }); i += 1; }
        continue;
      }
      if (ch === '=') {
        if (source[i + 1] === '=') { tokens.push({ type: 'COMP', value: '==' }); i += 2; } else { tokens.push({ type: 'COMP', value: '==' }); i += 1; }
        continue;
      }

      throw new DiceError('Carácter no reconocido en la expresión.');
    }
    tokens.push({ type: 'EOF' });
    return tokens;
  }

  // -- parser (recursivo descendente) -----------------------------------
  // Gramática:
  //   expr       := additive [ COMP additive ]
  //   additive   := multiplicative (('+' | '-') multiplicative)*
  //   multiplicative := unary (('*' | '/') unary)*
  //   unary      := '-' (number | '(' additive ')')  |  primary
  //   primary    := number | dice | '(' additive ')'
  //   dice       := [NUMBER] D (NUMBER | PERCENT)
  //
  // Los paréntesis solo agrupan aritmética (additive), nunca una
  // comparación completa: evita anidar comparadores sin necesidad real.
  function parse(tokens) {
    const cursor = { tokens: tokens, pos: 0, depth: 0 };

    function current() { return cursor.tokens[cursor.pos]; }
    function next() { const t = current(); cursor.pos += 1; return t; }

    function parseDiceSuffix(quantity) {
      if (quantity <= 0) throw new DiceError('La cantidad de dados debe ser al menos 1.');
      if (quantity > LIMITS.maxQuantity) throw new DiceError('Demasiados dados en la expresión (máximo ' + LIMITS.maxQuantity + ').');

      const t = current();
      if (t.type === 'PERCENT') {
        next();
        return { type: 'Dice', kind: 'standard', quantity: quantity, sides: 100 };
      }
      if (t.type === 'NUMBER') {
        next();
        const faces = t.value;
        if (faces === 66) {
          return { type: 'Dice', kind: 'd66', quantity: quantity };
        }
        if (faces <= 0) throw new DiceError('Un dado necesita al menos 1 cara.');
        if (faces > LIMITS.maxSides) throw new DiceError('Demasiadas caras en un dado (máximo ' + LIMITS.maxSides + ').');
        return { type: 'Dice', kind: 'standard', quantity: quantity, sides: faces };
      }
      throw new DiceError('Falta el número de caras después de "d".');
    }

    // Number o Dice (con cantidad implícita 1 si empieza directamente en "d")
    function parsePrimaryValue() {
      const t = current();
      if (t.type === 'NUMBER') {
        next();
        if (current().type === 'D') {
          next();
          return parseDiceSuffix(t.value);
        }
        return { type: 'Number', value: t.value };
      }
      if (t.type === 'D') {
        next();
        return parseDiceSuffix(1);
      }
      if (t.type === 'LPAREN') {
        cursor.depth += 1;
        if (cursor.depth > LIMITS.maxParenDepth) throw new DiceError('Demasiados paréntesis anidados.');
        next();
        const inner = parseAdditive();
        if (current().type !== 'RPAREN') throw new DiceError('Falta cerrar un paréntesis.');
        next();
        cursor.depth -= 1;
        return inner;
      }
      if (t.type === 'EOF') throw new DiceError('Expresión incompleta.');
      throw new DiceError('Expresión no válida.');
    }

    // Tras un menos unario solo se acepta un número o un grupo entre
    // paréntesis, nunca un dado suelto: "-1d6" debe rechazarse (usar
    // "-(1d6)" si de verdad se quiere negar una tirada).
    function parseUnary() {
      if (current().type === 'MINUS') {
        next();
        const t = current();
        if (t.type === 'NUMBER' && cursor.tokens[cursor.pos + 1] && cursor.tokens[cursor.pos + 1].type !== 'D') {
          next();
          return { type: 'Neg', operand: { type: 'Number', value: t.value } };
        }
        if (t.type === 'LPAREN') {
          return { type: 'Neg', operand: parsePrimaryValue() };
        }
        throw new DiceError('No se puede negar una tirada de dados directamente; usa "-(NdX)".');
      }
      return parsePrimaryValue();
    }

    function parseMultiplicative() {
      let left = parseUnary();
      while (current().type === 'STAR' || current().type === 'SLASH') {
        const op = next().type === 'STAR' ? '*' : '/';
        const right = parseUnary();
        left = { type: 'BinOp', op: op, left: left, right: right };
      }
      return left;
    }

    function parseAdditive() {
      let left = parseMultiplicative();
      while (current().type === 'PLUS' || current().type === 'MINUS') {
        const op = next().type === 'PLUS' ? '+' : '-';
        const right = parseMultiplicative();
        left = { type: 'BinOp', op: op, left: left, right: right };
      }
      return left;
    }

    const left = parseAdditive();
    if (current().type === 'COMP') {
      const operator = next().value;
      const right = parseAdditive();
      if (current().type !== 'EOF') throw new DiceError('Expresión no válida después de la comparación.');
      return { type: 'Comparison', left: left, operator: operator, right: right };
    }
    if (current().type !== 'EOF') throw new DiceError('Expresión no válida.');
    return left;
  }

  // -- evaluator ----------------------------------------------------------
  function rollDie(sides, rng) {
    return Math.floor(rng() * sides) + 1;
  }

  function evaluateNode(node, ctx) {
    if (node.type === 'Number') return node.value;

    if (node.type === 'Neg') return -evaluateNode(node.operand, ctx);

    if (node.type === 'BinOp') {
      const l = evaluateNode(node.left, ctx);
      const r = evaluateNode(node.right, ctx);
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      return l / r;
    }

    if (node.type === 'Dice') {
      if (node.kind === 'd66') {
        let sum = 0;
        for (let i = 0; i < node.quantity; i += 1) {
          const tens = rollDie(6, ctx.rng);
          const units = rollDie(6, ctx.rng);
          const value = tens * 10 + units;
          sum += value;
          ctx.diceLog.push({
            notation: '1d66',
            kind: 'd66',
            quantity: 1,
            sides: 66,
            rolls: [tens, units],
            subtotal: value
          });
        }
        return sum;
      }

      const rolls = [];
      let subtotal = 0;
      for (let i = 0; i < node.quantity; i += 1) {
        const value = rollDie(node.sides, ctx.rng);
        rolls.push(value);
        subtotal += value;
      }
      ctx.diceLog.push({
        notation: node.quantity + 'd' + node.sides,
        kind: 'standard',
        quantity: node.quantity,
        sides: node.sides,
        rolls: rolls,
        subtotal: subtotal
      });
      return subtotal;
    }

    throw new DiceError('Nodo de expresión no soportado.');
  }

  function compareValues(operator, a, b) {
    if (operator === '<=') return a <= b;
    if (operator === '>=') return a >= b;
    if (operator === '<') return a < b;
    if (operator === '>') return a > b;
    if (operator === '==') return a === b;
    throw new DiceError('Operador de comparación no soportado.');
  }

  function buildBreakdown(diceLog, total, comparison) {
    const dicePart = diceLog.map(function (d) {
      const sep = d.kind === 'd66' ? '->' : '=';
      return d.notation + ' -> [' + d.rolls.join(', ') + '] ' + sep + ' ' + d.subtotal;
    }).join(', ');
    let text = dicePart ? dicePart + ' -> total ' + total : 'total ' + total;
    if (comparison) {
      text += ' | ' + comparison.operator + ' ' + comparison.target + ' -> ' + (comparison.success ? 'ÉXITO' : 'FALLO');
    }
    return text;
  }

  // -- API pública ----------------------------------------------------
  // dice.roll(expression, { rng, label, context })
  NS.roll = function (expression, options) {
    const opts = options || {};
    const input = expression === undefined || expression === null ? '1d6' : String(expression);

    if (input.length > LIMITS.maxExpressionLength) {
      throw new DiceError('Expresión demasiado larga.');
    }

    const normalized = normalizeDiceExpression(input);
    if (!normalized) throw new DiceError('Expresión vacía.');

    const tokens = tokenize(normalized);
    const ast = parse(tokens);

    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const diceLog = [];
    const ctx = { rng: rng, diceLog: diceLog };

    let total;
    let comparison = null;

    if (ast.type === 'Comparison') {
      total = evaluateNode(ast.left, ctx);
      const target = evaluateNode(ast.right, ctx);
      comparison = { operator: ast.operator, target: target, success: compareValues(ast.operator, total, target) };
    } else {
      total = evaluateNode(ast, ctx);
    }

    const rollsFlat = [];
    diceLog.forEach(function (d) {
      d.rolls.forEach(function (v) { rollsFlat.push(v); });
    });

    const result = {
      input: input,
      expression: normalized,
      normalizedExpression: normalized,
      total: total,
      dice: diceLog,
      rolls: rollsFlat,
      breakdown: buildBreakdown(diceLog, total, comparison),
      comparison: comparison
    };
    if (opts.label !== undefined) result.label = opts.label;
    if (opts.context !== undefined) result.context = opts.context;
    return result;
  };

  // Alias histórico: hoy es exactamente la misma tirada. Se mantiene para
  // no romper llamadas existentes.
  NS.rollPool = function (expression, options) {
    return NS.roll(expression, options);
  };

  // Expuesto para depuración/tests: AST + normalización, sin evaluar.
  NS.parseDiceExpression = function (expression) {
    const normalized = normalizeDiceExpression(String(expression || ''));
    return parse(tokenize(normalized));
  };

  NS.normalizeDiceExpression = normalizeDiceExpression;
  NS.DiceError = DiceError;
})();
