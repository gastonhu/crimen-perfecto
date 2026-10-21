import type { Person } from '../engine';
import { useSettings } from './settings';

/** Ícono del sprite (design/furniture-icons.svg, inyectado una vez en App). Decorativo: el texto va al lado. */
export function Icon({ name, className = 'ico' }: { name: string; className?: string }) {
  return (
    <svg className={className} aria-hidden>
      <use href={`#${name}`} />
    </svg>
  );
}

/**
 * Medallón con la inicial de una persona (doble aro de tinta; la víctima, medalla de lacre llena).
 * Con el ajuste "avatares" muestra el emoji del caso en lugar de la inicial.
 */
export function Monogram({
  person,
  text,
  className = '',
}: {
  person: Pick<Person, 'role' | 'avatar'>;
  text: string;
  className?: string;
}) {
  const { avatars } = useSettings();
  const emoji = avatars && person.avatar;
  return (
    <span className={`medal medal-${person.role} ${emoji ? 'emoji' : ''} ${className}`} aria-hidden>
      {emoji || text}
    </span>
  );
}
