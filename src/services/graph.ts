import type { KnowledgeCard, LinkRecord, StepRecord } from '../domain/types';
import { linkId } from '../domain/types';
import { fold } from '../domain/text';
import { phaseOf, progressOf } from './steps';

/**
 * El Atlas: las fichas como lugares y lo que comparten como caminos.
 *
 * Todo se calcula en el dispositivo a partir de lo que el análisis ya extrajo
 * (herramientas, métodos, conceptos, libros, personas y etiquetas), sin llamar
 * a Gemini al abrir el mapa. Lo único que se guarda son tus decisiones
 * (`LinkRecord`): caminos trazados a mano, sugerencias confirmadas o descartadas.
 *
 * Cada camino lleva su explicación («Las dos usan Obsidian»). Compartir solo
 * etiquetas no basta para afirmar que dos fichas están relacionadas: esos
 * caminos llegan como sugerencia, en discontinua, para que decidas tú.
 */

export type Faceta = 'metodo' | 'herramienta' | 'concepto' | 'fuente' | 'etiqueta';

export type ConnKind = Exclude<Faceta, 'etiqueta'> | 'manual' | 'confirmada' | 'sugerida';

export const KIND_LABEL: Record<ConnKind, string> = {
  metodo: 'Mismo método',
  herramienta: 'Misma herramienta',
  concepto: 'Concepto común',
  fuente: 'Misma fuente',
  manual: 'Trazado por ti',
  confirmada: 'Confirmado por ti',
  sugerida: 'Sugerido',
};

export interface Connection {
  /** `linkId(a, b)`: el mismo que usaría un `LinkRecord` sobre este par. */
  id: string;
  a: string;
  b: string;
  kind: ConnKind;
  /** La frase que explica el camino. */
  reason: string;
  weight: number;
  /** Nombres de lo que comparten, tal como aparecen en las fichas. */
  shared: string[];
  /** Si es tuyo (manual), se puede quitar; si es automático, descartar. */
  decided: boolean;
}

/* ---------- normalización de nombres ---------- */

/**
 * Sinónimos frecuentes, ya sin tildes y en singular. Sin esto «IA», «AI» e
 * «inteligencia artificial» serían tres puntos de unión distintos.
 */
const ALIAS: Record<string, string> = {
  ai: 'ia',
  'inteligencia artificial': 'ia',
  'artificial intelligence': 'ia',
  'generative ai': 'ia generativa',
  'ai generativa': 'ia generativa',
  'inteligencia artificial generativa': 'ia generativa',
  llm: 'modelo de lenguaje',
  'large language model': 'modelo de lenguaje',
  'modelo de lenguaje grande': 'modelo de lenguaje',
  'chat gpt': 'chatgpt',
  'openai chatgpt': 'chatgpt',
  'google gemini': 'gemini',
  'obsidian md': 'obsidian',
  'notion so': 'notion',
  'spaced repetition': 'repeticion espaciada',
  'active recall': 'recuperacion activa',
  'recuerdo activo': 'recuperacion activa',
  'practica de recuperacion': 'recuperacion activa',
  'second brain': 'segundo cerebro',
  'building a second brain': 'segundo cerebro',
  pomodoro: 'tecnica pomodoro',
  'metodo pomodoro': 'tecnica pomodoro',
  'pomodoro technique': 'tecnica pomodoro',
  'feynman technique': 'tecnica feynman',
  'metodo feynman': 'tecnica feynman',
  'prompt engineering': 'ingenieria de prompt',
};

const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'the', 'a', 'an']);

/** Plural sencillo: «herramientas» → «herramienta». Respeta «análisis», «tesis», «express». */
function singular(w: string): string {
  if (w.length <= 4 || !w.endsWith('s') || w.endsWith('ss') || w.endsWith('is') || w.endsWith('us')) return w;
  return w.slice(0, -1);
}

/**
 * Clave estable de un nombre: sin tildes, sin lo que vaya tras «:» o entre
 * paréntesis (los conceptos suelen traer su definición), sin artículo inicial,
 * en singular y con los sinónimos resueltos. null si no sirve como unión.
 */
export function termKey(raw: string): string | null {
  let t = fold(raw).split(/:|\s[—–-]\s/)[0];
  t = t.replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\p{N}\s+#]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = t.split(' ').filter(Boolean);
  if (words.length > 1 && ARTICULOS.has(words[0])) words.shift();
  if (words.length === 0 || words.length > 6) return null;
  const plain = words.join(' ');
  const key = ALIAS[plain] ?? words.map(singular).join(' ');
  const out = ALIAS[key] ?? key;
  return out.length >= 2 ? out : null;
}

/** Nombre para mostrar: el original, sin la definición que a veces lo acompaña. */
function display(raw: string): string {
  return raw.split(/:|\s[—–-]\s/)[0].replace(/\(.*?\)/g, '').trim() || raw.trim();
}

const FACETAS: { faceta: Faceta; peso: number; campos: (keyof KnowledgeCard)[] }[] = [
  { faceta: 'metodo', peso: 3, campos: ['metodos', 'frameworks'] },
  { faceta: 'herramienta', peso: 2, campos: ['herramientas', 'apps'] },
  { faceta: 'concepto', peso: 2, campos: ['conceptos'] },
  { faceta: 'fuente', peso: 2, campos: ['libros', 'personas'] },
  { faceta: 'etiqueta', peso: 1, campos: ['etiquetas'] },
];

interface Term {
  key: string;
  label: string;
  faceta: Faceta;
  peso: number;
  cards: Set<string>;
}

/** Puntos de unión de la biblioteca: cada nombre normalizado y las fichas que lo mencionan. */
export function indexTerms(cards: KnowledgeCard[]): Map<string, Term> {
  const terms = new Map<string, Term>();
  for (const card of cards) {
    for (const { faceta, peso, campos } of FACETAS) {
      for (const campo of campos) {
        const values = card[campo];
        if (!Array.isArray(values)) continue;
        for (const raw of values) {
          if (typeof raw !== 'string') continue;
          const key = termKey(raw);
          if (!key) continue;
          const t = terms.get(key);
          if (!t) {
            terms.set(key, { key, label: display(raw), faceta, peso, cards: new Set([card.id]) });
            continue;
          }
          t.cards.add(card.id);
          // Si el mismo nombre sale como método y como etiqueta, manda el método.
          if (peso > t.peso) Object.assign(t, { faceta, peso });
        }
      }
    }
  }
  return terms;
}

/* ---------- el grafo ---------- */

export interface Graph {
  byId: Map<string, KnowledgeCard>;
  connections: Connection[];
  /** Caminos de cada ficha, el más fuerte primero. */
  byCard: Map<string, Connection[]>;
  /** Fichas sin ningún camino. */
  lonely: KnowledgeCard[];
  terms: Map<string, Term>;
}

/** Caminos automáticos que conserva cada ficha: más, y el mapa se vuelve una maraña. */
const MAX_POR_FICHA = 6;

/** Un nombre que aparece en muchas fichas («ia» en una biblioteca de IA) no explica nada. */
function generico(df: number, n: number): boolean {
  return df > Math.max(5, n * 0.35);
}

const quote = (s: string) => `«${s}»`;

function lista(items: string[]): string {
  const q = items.map(quote);
  return q.length <= 1 ? (q[0] ?? '') : `${q.slice(0, -1).join(', ')} y ${q[q.length - 1]}`;
}

function razon(faceta: Faceta, nombres: string[]): string {
  const top = nombres.slice(0, 2);
  switch (faceta) {
    case 'metodo':
      return top.length > 1 ? `Las dos aplican ${lista(top)}.` : `Las dos aplican el método ${lista(top)}.`;
    case 'herramienta':
      return `Las dos usan ${lista(top)}.`;
    case 'concepto':
      return top.length > 1 ? `Comparten los conceptos ${lista(top)}.` : `Comparten el concepto ${lista(top)}.`;
    case 'fuente':
      return `Las dos citan a ${lista(top)}.`;
    case 'etiqueta':
      return `Comparten las etiquetas ${lista(nombres.slice(0, 3))}. ¿Están relacionadas?`;
  }
}

export function buildGraph(cards: KnowledgeCard[], links: LinkRecord[]): Graph {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const terms = indexTerms(cards);
  const n = cards.length;

  interface Acc {
    a: string;
    b: string;
    weight: number;
    strong: { faceta: Faceta; label: string; peso: number }[];
    tags: string[];
  }
  const pairs = new Map<string, Acc>();
  for (const t of terms.values()) {
    const ids = [...t.cards];
    if (ids.length < 2 || ids.length > 24 || generico(ids.length, n)) continue;
    // Cuanto más raro es lo que comparten, más dice de las dos fichas.
    const idf = 1 / Math.log2(1 + ids.length);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const id = linkId(ids[i], ids[j]);
        const acc = pairs.get(id) ?? {
          a: ids[i] < ids[j] ? ids[i] : ids[j],
          b: ids[i] < ids[j] ? ids[j] : ids[i],
          weight: 0,
          strong: [],
          tags: [],
        };
        acc.weight += t.peso * idf;
        if (t.faceta === 'etiqueta') acc.tags.push(t.label);
        else acc.strong.push({ faceta: t.faceta, label: t.label, peso: t.peso });
        pairs.set(id, acc);
      }
    }
  }

  const auto: Connection[] = [];
  for (const [id, acc] of pairs) {
    if (acc.strong.length > 0) {
      acc.strong.sort((x, y) => y.peso - x.peso);
      const faceta = acc.strong[0].faceta;
      const mismos = acc.strong.filter((s) => s.faceta === faceta).map((s) => s.label);
      auto.push({
        id,
        a: acc.a,
        b: acc.b,
        kind: faceta as ConnKind,
        reason: razon(faceta, mismos),
        weight: acc.weight,
        shared: acc.strong.map((s) => s.label),
        decided: false,
      });
    } else if (acc.tags.length >= 2) {
      auto.push({
        id,
        a: acc.a,
        b: acc.b,
        kind: 'sugerida',
        reason: razon('etiqueta', acc.tags),
        weight: acc.weight * 0.5,
        shared: acc.tags,
        decided: false,
      });
    }
  }

  // Solo los caminos más fuertes de cada ficha: un camino sobrevive si está
  // entre los mejores de cualquiera de sus dos extremos.
  const ranking = new Map<string, Connection[]>();
  for (const c of auto) {
    for (const end of [c.a, c.b]) ranking.set(end, [...(ranking.get(end) ?? []), c]);
  }
  const keep = new Set<string>();
  for (const list of ranking.values()) {
    list.sort((x, y) => y.weight - x.weight);
    for (const c of list.slice(0, MAX_POR_FICHA)) keep.add(c.id);
  }
  const byPair = new Map(auto.filter((c) => keep.has(c.id)).map((c) => [c.id, c]));

  // Tus decisiones mandan sobre lo calculado.
  for (const l of links) {
    if (!byId.has(l.a) || !byId.has(l.b)) continue;
    if (l.estado === 'descartada') {
      byPair.delete(l.id);
      continue;
    }
    if (l.estado === 'manual') {
      byPair.set(l.id, {
        id: l.id,
        a: l.a,
        b: l.b,
        kind: 'manual',
        reason: l.nota.trim() ? `Tu nota: «${l.nota.trim()}»` : 'Trazaste este camino tú.',
        weight: 10,
        shared: [],
        decided: true,
      });
      continue;
    }
    const base = byPair.get(l.id);
    byPair.set(l.id, {
      id: l.id,
      a: l.a,
      b: l.b,
      kind: base && base.kind !== 'sugerida' ? base.kind : 'confirmada',
      reason: base ? base.reason.replace(' ¿Están relacionadas?', '') : 'Confirmaste este camino.',
      weight: Math.max(base?.weight ?? 0, 4),
      shared: base?.shared ?? [],
      decided: true,
    });
  }

  const connections = [...byPair.values()];
  const byCard = new Map<string, Connection[]>();
  for (const c of connections) {
    for (const end of [c.a, c.b]) byCard.set(end, [...(byCard.get(end) ?? []), c]);
  }
  for (const list of byCard.values()) list.sort((x, y) => orden(x) - orden(y) || y.weight - x.weight);
  const lonely = cards.filter((c) => !byCard.has(c.id));
  return { byId, connections, byCard, lonely, terms };
}

/** Tus caminos primero, luego los automáticos, y las sugerencias al final. */
function orden(c: Connection): number {
  return c.kind === 'manual' || c.kind === 'confirmada' ? 0 : c.kind === 'sugerida' ? 2 : 1;
}

export const otherEnd = (c: Connection, id: string) => (c.a === id ? c.b : c.a);

/* ---------- insights que se pueden convertir en acción ---------- */

export type AtlasInsight =
  | { tipo: 'metodo'; titulo: string; detalle: string; cardIds: string[] }
  | { tipo: 'aplicar'; titulo: string; detalle: string; cardId: string }
  | { tipo: 'parecidas'; titulo: string; detalle: string; a: string; b: string }
  | { tipo: 'reciente'; titulo: string; detalle: string; cardIds: string[] };

const DIA = 86_400_000;

export function atlasInsights(
  graph: Graph,
  cards: KnowledgeCard[],
  steps: StepRecord[],
  now = Date.now()
): AtlasInsight[] {
  const out: AtlasInsight[] = [];
  const n = cards.length;
  const titulo = (id: string) => graph.byId.get(id)?.titulo ?? '';

  // 1. Fichas que comparten un método o concepto: consultarlas juntas.
  const grupos = [...graph.terms.values()]
    .filter((t) => (t.faceta === 'metodo' || t.faceta === 'concepto') && t.cards.size >= 3 && !generico(t.cards.size, n))
    .sort((x, y) => y.cards.size - x.cards.size || y.peso - x.peso)
    .slice(0, 2);
  for (const t of grupos) {
    out.push({
      tipo: 'metodo',
      titulo: `${t.cards.size} fichas comparten ${quote(t.label)}`,
      detalle: 'Léelas juntas: entre todas cuentan más que cada una por separado.',
      cardIds: [...t.cards],
    });
  }

  // 2. Ideas relacionadas con algo que ya aplicas y todavía sin empezar.
  const vistos = new Set<string>();
  for (const c of graph.connections) {
    if (out.filter((i) => i.tipo === 'aplicar').length >= 2) break;
    for (const [hecha, otra] of [
      [c.a, c.b],
      [c.b, c.a],
    ]) {
      if (vistos.has(otra) || phaseOf(steps, hecha) === 'nueva' || phaseOf(steps, otra) !== 'nueva') continue;
      if (progressOf(steps, otra).total === 0) continue;
      vistos.add(otra);
      out.push({
        tipo: 'aplicar',
        titulo: `${quote(titulo(otra))} conecta con algo que ya aplicas`,
        detalle: `Está ligada a ${quote(titulo(hecha))} y aún no has dado su primer paso.`,
        cardId: otra,
      });
      break;
    }
  }

  // 3. Contenido muy parecido: comparar y quedarse con lo mejor de cada una.
  const claves = new Map<string, Set<string>>();
  // Las etiquetas no cuentan: compartir «memoria» y «estudio» no hace parecidas dos fichas.
  for (const t of graph.terms.values()) {
    if (t.faceta === 'etiqueta') continue;
    for (const id of t.cards) claves.set(id, (claves.get(id) ?? new Set()).add(t.key));
  }
  const parecidas: { a: string; b: string; s: number }[] = [];
  for (const c of graph.connections) {
    const ka = claves.get(c.a) ?? new Set<string>();
    const kb = claves.get(c.b) ?? new Set<string>();
    const comunes = [...ka].filter((k) => kb.has(k)).length;
    const union = new Set([...ka, ...kb]).size;
    const mismoTitulo = fold(titulo(c.a)) === fold(titulo(c.b));
    const s = mismoTitulo ? 1 : union ? comunes / union : 0;
    if (mismoTitulo || (comunes >= 3 && s >= 0.5)) parecidas.push({ a: c.a, b: c.b, s });
  }
  for (const p of parecidas.sort((x, y) => y.s - x.s).slice(0, 2)) {
    out.push({
      tipo: 'parecidas',
      titulo: `${quote(titulo(p.a))} y ${quote(titulo(p.b))} se parecen mucho`,
      detalle: 'Compáralas: quizá te baste con una, o con juntar sus notas.',
      a: p.a,
      b: p.b,
    });
  }

  // 4. Lo que estás explorando estas semanas.
  const recientes = new Set(cards.filter((c) => now - c.createdAt < 21 * DIA).map((c) => c.id));
  if (recientes.size >= 2) {
    const top = [...graph.terms.values()]
      .filter((t) => t.faceta !== 'fuente')
      .map((t) => ({ t, k: [...t.cards].filter((id) => recientes.has(id)) }))
      .filter((x) => x.k.length >= 2)
      .sort((x, y) => y.k.length - x.k.length || y.t.peso - x.t.peso)[0];
    if (top) {
      out.push({
        tipo: 'reciente',
        titulo: `Estas semanas exploras ${quote(top.t.label)}`,
        detalle: `${top.k.length} de tus fichas recientes giran en torno a eso.`,
        cardIds: top.k,
      });
    }
  }
  return out;
}

/* ---------- disposición en el mapa ---------- */

export interface Point {
  x: number;
  y: number;
}

export interface Region {
  nombre: string;
  x: number;
  y: number;
  r: number;
}

export interface Layout {
  pos: Map<string, Point>;
  regions: Region[];
}

/** Pseudoaleatorio estable a partir del id: el mapa sale igual cada vez que lo abres. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Coloca las fichas con caminos en un lienzo de `w`×`h`. Cada tema es una
 * región: sus fichas parten de un mismo centro y se atraen hacia él; los
 * caminos tiran de las fichas que unen y todas se repelen un poco para no
 * pisarse. Es determinista (sin aleatoriedad real) y se calcula una vez, sin
 * animación.
 */
export function layoutGraph(graph: Graph, w: number, h: number): Layout {
  const nodos = [...graph.byCard.keys()].map((id) => graph.byId.get(id)!).filter(Boolean);
  const pos = new Map<string, Point>();
  if (nodos.length === 0) return { pos, regions: [] };

  const tema = (c: KnowledgeCard) => c.categoria || 'Sin tema';
  const temas = [...new Set(nodos.map(tema))].sort(
    (a, b) => nodos.filter((c) => tema(c) === b).length - nodos.filter((c) => tema(c) === a).length
  );
  const centro = new Map<string, Point>();
  temas.forEach((t, i) => {
    const ang = (i / temas.length) * Math.PI * 2 - Math.PI / 2;
    const r = temas.length === 1 ? 0 : 0.3;
    centro.set(t, { x: 0.5 + Math.cos(ang) * r * (w / Math.max(w, h)), y: 0.5 + Math.sin(ang) * r * (h / Math.max(w, h)) });
  });

  const p = nodos.map((c) => {
    const cc = centro.get(tema(c))!;
    return { id: c.id, t: tema(c), x: cc.x + (hash(c.id) - 0.5) * 0.2, y: cc.y + (hash(c.id + '·') - 0.5) * 0.2, dx: 0, dy: 0 };
  });
  const idx = new Map(p.map((n, i) => [n.id, i]));
  const k = Math.sqrt(1 / p.length) * 0.75;
  const iters = p.length > 200 ? 120 : 220;
  let temp = 0.08;

  for (let it = 0; it < iters; it++) {
    for (const n of p) {
      n.dx = 0;
      n.dy = 0;
    }
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const dx = p[i].x - p[j].x;
        const dy = p[i].y - p[j].y;
        const d2 = Math.max(dx * dx + dy * dy, 1e-5);
        const f = (k * k) / d2;
        p[i].dx += dx * f;
        p[i].dy += dy * f;
        p[j].dx -= dx * f;
        p[j].dy -= dy * f;
      }
    }
    for (const c of graph.connections) {
      const a = p[idx.get(c.a)!];
      const b = p[idx.get(c.b)!];
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
      const f = (d / k) * (c.kind === 'sugerida' ? 0.4 : 1);
      a.dx -= dx * f;
      a.dy -= dy * f;
      b.dx += dx * f;
      b.dy += dy * f;
    }
    for (const n of p) {
      const cc = centro.get(n.t)!;
      n.dx += (cc.x - n.x) * 0.9;
      n.dy += (cc.y - n.y) * 0.9;
      const len = Math.sqrt(n.dx * n.dx + n.dy * n.dy) || 1;
      n.x += (n.dx / len) * Math.min(len, temp);
      n.y += (n.dy / len) * Math.min(len, temp);
    }
    temp *= 0.975;
  }

  // Encajar en el lienzo con margen para las etiquetas.
  const xs = p.map((n) => n.x);
  const ys = p.map((n) => n.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const mx = 70;
  const my = 50;
  const sx = (w - 2 * mx) / Math.max(maxX - minX, 1e-3);
  const sy = (h - 2 * my) / Math.max(maxY - minY, 1e-3);
  const s = Math.min(sx, sy);
  const ox = (w - (maxX - minX) * s) / 2;
  const oy = (h - (maxY - minY) * s) / 2;
  for (const n of p) pos.set(n.id, { x: ox + (n.x - minX) * s, y: oy + (n.y - minY) * s });

  const regions: Region[] = temas.map((t) => {
    const pts = p.filter((n) => n.t === t).map((n) => pos.get(n.id)!);
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    // Radio por la distancia media, no la máxima: una ficha alejada no debe inflar toda la región.
    const media = pts.reduce((a, q) => a + Math.hypot(q.x - cx, q.y - cy), 0) / pts.length;
    const r = Math.max(50, media * 1.3 + 34);
    return { nombre: t, x: cx, y: cy, r };
  });
  return { pos, regions };
}

/** Vista de entorno: la ficha en el centro y sus caminos alrededor, siempre legible en el móvil. */
export function layoutLocal(graph: Graph, id: string, w: number, h: number): Layout {
  const pos = new Map<string, Point>([[id, { x: w / 2, y: h / 2 }]]);
  const vecinos = (graph.byCard.get(id) ?? []).map((c) => otherEnd(c, id));
  // Elipse alta y estrecha, girada un cuarto de paso: ninguna vecina cae en la
  // horizontal de la ficha central ni a la misma altura que otra (sus
  // etiquetas chocarían), y en el móvil los nombres no se salen por los lados.
  const rx = w * 0.26;
  const ry = h * 0.36;
  const paso = (Math.PI * 2) / Math.max(vecinos.length, 1);
  vecinos.forEach((v, i) => {
    const ang = -Math.PI / 2 + paso / 4 + i * paso;
    pos.set(v, { x: w / 2 + Math.cos(ang) * rx, y: h / 2 + Math.sin(ang) * ry });
  });
  return { pos, regions: [] };
}
