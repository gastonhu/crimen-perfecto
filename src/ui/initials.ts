import type { Person } from '../engine';

/**
 * Iniciales cortas y distintas para cada persona (fichas y notas). Si dos nombres empiezan igual
 * ("Don Ruiz" y "Diego"), prueba con las iniciales de cada palabra y después con las dos primeras letras.
 */
export function initials(people: Person[]): Map<string, string> {
  const options = (name: string) => {
    const words = name.split(/\s+/).filter(Boolean);
    const first = name[0].toUpperCase();
    return [first, words.map((w) => w[0].toUpperCase()).join(''), first + name.slice(1, 2).toLowerCase(), first + name.slice(1, 3).toLowerCase()];
  };
  const firsts = people.map((x) => x.name[0].toUpperCase());
  const out = new Map<string, string>();
  const taken = new Set<string>();
  // Primero quienes tienen la inicial sola sin choque, para que ellos la conserven.
  people.forEach((x, i) => {
    if (firsts.filter((f) => f === firsts[i]).length === 1) {
      out.set(x.id, firsts[i]);
      taken.add(firsts[i]);
    }
  });
  for (const x of people) {
    if (out.has(x.id)) continue;
    const pick = options(x.name).find((o) => o.length > 1 && !taken.has(o)) ?? x.id;
    out.set(x.id, pick);
    taken.add(pick);
  }
  return out;
}
