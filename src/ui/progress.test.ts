import { describe, expect, it } from 'vitest';
import { pickBoard, sanitizeBoard } from './useGame';

describe('pickBoard: tablero local o del servidor al abrir el caso', () => {
  it('sin tablero en el servidor, el local', () => {
    expect(pickBoard({ savedAt: 10 }, null)).toBe('local');
    expect(pickBoard(null, null)).toBe('local');
  });

  it('sin tablero local (o sin fecha, de una versión anterior), el del servidor', () => {
    expect(pickBoard(null, { updatedAt: 5 })).toBe('remote');
    expect(pickBoard({}, { updatedAt: 5 })).toBe('remote');
  });

  it('si el servidor no tiene nada posterior a la última sincronización, el local (cambios sin subir)', () => {
    expect(pickBoard({ savedAt: 100, syncedAt: 50 }, { updatedAt: 50 })).toBe('local');
    // aunque el reloj local esté atrasado respecto del servidor
    expect(pickBoard({ savedAt: 10, syncedAt: 50 }, { updatedAt: 50 })).toBe('local');
  });

  it('si otro dispositivo guardó después, gana el más reciente', () => {
    expect(pickBoard({ savedAt: 60, syncedAt: 50 }, { updatedAt: 80 })).toBe('remote');
    expect(pickBoard({ savedAt: 90, syncedAt: 50 }, { updatedAt: 80 })).toBe('local');
    expect(pickBoard({ savedAt: 90 }, { updatedAt: 80 })).toBe('local');
    expect(pickBoard({ savedAt: 70 }, { updatedAt: 80 })).toBe('remote');
  });
});

describe('sanitizeBoard', () => {
  const p = { size: 3, people: [{ id: 'ana' }, { id: 'beto' }] } as Parameters<typeof sanitizeBoard>[1];

  it('deja pasar un tablero válido', () => {
    const b = { placements: { ana: { r: 0, c: 1 } }, marks: ['2,2'], notes: { '1,1': ['beto'] } };
    expect(sanitizeBoard(b, p)).toEqual(b);
  });

  it('descarta personas, casillas y notas que no son del caso', () => {
    expect(
      sanitizeBoard(
        {
          placements: { ana: { r: 0, c: 3 }, beto: { r: 1, c: 1 }, intruso: { r: 0, c: 0 }, x: null },
          marks: ['0,0', '0,0', '9,9', 'hola', 3],
          notes: { '1,2': ['ana', 'nadie', 'ana'], '5,5': ['ana'], '0,1': ['nadie'] },
        },
        p,
      ),
    ).toEqual({ placements: { beto: { r: 1, c: 1 } }, marks: ['0,0'], notes: { '1,2': ['ana'] } });
  });

  it('cualquier otra cosa da null o un tablero vacío', () => {
    expect(sanitizeBoard(null, p)).toBeNull();
    expect(sanitizeBoard('x', p)).toBeNull();
    expect(sanitizeBoard({}, p)).toEqual({ placements: {}, marks: [], notes: {} });
  });
});
