# Avisos de terceros

El código original de OSR Manager se distribuye bajo licencia MIT (ver
`LICENSE`). Esta tabla documenta el contenido y los componentes de terceros
incluidos en el repositorio, que **no** están cubiertos por esa licencia MIT
y conservan sus propios términos.

No se ha inventado ninguna licencia: donde el proyecto no incluye un fichero
de licencia local que la confirme, se marca explícitamente como pendiente de
revisión.

| Dependencia / contenido | Origen | Licencia | Qué parte del proyecto afecta |
|---|---|---|---|
| TuiCss (`css/tui.css`, `css/tuicss.css`) | Framework CSS de terceros "TuiCss" (estética Turbo Vision / DOS). No se incluye un fichero `LICENSE` local en el proyecto que confirme sus términos. | **Pendiente de revisión** — verificar y copiar el `LICENSE` exacto del repositorio de origen a `licenses/` antes de una distribución más amplia. | Toda la hoja de estilos base y el tema visual de la aplicación (`css/tui.css`, `css/tuicss.css`). `css/custom.css` es código propio del proyecto (overrides) y sí está cubierto por la licencia MIT del proyecto. |
| Imágenes de tema TuiCss (`css/images/bg-*.png`, `css/images/scroll-*.png`) | Assets del tema visual empaquetados junto con TuiCss. | Mismo origen y estado que TuiCss — **pendiente de revisión**. | Fondos de ventana y decoración de scroll de la interfaz. |
| Fuente "Perfect DOS VGA 437" / "Perfect DOS VGA 437 Win" (`css/fonts/*.ttf`) | Zeh Fernando (fatorcaos.com.br). Información de origen incluida en `css/fonts/dos437.txt`, pero ese fichero no contiene un texto de licencia formal. | **Pendiente de revisión** — fuente distribuida históricamente como freeware por su autor; verificar los términos exactos antes de redistribución más amplia. | Tipografía monoespaciada estilo DOS usada en toda la interfaz. |

## Contenido de reglas / rulesets (`js/rules/`)

Los perfiles de ruleset (B/X, Old-School Essentials, Aventuras en la Marca
del Este, BECMI, Lamentations of the Flame Princess, OD&D/0e, AD&D 1e) son
**código propio** del proyecto: contienen únicamente identificadores, flags y
parámetros de configuración (duración de turno, dado de iniciativa, modo de
CA, etc.), no texto ni contenido copiado de los manuales originales de esos
juegos. Estos ficheros sí están cubiertos por la licencia MIT del proyecto.

Los nombres de los sistemas de juego se usan únicamente para identificar
compatibilidad de reglas; OSR Manager no reproduce ni distribuye contenido
protegido de esos manuales.

## Notas generales

- Un repositorio de GitHub privado **no** protege los archivos publicados
  mediante GitHub Pages: todo lo que se sube como artifact de Pages debe
  considerarse público. Ver la nota de visibilidad en `README.md`.
- Si en el futuro se integran datasets o compendios de terceros (por ejemplo
  contenido derivado de Old-School Essentials u otro sistema), añadir aquí
  una fila propia con origen, licencia exacta y qué parte del proyecto
  afecta, y conservar el texto de licencia correspondiente en `licenses/`.
