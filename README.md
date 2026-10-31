# 📚 Bibliotheke

> **«No guardes contenido. Guarda conocimiento.»**

Bibliotheke convierte Reels, vídeos de YouTube y textos en **fichas de conocimiento estructurado** usando Gemini. En lugar de acumular cientos de vídeos guardados que nunca vuelves a ver, construyes una biblioteca buscable de aprendizajes, herramientas, prompts y acciones concretas.

Y, sobre todo, **te ayuda a aplicarlas**: cada ficha trae de uno a cinco micropasos y la app lleva la cuenta de cuáles has dado. El **Atlas** te enseña además qué conecta con qué: herramientas, métodos y conceptos que comparten tus fichas.

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
        │
        ▼
   El Dado 🎲 → un micropaso cada vez → Insights: qué guardas vs. qué aplicas
```

- **Vídeo de YouTube**: pega la URL y ya está — Gemini procesa vídeos de YouTube de forma nativa, sin descargar nada.
- **Reel de Instagram**: pega la URL —o varias de golpe, una por línea— con el *companion* local abierto (servidor Node con yt-dlp en `companion/`), o sube el vídeo a mano. En el móvil, compartir un reel a la app lo deja en una cola que se procesa luego en el PC.
- **Vídeo propio**: sube o arrastra el archivo.
- **Texto**: pega artículos, hilos, newsletters o transcripciones.

## De guardar a aplicar

Guardar conocimiento es fácil; aplicarlo es lo difícil. Por eso el análisis produce **de 1 a 5 micropasos** por ficha —tantos como el contenido dé de sí; una ficha de consulta puede quedarse en uno—, ordenados de fácil a difícil y ejecutables en menos de 30 minutos, y la app cierra el bucle:

- **🎲 Práctica** — el Dado te sirve **un** micropaso a pantalla completa y te dice **por qué te toca ese**: la elección es aleatoria pero ponderada por la utilidad de la ficha, los días que lleva guardada sin estrenar, lo poco que aplicas esa categoría, la facilidad del paso y las veces que ya te lo ofreció. Cuatro respuestas: hecho, otro, ahora no (lo aparta dos días) o no aplica (lo retira).
- **Aplicar esto** — los pasos, marcables, arriba del todo en cada ficha, con barra de progreso. Al exportar a Markdown viajan con su estado real (`- [x]`).
- **📊 Insights, en dos mitades** — *Guardado* (categorías, fuentes, fiabilidad: la radiografía de lo que consumes) y ***Aplicado*** (tasa de aplicación por categoría, el hueco entre lo que ocupa cada tema en tu biblioteca y lo que de verdad usas de él, racha, latencia hasta el primer paso, fichas zombi y las fichas que más te han servido). La lectura crítica es por reglas locales y propone siempre un siguiente paso concreto, sin juzgar: la app no conoce tu contexto.

## El Atlas: qué conecta con qué

La pestaña **Atlas** dibuja tu biblioteca como un mapa: cada tema es una región, cada ficha un punto y lo que comparten, un camino.

- **Caminos con explicación.** Dos fichas se unen porque usan la misma herramienta, aplican el mismo método, comparten un concepto o citan a la misma persona o libro, y cada camino lo dice: «Las dos usan «Obsidian»».
- **Sugerencias por revisar.** Compartir solo etiquetas no basta para afirmar que dos fichas están relacionadas: esos caminos salen en discontinua y tú decides si los confirmas o los descartas.
- **Caminos tuyos.** «Trazar camino» enlaza dos fichas a mano con una frase que explique por qué.
- **Solo su entorno.** En el móvil, la ficha elegida en el centro y sus caminos alrededor, siempre legible.
- **Qué puedes hacer con esto.** Fichas que comparten un método (para leerlas juntas), ideas ligadas a algo que ya aplicas y aún sin empezar, fichas muy parecidas para comparar, y el tema que más exploras estas semanas.
- **Temas** sigue ahí, como tercera vista del Atlas, con su mazo para repasar.

Todo se calcula en el dispositivo con lo que el análisis ya extrajo: abrir el mapa no llama a Gemini. Antes de unir, los nombres se normalizan («IA», «AI» e «inteligencia artificial» son el mismo punto; plurales, tildes y definiciones entre paréntesis no cuentan). Tus decisiones —caminos trazados, confirmados o descartados— viajan con el enlace y la copia de seguridad.

## Privacidad por diseño

- **Tu API key, tu cuota**: la app pide tu clave de Gemini al iniciarse ([consíguela gratis aquí](https://aistudio.google.com/apikey)). Se guarda solo en tu dispositivo y solo viaja a la API de Google. No hay backend, no hay cuentas, no hay claves embebidas.
- **Sin clave también se entra**: para consultar la biblioteca, usar el Atlas o restaurar una copia no hace falta API key; solo se pide al analizar algo nuevo.
- **Tus datos, tu dispositivo**: la biblioteca vive en IndexedDB local. Ningún dato sale de tu dispositivo salvo que tú lo lleves con un enlace o una copia de seguridad.

## Pasar tus fichas entre móvil y PC

El flujo típico: capturas reels en el móvil, los procesas en el PC (donde vive el companion) y llevas las fichas extraídas de vuelta al móvil. Dos formas, ambas en **Ajustes**, **100% locales y aditivas** (funden sin borrar nada de lo que ya haya):

1. **Enlace** — genera un enlace que lleva dentro toda tu biblioteca **y la cola de reels** (comprimida, sin la API key, en el fragmento `#…` que nunca sale del dispositivo). Ábrelo en el otro dispositivo y se cargan ahí. Ideal para el traspaso rápido PC↔móvil sin tocar archivos.
2. **Copia de seguridad (archivo `.json`)** — descarga un archivo con **fichas + cola** y guárdalo como respaldo (recomendado sobre todo en el móvil, donde el navegador puede vaciar el almacenamiento tras días sin abrir la app). «Cargar copia» la restaura fundiéndola con lo que tengas.

Antes de importar verás **qué trae** (fichas nuevas o actualizadas, micropasos con avances, caminos, borrados, reels) y solo se escribe si confirmas. Todo se valida antes de guardarse: una copia incompleta o de una versión antigua se completa con valores neutros en vez de romper la biblioteca, y lo que no se puede rescatar se descarta y se cuenta. Un enlace que solo trae avances en micropasos también se acepta.

Al fundir, si una ficha ya existe se conserva la **versión más reciente** (por fecha de edición); la cola se deduplica por reel.

**Papelera y borrados.** Eliminar una ficha la lleva a la papelera (Ajustes), desde donde se puede restaurar. El borrado viaja en el enlace y en la copia: el otro dispositivo también la manda a la papelera, y cargar una copia antigua **no la resucita**. Si la restauras, vuelve en los dos sitios. Además, **los reels que ya se han convertido en ficha desaparecen solos de la cola**: si el PC procesó un reel y la ficha te llega al móvil, deja de esperar allí.

A partir del segundo envío el enlace lleva **solo lo que ha cambiado desde el anterior**, así que se mantiene corto por grande que se haga tu biblioteca; «Copiar todo» sigue ahí para un dispositivo nuevo o si un envío se perdió. Y al terminar de procesar un lote en el PC, la propia pantalla ofrece **«Devolver N fichas al móvil»** con ese enlace ya hecho.

### En iPhone

Safari en iOS todavía no permite que una web instalada aparezca en el menú Compartir de Instagram, así que el `share_target` del manifest solo funciona en Android. En el iPhone:

1. En el reel, toca Compartir → **Copiar enlace**.
2. En Bibliotheke, **Añadir → Instagram → «Pegar enlace copiado»** y «Guardar en la cola».

Para hacerlo en un toque, crea un **Atajo de iOS** que reciba URLs desde la hoja de compartir y abra `https://<tu-dominio>/?share_url=` seguido de la URL (con la acción «Codificar URL»). La app recoge el reel y lo deja en la cola. Ojo: el Atajo abre Safari, y en iOS la app añadida a la pantalla de inicio guarda sus datos aparte de Safari; si usas la app instalada, el atajo más fiable es «Copiar al portapapeles» seguido de abrir la app y pulsar «Pegar enlace copiado».

Antes de analizar, la app avisa si ya tienes una ficha de esa misma fuente, y al procesar la cola se salta los reels que ya son ficha.

### Solo los reels: enlace corto

Para el caso habitual —capturar reels en el móvil y procesarlos en el PC— no hace falta nada de lo anterior. En **Añadir → Instagram**, «Enviar al PC» genera un enlace que lleva **únicamente la cola**: los shortcodes de los reels, once caracteres cada uno. Doce reels caben en 172 caracteres, y cien en poco más de mil, así que nunca se pasa del límite de las apps de mensajería por muchos que acumules. Ábrelo en el PC (aunque la app ya esté abierta) y los reels entran en la cola solos.

## Desarrollo

```bash
npm install
npm run dev      # desarrollo en http://localhost:5177
npm run build    # comprobación de tipos + build de producción en dist/
npm run preview  # servir el build
```

Stack: **React 19 + TypeScript + Vite**, `@google/genai` (SDK oficial de Gemini), `idb` (IndexedDB) y PWA instalable (manifest + service worker). Sin más dependencias.

Despliegue: es un sitio 100% estático — sirve `dist/` en Vercel, Netlify, GitHub Pages o cualquier hosting. Sin backend.

## Arquitectura

Separación **fuentes → procesador → destinos** pensada para crecer sin tocar el núcleo:

```
src/
├── domain/
│   ├── types.ts      # KnowledgeCard: el modelo de ficha (+ caminos y borrados)
│   ├── normalize.ts  # Validación y adaptación de todo lo que entra de fuera
│   ├── schema.ts     # responseSchema → Gemini SIEMPRE devuelve JSON válido
│   └── prompt.ts     # El prompt maestro del analista
├── services/
│   ├── analyzer.ts   # Conectores de fuente (video | youtube | instagram | texto) → Gemini
│   ├── db.ts         # Repositorio IndexedDB (fichas, micropasos, papelera, caminos)
│   ├── transfer.ts   # Importación en dos tiempos: previsualizar y fundir
│   ├── sync.ts       # Enlace entre dispositivos (incremental, en partes si no cabe)
│   ├── graph.ts      # El Atlas: conexiones, insights y disposición en el mapa
│   ├── steps.ts      # Capa de práctica: estado de cada micropaso y el Dado
│   ├── analytics.ts  # Estadísticas de aplicación y lectura crítica por reglas
│   ├── apiKey.ts     # Gestión y validación de la clave
│   └── exporters.ts  # Destinos: Markdown (Obsidian), JSON
└── ui/               # Onboarding · Biblioteca · Práctica · Importar · Ficha · Atlas · Insights · Ajustes
    └── icons.tsx     # Set de iconos propio (sin emoji: se ven igual en todos los sistemas)
```

Añadir una fuente nueva (podcast, PDF, URL de artículo) = un caso más en `analyzer.ts`. Añadir un destino (Notion, Google Drive) = un exportador más.

## La ficha de conocimiento

Cada análisis produce: título, resumen corto y detallado, idea principal, aprendizajes, consejos, acciones, checklist, herramientas, apps, webs, libros, personas, empresas, prompts literales, frameworks, métodos, conceptos, errores comunes, texto en pantalla, categoría, etiquetas, nivel e idioma — más una **evaluación crítica honesta**: utilidad, accionabilidad, originalidad y claridad (1–10), fiabilidad estimada, afirmaciones que conviene verificar, si merece guardarse y cuántos minutos ahorra la ficha frente a ver el vídeo.

## Hoja de ruta

- **Fase 1** ✅ — API key por usuario, análisis de vídeo/YouTube/texto, biblioteca buscable con filtros, edición, exportación Markdown/JSON, PWA instalable.
- **Fase 2** ✅ — Reels de Instagram con companion local, cola móvil→PC vía Web Share Target, traspaso entre dispositivos por enlace y copia de seguridad.
- **Fase 3 (actual)** ✅ — Capa de práctica: micropasos con estado, el Dado, checklist marcable e Insights partido en Guardado / Aplicado.
- **Fase 4 (actual)** ✅ — Atlas de conexiones con caminos explicados, sugerencias por revisar y caminos propios; importación validada con previsualización; papelera y borrados sincronizados; búsqueda en todos los campos y sin tildes; de 1 a 5 micropasos.
- **Siguiente** — Síntesis de varias fichas, notas propias enlazables con `[[enlaces]]`, colecciones por proyecto, práctica por tiempo disponible (5/15/30 min) y repaso con recuerdo activo.
- **Más adelante** — PDFs e imágenes como fuente; trazabilidad de afirmaciones con fragmento y marca de tiempo; búsqueda semántica con embeddings (RAG local); destinos: Notion, Obsidian vault, Google Drive.
