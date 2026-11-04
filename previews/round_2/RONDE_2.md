# Ronde 2 – low-poly look naar referentie

Aanleiding: feedback "heeft weinig van een hond" + referentiefoto (faceted low-poly hond: crème kop/nek/borst, tan oren en poten, wigsnuit, grote neus, kleine ogen, driehoekige flaporen).

## Aangepast
- **Look**: vlakke schaduw (gebouwd uit losse driehoeken met vlaknormalen), 5-staps zachte toon-gradient, hoge-contrast kleurblokken. Lijf nu ~2.600 driehoeken (was 10.500); totaal ~4.100 met oogdelen.
  - Afwijking van de oorspronkelijke eis (8.000–15.000 driehoeken): die past niet bij deze look. Met `DOG_TRIS=12000 npx tsx tools/dog/build.ts` is het gladde model nog te bouwen.
- **Kleurzones per driehoek** + meerderheidsfilter, zodat de grenzen rechte, leesbare blokken zijn: crème (coat_secondary) op kop, nek, borst, buik, onderpoten; tan (coat_base) op oren, rug, achterhand, staart en een oogvlek.
- **Kop opnieuw**: hoger op een langere nek, wigvormige snuit, grote donkerbruine neus, kleinere ogen hoger op de kop, driehoekige oren die vanaf de kruin naar buiten vallen.
- **Mond**: de echte mondspleet vervalt in low-poly (verdwijnt bij zo weinig driehoeken); nu een donkere lijn. `DOG_MOUTH=1` zet de spleet terug voor het gladde model.
- Rig, morph targets, clips en secondary motion ongewijzigd en werken nog (zie `anim_*`).

## Eigen oordeel
| Vraag | Oordeel |
| --- | --- |
| Herkenbaar als hond? | Veel beter: kleurblokken, flaporen en neus lezen meteen als hond. Nog wel meer "pup/spaniel" dan labrador. |
| Schattig? | Ja, maar de kleine ogen zijn minder "glanzend" dan gevraagd; ze blijven wel leesbaar. |
| Silhouet? | Schoon. Snuit nog niet zo blokvormig als de referentie; staart nog een lange punt. |
| Buigen? | Sit/Lie/Run/Roll buigen goed. |
| Loops? | Naadloos (unit-test). |

## Open voor ronde 3
1. Poten: stevigere "pilaren" met tenen (nu gladde crème knotsen) en tan bovenbenen zoals de referentie.
2. Snuit blokvormiger, wangen/lippen.
3. `mouth_open` is in low-poly alleen een kaakdraai zonder holte (bij Roll/Run ziet dat er rommelig uit).
4. Grondcontact in Run/Jump/Roll (hond zweeft); Lie-voorpoten plat.
5. Oren iets groter en scherper; kortere staart.
6. Prestatie nog te meten op een echte telefoon.
