# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado [SemVer](https://semver.org/lang/es/) (mientras el proyecto esté
por debajo de 1.0.0, cambios de versión menor pueden incluir funcionalidad
nueva sin garantía de estabilidad de la API interna).

## [0.3.0] - 2026-08-19

### Añadido

- **Statblock Importer 1.0** (`js/statblock-parser.js`): pega un statblock,
  analízalo y revisa el resultado antes de guardar (nunca se guarda
  automáticamente). Parser tolerante por etiquetas (CA/AC, DG/HD, PG/HP,
  ATQ/ATT, THAC0, BA/AB, MV, SV/TS, ML/Moral, AL, XP/PX, NA, TT/Tesoro), sin
  `eval()`, reutiliza Dice Engine para validar expresiones de dados. Ajustado
  con statblocks reales de Old-School Essentials (EN/ES) y Aventuras en la
  Marca del Este: normaliza guiones/primas/Markdown, repara palabras
  partidas por PDF, conserva excepciones tipo "ML 7 (9 with king)" sin
  convertirlas en regla automática, y extrae habilidades desde viñetas
  Markdown sin perder el texto original (`source.originalStatblock` íntegro
  siempre).
- **Codex MVP** (`js/repository.js` + popup Codex): biblioteca de
  Monstruos / PNJ / Encuentros. Combina Biblioteca (global, `localStorage`
  propio, fuera del export de campaña) y contenido de la campaña actual sin
  duplicar registros. Buscar/filtrar en tiempo real, sticky header,
  selección con teclado. Crear/editar reutiliza el mismo formulario del
  Statblock Importer; Importar abre el importador sin duplicar su lógica.
  Encuentros como composición reutilizable por referencia (`actorId`, nunca
  copia de stats); una referencia rota nunca rompe el Codex.
- Mazmorra: panel **Ubicación actual** (nombre/nivel/referencia/notas,
  puramente textual, sin mapa) y aviso **"! DESCANSO PENDIENTE"** cuando el
  ciclo de descanso llega al límite configurado por el ruleset activo.

### Cambiado

- Corregido: al generar un encuentro se tiraba **Moral** para cualquier
  criatura con presencia real; ahora se tira **Reacción** (la disposición
  inicial), que es lo que ese momento del procedimiento representa. Moral
  queda reservada para la prueba de aguante en combate (todavía no
  automatizada).
- Mazmorra y Exterior: Buscar/Escuchar/Forzar/Descansar pasan de un popup
  aparte a botones directos en el panel Acciones, agrupados **DJ /
  Jugadores** en ambos modos, en dos columnas.
- Pasada de accesibilidad: sustituidos todos los iconos/separadores que no
  se podían escribir con teclado (`≡ ▢ ▣ ✎ ⤢ │ ↑ ↓ · →`) por equivalentes
  ASCII en toda la aplicación.
- Landing de GitHub Pages (`site/index.html`) revisada varias veces:
  estructura más corta y sin contenido repetido, colores de modo
  (Mazmorra/Exterior/Combate) reservados exclusivamente a las secciones que
  realmente son esos modos, y finalmente rediseñada con identidad de
  "portada de módulo old-school" (cinta diagonal, código de módulo
  "OSR-01", subtítulo "Game Master's Utility", captura grande a modo de
  ilustración de portada) reutilizando exclusivamente la paleta EGA ya
  existente; FAQ, roadmap, arquitectura y detalle de `localStorage`
  eliminados de la landing y quedan solo en `README.md`.

### Corregido

- Dos popups abiertos a la vez (p. ej. Codex → Importar statblock) podían
  apilarse en el orden equivocado — el que aparecía primero en el HTML
  pintaba encima aunque se hubiera abierto después. `openModal` ahora mueve
  el popup al final de su contenedor al abrirse.
- Botones "Cerrar" añadidos dinámicamente (fichas de detalle) no
  respondían al clic: el bindeo de `data-close-modal` era estático y nunca
  los encontraba. Ahora es un listener delegado, cubre cualquier botón
  futuro también.

## [0.2.0] - 2026-08-14

### Añadido

- **Dice Engine 2.0** (`js/dice.js`): parser propio (sin `eval`) para
  expresiones `NdS`, operadores `+ - * /`, paréntesis, comparaciones
  (`< <= > >= = ==`), `d%` (alias de d100) y `d66` (dos tiradas de d6
  formando decenas+unidades, no un uniforme 1-66), con límites de
  seguridad (longitud, cantidad, caras, profundidad de paréntesis).
- **Ruleset Core** (`js/rules/`): arquitectura de sistemas de reglas por
  campaña (registro + resolutor, herencia `extends`/`overrides`), con
  ventana "Reglas..." para elegir/ver/personalizar el ruleset activo.
  Perfiles incluidos: Marca del Este, Old-School Essentials, B/X, BECMI,
  LotFP, OD&D/0e, AD&D 1e.
- Layout responsive **Normal / Maximizado**: Normal con ancho ~920px y
  alto según contenido; Maximizado con tope 1920×1080. El cambio de
  layout solo ocurre al pulsar el botón Maximizar, nunca por anchura de
  viewport.
- Panel de Log con altura fija (~5 entradas visibles) y scroll propio.
- `js/ui-list.js`: helpers reutilizables de búsqueda/filtro
  (case-insensitive, normalización de espacios) y navegación de listas
  por teclado, preparados para el futuro Codex.

### Cambiado

- Pasada de ajustes visuales y de usabilidad: cabeceras fijas y scroll
  consistente en tablas/listas (Grupo, Combate), alineación numérica,
  distinción visual entre combatiente **seleccionado** (amarillo) y
  **turno activo** (marcador `▸`, nunca el mismo amarillo), contadores
  `[N]` en cabeceras de panel (Grupo/Efectos/Combate), estados vacíos sin
  caja ni icono.
- Popups consolidados en tamaños **small / medium / large**, con pie de
  atajos de teclado por contexto y foco inicial automático (primer campo
  o acción principal).
- Popup de Ayuda ampliado con explicación de uso por modo (Mazmorra,
  Exterior, Combate, Guardado) y enlace al repositorio.

### Corregido

- Direcciones del popup de Viajar mostraban las claves internas en inglés
  (NE/NW/SE/SW) en vez de abreviaturas en español (NE/NO/SE/SO).

## [0.1.0] - 2026-08-14

### Añadido

- Preparación inicial del repositorio para GitHub y GitHub Pages: README,
  `LICENSE` (MIT), `THIRD_PARTY_NOTICES.md`, carpeta `licenses/` y
  workflow de publicación manual (`workflow_dispatch`, sin triggers
  automáticos de push/PR).
- Ninguna funcionalidad de la aplicación modificada en esta versión.
