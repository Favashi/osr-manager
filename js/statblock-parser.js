(function () {
  const NS = (window.OSRApp = window.OSRApp || {});

  // ---------------------------------------------------------------------
  // Statblock Importer 1.0 — parser tolerante basado en patrones, ajustado
  // para statblocks reales de Old-School Essentials (EN/ES) y Aventuras en
  // la Marca del Este. NO es un parser universal de RPG: solo reconoce las
  // abreviaturas habituales de este linaje de juegos. Nunca usa eval().
  // Reutiliza Dice Engine (js/dice.js) para validar expresiones de dados
  // en vez de reinventar esa lógica.
  // ---------------------------------------------------------------------

  const LABELS = {
    ac: 'AC|CA|AAC',
    hd: 'HD|DG',
    hp: 'HP|PG',
    att: 'ATT|ATQ|Ataques|Attacks',
    thac0: 'THAC0',
    ba: 'BA|AB',
    mv: 'MV|MOV|Movimiento|Movement',
    sv: 'SV|TS|Saves?|Salvaciones?',
    ml: 'ML|Moral',
    al: 'AL|Alineamiento|Alignment',
    xp: 'XP|PX',
    na: 'NA|N[ºo°]?\\.?\\s*que\\s*aparece|Number Appearing',
    tt: 'TT|Tesoro|Treasure',
    notes: 'Notas?|Notes?'
  };

  // Alternancia de TODAS las etiquetas conocidas: sirve de frontera para
  // saber dónde termina el valor de un campo cuando el statblock no usa
  // comas/saltos de línea entre campos (orden y separadores variables, o
  // todo el bloque principal en una sola línea corrida como en OSE).
  const LABEL_ALTERNATION = '(?:' + Object.keys(LABELS).map(function (key) { return LABELS[key]; }).join('|') + ')';

  // --- Normalización (solo para analizar; NUNCA toca source.originalStatblock) --

  // Repara palabras partidas al copiar desde PDF ("alcan-\nzan" ->
  // "alcanzan"): letra + guión + salto de línea + letra, sin espacios de
  // por medio. Deliberadamente estricto para no fusionar guiones de
  // puntuación real (esos casi siempre llevan espacio alrededor).
  function repairHyphenatedLineBreaks(text) {
    return text.replace(/([a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])-\s*\n\s*([a-zA-ZáéíóúñüÁÉÍÓÚÑÜ])/g, '$1$2');
  }

  function normalizeForParsing(rawText) {
    let text = String(rawText || '');
    // Variantes de guión (en dash/em dash/menos) -> guión simple. Debe ir
    // ANTES de reparar palabras partidas, porque el PDF puede usar
    // cualquiera de estos como guión de corte de línea, y statblocks OSE
    // reales usan en dash en "HD 1–1".
    text = text.replace(/[–—−]/g, '-');
    text = repairHyphenatedLineBreaks(text);
    // × / x indistintos para "cantidad x ataque".
    text = text.replace(/×/g, 'x');
    // Prima/comillas tipográficas -> apóstrofo recto (pies de movimiento).
    text = text.replace(/[’′‘]/g, "'");
    // Espacios especiales (NBSP y variantes Unicode) -> espacio normal.
    text = text.replace(/[\u00a0\u2000-\u200b\u202f]/g, ' ');
    // Markdown: enlaces [texto](url) -> texto; negrita/cursiva -> texto.
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2');
    // Espacios/tabs repetidos y saltos de línea arbitrarios -> forma
    // predecible, conservando al menos un salto de línea como separador
    // de sección (para poder cortar "bloque principal" / "habilidades").
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/ *\n */g, '\n');
    text = text.replace(/\n{2,}/g, '\n');
    return text.trim();
  }

  function isValidDiceExpression(expr) {
    if (!expr || !NS.parseDiceExpression) return false;
    try {
      NS.parseDiceExpression(expr);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Busca un patrón NdX(+/-N) dentro de un texto libre y lo valida contra
  // Dice Engine; si no hay coincidencia válida devuelve null (nunca
  // inventa una expresión).
  function extractDiceExpression(text) {
    const match = String(text || '').match(/\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?/i);
    if (!match) return null;
    const candidate = match[0].replace(/\s+/g, '');
    return isValidDiceExpression(candidate) ? candidate : null;
  }

  function slugify(value) {
    const base = String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'sin-nombre';
  }

  // IDs estables, nunca el nombre solo: "monster:custom:goblin-<marca>".
  // Mismo patrón de sufijo (Date.now()) que ya usa el resto de la app
  // para IDs generados en cliente (efectos, luces, personajes).
  function generateStatblockId(type, name) {
    return type + ':custom:' + slugify(name) + '-' + Date.now();
  }

  function detectType(text) {
    if (/\b(?:Nivel|Level|Clase|Class)\b/i.test(text)) return 'npc';
    return 'monster';
  }

  // Nombre = todo el texto antes de la primera etiqueta reconocida,
  // recortando la primera línea sobrante y puntuación final.
  function extractName(text) {
    const re = new RegExp('^([\\s\\S]*?)\\b' + LABEL_ALTERNATION + '\\b', 'i');
    const match = text.match(re);
    let candidate = match ? match[1] : text;
    candidate = candidate.split('\n')[0].trim();
    candidate = candidate.replace(/[:\-,;]+$/, '').trim();
    return candidate || null;
  }

  // --- Campos con posición: cada extractor devuelve también el match
  // completo (o null) para que parseStatblock calcule dónde termina el
  // bloque principal reconocido y qué queda como texto sobrante
  // (habilidades/notas) sin perder nada.

  function matchArmorClass(text) {
    return text.match(new RegExp('\\b(?:' + LABELS.ac + ')\\b\\s*[:=]?\\s*(-?\\d+)\\s*(?:\\[\\s*(-?\\d+)\\s*\\])?', 'i'));
  }

  function matchHitDice(text) {
    return text.match(new RegExp('\\b(?:' + LABELS.hd + ')\\b\\s*[:=]?\\s*([0-9]+(?:\\s*[+\\-]\\s*[0-9]+)?\\*{0,2})\\s*(\\([^)]*\\))?', 'i'));
  }

  function matchHitPointsParenthetical(text) {
    return text.match(/\(\s*(\d+)\s*(?:pg|hp)\s*\)/i);
  }

  function matchHitPointsLabel(text) {
    return text.match(new RegExp('\\b(?:' + LABELS.hp + ')\\b\\s*[:=]?\\s*(\\d+)', 'i'));
  }

  function matchThac0(text) {
    return text.match(new RegExp('\\b(?:' + LABELS.thac0 + ')\\b\\s*[:=]?\\s*(\\d+)\\s*(?:\\[\\s*(-?\\d+)\\s*\\])?', 'i'));
  }

  function matchBaseAttackBonus(text) {
    return text.match(new RegExp('\\b(?:' + LABELS.ba + ')\\b\\s*[:=]?\\s*\\+?(-?\\d+)', 'i'));
  }

  // Campos numéricos que pueden traer una excepción entre paréntesis
  // ("ML 7 (9 with king)", "XP 5 (bodyguard: 20, king: 35)"): se guarda
  // el valor base normalizado y el texto completo tal cual, sin intentar
  // convertir la excepción en una regla automática.
  function matchValueWithException(text, labelPattern) {
    return text.match(new RegExp('\\b(?:' + labelPattern + ')\\b\\s*[:=]?\\s*(-?\\d+)\\s*(\\([^)]*\\))?', 'i'));
  }

  function valueWithExceptionFromMatch(match) {
    if (!match) return { value: null, raw: null };
    const value = Number(match[1]);
    const raw = match[2] ? (match[1] + ' ' + match[2]).trim() : String(value);
    return { value: value, raw: raw };
  }

  // Captura genérica para campos de texto libre (movimiento, alineamiento,
  // salvaciones, tesoro): todo lo que sigue a la etiqueta hasta el próximo
  // delimitador (coma/punto y coma/salto de línea) o la siguiente
  // etiqueta conocida, lo que llegue antes. Funciona igual si el
  // statblock no usa separadores (todo en una línea corrida).
  function matchFreeTextField(text, labelPattern) {
    const boundary = '(?:[,;\\n]|\\s+' + LABEL_ALTERNATION + '\\b|$)';
    const re = new RegExp('\\b(?:' + labelPattern + ')\\b\\s*[:=]?\\s*([\\s\\S]*?)(?=' + boundary + ')', 'i');
    return text.match(re);
  }

  function matchNumberAppearing(text) {
    const re = new RegExp('\\b(?:' + LABELS.na + ')\\b\\s*[:=]?\\s*([0-9]+\\s*d\\s*[0-9]+(?:\\s*[+-]\\s*[0-9]+)?)\\s*(?:\\(\\s*([0-9]+\\s*d\\s*[0-9]+(?:\\s*[+-]\\s*[0-9]+)?)\\s*\\))?', 'i');
    return text.match(re);
  }

  // --- Ataques -----------------------------------------------------------

  // Divide por comas/punto y coma de nivel superior (ignora los que caen
  // dentro de paréntesis, p.ej. "1d4 cada una") para no partir un mismo
  // ataque en dos trozos.
  function splitTopLevelAttacks(text) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if ((ch === ',' || ch === ';') && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map(function (part) { return part.trim(); }).filter(Boolean);
  }

  function parseAttackEntry(raw) {
    const entry = { name: null, count: null, attackBonus: null, damage: null, raw: raw };
    let rest = raw.trim();

    const parenMatch = rest.match(/\(([^)]*)\)/);
    let damageText = null;
    if (parenMatch) {
      damageText = parenMatch[1].trim();
      rest = (rest.slice(0, parenMatch.index) + rest.slice(parenMatch.index + parenMatch[0].length)).trim();
    }

    const countMatch = rest.match(/^(\d+)\s*x?\s*/i);
    if (countMatch) {
      entry.count = Number(countMatch[1]);
      rest = rest.slice(countMatch[0].length).trim();
    }

    const bonusMatch = rest.match(/\+\s*(\d+)/);
    if (bonusMatch) {
      entry.attackBonus = Number(bonusMatch[1]);
      rest = (rest.slice(0, bonusMatch.index) + rest.slice(bonusMatch.index + bonusMatch[0].length)).trim();
    }

    entry.name = rest || null;

    if (damageText) {
      const diceExpr = extractDiceExpression(damageText);
      entry.damage = diceExpr || damageText;
    }

    return entry;
  }

  function extractAttacks(attackBlock, warnings) {
    if (!attackBlock) return [];
    const attacks = splitTopLevelAttacks(attackBlock).map(parseAttackEntry);
    const anyUnstructured = attacks.some(function (attack) { return !attack.damage; });
    if (anyUnstructured) {
      warnings.push('Ataque conservado como texto.');
    }
    return attacks;
  }

  // --- Habilidades y notas -------------------------------------------

  // Todo lo que queda DESPUÉS del último campo reconocido del bloque
  // principal (posición máxima entre todos los matches) se conserva: no
  // se descarta nada. Las líneas con forma de viñeta Markdown
  // "- Nombre: texto." (ya sin negrita, limpiada en normalizeForParsing)
  // se estructuran como habilidades; el resto de líneas se une como notas.
  function parseAbilitiesAndNotes(trailingText) {
    const abilities = [];
    const noteLines = [];
    const lines = String(trailingText || '')
      .split('\n')
      .map(function (line) { return line.trim(); })
      // Descarta líneas vacías y restos de puntuación de cierre del último
      // campo reconocido (p.ej. el "." de "PX: 500."), que no aportan
      // información propia.
      .filter(function (line) { return line && !/^[.,;:!?]+$/.test(line); });

    lines.forEach(function (line) {
      const bulletMatch = line.match(/^[-•*]\s*([^:]+):\s*(.+)$/);
      if (bulletMatch) {
        abilities.push({ name: bulletMatch[1].trim(), text: bulletMatch[2].trim() });
        return;
      }
      const explicitNotes = line.match(new RegExp('^(?:' + LABELS.notes + ')\\s*[:=]?\\s*(.*)$', 'i'));
      // Restos de puntuación al inicio de la línea (p.ej. ". Los ataques...")
      // se recortan sin tocar el resto del texto.
      const cleaned = (explicitNotes ? explicitNotes[1] : line).replace(/^[.,;:!?]+\s*/, '');
      noteLines.push(cleaned.trim());
    });

    return {
      abilities: abilities,
      notes: noteLines.filter(Boolean).join(' ').trim() || null
    };
  }

  // --- API pública ---------------------------------------------------

  function parseStatblock(rawText, typeHint) {
    const original = String(rawText || '');
    const text = normalizeForParsing(original);
    const warnings = [];
    const type = (typeHint && typeHint !== 'auto') ? typeHint : detectType(text);

    let lastEnd = 0;
    function track(match) {
      if (match) lastEnd = Math.max(lastEnd, match.index + match[0].length);
    }

    const name = extractName(text);
    if (!name) warnings.push('No se ha podido detectar el nombre.');

    const acMatch = matchArmorClass(text);
    track(acMatch);
    const armorClass = acMatch
      ? { descending: Number(acMatch[1]), ascending: acMatch[2] !== undefined ? Number(acMatch[2]) : null }
      : { descending: null, ascending: null };

    const hdMatch = matchHitDice(text);
    track(hdMatch);
    let hitDice = { raw: null, formula: null };
    if (hdMatch) {
      const raw = hdMatch[1].replace(/\s+/g, '');
      const diceLike = raw.match(/\d+d\d+(?:[+-]\d+)?/i);
      hitDice = { raw: raw, formula: diceLike && isValidDiceExpression(diceLike[0]) ? diceLike[0] : null };
    }

    // PG entre paréntesis pegado al DG ("HD 1-1 (3hp)", "DG: 6 (50 PG)")
    // tiene prioridad; si no aparece ahí, se busca la etiqueta PG/HP suelta.
    const hpParenMatch = matchHitPointsParenthetical(text);
    const hpLabelMatch = matchHitPointsLabel(text);
    track(hpParenMatch);
    track(hpLabelMatch);
    const hitPoints = hpParenMatch ? Number(hpParenMatch[1]) : (hpLabelMatch ? Number(hpLabelMatch[1]) : null);

    const attMatch = matchFreeTextField(text, LABELS.att);
    track(attMatch);
    const attacks = extractAttacks(attMatch ? attMatch[1].trim() : null, warnings);

    const thac0Match = matchThac0(text);
    track(thac0Match);
    const thac0 = thac0Match
      ? thac0Match[1] + (thac0Match[2] !== undefined ? ' [' + thac0Match[2] + ']' : '')
      : null;

    const baMatch = matchBaseAttackBonus(text);
    track(baMatch);
    const baseAttackBonus = baMatch ? Number(baMatch[1]) : null;

    const mvMatch = matchFreeTextField(text, LABELS.mv);
    track(mvMatch);
    const movement = mvMatch ? (mvMatch[1].trim() || null) : null;
    if (!movement) warnings.push('Revisa el movimiento.');

    const svMatch = matchFreeTextField(text, LABELS.sv);
    track(svMatch);
    const savingThrows = svMatch ? (svMatch[1].trim() || null) : null;
    if (!savingThrows) warnings.push('No se ha podido interpretar la salvación.');

    const mlMatch = matchValueWithException(text, LABELS.ml);
    track(mlMatch);
    const morale = valueWithExceptionFromMatch(mlMatch);

    const alMatch = matchFreeTextField(text, LABELS.al);
    track(alMatch);
    const alignment = alMatch ? (alMatch[1].trim() || null) : null;

    const xpMatch = matchValueWithException(text, LABELS.xp);
    track(xpMatch);
    const xp = valueWithExceptionFromMatch(xpMatch);

    const naMatch = matchNumberAppearing(text);
    track(naMatch);
    const numberAppearing = { dungeon: null, wilderness: null };
    if (naMatch) {
      const dungeon = naMatch[1] ? naMatch[1].replace(/\s+/g, '') : null;
      const wilderness = naMatch[2] ? naMatch[2].replace(/\s+/g, '') : null;
      numberAppearing.dungeon = dungeon && isValidDiceExpression(dungeon) ? dungeon : null;
      numberAppearing.wilderness = wilderness && isValidDiceExpression(wilderness) ? wilderness : null;
    }

    const ttMatch = matchFreeTextField(text, LABELS.tt);
    track(ttMatch);
    const treasure = ttMatch ? (ttMatch[1].trim() || null) : null;

    // Notas explícitas ("Notas:"/"Notes:") en el bloque principal, si las
    // hay, también empujan la frontera del bloque reconocido.
    const notesMatch = matchFreeTextField(text, LABELS.notes);
    track(notesMatch);

    const trailingText = text.slice(lastEnd);
    const abilitiesAndNotes = parseAbilitiesAndNotes(trailingText);
    // Un "Notas:" ya capturado dentro del bloque principal (raro, pero
    // posible) se antepone a cualquier nota sobrante encontrada después.
    const inlineNotes = notesMatch ? (notesMatch[1].trim() || null) : null;
    const notes = [inlineNotes, abilitiesAndNotes.notes].filter(Boolean).join(' ').trim() || null;

    const model = {
      id: generateStatblockId(type, name),
      type: type,
      name: name,
      armorClass: armorClass,
      hitDice: hitDice,
      hitPoints: hitPoints,
      movement: movement,
      attacks: attacks,
      thac0: thac0,
      baseAttackBonus: baseAttackBonus,
      morale: morale,
      alignment: alignment,
      xp: xp,
      numberAppearing: numberAppearing,
      savingThrows: savingThrows,
      treasure: treasure,
      abilities: abilitiesAndNotes.abilities,
      notes: notes,
      source: {
        type: 'custom',
        originalStatblock: original
      }
    };

    return { model: model, warnings: warnings };
  }

  NS.statblock = {
    parse: parseStatblock,
    detectType: detectType,
    slugify: slugify,
    generateId: generateStatblockId,
    normalizeForParsing: normalizeForParsing
  };
})();
