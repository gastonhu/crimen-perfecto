// Tipos del motor de Crimen Perfecto. Sin dependencias de React: lo usan la UI, los tests y los scripts.

/** Código de objeto en cada casilla del plano. '.' = piso libre. */
export type ObjectCode = '.' | 'T' | 'S' | 'P' | 'V' | 'K' | 'M' | 'C' | 'B' | 'R';

export interface ObjectInfo {
  name: string;
  /** Con artículo indefinido, para generar pistas: "una silla". */
  indef: string;
  /** Plural sin artículo: "sillas". */
  plural: string;
  icon: string;
  /** Si bloquea la casilla: nadie puede estar parado ahí. */
  blocking: boolean;
}

export const OBJECTS: Record<Exclude<ObjectCode, '.'>, ObjectInfo> = {
  T: { name: 'mesa', indef: 'una mesa', plural: 'mesas', icon: '🟫', blocking: true },
  S: { name: 'estante', indef: 'un estante', plural: 'estantes', icon: '📚', blocking: true },
  P: { name: 'planta', indef: 'una planta', plural: 'plantas', icon: '🪴', blocking: true },
  V: { name: 'televisor', indef: 'un televisor', plural: 'televisores', icon: '📺', blocking: true },
  K: { name: 'rack de servidores', indef: 'un rack de servidores', plural: 'racks de servidores', icon: '🗄️', blocking: true },
  M: { name: 'equipaje', indef: 'el equipaje', plural: 'equipajes', icon: '🧳', blocking: true },
  C: { name: 'silla', indef: 'una silla', plural: 'sillas', icon: '🪑', blocking: false },
  B: { name: 'cama', indef: 'una cama', plural: 'camas', icon: '🛏️', blocking: false },
  R: { name: 'alfombra', indef: 'una alfombra', plural: 'alfombras', icon: '🟥', blocking: false },
};

export type Role = 'victim' | 'suspect';

/**
 * Reglas verificables de una pista. Filas y columnas son 1-based en el JSON (más naturales para autores).
 * Las direcciones son estrictas: northOf = en una fila más arriba (no necesariamente la misma columna).
 */
export type Rule =
  | ['inRoom', string]
  | ['notInRoom', string]
  | ['onObject', ObjectCode]
  | ['notOnObject', ObjectCode]
  | ['adjacentTo', ObjectCode]
  | ['notAdjacentTo', ObjectCode]
  | ['onEdge']
  | ['notOnEdge']
  | ['row', number]
  | ['col', number]
  | ['sameRoomAs', string]
  | ['notSameRoomAs', string]
  | ['northOf', string]
  | ['southOf', string]
  | ['eastOf', string]
  | ['westOf', string]
  | ['touching', string]
  | ['notTouching', string]
  | ['byWindow']
  | ['notByWindow']
  | ['byDoor']
  | ['notByDoor']
  | ['alone']
  | ['withExactly', number];

/** Hechos generales del caso (no son de una persona). */
export type Fact =
  /** En la habitación había exactamente N personas (0 = vacía). */
  | ['roomCount', string, number]
  /** Exactamente N personas estaban sobre ese tipo de mueble. */
  | ['objectCount', ObjectCode, number];

export interface FactClue {
  text?: string;
  fact: Fact;
}

/**
 * Cómo se identifica al asesino.
 * - aloneWithVictim: el único sospechoso en la habitación de la víctima (regla clásica).
 * - touchingVictim: la única persona pegada en diagonal a la víctima.
 */
export type CrimeRule = 'aloneWithVictim' | 'touchingVictim';

/** Lado de una casilla donde hay una ventana o puerta: N, S, E u O (oeste). */
export type Side = 'N' | 'S' | 'E' | 'O';

export interface Clue {
  /** Texto para el jugador. Si falta, se genera desde `rules`. */
  text?: string;
  rules: Rule[];
}

export interface Person {
  id: string;
  name: string;
  role: Role;
  avatar: string;
  /** Para concordar los textos ("sola", "sentado"). Sin dato se usan formas neutras. */
  gender?: 'f' | 'm';
  clue: Clue;
}

export interface Puzzle {
  id: string;
  theme: string;
  title: string;
  size: number;
  difficulty: number;
  story: string;
  /** Texto de cierre. `{killer}` se reemplaza con el nombre del culpable. */
  epilogue?: string;
  rooms: string[];
  roomNames: Record<string, string>;
  objects: string[];
  /** Ventanas en paredes exteriores, como "B1N" (casilla B1, lado norte). */
  windows?: string[];
  /** Puertas entre habitaciones, como "C3E" (casilla C3, lado este). */
  doors?: string[];
  people: Person[];
  facts?: FactClue[];
  /** Por defecto: aloneWithVictim. */
  crime?: CrimeRule;
  /** Versión del formato del archivo. */
  schemaVersion?: number;
}

export interface Cell {
  r: number;
  c: number;
}

/** Ubicación de cada persona (índices 0-based). */
export type Placement = Record<string, Cell>;
