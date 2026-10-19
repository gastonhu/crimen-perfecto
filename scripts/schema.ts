// Esquema estricto de los archivos de caso (puzzles/**.json). Se usa en validate, publish y los tests.
// Vive fuera de src/ para que zod no entre al bundle del juego.
import { z } from 'zod';

export const SCHEMA_VERSION = 2;

const id = z.string().regex(/^[a-z0-9-]+$/, 'solo minúsculas, números y guiones');
const objectCode = z.enum(['.', 'T', 'S', 'P', 'V', 'K', 'M', 'C', 'B', 'R']);
const sideRef = z.string().regex(/^[A-I][1-9][NSEO]$/, 'formato "B1N": columna, fila y lado (N, S, E u O)');
const line = z.number().int().min(1).max(9);

const rule = z.union([
  z.tuple([z.enum(['inRoom', 'notInRoom']), z.string().length(1)]),
  z.tuple([z.enum(['onObject', 'notOnObject', 'adjacentTo', 'notAdjacentTo']), objectCode]),
  z.tuple([z.enum(['onEdge', 'notOnEdge', 'byWindow', 'notByWindow', 'byDoor', 'notByDoor', 'alone'])]),
  z.tuple([z.enum(['row', 'col']), line]),
  z.tuple([
    z.enum(['sameRoomAs', 'notSameRoomAs', 'northOf', 'southOf', 'eastOf', 'westOf', 'touching', 'notTouching']),
    id,
  ]),
  z.tuple([z.literal('withExactly'), z.number().int().min(0).max(8)]),
]);

const fact = z.union([
  z.tuple([z.literal('roomCount'), z.string().length(1), z.number().int().min(0).max(9)]),
  z.tuple([z.literal('objectCount'), objectCode, z.number().int().min(0).max(9)]),
]);

export const puzzleSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id,
    theme: id,
    title: z.string().min(3).max(60),
    size: z.number().int().min(3).max(9),
    difficulty: z.number().int().min(1).max(5),
    story: z.string().min(10),
    epilogue: z.string().includes('{killer}', { message: 'el epílogo tiene que nombrar al culpable con {killer}' }).optional(),
    rooms: z.array(z.string().regex(/^[A-Z]+$/)),
    roomNames: z.record(z.string().length(1), z.string().min(2)),
    objects: z.array(z.string().regex(/^[.TSPVKMCBR]+$/)),
    windows: z.array(sideRef).optional(),
    doors: z.array(sideRef).optional(),
    people: z.array(
      z
        .object({
          id,
          name: z.string().min(1).max(30),
          role: z.enum(['victim', 'suspect']),
          avatar: z.string(),
          gender: z.enum(['f', 'm']).optional(),
          clue: z.object({ text: z.string().optional(), rules: z.array(rule) }).strict(),
        })
        .strict(),
    ),
    facts: z.array(z.object({ text: z.string().optional(), fact }).strict()).optional(),
    crime: z.enum(['aloneWithVictim', 'touchingVictim']).optional(),
  })
  .strict();

/** Errores de forma del archivo (vacío si está bien). */
export function schemaErrors(json: unknown): string[] {
  const r = puzzleSchema.safeParse(json);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`);
}
