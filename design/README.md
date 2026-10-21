# Crimen Perfecto: sistema visual

Mockups: https://claude.ai/artifact/1sieHupQVWH4GmyQhj9vbi (canvas "Baker Street": juego en escritorio claro y oscuro, mobile claro y oscuro, componente plano, archivo de casos, Acusar, caso cerrado, editor y hoja del sistema). El canvas anterior, con la estética noir, queda como referencia: https://claude.ai/artifact/JHQdCVWotNJvdCk1fAwaP7.

Archivos:

- `tokens.css`: variables CSS. Se importa una vez en la entrada de la app. Trae las Google Fonts, el modo claro en `:root`, el oscuro por `prefers-color-scheme` y una base mínima (`body` con la textura de papel, `:focus-visible`, reduced motion).
- `furniture-icons.svg`: sprite que `App.tsx` inyecta una vez. Trae los muebles (`#obj-T`, `#obj-S`… con los mismos códigos que `src/engine/types.ts`), la ✗ (`#mark-x`), las herramientas (`#tool-place`, `#tool-notes`, `#tool-undo`, `#tool-redo`, `#tool-help`, `#tool-accuse`, `#tool-clear`, `#tool-more`), la interfaz (`#ui-lens`, `#ui-ledger`, `#ui-watch`, `#ui-gear`, `#ui-book`, `#ui-eye`, `#ui-copy`, `#ui-back`, `#ui-prev`, `#ui-next`, `#ui-close`, `#ui-compass`), un ícono por tema (`#theme-hotel`, `#theme-tren`, `#theme-estancia`, `#theme-datacenter`, `#theme-cozy` y `#theme-other` para temas nuevos) y el sello de lacre (`#seal`). Trazo de 1.6 en `currentColor`, así que toman el color del token. En React se usan con `<Icon name="…" />` (`src/ui/Icon.tsx`).

## Estética

Baker Street, Londres 1890. De día, papel verjurado, tinta ferrogálica, latón y lacre. De noche, niebla, hollín y luz de gas. Hay un solo acento, el latón (herramienta activa, casilla o persona elegida, lo "tuyo"). El lacre queda para la víctima, Acusar y los errores.

- Tipografía: títulos en Playfair Display, sin mayúsculas forzadas. La cabecera, los rótulos y los sellos van en versalitas (Playfair Display SC). El texto y los controles van en Source Serif 4, y el reloj, las coordenadas y los puntos en Courier Prime.
- Ornamentos (todo en CSS o SVG, sin imágenes): regla de diario gruesa-fina bajo la cabecera, la historia del caso como recorte con capitular en lacre, esquineros de álbum en diálogos, carpetas de caso y paneles del editor, rayado de grabado cruzado en los muebles que bloquean, marco doble en el cronómetro, el plano como lámina con pie y rosa de los vientos, sello de lacre al cerrar el caso y manícula (la mano que señala) como ícono de Acusar.
- Personas: en lugar del emoji, un monograma con la inicial en Playfair itálica dentro de un medallón de doble aro (`<Monogram>` en `src/ui/Icon.tsx`). La víctima es una medalla de lacre llena. El ajuste "Mostrar avatares" vuelve a mostrar el emoji de cada caso.
- Sin kitsch: nada de pergaminos rotos, manchas de café ni tipografías de imitación manuscrita. Radios chicos (2–6 px), texto siempre legible y el plano manda.

## Modo claro/oscuro

Por defecto la app sigue al sistema. Para un selector manual, poné `data-theme="light"` o `data-theme="dark"` en `<html>`; los dos bloques de `tokens.css` lo respetan. `index.html` declara `theme-color` para los dos modos.

## Tokens

### Superficies
| Token | Uso |
|---|---|
| `--cp-bg` | Fondo de página (papel). |
| `--cp-paper` | Textura que va encima del fondo: verjurado con bordes tostados de día, halo de farol y bruma de noche. `body` la usa como `background-image`. |
| `--cp-surface` | Tarjetas, paneles, diálogos, fichas, lámina del plano. |
| `--cp-surface-2` | Superficie hundida: segmentados, chips neutros. |
| `--cp-overlay` | Velo detrás de modales y del drawer. |
| `--cp-border` | Bordes de tarjetas, inputs y botones secundarios. |
| `--cp-border-strong` | Bordes enfáticos y aros de los monogramas. También el color de los esquineros. |
| `--cp-rule` | Reglas de diario: cabecera, recorte de la historia, pestañas del editor. |

### Texto
| Token | Uso |
|---|---|
| `--cp-text` | Tinta. También es el relleno del botón primario neutro (Entrar, Compartir), con `--cp-surface` como texto. |
| `--cp-text-muted` | Sepia: texto secundario, pistas, descripciones. |
| `--cp-text-faint` | Rótulos en versalitas, coordenadas del plano, encabezados de tabla. Cumple AA (≥4.5:1) sobre `bg`, `surface` y `surface-2`. |

### Acento y estados
| Token | Uso |
|---|---|
| `--cp-accent` / `--cp-on-accent` | Relleno de latón y su texto: herramienta activa (Colocar/Marcar/Notas), CTA "Otro caso", "Empezar". |
| `--cp-accent-text` | Latón usado como texto o ícono (rótulo del expediente, lupa de la cabecera, links). |
| `--cp-accent-soft` | Fondo suave: tu fila en el ranking, ayuda, puntos. |
| `--cp-select` | Aro de la casilla y de la persona elegidas. Es latón oscuro de día para que se vea sobre cualquier habitación. |
| `--cp-focus` | Anillo de foco de teclado (azul de Prusia, distinto del acento a propósito). |
| `--cp-danger` / `--cp-on-danger` / `--cp-danger-text` / `--cp-danger-soft` | Lacre: Acusar, medalla y tag de víctima, errores, sello y "Caso cerrado", capitular de la historia. |
| `--cp-success` / `--cp-on-success` / `--cp-success-text` / `--cp-success-soft` | Verde botella: "En el plano", "Resuelto", "Guardado", "Copiado". |

### Plano
| Token | Uso |
|---|---|
| `--cp-wall`, `--cp-wall-w` (3px) | Pared entre habitaciones y borde exterior, en tinta. |
| `--cp-grid-line`, `--cp-grid-w` (1px) | Línea punteada entre casillas de una misma habitación, como en un plano de arquitecto. |
| `--cp-room-1` … `--cp-room-8` | Fondo de casilla por habitación: aguadas de mapa coloreado a mano (ocre, salvia, pizarra, granza, malva, verdín, siena, piedra). Se asignan en el orden en que aparece cada letra en `rooms`. Todos dan ≥9.6:1 con `--cp-room-ink`. |
| `--cp-room-ink` | Texto sobre cualquier habitación. |
| `--cp-obj-block` | Ícono de mueble que bloquea (mesa, estante, planta, TV, rack, equipaje). |
| `--cp-obj-free` | Ícono de mueble transitable (silla, cama, alfombra). |
| `--cp-hatch` | Rayado de grabado cruzado que se suma al fondo de una casilla bloqueada: `background-image: var(--cp-hatch)`. |
| `--cp-mark` | Color de la ✗. |
| `--cp-dim` | Velo para atenuar habitaciones fuera de foco (pista interactiva, escena del crimen al resolver). Se aplica como capa encima del color. |

### Forma, tipografía y espaciado
- Radios: `--cp-radius-sm` 2 (chips, badges), `-md` 4 (botones, inputs, tarjetas de persona), `-lg` 6 (paneles, carpetas de caso, diálogos), `-pill`.
- Sombras: `--cp-shadow-1` (tarjetas en reposo), `-2` (fichas sobre el plano, plano), `-3` (diálogos y drawer).
- Fuentes: `--cp-font-display` (títulos, habitaciones, monogramas; siempre ≥17px), `--cp-font-caps` (cabecera, rótulos, sellos), `--cp-font-body`, `--cp-font-mono`.
- Escala: `--cp-text-xs` 12 · `sm` 14 · `md` 16 · `lg` 20 · `xl` 28 · `2xl` 44 · `3xl` 64. Versalitas con `--cp-tracking-caps` (0.12em).
- Espaciado base 4: `--cp-space-1` 4 · 2 8 · 3 12 · 4 16 · 5 24 · 6 32 · 7 48 · 8 64.

## Layout

| Breakpoint | Ancho | Layout |
|---|---|---|
| Mobile | < 768px | Una columna, márgenes de 16px (`--cp-gutter` pasa a 16). Cabecera con la lupa, el nombre en versalitas y solo el medallón del alias (el nombre queda para lectores de pantalla). Plano a todo el ancho, sin marco de lámina, personas debajo. Herramientas en una barra fija abajo (Colocar, Marcar, Notas, Deshacer, Ayuda, Acusar). El marcador se resume en una barra fija y se abre como drawer desde abajo, de 600px de alto como máximo. |
| Tablet | 768–1099px | Plano y personas lado a lado (las personas pasan abajo si no entran 300px). El marcador va al final de la página como panel completo. |
| Escritorio | ≥ 1100px | Plano y personas; el marcador queda fijo a la derecha de `--cp-scoreboard-w` (320px). Durante la partida el plano manda: el marcador se abre desde el botón Marcador de la cabecera. Contenido centrado con un máximo de `--cp-content-max` (1440px) y márgenes de 32px. |

### Tamaño de casilla

```
casilla = clamp(44px, floor((ancho disponible - rótulos - pared) / N), 88px)
```

- Rótulos de coordenadas: 20px en mobile, si no 22px. Pared exterior: 3px.
- A 390px (358 útiles): 5×5 → 67px, 6×6 → 55px, 7×7 → 47px.
- `--cp-cell-min` (44px) es el piso táctil. Si un plano no entra con 44px (8×8 o más en un teléfono), el plano scrollea en horizontal dentro de su caja; la página nunca.
- En la partida de escritorio el plano llega a ~560px y la casilla a 96px como máximo.
- Cualquier control mide como mínimo `--cp-touch` (44px) de alto.

### Anatomía del plano

- El plano va dentro de una lámina (`figure.plate`): papel con filete doble y un pie con "Lámina · título del caso" y la rosa de los vientos. En mobile la lámina se reduce al pie.
- Cada casilla dibuja solo su borde superior e izquierdo: pared si cambia la habitación o si es la primera fila o columna, si no línea punteada. El contenedor dibuja la pared derecha e inferior. Así no hay bordes dobles.
- Nombre de habitación: Playfair itálica de 11px arriba a la izquierda, a lo ancho de su tramo, como en un mapa grabado.
- Mueble que bloquea: rayado cruzado y el ícono centrado al 52% de la casilla. Mueble transitable: ícono centrado al 44%, o en la esquina inferior derecha al 30% si hay una ficha o una ✗ encima.
- Ficha: monograma al 62% de la casilla, fondo `surface`, doble aro en `border-strong` y la inicial en Playfair itálica al 30%. Víctima: medalla de lacre llena con la inicial en `on-danger`. Persona que no cumple su pista: aro punteado de lacre. Con el ajuste de avatares, el emoji al 34% y un badge con la inicial.
- ✗: trazo de 2.25 en `--cp-mark`, al 40% de la casilla.
- Casilla elegida: `box-shadow: inset 0 0 0 3px var(--cp-select), inset 0 0 0 5px var(--cp-surface)`.
- Filas y columnas ocupadas: se apagan a sepia (`grayscale` + `sepia` + `brightness`), sin rayado, para no confundirse con los muebles.
- Coordenadas: columnas A–G arriba y filas 1–7 a la izquierda, en mono `--cp-text-faint`. Se usan en los chips ("En el plano · B1") y en las etiquetas accesibles.

### Accesibilidad

- Cada casilla es un `<button>` con `aria-label` del estilo "B2, el bar, silla, Ana, marcada". Navegación con flechas usando roving tabindex.
- Las tarjetas de persona son botones con `aria-pressed` (la elegida para colocar). El modo Colocar/Marcar/Notas es un grupo de botones con `aria-pressed`.
- Íconos y monogramas son decorativos (`aria-hidden`): cada botón conserva su texto o su `aria-label`.
- El color nunca es la única señal: las habitaciones tienen paredes, el bloqueo tiene rayado, la víctima es una medalla llena (no solo roja) con tag, y los estados tienen texto.
- Contraste medido en los dos modos: todo par de texto sobre superficie da ≥4.5:1 (AA) y el texto sobre habitaciones (`--cp-room-ink`) da ≥9.6:1. Íconos de mueble y ✗ sobre habitaciones dan ≥4.4:1 (piso para gráficos: 3:1). `--cp-text-faint` no se usa como texto sobre habitaciones: ahí no llega a 4.5.

## Decisiones que son propuesta (a confirmar con el motor)

- Puntos: el ejemplo de la pantalla de resuelto usa base 100 × dificultad, +50 si tardás menos de 5 minutos y −10 por ayuda. Es solo para el mockup.
- Acusación equivocada: el caso sigue abierto y el cronómetro sigue corriendo.
- Compartir: texto sin spoilers, con un cuadrado por persona (🟩 ubicada a la primera, 🟨 la moviste) y el link del caso.
- Alias de 3 a 16 caracteres (letras, números y `_`) y PIN de 4 a 6 dígitos, sin recuperación.
