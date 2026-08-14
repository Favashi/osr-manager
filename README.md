# OSR Manager

Herramienta portable para gestionar exploración, hexcrawl, encuentros y
combate en juegos OSR.

Aplicación 100% cliente: HTML + CSS + JavaScript, sin backend, sin
instalación, sin build. Funciona directamente abriendo `index.html`, y
también puede publicarse como página estática mediante GitHub Pages — es la
misma aplicación en ambos casos, no dos versiones distintas.

**Versión actual:** 0.2.0 — ver [`CHANGELOG.md`](CHANGELOG.md) para el
historial completo de cambios.

## Estado del proyecto

Implementado:

- Modo **Mazmorra** (turnos, luz, efectos, descanso, encuentros).
- Modo **Exterior** (hexcrawl: viaje por hexes con popup de dirección,
  terreno, recursos, clima, caza, campamento).
- Modo **Combate** (iniciativa, daño/curación, estados, moral y reacción
  preparados a nivel de datos).
- **Ruleset Core**: arquitectura de sistemas de reglas por campaña
  (base + overrides), con ventana "Reglas..." para seleccionar, ver
  detalles y personalizar el ruleset activo.

En desarrollo / previsto (no confundir con lo anterior):

- Compendio de monstruos/objetos y motor de encuentros avanzado.
- Implementación funcional completa de moral, reacción y sorpresa (hoy la
  infraestructura de reglas ya las modela, pero el procedimiento de juego
  todavía no está implementado en el motor).
- Salvaciones, clases, hechizos, ataques automáticos, tablas de combate
  completas, experiencia y progresión de nivel.

## Características

- Interfaz de estética Turbo Vision / DOS (TuiCss), con paneles, menús y
  ventanas modales consistentes en los tres modos.
- Guardado local en el navegador + exportar/importar campaña como JSON.
- Atajos de teclado para las acciones más comunes.

## Sistemas compatibles

La arquitectura de reglas (`js/rules/`) está preparada para
sistemas OSR clásicos emparentados con D&D clásico. Rulesets soportados /
en proceso de integración:

- Aventuras en la Marca del Este
- Old-School Essentials (OSE)
- B/X (D&D Básico/Experto)
- BECMI
- Lamentations of the Flame Princess (LotFP)
- OD&D / 0e
- AD&D 1e

Cada perfil declara identificadores, familia y parámetros de configuración
(duración de turno, dado de iniciativa, modo de CA ascendente/descendente,
costes de terreno, etc.). Donde un manual concreto todavía no tiene un valor
confirmado, el ruleset hereda el valor genérico en vez de inventar una
regla — ver el propio código en `js/rules/` para el detalle
exacto de cada perfil.

No es un motor universal de rol: el alcance se limita deliberadamente a
sistemas OSR derivados o cercanos a D&D clásico.

## Ejecución portable

No requiere instalación. No requiere backend. No requiere Node para jugar.

1. Descargar o clonar este repositorio.
2. Abrir `index.html` (doble clic, o arrastrarlo a un navegador).
3. Utilizar OSR Manager.

Funciona completamente offline mediante `file://`.

**Limitación conocida de `file://`:** el guardado automático usa
`localStorage`, cuyo almacenamiento depende del origen (`file://` es un
origen distinto de una URL `https://`). Ver la sección
[Datos y persistencia](#datos-y-persistencia).

## GitHub Pages

Además de la versión portable, este repositorio incluye un workflow para
publicar la misma aplicación en GitHub Pages, junto con una landing:

- **Raíz del sitio** (`/`) — landing: qué es OSR Manager, modos, sistemas
  compatibles, enlace a la app y al repositorio. Fuente: `site/index.html`.
- **`/app/`** — la aplicación real, idéntica a abrir `index.html` en local.

El `index.html` de la raíz del repositorio **no cambia de función**: sigue
siendo el punto de entrada portable (`file://`, doble clic). El workflow lo
copia a `/app/` del sitio publicado; no se publica en la raíz del sitio.

La publicación **no es automática**: ningún commit ni pull request dispara
un despliegue. Se publica bajo demanda:

```text
GitHub
→ Actions
→ Publish GitHub Pages
→ Run workflow
→ seleccionar rama
→ Run workflow
```

El workflow debe estar disponible desde la rama principal/por defecto del
repositorio.

### Configuración inicial (una sola vez por repositorio)

Antes de poder publicar por primera vez:

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

**No** usar la opción "Deploy from a branch" — la fuente de publicación de
este proyecto es GitHub Actions.

### Aviso de visibilidad

El repositorio puede ser privado, pero los archivos publicados mediante
GitHub Pages deben considerarse **públicamente accesibles**. Por tanto: no
incluir secretos ni información privada en lo que se publica. El workflow
solo copia explícitamente los archivos necesarios para ejecutar la
aplicación (ver `.github/workflows/pages.yml`); no publica el repositorio
completo.

## Datos y persistencia

OSR Manager guarda la campaña activa en el `localStorage` del navegador.

`file://` y una URL de GitHub Pages (`https://usuario.github.io/...`) son
**orígenes distintos** para el navegador, así que no comparten
`localStorage` entre sí. Una campaña guardada en la versión portable no
aparecerá automáticamente en la versión web, y viceversa. No existe (ni está
previsto en esta fase) ningún mecanismo de sincronización entre ambas.

Para mover una campaña entre la versión portable y la versión web, usar:

```text
Archivo → Exportar   (genera un .json)
Archivo → Importar   (carga ese .json)
```

## Estructura del proyecto

```text
index.html               Punto de entrada de la aplicación (portable, file://)
css/                      TuiCss + overrides propios (custom.css) + fuentes e imágenes
js/                        Lógica de la app (estado, motores de Mazmorra/Exterior/Combate, Ruleset Core en js/rules/)

site/index.html           Landing publicada en la raíz de GitHub Pages (no afecta a la versión portable)

.github/workflows/       Workflow de publicación manual a GitHub Pages (landing en / + app en /app/)
licenses/                 Textos de licencia de terceros (ver THIRD_PARTY_NOTICES.md)

README.md                 Este documento
CHANGELOG.md               Historial de versiones
LICENSE                    Licencia MIT del código original del proyecto
THIRD_PARTY_NOTICES.md     Contenido/componentes de terceros y su licencia
.gitignore
```

## Desarrollo

OSR Manager no tiene build ni dependencias de runtime. No hay `package.json`
en el proyecto todavía: no existen (por ahora) importadores, generador de
compendios ni suite de tests con Node — si en el futuro se añaden, serán
**dependencia de desarrollo únicamente**, nunca necesaria para ejecutar o
jugar la aplicación.

La única comprobación automatizada existente hoy es una validación de
sintaxis JavaScript (`node --check`) que corre el propio workflow de Pages
antes de publicar — no requiere instalar nada, usa el Node ya presente en
el runner de GitHub Actions.

## Publicación manual

1. Hacer commit/push de los cambios.
2. Comprobar qué rama se quiere publicar.
3. Abrir **Actions** en GitHub.
4. Seleccionar **Publish GitHub Pages**.
5. Pulsar **Run workflow**.
6. Seleccionar la rama.
7. Confirmar.
8. Esperar a que termine el deployment (job `deploy`).
9. Abrir la URL de Pages indicada en el resumen del job o en
   Settings → Pages.

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

## Changelog

Ver [`CHANGELOG.md`](CHANGELOG.md) para el historial de versiones.

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
