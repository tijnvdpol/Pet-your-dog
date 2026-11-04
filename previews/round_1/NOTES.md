# Ronde 1 – nieuw hondenmodel uit code (SDF)

Gebouwd met `npx tsx tools/dog/build.ts` → `public/models/dog_large.glb`.
Screenshots met `npx tsx tools/dog/preview.ts 1` (dev-server op :5173).

## Wat er staat

- **Model:** ellipsoïden en round cones met smooth union. Daaruit maakt surface nets een mesh van de rechterhelft; die wordt gladgemaakt, op het oppervlak teruggezet, vereenvoudigd tot 12.500 driehoeken en gespiegeld. Daardoor is het model exact symmetrisch en waterdicht.
- **Losse onderdelen:** ogen (ovale lens met iris, pupil en 2 highlights in de shader), neus met neusgaten, en tong.
- **Skelet:** 32 botten: root, spine ×3, neck, head, jaw, 2 per oor, tail ×5, en per poot 3 + voet.
- **Skin weights:** ze volgen uit welke SDF-delen een punt "bezitten". Zo zijn de overgangen zacht waar delen in elkaar overvloeien (knie, nek, staartbasis) en hard waar ze dat niet doen (linker- en rechterpoot, bovenlip en kaak).
- **Morph targets met dezelfde topologie:** elke vertex reist mee met zijn SDF-delen naar de nieuwe parameters en wordt dan op het nieuwe oppervlak gezet.
  - Vorm: `ears_up`, `ears_half`, `snout_long/short`, `body_slim/chunky`, `tail_long/short`.
  - Gezicht: `mouth_open`, `sad_brows` (lijf) en `blink`, `happy_eyes`, `sad_brows` (ogen).
- **Kleurzones:** dit zijn gladde velden in de vertexattributen, die de shader scherp afsnijdt.
  - `COLOR_0` = borst, snuit, poothoogte, binnenoor.
  - `_MARKINGS` = mond, bles, zadel, ooglap. Vlekken komen uit ruis in de shader.
- **Animaties:** 11 clips als keyframes in de GLB, met IK voor de poten:
  - Idle, Wag, Sit, Lie, Sleep, Eat, Run, Roll, Jump, Sulk, PetHappy.

### Waarom keyframes in de GLB en het gezicht en de na-wiebel in de app

- De clips worden in code gemaakt en als keyframes opgeslagen. Ze werken direct met `useAnimations` en crossfade, en zien er elke keer hetzelfde uit, zodat ik ze per frame kan beoordelen.
- De gezichtsmorphs zitten niet in de clips. Een glTF-`weights`-track overschrijft namelijk _alle_ morphs, ook de vormmorphs van jouw hond. De app stuurt het gezicht per animatie aan.
- Oren die na-wiebelen en een vertraagde staart moeten reageren op de beweging die je echt ziet, ook tijdens een crossfade. Daarom draaien die als veer en low-pass filter in de app, na de mixer.

## Iteraties binnen deze ronde

1. **Eerste versie:** realistische verhoudingen. Het leek een rat, met een eendensnavelsnuit, een dunne staart met ringen, en ogen en neus in het verkeerde materiaal.
   - De materiaalfout kwam doordat React StrictMode de toewijzing twee keer uitvoerde. Opgelost.
2. **Chibi-verhoudingen:** kop ×1,3 en ronder, korte ronde snuit, grote ovale ogen die op het gezicht liggen in plaats van uitpuilen, en een grote neus. Hij werd duidelijk schattiger.
3. **Oren groter en meer naar voren, staart als otterstaart, nek en poten korter.**
   - De staart en poten zijn nu één doorlopende "round cone"-keten: glad, zonder ringen. De skin weights zijn wel zacht gebleven.
4. **Animaties:**
   - De oren sloegen te wild: veer zachter gemaakt en een tekenfout in de flap-richting gerepareerd.
   - Bij Roll ging de kop door de grond: de kop blijft nu dicht bij de draai-as.
   - PetHappy trappelt met de poot aan de camerakant.
   - De nekovergang is zachter gemaakt.
5. **Details:**
   - Bij `snout_short` begroef de neus zich: de snuit gaat minder ver terug.
   - De lichaamsvarianten zijn sterker gemaakt.
   - De borstvlek heeft een zachte rand.
   - Bij flaporen is het binnenoor gelijk aan de vacht (geen lichte streep meer).
   - De telefooncamera houdt rekening met de beeldverhouding.

## Checklist

| Vraag                           | Oordeel                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct herkenbaar als labrador? | Ja, als **labradorpup**: chocoladebruin, hangoren, otterstaart, brede kop. Een volwassen lab heeft een langere snuit (`snout_long` helpt). |
| Schattig?                       | Ja: grote glanzende ogen, ronde kop, korte snuit, open bekje met tong.                                                                     |
| Glad silhouet?                  | Ja, geen deuken of gaten. Wel: een lichte lijn in de nekplooi (rim light in de holte) en de oorrand is van opzij wat "plaatachtig".        |
| Buigen gewrichten netjes?       | Sit, Lie en Roll: ja, zonder knikken. De heup in Sit is wat bolvormig.                                                                     |
| Lopen de loops naadloos?        | Ja: per clip getest dat pose(0) = pose(T), en de poten blijven op de grond (unit tests).                                                   |

## Bekende punten voor ronde 2

- Rim light geeft een lichte lijn in holtes (nek, oorplooi): alleen rim op het silhouet.
- Toon-tinten zijn zacht. Ze mogen iets leesbaarder (duidelijkere 2e tint).
- `ears_half` leest vanaf voren als bijna rechtop: de vouw moet duidelijker.
- `snout_short`: de mondlijn wordt te breed en donker.
- Eat: de kop zakt in het gras. Bij integratie afstemmen op de voerbak.
- Run en Jump: de poten zijn wat stijf. Run kan meer strekken en buigen in de rug.
- Er zijn nog geen tenen te zien op de poten (de bobbeltjes zijn te subtiel).

## Meetwaarden

- **Lijf:** 12.500 driehoeken.
- **Ogen, neus en tong:** 3.800 driehoeken. Totaal ~16.300, in 5 draw calls.
- **GLB:** 377 kB met meshopt en quantization (limiet 3 MB).
- **Laden van `/dev/dog` (productiebuild, inclusief leva):**
  - 4G (4 Mbit/s, 150 ms): 2,8 s.
  - Snelle 4G (9 Mbit/s, 60 ms): 1,4 s.
- **60 fps:** kan in deze container niet gemeten worden (geen GPU). Moet op een echte telefoon, via `/dev/dog` met de `stats`-toggle.
