# screenshots/

Capturas reales de OSR Manager para la sección "En partida" de la landing
(`site/index.html`). Todavía no hay capturas — el HTML actual muestra un
marcador de posición (`.screenshot-placeholder`) en su lugar, dejando
comentado justo encima el `<img>` a activar.

Añadir aquí, con estos nombres exactos:

```text
screenshots/mazmorra.png
screenshots/exterior.png
screenshots/combate.png
```

Recomendaciones (no obligatorias):

- Formato PNG, recorte ajustado a la ventana de la app (sin fondo de
  escritorio alrededor).
- Un ancho de referencia ~1200px es suficiente; no hace falta más para una
  imagen que ocupa media columna.
- Comprimir antes de subir si hay tooling disponible (no instalar nada
  nuevo solo para esto — cualquier compresor ya instalado vale).

Al añadir cada imagen, en `site/index.html`:

1. Localizar el comentario `<!-- Sustituir por: ... -->` de esa sección.
2. Sustituir el `<div class="screenshot-placeholder">` por el `<img>` ya
   comentado justo encima (mismo `alt`, con `loading="lazy"` ya incluido).

El workflow de GitHub Pages (`.github/workflows/pages.yml`) ya copia esta
carpeta al sitio publicado si existe — no hace falta tocarlo al añadir las
imágenes.
