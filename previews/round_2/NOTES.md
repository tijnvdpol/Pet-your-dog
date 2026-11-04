# Ronde 2 – diepte, poten en levendiger bewegen

Feedback ronde 1: "ziet een stuk beter uit". Daarom heb ik deze ronde de eigen verbeterpunten uit ronde 1 aangepakt.

## Wat ik verbeterd heb, en waarom

1. **Ambient occlusion, eenmalig uit de SDF berekend** (nieuw attribuut `_SHADE`).
   - Per vertex kijk ik langs de normaal hoeveel ruimte er is. Ogen en neus tellen mee, zodat de oogkassen een zachte contactschaduw krijgen.
   - Waarom: het model miste diepte. Nek, oorbasis, onderkant van de kop, tussen de poten en rond de ogen zijn nu zacht donkerder.
   - Het kost in de app niets: het is één waarde per vertex.
2. **Randlicht alleen op het silhouet.**
   - Het randlicht wordt onderdrukt waar de occlusie hoog is, en is smaller en zachter gemaakt.
   - Waarom: in ronde 1 gaf het een lichte "halsband"-lijn in de nekplooi.
3. **Toon-tinten scherper.** De overgangen zijn smaller en de schaduwtint is iets dieper, zodat de lichtvlakken beter leesbaar zijn.
4. **Teentjes:** drie bolle tenen met ondiepe groeven ertussen. Waarom: de poten waren "klompjes"; met de occlusie lezen de tenen nu meteen.
5. **`ears_half`:** het oor buigt lager en het puntje is groter en hangt naar voren en omlaag. Waarom: vanaf voren las het als rechtop.
6. **Morphs:** de snijvlakken in de mond bewegen nu mee met de snuit en de kaak.
   - Waarom: bij `snout_short` werden donkere mond-vertices naar de buitenkant van de lip geduwd.
   - Gecontroleerd door de variant ook als losse basisvorm te bouwen (`DOG_VARIANT=snout_short`). Morph en echte vorm zijn nu vrijwel gelijk.
   - Het iets "open" uiterlijk van een korte snuit komt door de vorm zelf: je kijkt dan recht in de mondspleet.
7. **Tong:** korter en verder naar voren in de kaak, met een kleine depth-offset. Waarom: de achterkant schoof onder de mondbodem en gaf een kartelrand.
8. **Run:**
   - Één zweeffase per pas.
   - De rug buigt en strekt.
   - Grotere passen.
   - Pootjes krullen in de zwaai.
   - De kop blijft stil terwijl het lijf eronder wiegt.
9. **Jump:** hurken, afzetten (gestrekt, neus omhoog), opgerold op het hoogste punt, met de voorpoten naar de grond reiken, landen en veren.
10. **Eat:** `/dev/dog` toont nu een voerbak. De neus zit op ongeveer 16 cm, precies in de bak.
11. **Borstvlek:** zachtere en iets lichtere overgang.

## Checklist

| Vraag                           | Oordeel                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| Direct herkenbaar als labrador? | Ja, als pup.                                                  |
| Schattig?                       | Ja; de occlusie rond de ogen maakt de blik zachter en dieper. |
| Glad silhouet?                  | Ja. De nek-"halsband" is weg.                                 |
| Buigen gewrichten netjes?       | Ja, ook in de nieuwe Run- en Jump-poses.                      |
| Loops naadloos?                 | Ja (unit tests; Run is nu 0,48 s).                            |

## Nog open voor ronde 3

- Bij een korte snuit blijft de mondspleet zichtbaarder dan bij de basisvorm.
- Lie en Sleep: de achterpoten zijn van opzij weinig zichtbaar. Het kan schattiger met de achterpoten wat meer naar buiten.
- Roll: als hij op zijn rug ligt, kan de kop iets meer opzij kantelen.
- Idle zou een korte "kijk naar de camera"-beweging kunnen krijgen.

## Meetwaarden

- **Driehoeken:** lijf 12.500, ogen, neus en tong 3.800.
- **Draw calls:** 5.
- **GLB:** 386 kB.
