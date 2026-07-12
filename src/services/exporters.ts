import { LIST_SECTIONS, type KnowledgeCard } from '../domain/types';

/** Exporta una ficha a Markdown (compatible con Obsidian: frontmatter YAML). */
export function cardToMarkdown(card: KnowledgeCard): string {
  const e = card.evaluacion;
  const stars = '★'.repeat(Math.round(e.utilidad / 2)) + '☆'.repeat(5 - Math.round(e.utilidad / 2));
  const lines: string[] = [
    '---',
    `titulo: "${card.titulo.replaceAll('"', "'")}"`,
    `fecha: ${new Date(card.createdAt).toISOString().slice(0, 10)}`,
    `fuente: ${card.fuente.tipo} — ${card.fuente.referencia}`,
    `categoria: ${card.categoria}`,
    `nivel: ${card.nivel}`,
    `etiquetas: [${card.etiquetas.join(', ')}]`,
    `utilidad: ${e.utilidad}/10`,
    '---',
    '',
    `# ${card.titulo}`,
    '',
    `> **Idea principal:** ${card.ideaPrincipal}`,
    '',
    `${stars} · Utilidad ${e.utilidad}/10 · Accionable ${e.accionable}/10 · Originalidad ${e.originalidad}/10 · Fiabilidad ${e.fiabilidad}`,
    '',
    '## Resumen',
    '',
    card.resumenCorto,
    '',
    card.resumenDetallado,
    '',
  ];

  if (card.analisisCritico?.trim()) {
    lines.push('## Análisis crítico', '', card.analisisCritico, '');
  }

  for (const { key, label } of LIST_SECTIONS) {
    const items = card[key] as string[];
    if (items.length === 0) continue;
    lines.push(`## ${label}`, '');
    const bullet = key === 'checklist' ? '- [ ]' : '-';
    for (const item of items) lines.push(`${bullet} ${item}`);
    lines.push('');
  }

  if (e.necesitaVerificacion && e.afirmacionesDudosas.length > 0) {
    lines.push('## ⚠️ Afirmaciones a verificar', '');
    for (const claim of e.afirmacionesDudosas) lines.push(`- ${claim}`);
    lines.push('');
  }

  if (card.notas.trim()) {
    lines.push('## Mis notas', '', card.notas, '');
  }

  lines.push('---', '', `*Ficha generada por Bibliotheke · ahorra ~${e.tiempoAhorradoMin} min*`);
  return lines.join('\n');
}

export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}
