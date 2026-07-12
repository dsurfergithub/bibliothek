# Bibliotheke Companion

Servidor local que descarga Reels de Instagram para que Bibliotheke (la app
web) pueda analizarlos. La app es 100% cliente y el navegador no puede
descargar de Instagram; este proceso corre en tu máquina y hace de puente
usando [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Requisitos

- Node 18 o superior.
- yt-dlp: `pip install yt-dlp` (o `winget install yt-dlp`).

## Uso

Doble clic en `start.cmd` (Windows) o `node server.mjs`. Deja la ventana
abierta mientras importas reels en Bibliotheke; la app detecta sola que el
compañero está en marcha.

## Reels que piden login

La mayoría de reels públicos se descargan sin más. Si Instagram pide login
para alguno, exporta las cookies de tu sesión con una extensión tipo
"Get cookies.txt LOCALLY" y guarda el archivo como `cookies.txt` en esta
carpeta. Se usará automáticamente. **No subas ese archivo a ningún sitio:
son las llaves de tu cuenta** (está en `.gitignore`).

## Notas

- Las descargas se cachean 48 h en `downloads/` (también gitignoreado):
  repetir una URL no vuelve a descargar.
- Si yt-dlp deja de funcionar porque Instagram cambió algo:
  `pip install -U yt-dlp`.
- Úsalo con tus propios reels guardados y a ritmo humano; descargar en masa
  puede hacer que Instagram limite tu IP o tu cuenta.
