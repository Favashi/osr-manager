# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado [SemVer](https://semver.org/lang/es/) (mientras el proyecto esté
por debajo de 1.0.0, cambios de versión menor pueden incluir funcionalidad
nueva sin garantía de estabilidad de la API interna).

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
