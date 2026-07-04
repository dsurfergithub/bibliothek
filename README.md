# 📚 Bibliotheke

> **«No guardes contenido. Guarda conocimiento.»**

Bibliotheke convierte Reels, vídeos de YouTube y textos en **fichas de conocimiento estructurado** usando Gemini. En lugar de acumular cientos de vídeos guardados que nunca vuelves a ver, construyes una biblioteca buscable de aprendizajes, herramientas, prompts y acciones concretas.

## Cómo funciona

```
Reel / YouTube / Texto
        │
        ▼
   Gemini (multimodal: audio + texto en pantalla + imagen)
        │
        ▼
Ficha estructurada: resumen · aprendizajes · herramientas · webs ·
libros · prompts · acciones · evaluación crítica · etiquetas
        │
        ▼
Biblioteca local buscable → exporta a Markdown (Obsidian) o JSON
```

- **Vídeo de YouTube**: pega la URL y ya está — Gemini procesa vídeos de YouTube de forma nativa, sin descargar nada.
- **Reel / TikTok / vídeo propio**: sube o comparte el archivo de vídeo. (Instagram no ofrece API de descarga; los scrapers son frágiles y violan sus ToS, así que el MVP no depende de ellos.)
- **Texto**: pega artículos, hilos, newsletters o transcripciones.

## Privacidad por diseño

- **Tu API key, tu cuota**: la app pide tu clave de Gemini al iniciarse ([consíguela gratis aquí](https://aistudio.google.com/apikey)). Se guarda solo en tu dispositivo y solo viaja a la API de Google. No hay backend, no hay cuentas, no hay claves embebidas.
- **Tus datos, tu dispositivo**: la biblioteca vive en IndexedDB local. Exporta/importa un JSON cuando quieras.

## Desarrollo

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # comprobación de tipos + build de producción en dist/
npm run preview  # servir el build
```

Stack: **React 19 + TypeScript + Vite**, `@google/genai` (SDK oficial de Gemini), `idb` (IndexedDB) y PWA instalable (manifest + service worker). Sin más dependencias.

Despliegue: es un sitio 100% estático — sirve `dist/` en Vercel, Netlify, GitHub Pages o cualquier hosting.

## Arquitectura

Separación **fuentes → procesador → destinos** pensada para crecer sin tocar el núcleo:

```
src/
├── domain/
│   ├── types.ts      # KnowledgeCard: el modelo de ficha
│   ├── schema.ts     # responseSchema → Gemini SIEMPRE devuelve JSON válido
│   └── prompt.ts     # El prompt maestro del analista
├── services/
│   ├── analyzer.ts   # Conectores de fuente (video | youtube | texto) → Gemini
│   ├── db.ts         # Repositorio IndexedDB
│   ├── apiKey.ts     # Gestión y validación de la clave
│   └── exporters.ts  # Destinos: Markdown (Obsidian), JSON
└── ui/               # Onboarding · Biblioteca · Importar · Ficha · Ajustes
```

Añadir una fuente nueva (podcast, PDF, URL de artículo) = un caso más en `analyzer.ts`. Añadir un destino (Notion, Google Drive) = un exportador más.

## La ficha de conocimiento

Cada análisis produce: título, resumen corto y detallado, idea principal, aprendizajes, consejos, acciones, checklist, herramientas, apps, webs, libros, personas, empresas, prompts literales, frameworks, métodos, conceptos, errores comunes, texto en pantalla, categoría, etiquetas, nivel e idioma — más una **evaluación crítica honesta**: utilidad, accionabilidad, originalidad y claridad (1–10), fiabilidad estimada, afirmaciones que conviene verificar, si merece guardarse y cuántos minutos ahorra la ficha frente a ver el vídeo.

## Hoja de ruta

- **Fase 1 (este MVP)** ✅ — API key por usuario, análisis de vídeo/YouTube/texto, biblioteca buscable con filtros, edición, exportación Markdown/JSON, PWA instalable.
- **Fase 2** — Compartir directo desde Instagram/la galería vía Web Share Target; PDFs e imágenes como fuente; extractor de URL enchufable (endpoint propio con yt-dlp para quien quiera montarlo).
- **Fase 3** — Búsqueda semántica con embeddings (RAG local); colecciones y relaciones entre fichas.
- **Fase 4** — Destinos: Notion, Obsidian vault, Google Drive; sincronización opcional entre dispositivos.
