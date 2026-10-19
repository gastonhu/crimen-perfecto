import { cellKey, objectAt, roomAt, sidesWith, type Cell, type Person, type Placement, type Puzzle } from '../engine';

export interface ClueRefs {
  /** Casillas que la pista nombra: muebles, ventanas/puertas y personas ya ubicadas. */
  cells: Set<string>;
  /** Habitaciones que la pista nombra. */
  rooms: Set<string>;
}

/** Lo que menciona la pista de una persona, para marcarlo en el plano mientras se la mira. */
export function clueRefs(p: Puzzle, person: Person, placements: Partial<Placement>): ClueRefs {
  const cells = new Set<string>();
  const rooms = new Set<string>();
  const all: Cell[] = [];
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) all.push({ r, c });
  for (const rule of person.clue.rules) {
    switch (rule[0]) {
      case 'inRoom':
      case 'notInRoom':
        rooms.add(rule[1]);
        break;
      case 'onObject':
      case 'notOnObject':
      case 'adjacentTo':
      case 'notAdjacentTo':
        for (const c of all) if (objectAt(p, c) === rule[1]) cells.add(cellKey(c));
        break;
      case 'byWindow':
      case 'notByWindow':
      case 'byDoor':
      case 'notByDoor': {
        const kind = rule[0].toLowerCase().includes('window') ? 'windows' : 'doors';
        for (const c of all) if (sidesWith(p, c, kind).length) cells.add(cellKey(c));
        break;
      }
      case 'sameRoomAs':
      case 'notSameRoomAs':
      case 'northOf':
      case 'southOf':
      case 'eastOf':
      case 'westOf':
      case 'touching':
      case 'notTouching': {
        const other = placements[rule[1]];
        if (other) {
          cells.add(cellKey(other));
          if (rule[0].endsWith('ameRoomAs')) rooms.add(roomAt(p, other));
        }
        break;
      }
    }
  }
  return { cells, rooms };
}
