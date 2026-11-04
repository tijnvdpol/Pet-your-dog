# Ronde 1 – wat is gedaan en waarom

Screenshots: `view_*` (voor, 3/4, zij, boven, close-up), `face_mouth_open`, `anim_*` (frames uit elke clip).
Overzichtsbladen: `round_1_overzicht_modellen.png`, `round_1_overzicht_animaties.png`.

## Gedaan
- Hele pijplijn gebouwd (SDF → surface nets → decimeren → GLB). Eerste mesh was nog een beagle-achtige sliert; daarna binnen de ronde bijgesteld:
  - SDF-bug gevonden en gefixt (`roundCone` miste een factor `l2`): daardoor waren staart en poten fout en had de staart een afgekapt uiteinde.
  - smin-bulten op segmentverbindingen verwijderd (harde `min` waar radii gelijk zijn): geen ringen meer in de staart.
  - Poten smaller en dichter bij het lijf (geen "schouderpads"), lijf korter, dikkere otterstaart, grotere donkere neus.
  - Wenkbrauwen onzichtbaar in rust (samengevouwen), alleen zichtbaar via `sad_brows`; ooglid in rust ingeklapt, sluit alleen bij `blink`/`happy_eyes`.
  - Driehoekenbudget: lijf 10,5k + gezicht 2,5k = ~13k.

## Checklist (eigen oordeel)
| Vraag | Oordeel |
| --- | --- |
| Herkenbaar als labrador? | Half. Kleur en kop kloppen, maar het lijf is te lang en te slank; poten zijn buizen. |
| Schattig? | Ja: grote glanzende ogen, ronde kop, korte snuit. Wenkbrauwen/uitdrukking nog niet beoordeeld. |
| Glad silhouet? | Grotendeels. Oren zijn nog platte schijven met een lichte rand; pootjes zijn gladde schijven zonder tenen; mondspleet is wat rafelig. |
| Buigen Sit/Lie/Roll netjes? | Sit en Lie ja; Lie: voorpoten staan schuin omhoog. Roll buigt goed maar de hond zweeft; kaak staat te wijd open. |
| Naadloze loops? | Ja (unit-test: eerste en laatste frame gelijk). |

## Bekende problemen voor ronde 2
1. Labrador-proporties: korter, bredere borst, dikkere nek, kortere/stevigere poten, meer "cobby" lijf.
2. Oren: volume en zachte plooi in plaats van een platte schijf; rand verbergen.
3. Mond: rafelige spleet en te wijd open kaak (Roll/Run); tong beter verbergen als de mond dicht is.
4. Grondcontact: Run/Jump/Roll zweven; Lie-voorpoten plat op de grond.
5. Sulk draait niet duidelijk weg; Eat/Sleep vanuit camera moeilijk leesbaar.
6. Pootjes met tenen/teenspleten; de gekleurde "sokken" lopen nog hard af.
7. Prestatie niet gemeten (Playwright draait op software-GL); 60 fps en laadtijd op een echte telefoon nog te testen.
