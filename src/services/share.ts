/**
 * Compartir o copiar un enlace SIN perder el gesto del usuario.
 *
 * iOS Safari solo permite `navigator.share` y escribir en el portapapeles
 * dentro del toque que los dispara: en cuanto hay un `await` por medio (leer
 * la BD, comprimir) el gesto caduca y ambos fallan en silencio. Por eso los
 * componentes preparan el enlace ANTES del toque y aquí no se espera nada
 * antes de llamar a la API.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'manual';

/** Diálogo nativo de compartir; si no existe o falla, al portapapeles. */
export async function shareOrCopyLink(title: string, link: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url: link });
      return 'shared';
    } catch (err) {
      // El usuario cerró el diálogo: no hay nada más que hacer.
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
      // Cualquier otro fallo (gesto caducado, escritorio sin diálogo): copiar.
    }
  }
  return copyLink(link);
}

/** `manual` = sin permiso de portapapeles: hay que enseñar el enlace para copiarlo a mano. */
export async function copyLink(link: string): Promise<'copied' | 'manual'> {
  try {
    await navigator.clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'manual';
  }
}
