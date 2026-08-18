# OSR Manager

Una ayuda de mesa para directores de juego OSR: exploración, encuentros,
combate, tiempo, luz y recursos — sin convertir la partida en un VTT.

**[▶ Abrir online](https://favashi.github.io/osr-manager/app/)** ·
**[↓ Descargar última versión](https://github.com/Favashi/osr-manager/releases/latest/download/osr-manager.zip)** ·
[GitHub Releases](https://github.com/Favashi/osr-manager/releases/latest)

Ver [`CHANGELOG.md`](CHANGELOG.md) para el historial completo de cambios.

## Qué es

OSR Manager es una herramienta portable para directores de juego (DJ) de
RPG old-school (D&D clásico y sistemas emparentados: OSE, B/X, BECMI,
LotFP, OD&D, AD&D 1e, y perfiles de la comunidad hispana como Aventuras en
la Marca del Este). Gestiona el trabajo repetitivo de mesa — turnos, luz,
efectos, encuentros, viaje por hexes, iniciativa — desde el navegador,
offline y sin instalación.

## Filosofía

OSR Manager no pretende sustituir los libros, fichas, dados o mapas. Está
diseñado para encargarse de las tareas repetitivas mientras el director
sigue centrado en la partida.

**Menos gestión. Más partida.**

**No es un VTT.** No hay mapas tácticos, tokens, niebla de guerra ni
movimiento por casillas. Tus dados, fichas, mapas y libros siguen estando
en la mesa.

## Funcionalidades

Estado real del código en este repositorio (no una lista aspiracional):

Implementado:

- Modo **Mazmorra** (turnos, luz, efectos, descansos, exploración,
  encuentros, ubicación actual).
- Modo **Exterior** (hexcrawl: viaje por hexes, terreno, recursos, clima,
  caza, campamento, encuentros).
- Modo **Combate** (iniciativa, rondas, daño/curación, estados, moral y
  reacción a nivel de datos).
- **Ruleset Core**: arquitectura de sistemas de reglas por campaña (base +
  overrides), con ventana "Reglas..." para seleccionar, ver detalles y
  personalizar el ruleset activo.
- **Dice Engine**: parser propio de expresiones de dados (sin `eval`) —
  `2d6+1d4+3`, comparaciones, `d%`, `d66`.
- **Statblock Importer**: pega un statblock (OSE, La Marca del Este y
  formatos OSR similares), analízalo y revísalo antes de guardarlo. Nunca
  se guarda nada automáticamente.
- **Codex** *(en desarrollo — MVP funcional, sigue creciendo)*: biblioteca
  de Monstruos / PNJ / Encuentros, combinando una Biblioteca global del
  navegador con el contenido de la campaña actual, sin duplicar registros.

Previsto, todavía no implementado:

- Encuentro rápido (llevar un encuentro generado directamente a combate).
- Tablas (más allá de la referencia mínima actual) y tesoro.
- Implementación funcional completa de moral/reacción/sorpresa como
  procedimiento de juego (hoy Ruleset Core ya modela los datos, el motor
  todavía no automatiza el procedimiento).
- Salvaciones, clases, hechizos, ataques automáticos, progresión de nivel.

## Modos

- **Mazmorra** — turnos, tiempo, luz, efectos, descansos y encuentros.
- **Exterior** — hexcrawl: viaje por hexes, terreno, recursos, clima, caza
  y campamento.
- **Combate** — iniciativa, rondas, PG, estados, moral y combatientes.

## Utilidades

- **Dados** — expresiones como `2d6+1d4+3`, `d100`, `d66`.
- **PX** — calculadora rápida de experiencia.
- **Statblocks** — importa monstruos y PNJ desde texto.
- **Codex** — biblioteca personal de consulta *(en desarrollo)*.

## Sistemas compatibles

La arquitectura de reglas (`js/rules/`) está preparada para sistemas OSR
clásicos emparentados con D&D clásico:

- Aventuras en la Marca del Este
- Old-School Essentials (OSE)
- B/X (D&D Básico/Experto)
- BECMI
- Lamentations of the Flame Princess (LotFP)
- OD&D / 0e
- AD&D 1e

Cada perfil declara identificadores, familia y parámetros de configuración
(duración de turno, dado de iniciativa, modo de CA ascendente/descendente,
costes de terreno, etc.). Donde un manual concreto todavía no tiene un
valor confirmado, el ruleset hereda el valor genérico en vez de inventar
una regla. El grado de automatización puede variar según el sistema — ver
el propio código en `js/rules/` para el detalle exacto de cada perfil.

No es un motor universal de rol: el alcance se limita deliberadamente a
sistemas OSR derivados o cercanos a D&D clásico.

## Uso online

**[Abrir OSR Manager](https://favashi.github.io/osr-manager/app/)** —
publicado mediante GitHub Pages, sin instalación.

La landing en la raíz del sitio (`https://favashi.github.io/osr-manager/`)
explica el proyecto; `/app/` es la aplicación real, idéntica a la versión
portable.

## Uso portable / offline

1. Descargar
   [`osr-manager.zip`](https://github.com/Favashi/osr-manager/releases/latest/download/osr-manager.zip)
   (siempre apunta a la última versión publicada).
2. Descomprimir.
3. Abrir `index.html` (doble clic, o arrastrarlo a un navegador).

No requiere instalación. No requiere backend. No requiere Node para jugar.
Funciona completamente offline mediante `file://`.

Alternativa: clonar este repositorio y abrir `index.html` directamente —
es el mismo punto de entrada que usa el ZIP.

## Guardado

OSR Manager guarda la campaña activa en el `localStorage` del navegador.

`file://` y la URL de GitHub Pages son **orígenes distintos** para el
navegador, así que no comparten `localStorage` entre sí — tampoco lo
comparten dos ZIP descomprimidos en carpetas distintas. Una campaña
guardada en un origen no aparece automáticamente en otro.

Para mover una campaña entre orígenes (portable ↔ online, o entre
ordenadores), usar:

```text
Archivo → Exportar   (genera un .json)
Archivo → Importar   (carga ese .json)
```

## Roadmap

```text
[x] Mazmorra / Exterior / Combate
[x] Dice Engine / Ruleset Core
[x] Importador de statblocks
[>] Codex
[ ] Encuentro rápido
[ ] Tablas / Tesoro
```

Ver [`CHANGELOG.md`](CHANGELOG.md) para el detalle de cada versión.

## Desarrollo

OSR Manager no tiene build ni dependencias de runtime. No hay
`package.json`: no existen (por ahora) tests con Node — si en el futuro se
añaden, serán **dependencia de desarrollo únicamente**, nunca necesaria
para ejecutar o jugar la aplicación.

La única comprobación automatizada existente hoy es una validación de
sintaxis JavaScript (`node --check`) que corre el propio workflow de
publicación antes de desplegar — no requiere instalar nada, usa el Node ya
presente en el runner de GitHub Actions.

`VERSION` es la fuente única de versión del proyecto (usada por la
Release, el ZIP y la landing). Al preparar una nueva versión: actualizar
`VERSION`, la línea "Versión:" de la ventana *Acerca de* en `index.html`, y
añadir la entrada correspondiente en `CHANGELOG.md`.

### Estructura del proyecto

```text
index.html                 Punto de entrada de la aplicación (portable, file://)
VERSION                    Fuente única de versión (usada por Release/ZIP/landing)
css/                        TuiCss + overrides propios (custom.css) + fuentes e imágenes
js/                          Lógica de la app: estado, motores de Mazmorra/Exterior/Combate,
                             Dice Engine, Statblock Importer, Codex (repository.js),
                             Ruleset Core en js/rules/

site/index.html             Landing publicada en la raíz de GitHub Pages (no afecta a la
                             versión portable)

.github/workflows/         Workflow de publicación manual: GitHub Pages y, opcionalmente,
                             Release + osr-manager.zip
licenses/                   Textos de licencia de terceros (ver THIRD_PARTY_NOTICES.md)

README.md                   Este documento
CHANGELOG.md                 Historial de versiones
LICENSE                      Licencia MIT del código original del proyecto
THIRD_PARTY_NOTICES.md       Contenido/componentes de terceros y su licencia
.gitignore
```

### Publicación manual

Un único workflow, dos modos:

```text
GitHub
→ Actions
→ Publish (Pages + Release)
→ Run workflow
```

**Solo Pages** (`Publicar release` = false): actualiza la landing y la
app publicadas. No crea tag ni Release.

**Pages + Release** (`Publicar release` = true): usa la versión del
fichero `VERSION` (no se pide a mano), construye `osr-manager.zip`,
despliega Pages, crea el tag `vX.Y.Z`, publica la GitHub Release y adjunta
el ZIP. Si el tag ya existe, falla sin sobrescribir nada.

Requiere, una sola vez por repositorio:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

**No** usar la opción "Deploy from a branch".

### Aviso de visibilidad

El repositorio puede ser privado, pero los archivos publicados mediante
GitHub Pages y los assets de una Release deben considerarse **públicamente
accesibles**. El workflow solo copia/empaqueta explícitamente lo necesario
para ejecutar la aplicación (ver `.github/workflows/pages.yml`); no publica
el repositorio completo.

## Compendios y contenido de terceros

Este repositorio incluye componentes visuales de terceros (el framework
TuiCss y la fuente "Perfect DOS VGA 437") que **no** están cubiertos por la
licencia MIT del proyecto. Ver `THIRD_PARTY_NOTICES.md` para el detalle de
origen y licencia de cada uno, y `licenses/` para los textos
correspondientes cuando estén disponibles.

Si en el futuro se integra un compendio de contenido de terceros (por
ejemplo basado en Old-School Essentials), se documentará aquí y en
`THIRD_PARTY_NOTICES.md` con su origen y licencia exactos — nunca se
asumirá que un dataset externo es MIT solo porque el código del proyecto lo
sea.

## Licencia

El código original de OSR Manager se distribuye bajo licencia **MIT** (ver
`LICENSE`).

El contenido y los componentes de terceros incluidos en el repositorio
pueden estar sujetos a sus propias licencias. Consultar
`THIRD_PARTY_NOTICES.md`.

**Compatibilidad con la OGL:** el proyecto no incluye (todavía) contenido
licenciado bajo la Open Game License. La licencia MIT cubre exclusivamente
el código propio y no reclama derechos sobre ningún sistema OSR; los
perfiles de `js/rules/` son parámetros de configuración originales, no
texto de reglas copiado. Ver la sección "Compatibilidad con la OGL" en
`THIRD_PARTY_NOTICES.md` para el criterio a seguir si en el futuro se
integra contenido Open Game Content (p. ej. en el Codex).
