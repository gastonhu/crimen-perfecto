# Tema "Misterios acogedores" (cozy mystery)

Notas para armar casos inspirados en el género, **sin usar tramas, personajes ni finales de libros reales**: del género
tomamos los escenarios, los tipos de personaje y el tono, nunca la historia de un libro.

## Qué define al género

- **Detective aficionado** en una comunidad chica donde todos se conocen. En Crimen Perfecto el detective es quien juega.
- **Violencia fuera de escena**: el crimen ya pasó, nada de sangre en el texto. Lo clásico es el veneno o "lo encontraron
  sin vida".
- **Un oficio o hobby como tema**: panadería, librería, té, tejido, jardinería, antigüedades, vino. Suele estar en el
  título con un juego de palabras.
- **Pueblo con chismosos**: siempre hay una vecina que sabe todo. Mascota opcional, casi siempre un gato.
- **Tono liviano y con humor**, sin malas palabras. El cierre restituye el orden.

## Subgéneros relevados y su equivalente en el plano

| Subgénero | Ejemplos del género (solo como referencia) | Habitaciones | Muebles que encajan |
| --- | --- | --- | --- |
| Culinario: panadería, café, chocolatería | Hannah Swensen (Joanne Fluke), Bakeshop (Ellie Alexander) | obrador, mostrador, depósito | mesas, sillas |
| Casa de té | Tea Shop (Laura Childs), Vera Wong (Jesse Q. Sutanto) | salón, cocina, despensa, jardín de invierno | mesas, sillas, plantas |
| Librerías y bibliotecas | Lighthouse Library (Eva Gates), Cat in the Stacks (Miranda James) | sala, rincón de lectura, infantil, trastienda | estantes, sillas, alfombras |
| Manualidades: tejido, quilting, mercería | Amish Quilt Shop (Isabella Alan), Benni Harper (Earlene Fowler) | salón del club, cuarto de costura, depósito | sillas, estantes |
| Posadas y B&B | Hillside Manor (Mary Daheim), Marlow House | cuartos, comedor, galería | camas, sillas |
| Residencias y jubilados que investigan | Thursday Murder Club (Richard Osman), Marlow Murder Club (Robert Thorogood) | salón, enfermería, jardín, comedor | camas, mesas, televisor |
| Bodegas y viñedos | Read Between the Wines (Dani Simms), Napa Valley (Nadia Gordon) | viñedo, cava, degustación, casona | plantas (vides), mesas |
| Mansión de los años 20 | Daisy Dalrymple (Carola Dunn), Lady Hardcastle | biblioteca, salón de baile, invernadero, cochera | estantes, alfombras, plantas |
| Fiestas: Navidad, Halloween, kermés | Christmas Village, Death by Eggnog | salón parroquial, puestos, escenario | mesas, sillas |
| Paranormal: brujas, fantasmas | Haunted Library (Allison Brook) | casona con un cuarto "embrujado" | velas, espejos (pedirían muebles nuevos) |
| Mascotas: cat café, guardería de perros | Cat Cafe (Cate Conte), Doggy Inn | salón, recepción, patio de juegos | alfombras, camas |
| De viaje: crucero, pueblo extranjero | Cruise Ship (A.R. Winters), Aunt Poldi en Sicilia (Mario Giordano) | cubiertas, camarotes | camas, equipaje |
| Gastronomía japonesa / "healing fiction" | The Kamogawa Food Detectives (Hisashi Kashiwai) | barra, cocina, trastienda | sillas, mesas |
| Con raíces latinas | Caribbean Kitchen (Raquel V. Reyes) | cocina, set de TV, patio | televisor, mesas |

## Casos armados (`puzzles/cozy/`)

Todos pasan en lugares de un mismo universo (Villa Remanso y alrededores), con nombres criollos.

| Id | Título | Lugar | Plano | Dificultad |
| --- | --- | --- | --- | --- |
| cozy-01 | Con las manos en la masa | Panadería La Espiga | 5×5 | 1 |
| cozy-02 | Letra muerta | Librería Ex Libris (con gato) | 6×6 | 3 |
| cozy-03 | Una taza de más | Casa de té, concurso de scones | 6×6 | 4 |
| cozy-04 | Punto final | Club de tejido en la mercería | 6×6 | 3 |
| cozy-05 | Marea baja | Hostería costera fuera de temporada | 7×7 | 2 |
| cozy-06 | Cartón lleno | Noche de bingo en un hogar de abuelos | 7×7 | 3 |
| cozy-07 | Cosecha tardía | Bodega en vendimia, Valles Calchaquíes | 7×7 | 3 |

## Ideas para los próximos

- **Kermés navideña** en el salón parroquial: puestos, pesebre viviente, escenario del coro.
- **Feria de antigüedades** en la plaza: cada puesto es una habitación.
- **Concurso de dulce de leche** en la fiesta del pueblo, con jurado.
- **Quinta de los años 20** en Tafí del Valle: fin de semana con la familia, el notario y el testamento.
- **Vivero y club de jardinería**: plantas por todos lados, buen uso del mueble `P`.
- **Cat café**: el gato como testigo mudo, en el relato y no como sospechoso.
- **Rodaje de un programa de cocina** en un pueblo chico (sirve el televisor `V`).

Muebles que harían falta para algunos de estos: horno, barrica, piano, chimenea, mostrador. Cada uno se agrega en
`OBJECTS` (`src/engine/types.ts`) con un ícono.
