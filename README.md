# 🔎 Crimen Perfecto

Puzzles lógicos tipo sudoku con un asesinato de por medio. Cada caso es un plano NxN con habitaciones y muebles:
ubicá a cada persona (una por fila y una por columna) siguiendo sus pistas. **El asesino es el único sospechoso que
quedó a solas con la víctima en la misma habitación.** Los jugadores se registran con alias + PIN y compiten en un
marcador público.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173 (con .env usa Supabase; sin .env, "modo local")
npm run dev:local  # fuerza el modo local aunque haya .env (para probar sin tocar la base real)
npm test           # tests del motor (solver, pistas, ayudas)
npm run validate   # todos los casos: solución única, un solo culpable, dificultad estimada
```

En modo local, el alias de prueba que se usó en desarrollo es `detective_prueba` con PIN `4821`. Solo existe en el
localStorage del navegador donde se creó.

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/engine/` | Motor puro en TS: tipos, reglas de pistas, solver, deducción, ayudas |
| `src/ui/`, `src/App.tsx` | Interfaz React: tablero, personajes, marcador lateral, login |
| `src/api/` | Backend intercambiable: `local` (localStorage) o `supabase` (RPC) |
| `puzzles/<tema>/*.json` | Casos publicados (**sin** solución) |
| `drafts/` | Borradores con solución (ignorado por git) |
| `scripts/` | `suggest` (genera pistas), `validate`, `publish` (sube soluciones a Supabase) |
| `supabase/migrations/` | Tablas, RLS, funciones RPC y vistas del ranking |
| `design/` | Tokens y guía visual |

## Crear un caso nuevo

1. Escribí un borrador en `drafts/<id>.json`: plano (`rooms`, `roomNames`, `objects`), personajes y
   `"solution": { "<persona>": [fila, columna] }` (1-based). La víctima tiene que compartir habitación con un solo
   sospechoso y nadie más.
2. `npm run suggest -- drafts/<id>.json [--seed N] [--easy]` elige pistas verdaderas hasta que la solución sea única y
   escribe `puzzles/<tema>/<id>.json`. Podés reescribir el `text` de cada pista a mano; las `rules` son las que valen.
3. `npm run validate` y, con Supabase configurado, `npm run publish-puzzle -- puzzles/<tema>/<id>.json`.

**Muebles:** `T` mesa, `S` estante, `P` planta, `V` televisor, `K` rack, `M` equipaje bloquean la casilla.
`C` silla, `B` cama y `R` alfombra se pueden ocupar.
**Reglas:** `inRoom`, `notInRoom`, `onObject`, `notOnObject`, `adjacentTo`, `notAdjacentTo`, `onEdge`, `notOnEdge`,
`row`, `col`, `sameRoomAs`, `notSameRoomAs`, `northOf`, `southOf`, `eastOf`, `westOf`, `alone`, `withExactly`.

## Puesta en producción

1. **Supabase:** creá un proyecto gratis y ejecutá `supabase/migrations/*.sql` en el SQL Editor.
2. Copiá `.env.example` a `.env` con la URL, la anon key y la service role key (esta última solo para publicar casos
   desde tu máquina). Después corré `npm run publish-puzzle`.
3. **GitHub:** creá el repo `crimen-perfecto` y hacé push. En *Settings → Pages* elegí *GitHub Actions*. En
   *Settings → Secrets and variables → Actions → Variables* cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Cada push a `main` corre los tests y el validador y publica en `https://<usuario>.github.io/crimen-perfecto/`.

## Seguridad

- Las soluciones viven en la tabla privada `cp_solutions` y se verifican en el servidor. Ojo: alguien con su propio
  solver puede resolver las pistas públicas, como en cualquier puzzle lógico.
- El tiempo se mide en el servidor, desde `cp_start_attempt` hasta el envío correcto.
- El PIN se guarda con bcrypt y las sesiones como hash SHA-256. Hay límites de intentos para registro (por IP), login
  (por alias) y envíos, y un filtro de alias prohibidos (`cp_banned_words`).
