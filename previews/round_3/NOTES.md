# Ronde 3 – contact, poses en varianten

Feedback ronde 2: "klinkt goed, ga maar verder".

## Wat ik verbeterd heb, en waarom

1. **De hond kijkt je aan** (`LookAt` in `src/components/dogMotion.ts`, prop `lookAtCamera`).
   - In Idle, Wag, Sit, Lie en PetHappy draaien nek en kop naar de camera: een derde in de nek, de rest in de kop.
   - De hoeken zijn begrensd (±43° opzij, ±23° op en neer) en alles beweegt zacht mee.
   - Het werkt bovenop de clip, dus de kopbeweging uit de animatie blijft zichtbaar.
   - Waarom: voor een Tamagotchi is oogcontact het belangrijkste "hij leeft"-signaal. Het moet in de app gebeuren, want de clip weet niet waar de camera staat.
2. **Liggen en slapen:** de achterpoten liggen naar voren langs de buik met de knieën naar buiten. Waarom: van opzij waren ze bijna onzichtbaar.
3. **Rollen:** als hij op zijn rug ligt, rolt de kop minder ver mee en kijkt opzij. Waarom: zo leest de rol als "speels" in plaats van als een draaiend blok.
4. **Kleur- en aftekeningsvarianten**, een nieuw overzicht (`overview_variants.png`): zwarte, blonde en chocoladelabrador, dalmatiër, beagle, herder, collie, ooglap, masker en sokjes.
   - Waarom: het model moet de basis zijn voor _jouw_ hond. Alle zones (borst, snuit, poten, binnenoor) en aftekeningen (bles, sokjes, masker, vlekken, zadel, ooglap) werken samen met de vormmorphs.
5. **Kleine dingen:** de Idle-mond staat iets meer dicht en de mondbinnenkant is warmer donkerrood in plaats van bijna zwart.

## Checklist

| Vraag                           | Oordeel                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| Direct herkenbaar als labrador? | Ja, als pup. De zwarte en blonde varianten lezen ook meteen als labrador. |
| Schattig?                       | Ja, en met oogcontact nog meer.                                           |
| Glad silhouet?                  | Ja, ook in alle varianten.                                                |
| Buigen gewrichten netjes?       | Ja; de nieuwe liggende achterpoten buigen zonder knik.                    |
| Loops naadloos?                 | Ja (unit tests).                                                          |

## Wat ik bewust laat liggen

- **Korte snuit:** de mondspleet blijft zichtbaarder dan bij de basisvorm. Dat komt door de vorm zelf: een dichtere spleet vraagt een fijner grid, en dan wordt het bouwen ruim 2× trager.
- **Zwarte vacht:** de donkere iris valt weg tegen de vacht. Als dat bij echte foto's storend blijkt, kan de iris per hond lichter worden (één uniform).

## Meetwaarden

- **Driehoeken:** lijf 12.500, ogen, neus en tong 3.800. 5 draw calls.
- **Botten en morphs:** 32 botten, 10 morphs op het lijf.
- **GLB:** 386 kB.
- **Per frame (CPU):** één mixer-update (32 botten), veren voor 4 oorbotten en 5 staartbotten, look-at op 2 botten en 13 morph-gewichten. Dat is verwaarloosbaar naast het renderen.
- **60 fps:** de echte meting moet op een telefoon (`/dev/dog`, schakelaar `stats`).
