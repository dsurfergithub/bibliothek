# Prueba móvil sin PC

La app conserva su alojamiento estático en Vercel. Un servicio HTTPS ejecuta
`yt-dlp` y entrega el vídeo y el caption al móvil. El navegador llama a Gemini
con la clave del usuario y guarda la ficha en su IndexedDB habitual.

## Estado comprobado

- Reel facilitado: `https://www.instagram.com/reel/DfuvaVmBawJ/`.
- Descarga real desde el entorno remoto: HTTP 200; **7.986.544 bytes**, MP4,
  autor Fabian Herrera, con su descripción. No se han usado cookies ni login.
- Instagram no publica su duración: se permite duración desconocida; se rechazan
  duraciones conocidas superiores a cinco minutos. Límite de tamaño: 50 MiB.
- Chromium en vista móvil 390 × 844: configuración del servicio, análisis con
  vídeo y caption reales, guardado de ficha y ausencia de errores JavaScript
  o desbordamiento horizontal. **La respuesta de Gemini se simuló** para probar
  el cableado: no hay una API key del usuario en el entorno. La ficha de esa
  comprobación está marcada como simulada y no es un análisis del reel.
- `npm run build` y `npm test` verifican compilación, autenticación, CORS,
  validación de URLs, entrega de vídeo, caché, errores y reintentos.
- Contenedor construido con Node 24 y yt-dlp 2026.10.26. En este entorno fue
  necesario montar temporalmente su CA de proxy durante la instalación;
  el certificado no se añade al Dockerfile ni a la imagen.

Esto verifica una descarga desde este entorno, no garantiza que Instagram
admita todos los reels o todas las IP de alojamiento.

## Publicar el extractor (se puede hacer desde el móvil)

[Crear el servicio en Render](https://render.com/deploy?repo=https://github.com/dsurfergithub/bibliothek/tree/codex/mobile-reel-proof)

1. Abre el enlace y revisa el Blueprint de esta rama. Crea **un servicio nuevo**
   llamado `bibliotheke-extractor`; si ya existe uno con ese nombre, cambia el
   nombre antes de continuar. El fichero selecciona el plan `free`; comprueba
   su disponibilidad en tu cuenta antes de crear el servicio.
2. En `ALLOWED_ORIGINS`, escribe el origen exacto de la **preview de Vercel de
   esta rama**, por ejemplo `https://tu-preview.vercel.app`. Sin ruta ni barra
   final. Puedes añadir otros orígenes separados por comas, sin comodines.
3. Render genera `EXTRACTOR_TOKEN`. Cuando termine el despliegue, copia la URL
   HTTPS del servicio y ese token desde Environment. Es la clave del extractor,
   **no** la API key de Gemini. No publiques el token en GitHub ni lo envíes en
   un enlace.
4. Abre la preview de Vercel en el móvil. En **Ajustes → Reels sin PC · prueba**,
   pega URL y token; toca **Guardar y comprobar**. El plan de prueba puede tardar
   en arrancar: el chequeo espera hasta un minuto y se puede repetir.
5. Configura tu API key de Gemini en ese mismo navegador/PWA. Pega el reel en
   **Añadir → Instagram → Analizar ahora**. Mantén la app abierta hasta que
   aparezca la ficha. También puedes procesar la cola ya capturada en el móvil.

La preview tiene un origen distinto de producción: su biblioteca y claves
empiezan vacías. Para probar con fichas existentes, importa una copia desde
Ajustes. No cambies de Safari a la PWA a mitad de la prueba: pueden tener
almacenamientos separados. La app de producción no cambia al abrir esta rama.

El Blueprint desactiva autodespliegues: para actualizar este servicio de prueba,
lanza un despliegue manual del commit elegido desde Render. La documentación de
[Deploy to Render](https://render.com/docs/deploy-to-render) describe la creación
del servicio y la selección de rama.

## Qué comprobar en el móvil real

- El reel de arriba genera una ficha del contenido real y conserva su URL.
- Incluye las referencias del vídeo y del caption; no basta con inferir a partir
  de la descripción. Revisa, por ejemplo, si recoge los cursos mencionados.
- Cerrar y abrir la app **después de terminar** conserva la ficha.
- Un reel privado, eliminado o bloqueado muestra un error y permite subir el
  archivo desde Vídeo. Un fallo de un elemento de la cola no elimina ese elemento.
- Una clave de servicio incorrecta no habilita análisis por URL.

## Límites deliberados de esta prueba

Se necesitan internet y Gemini: no es inferencia local. No procesa en segundo
plano ni reanuda un análisis interrumpido al cerrar la app. No importa cookies
ni intenta acceder a contenido privado. Instagram puede bloquear IPs remotas;
la subida de un archivo de la galería sigue disponible.

El servicio exige token para salud autenticada, metadatos y vídeo, permite solo
los orígenes configurados, reconstruye URLs de Instagram, limita a dos descargas
simultáneas y guarda hasta veinte vídeos en caché. Los archivos caducan a los
quince minutos y se limpian cada minuto. `/ready` solo indica que el proceso
HTTP está vivo, para el health check del alojamiento.

## Desarrollo

Cliente (Node 24):

```sh
npm ci
npm test
npm run build
npm run dev
```

Servicio sin Docker: instala la versión de yt-dlp del Dockerfile y configura
`EXTRACTOR_TOKEN` (mínimo 24 caracteres), `ALLOWED_ORIGINS` y opcionalmente `PORT`
o `YTDLP_BIN`; ejecuta `node companion/remote.mjs`. El compañero local original
`node companion/server.mjs` sigue disponible si desconectas el remoto en Ajustes.

Contenedor:

```sh
docker build -f companion/Dockerfile -t bibliotheke-extractor companion
```

Para alojarlo, inyecta las variables anteriores como secretos del proveedor y
publica el puerto mediante HTTPS. La biblioteca y la clave de Gemini no se
montan en el contenedor.
