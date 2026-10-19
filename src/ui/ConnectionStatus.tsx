import { useSyncExternalStore } from 'react';
import { backend, connectionStore, type Connection } from '../api';

/** Último estado conocido de la conexión con el servidor (se actualiza con cada pedido). */
export const useConnection = (): Connection =>
  useSyncExternalStore(connectionStore.subscribe, connectionStore.get, () => 'online' as const);

/** Indicador para el encabezado: solo aparece si el servidor no responde. */
export function ConnectionStatus() {
  const connection = useConnection();
  if (!backend.online || connection === 'online') return null;
  return (
    <span className="chip danger" role="status" title="El servidor no responde. Lo que hagas se guarda en este dispositivo.">
      Sin conexión
    </span>
  );
}
