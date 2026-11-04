# Ronde 3 – anatomie herbouwd (otter -> hond)

Aanleiding: "lijkt nog steeds op een mislukte otter". Diagnose: de silhouetten waren otter-proporties (lange buis, korte rechte poten, lange taps toelopende staart, lage horizontale nek, korte snuit). Kleur en detail losten dat niet op; de bouw moest anders.

## Aangepast (model.ts)
- **Lijf**: vierkanter (lengte ≈ schofthoogte), diepe borst, smallere heupen en een taille-inkeping onder de buik.
- **Poten**: even lang als de borst diep is. Achterpoot met de typische dijbeen–knie–hak-zigzag; voorpoot recht met elleboog. Dunnere onderpoten, kleine ronde pootjes.
- **Nek en kop**: nek ~50° omhoog, kop hoog gedragen. Snuit ongeveer even lang als de schedel, met duidelijke stop; kleinere, ronde neus.
- **Staart**: korter, dunner, omhoog gedragen.
- **Oren**: aan de achterkant van de schedel, vallen naar beneden.
- Skelet, skin weights, morphs en kleurzones meeverhuisd; Sit-pose rump lager.

## Bugs gevonden en opgelost
- **Kaak/oren/staart stapelden op**: three.js' mixer schrijft een bot alleen terug als de clipwaarde verandert. Mijn extra rotatie (kaak, oor- en staartnawiebelen) werd daardoor bij constante tracks elk frame opgeteld. Nu onthoudt `Overlay` de clipwaarde als basis. Dit trof ook de live app, niet alleen de screenshots.

## Eigen oordeel
| Vraag | Oordeel |
| --- | --- |
| Herkenbaar als hond? | Ja: silhouet (hakknik, nek, snuit, staart) leest meteen als hond. Eerder een beagle/foxhound-achtige pup dan een stevige labrador. |
| Schattig? | Ja, kop en ogen werken; de kleine ogen zijn bewust zoals in de referentie. |
| Glad silhouet / geen rare knikken? | Ja, low-poly facetten zonder gaten of naden. |
| Buigen Sit/Lie/Roll? | Ja; Sit zit nu echt, Lie en Roll buigen netjes. |
| Naadloze loops? | Ja (unit-test). |

## Nog open
1. Labrador-stevigheid: bredere borst, dikkere bovenbenen en nek, grotere oren, kortere poten.
2. Grondcontact: Run, Jump en Roll zweven nog.
3. Pootjes: nog geen tenen.
4. Mond: low-poly mondlijn, geen echte holte (mouth_open = kaakdraai).
5. Prestatiemeting op een echte telefoon (60 fps, laden < 3 s op 4G) en aansluiting in de app.
