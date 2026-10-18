# Crimen Perfecto: sistema visual

Mockups: https://claude.ai/artifact/JHQdCVWotNJvdCk1fAwaP7 (canvas con juego en escritorio claro y oscuro, mobile, drawer del marcador, selector de casos, ingreso, Acusar, caso resuelto y hoja de tokens).

Archivos:

- `tokens.css`: variables CSS. Se importa una vez en la entrada de la app. Trae las Google Fonts, el modo claro en `:root`, el oscuro por `prefers-color-scheme` y una base mínima (`body`, `:focus-visible`, reduced motion).
- `furniture-icons.svg`: sprite con los íconos de muebles (`#obj-T`, `#obj-S`… con los mismos códigos que `src/engine/types.ts`) y la ✗ (`#mark-x`). Trazo en `currentColor`, así que toman el color del token. Reemplazan los emoji de `OBJECTS[*].icon`.

## Estética

Expediente noir: papel gris cálido de día, tinta y luz de lámpara de noche. Hay un solo acento, ámbar (herramienta activa, casilla elegida, lo "tuyo"). El rojo queda para la víctima, Acusar y los errores. Los títulos y sellos van en condensada (Big Shoulders Display), el texto en IBM Plex Sans y los números (cronómetro, puntos, coordenadas) en IBM Plex Mono.

## Modo claro/oscuro

Por defecto la app sigue al sistema. Para un selector manual, poné `data-theme="light"` o `data-theme="dark"` en `<html>`; los dos bloques de `tokens.css` lo respetan.

## Tokens

### Superficies
| Token | Uso |
|---|---|
| `--cp-bg` | Fondo de página. |
| `--cp-surface` | Tarjetas, paneles, diálogos, fichas. |
| `--cp-surface-2` | Superficie hundida: segmentados, chips neutros, filas alternadas, bloque de historia. |
| `--cp-overlay` | Velo detrás de modales y del drawer. |
| `--cp-border` | Bordes de tarjetas, inputs y botones secundarios. |
| `--cp-border-strong` | Bordes enfáticos (input activo, aro de ficha de sospechoso). |

### Texto
| Token | Uso |
|---|---|
| `--cp-text` | Texto principal. También es el relleno del botón primario neutro (Entrar, Compartir), con `--cp-surface` como texto. |
| `--cp-text-muted` | Texto secundario, pistas en mobile, descripciones. |
| `--cp-text-faint` | Rótulos en mayúsculas, coordenadas del plano, encabezados de tabla. Cumple AA (≥4.5:1) sobre `bg` y `surface`. |

### Acento y estados
| Token | Uso |
|---|---|
| `--cp-accent` / `--cp-on-accent` | Relleno ámbar y su texto: herramienta activa (Colocar/Marcar), CTA "Seguir", puesto #1. |
| `--cp-accent-text` | Ámbar usado como texto o ícono (eyebrows, links, "Elegido"). |
| `--cp-accent-soft` | Fondo suave: tu fila en el ranking, chip "En curso". |
| `--cp-focus` | Anillo de foco de teclado (azul, distinto del acento a propósito). |
| `--cp-danger` / `--cp-on-danger` / `--cp-danger-text` / `--cp-danger-soft` | Acusar, ficha y tag de víctima, errores, sello "Caso cerrado". |
| `--cp-success` / `--cp-on-success` / `--cp-success-text` / `--cp-success-soft` | "En el plano", "Resuelto", progreso, "Copiado". |

### Plano
| Token | Uso |
|---|---|
| `--cp-wall`, `--cp-wall-w` (3px) | Pared entre habitaciones y borde exterior. |
| `--cp-grid-line`, `--cp-grid-w` (1px) | Línea fina entre casillas de una misma habitación. |
| `--cp-room-1` … `--cp-room-8` | Fondo de casilla por habitación. Se asignan en el orden en que aparece cada letra en `rooms` (la primera letra nueva es room-1). Todos dan ≥10:1 con `--cp-room-ink`. |
| `--cp-room-ink` | Texto sobre cualquier habitación. |
| `--cp-obj-block` | Ícono de mueble que bloquea (mesa, estante, planta, TV, rack, equipaje). |
| `--cp-obj-free` | Ícono de mueble transitable (silla, cama, alfombra). |
| `--cp-hatch` | Rayado diagonal que se suma al fondo de una casilla bloqueada: `background-image: var(--cp-hatch)`. |
| `--cp-mark` | Color de la ✗. |
| `--cp-dim` | Velo para atenuar habitaciones fuera de foco (pantalla de resuelto: todo menos la escena del crimen). Se aplica como `linear-gradient(var(--cp-dim), var(--cp-dim))` encima del color. |

### Forma, tipografía y espaciado
- Radios: `--cp-radius-sm` 4 (chips, badges), `-md` 8 (botones, inputs, tarjetas de persona), `-lg` 14 (paneles, tarjetas de caso, diálogos), `-pill`.
- Sombras: `--cp-shadow-1` (tarjetas en reposo), `-2` (fichas sobre el plano, miniaturas), `-3` (diálogos y drawer).
- Fuentes: `--cp-font-display` (h1/h2, sellos; siempre ≥20px), `--cp-font-body`, `--cp-font-mono`.
- Escala: `--cp-text-xs` 12 · `sm` 14 · `md` 16 · `lg` 20 · `xl` 28 · `2xl` 44 · `3xl` 64. Rótulos en mayúsculas con `--cp-tracking-caps`.
- Espaciado base 4: `--cp-space-1` 4 · 2 8 · 3 12 · 4 16 · 5 24 · 6 32 · 7 48 · 8 64.

## Layout

| Breakpoint | Ancho | Layout |
|---|---|---|
| Mobile | < 768px | Una columna, márgenes de 16px (`--cp-gutter` pasa a 16). Barra superior con volver, título y cronómetro. Plano a todo el ancho, personas debajo. Herramientas en una barra fija abajo (5 botones iguales: Colocar, Marcar, Deshacer, Ayuda, Acusar). El marcador se resume en una barra fija arriba de las herramientas (puesto, puntos, récord del caso) y se abre como drawer desde abajo, de 600px de alto como máximo. |
| Tablet | 768–1099px | Plano y personas lado a lado (las personas pasan abajo si no entran 320px). El marcador va al final de la página como panel completo. |
| Escritorio | ≥ 1100px | Tres columnas: plano, personas (mín. 340px) y marcador fijo de `--cp-scoreboard-w` (320px) con `position: sticky; top: 24px`. Contenido centrado con un máximo de `--cp-content-max` (1440px) y márgenes de 32px. |

### Tamaño de casilla

```
casilla = clamp(44px, floor((ancho disponible - rótulos - pared) / N), 88px)
```

- Rótulos de coordenadas: 18px si la casilla es < 60px, si no 22px. Pared exterior: 3px.
- A 375px (343 útiles): 5×5 → 64px, 6×6 → 53px, 7×7 → 46px.
- `--cp-cell-min` (44px) es el piso táctil. Si un plano no entra con 44px (8×8 o más en un teléfono), el plano scrollea en horizontal dentro de su caja; la página nunca.
- En escritorio usamos 84px para 5×5, y la casilla se achica para que el plano no pase de ~520px.
- Cualquier control mide como mínimo `--cp-touch` (44px) de alto.

### Anatomía del plano

- Cada casilla dibuja solo su borde superior e izquierdo: pared si cambia la habitación o si es la primera fila o columna, si no línea fina. El contenedor dibuja la pared derecha e inferior. Así no hay bordes dobles.
- Mueble que bloquea: rayado y el ícono centrado al 52% de la casilla. Mueble transitable: ícono centrado al 44%, o en la esquina inferior derecha al 30% si hay una ficha o una ✗ encima.
- Ficha: círculo al 68% de la casilla, fondo `surface`, aro de 2.5px (`border-strong` para sospechosos, `danger` para la víctima), avatar emoji al 34% y un badge con la inicial abajo a la derecha (fuente mono, 11px como mínimo).
- ✗: trazo de 2.25 en `--cp-mark`, al 40% de la casilla.
- Casilla elegida: `box-shadow: inset 0 0 0 3px var(--cp-accent), inset 0 0 0 5px var(--cp-surface)`.
- Coordenadas: columnas A–G arriba y filas 1–7 a la izquierda, en mono `--cp-text-faint`. Se usan en los chips ("En el plano · B1") y en las etiquetas accesibles.

### Accesibilidad

- Cada casilla es un `<button>` con `aria-label` del estilo "B2, el bar, silla, Ana, marcada". Navegación con flechas usando roving tabindex.
- Las tarjetas de persona son botones con `aria-pressed` (la elegida para colocar). El modo Colocar/Marcar es un grupo de botones con `aria-pressed`.
- El color nunca es la única señal: las habitaciones tienen paredes, el bloqueo tiene rayado, la víctima tiene tag y badge rojos, y los estados tienen texto.
- Contraste medido en los dos modos: todo par de texto sobre superficie da ≥4.5:1 (AA) y el texto sobre habitaciones (`--cp-room-ink`) da ≥8.5:1. Íconos de mueble y ✗ sobre habitaciones dan ≥4:1 (piso para gráficos: 3:1). `--cp-text-faint` no se usa como texto sobre habitaciones: ahí no llega a 4.5.

## Decisiones que son propuesta (a confirmar con el motor)

- Puntos: el ejemplo de la pantalla de resuelto usa base 100 × dificultad, +50 si tardás menos de 5 minutos y −10 por ayuda. Es solo para el mockup.
- Acusación equivocada: el caso sigue abierto y el cronómetro sigue corriendo.
- Compartir: texto sin spoilers, con un cuadrado por persona (🟩 ubicada a la primera, 🟨 la moviste) y el link del caso.
- Alias de 3 a 16 caracteres (letras, números y `_`) y PIN de 4 a 6 dígitos, sin recuperación.
