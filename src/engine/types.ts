// Tipos del motor de Crimen Perfecto. Sin dependencias de React: lo usan la UI, los tests y los scripts.

/** Código de objeto en cada casilla del plano. '.' = piso libre. */
export type ObjectCode = '.' | 'T' | 'S' | 'P' | 'V' | 'K' | 'M' | 'C' | 'B' | 'R';

export interface ObjectInfo {
  name: string;
  /** Con artículo indefinido, para generar pistas: "una silla". */
  indef: string;
  icon: string;
  /** Si bloquea la casilla: nadie puede estar parado ahí. */
  blocking: boolean;
}

export const OBJECTS: Record<Exclude<ObjectCode, '.'>, ObjectInfo> = {
  T: { name: 'mesa', indef: 'una mesa', icon: '🟫', blocking: true },
  S: { name: 'estante', indef: 'un estante', icon: '📚', blocking: true },
  P: { name: 'planta', indef: 'una planta', icon: '🪴', blocking: true },
  V: { name: 'televisor', indef: 'un televisor', icon: '📺', blocking: true },
  K: { name: 'rack de servidores', indef: 'un rack de servidores', icon: '🗄️', blocking: true },
  M: { name: 'equipaje', indef: 'el equipaje', icon: '🧳', blocking: true },
  C: { name: 'silla', indef: 'una silla', icon: '🪑', blocking: false },
  B: { name: 'cama', indef: 'una cama', icon: '🛏️', blocking: false },
  R: { name: 'alfombra', indef: 'una alfombra', icon: '🟥', blocking: false },
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
  | ['alone']
  | ['withExactly', number];

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
  people: Person[];
}

export interface Cell {
  r: number;
  c: number;
}

/** Ubicación de cada persona (índices 0-based). */
export type Placement = Record<string, Cell>;
