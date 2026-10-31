/** Minúsculas y sin tildes ni diéresis: «metodo» encuentra «Método». */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
