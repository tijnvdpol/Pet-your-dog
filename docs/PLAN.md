# Projectplan – Virtuele Hond (3D Tamagotchi PWA)

Nov 4, 2026 · @Tijn

## Concept

Een mobile-first webapp (PWA) waarin je een foto of video van je hond uploadt en een gestileerde 3D-versie van hem terugkrijgt, die je dagelijks verzorgt en mee speelt: een Tamagotchi van je eigen hond.

- **Kern:** je hond lijkt op de echte (uiterlijk uit de foto) en gedraagt zich zo (karakter uit video en vragen).
- **Toon:** cozy basis (verzorgen, aaien, groeien) met af en toe chaos-events voor humor en deelbare momenten.
- **Doelgroep:** hondenbaasjes die het leuk vinden om even tussendoor met hun hond bezig te zijn; geschikt voor jong en oud.
- **Uitgangspunt:** de hond gaat nooit dood of weg. Verwaarlozing is grappig (mokken, sok slopen), nooit schuldgevoel-opwekkend.
- **Platform:** mobiel, staand scherm, sessies van 30 seconden tot 2 minuten.

## Gameplay

De kernloop: openen → hond reageert op je → verzorgen → kort spelen → iets nieuws leren → morgen terugkomen.

### Meters

| Meter | Daalt door | Aanvullen door |
| --- | --- | --- |
| Honger | Tijd (ca. leeg na 8–12 uur) | Voeren (brokjes, snoepje) |
| Energie | Spelen, minigames | Slapen in de mand |
| Blijheid | Tijd zonder aandacht | Aaien, spelen, trucjes |
| Schoon | Wandelen, modder-events | Wassen/borstelen |

Alle waarden 0–100. De daalsnelheid hangt af van het karakter (een drukke hond verliest sneller energie, een luie hond wil meer slapen).

### Verwaarlozing (mild)

- Lage meters geven grappig gedrag: zielig in de mand liggen, met de bak in zijn bek staan, een gesloopte sok naast hem.
- Na terugkomst is hij eerst even beledigd (draait zich om) en daarna extra blij.
- Geen straf op voortgang: levels en trucjes blijven altijd behouden.

### Interacties

- **Aaien:** vegen over de hond; reactie per zone (oren, kin, buik, rug). Achter de oren kriebelen laat zijn achterpoot trappelen.
- **Voeren:** snoepje naar zijn bek slepen.
- **Bal gooien:** swipe; hij rent erachteraan en brengt hem (soms niet) terug.
- **Commando's:** zit, lig, poot, rol.

### Trucjes en groei

- Trucjes leer je door herhaling; elk trucje heeft een vaardigheid van 0–100% en gaat eerst half mis.
- XP voor elke verzorgactie en elk spelletje; levels ontgrendelen trucjes, speeltjes, outfits en omgevingen (tuin, park, strand, bos).
- Dagelijkse streak met kleine beloningen.

### Chaos-events (de fun-laag)

Willekeurig, maximaal een paar per dag: eekhoorn in de tuin, achter zijn eigen staart aan, een scheet waar hij zelf van schrikt, zoomies door de kamer, de bal "kwijt" onder de bank. Elk event is een kort deelbaar moment.

### Sociaal (later)

- Op bezoek bij de hond van een vriend (via een link) en samen spelen.
- Een clipje of screenshot delen.

## Mobile-first UX

Alles is ontworpen voor één duim op een staand telefoonscherm.

- **Schermindeling:** meters bovenin, de hond groot in het midden, actieknoppen (voeren, spelen, trucjes, mand) onderin binnen duimbereik.
- **Gebaren:** vegen = aaien, swipe = bal gooien, slepen = snoepje geven, tikken = aandacht trekken.
- **Haptics:** kort trilletje bij kwispelen, aaien en vangen (Vibration API; niet op iOS, dan alleen visueel en geluid).
- **Geluid:** blafjes en hijgen, standaard zacht en met een duidelijke mute-knop.
- **Sessies:** alles moet in 30 seconden tot 2 minuten kunnen; minigames duren maximaal \~30 seconden.
- **PWA-installatie:** een onboarding-moment "Geef \[naam\] een plekje op je beginscherm". Op iPhone werkt pushen alleen als de app op het beginscherm staat.
- **Pushmeldingen in de stem van de hond:** "Ik heb honger en ik heb naar de deur gestaard. Al 3 uur." Maximaal 1–2 per dag, met stille uren 's nachts.

## 3D-aanpak

Geen nieuw 3D-model per hond genereren, maar een paar geriggede basismodellen personaliseren met data uit de foto. Zo deelt elke hond dezelfde animaties en lijkt hij toch op de echte.

### Basismodellen

| Model | Voorbeeldrassen | Wanneer |
| --- | --- | --- |
| Groot | Labrador, herder, golden retriever | Fase 1 (eerste en enige model) |
| Middel | Beagle, border collie | Fase 3 |
| Klein | Teckel, chihuahua, jack russell | Fase 3 |
| Pluizig | Poedel, husky, pomeriaan | Later |

### Personalisatie

- **Uit de foto (AI-analyse):** basis-vachtkleur, tweede kleur, aftekening (vlekken, bles, sokjes, masker), oorvorm (staand/hangend/half), staartlengte, snuitlengte, bouw (slank/stevig).
- **Op het model:** kleuren via materiaal-parameters, aftekening via een paar maskertexturen, vorm via morph targets (shape keys) of geschaalde botten.
- **Uit video en vragen (fase 3+):** karakterprofiel, bijvoorbeeld energie, speelsheid, knuffelbaarheid en eigenwijsheid (elk 1–5), plus favoriet speeltje en favoriete aaiplek.
- De gebruiker kan het resultaat altijd handmatig bijstellen (kleurkiezer, oorvorm), want AI zit er soms naast.

### Stijl

> **Model v2 (gebouwd):** de hond is geen verzameling bollen meer, maar glad gemodelleerde delen (lijf, kop, staart, voor- en achterpoot) uit signed-distance-fields (`src/dog/sdf.ts`, `mesher.ts`, `dogParts.ts`). Vachtkleuren en aftekeningen zitten als vertexkleuren in het oppervlak. ~16k driehoeken, opbouw ~0,15–0,3 s bij elke wijziging.

Gestileerd en schattig, niet realistisch: toon-shading of zachte low-poly, iets grotere ogen en kop, zachte kleuren. Vacht via shading, geen losse haren.

### Animaties (minimaal)

Idle/ademen, kwispelen, zitten, liggen, slapen, eten, rennen, rollen, blij springen, mokken. Chaos-events (staart achterna, zoomies) komen later.

### Performance-eisen

- Model + texturen samen onder \~2–3 MB (glTF/GLB met Draco- of meshopt-compressie, KTX2-texturen).
- Stabiel 60 fps op een middenklasse telefoon van een paar jaar oud; 30 fps is de ondergrens.
- Één lichtbron + omgevingslicht, simpele schaduw (blob of contact shadow), geen zware post-processing.

## Techstack en architectuur

De frontend draait volledig in de browser; Supabase regelt accounts, opslag en de AI-analyse; Vercel host de site.

| Laag | Keuze | Rol |
| --- | --- | --- |
| Frontend | Vite + React + TypeScript | App-structuur en UI |
| 3D | React Three Fiber + drei | Hond renderen, animaties, camera |
| State | Zustand | Spelstatus in de app |
| Styling | Tailwind CSS | Snelle mobiele UI |
| PWA | vite-plugin-pwa | Installeerbaar, offline, push |
| Backend | Supabase (Auth, Postgres, Storage) | Accounts, honden, uploads |
| AI | Supabase Edge Function + vision-model | Foto → kenmerken als JSON |
| Planning | Supabase Cron + Web Push | Meldingen "ik heb honger" |
| Hosting | Vercel (via GitHub) | Automatisch live bij elke push |

### Meters berekenen zonder server-timer

Sla per meter alleen de laatste waarde en het tijdstip op. Bij openen rekent de app de huidige waarde uit:

```latex
huidig = \max(0,\ waarde_{opgeslagen} - daalsnelheid \times uren\ sinds\ update)
```

Dat is goedkoop, werkt offline en kan niet "vergeten" worden. Alleen pushmeldingen draaien via een geplande taak die dezelfde formule gebruikt.

### Datamodel (eerste opzet)

| Tabel | Belangrijkste velden |
| --- | --- |
| profiles | id, weergavenaam, push-abonnement, stille uren |
| dogs | id, eigenaar, naam, basismodel, uiterlijk (JSON), karakter (JSON), level, XP |
| dog\_stats | hond, honger, energie, blijheid, schoon, bijgewerkt\_op |
| tricks | hond, trucje, vaardigheid (0–100) |
| uploads | hond, opslagpad, type (foto/video), analyse (JSON) |
| unlocks | hond, item, ontgrendeld\_op |

Row Level Security staat op elke tabel aan: een gebruiker ziet en wijzigt alleen zijn eigen honden.

### Foto-analyse-flow

1. Gebruiker uploadt foto → Supabase Storage (privé bucket).
2. Edge Function stuurt de foto naar een vision-model met een vast JSON-schema.
3. Resultaat (ras, kleuren, aftekening, oren, staart, bouw) wordt gevalideerd en opgeslagen in `dogs.uiterlijk`.
4. Frontend zet die JSON om naar modelparameters; gebruiker kan bijstellen.

De API-sleutel van het AI-model staat alleen als secret in de Edge Function, nooit in de frontend.

## Fases en taken

Vijf fases; elke fase levert een werkende versie op die je kunt laten zien. Begin pas aan de volgende fase als alle acceptatiecriteria kloppen.

### Fase 1 – Hond leeft (lokaal, geen backend)

- [x] Project opzetten: Vite + React + TS, Tailwind, R3F + drei, Zustand, oxlint/Prettier
- [x] Hond zelf maken als parametrisch model in code (geen extern model nodig, geen licentie); zie `src/dog/Dog.tsx` en `appearance.ts`
- [x] Camera en licht instellen, idle-animatie afspelen (met placeholder-hond; GLB laden volgt zodra er een model is)
- [x] Aaien: vegen over de hond → kwispelen + trilletje; zones (kop, rug, buik)
- [x] Meters (honger, energie, blijheid) met daalformule, lokaal opgeslagen in localStorage
- [x] Knoppen voeren en slapen met bijbehorende animaties
- [x] Mobiele layout (staand), getest op een echte telefoon

**Klaar als:** de hond laadt in < 3 s op 4G, draait soepel op je telefoon, reageert op aaien en de meters dalen na een uur echt.

> **Status: afgerond.** Gemeten op gesimuleerde snelle 4G: UI na 0,3 s, hond na 0,65 s (JS 73 kB + 3D-chunk 246 kB gzip). Soepel op een echte telefoon bevestigd. De daalformule is gedekt door unit-tests.

### Fase 2 – Hond onthoudt

- [x] Supabase-project (`Pet your dog`, eu-north-1), Auth met e-mail magic link
- [ ] ~~Auth met Google~~ (optioneel, besloten: voorlopig niet nodig)
- [x] Tabellen `profiles`, `dogs`, `dog_stats` met RLS (zie `supabase/migrations/`; RLS getest met twee gebruikers)
- [x] Status opslaan/laden; meters doorrekenen sinds laatste bezoek (test: tweede schone browser ziet dezelfde hond)
- [x] Mokkig-gedrag en het "beledigd, dan blij"-welkom (na 3 uur weg; test met `?dev` → Welkom)
- [x] PWA: manifest, iconen, offline cache, installatie-onboarding
- [x] Deploy naar Vercel (project `pet-your-dog`, automatisch bij elke push)

**Klaar als:** je kunt inloggen op twee apparaten en ziet dezelfde hond met correct gedaalde meters.

> **Status: afgerond** (getest door de eigenaar op echte apparaten; inloggen met magic link of wachtwoord).

### Fase 3 – Jouw hond

- [x] Upload foto naar Storage, Edge Function met vision-model, vast JSON-schema (gebouwd en getest op alles behalve de modelaanroep zelf: wacht op `GEMINI_API_KEY`-secret)
- [x] Kleuren + aftekening + oorvorm toepassen op het model (`src/dog/analysis.ts`, met tests)
- [x] Handmatig bijstellen (kleurkiezer, oren, staart, aftekening, snuit, bouw, naam) in het paneel "Maak Max na"
- [x] Middel- en klein-basismodel toevoegen (drie lichaamssjablonen in `appearance.ts`; zelfde stijl en animaties)
- [x] Korte vragenlijst voor karakter (energie, speelsheid, knuffelig, eigenwijs, speeltje, aaiplek); energie en knuffelig beïnvloeden de daalsnelheid, de aaiplek geeft bonus

**Klaar als:** 8 van de 10 testfoto's van verschillende honden een herkenbare avatar opleveren zonder handmatige correctie.

### Fase 4 – Spelen en groeien

- [ ] Bal gooien met swipe (simpele fysica)
- [ ] Trucjes leren met vaardigheidspercentage
- [ ] XP, levels, ontgrendelbare items en omgevingen
- [ ] Dagelijkse streak

**Klaar als:** een testgebruiker na een week nog dagelijks terugkomt omdat er iets nieuws te ontgrendelen is.

### Fase 5 – Chaos en delen

- [ ] Systeem voor willekeurige events + de eerste 5 events
- [ ] Web Push met Supabase Cron, stille uren, maximaal 2 per dag
- [ ] Clip/screenshot delen
- [ ] Op bezoek bij een vriend via een link
- [ ] Optioneel: video-analyse voor karakter

**Klaar als:** testers spontaan een moment delen.

## Werken met Claude Code

Zet dit plan in de repo als `docs/PLAN.md` (exporteer dit document als Markdown) en laat Claude Code één fase tegelijk bouwen.

### Werkwijze

1. Maak een lege map en een GitHub-repo, open Claude Code in die map.
2. Plak de startprompt hieronder.
3. Laat Claude Code eerst een plan voor fase 1 maken; keur het goed of stuur bij.
4. Test na elke taak op je eigen telefoon (via het lokale netwerkadres of een Vercel-preview).
5. Commit per afgeronde taak; vink de taak hier af.

### Startprompt

```text
We bouwen een mobile-first PWA: een 3D Tamagotchi van je eigen hond.
Het volledige plan staat in docs/PLAN.md. Lees dat eerst.

We beginnen met Fase 1 (lokaal, geen backend).
Stack: Vite + React + TypeScript, Tailwind, React Three Fiber + drei, Zustand.

Maak eerst een kort plan voor Fase 1 en wacht op mijn akkoord.
Maak daarna een CLAUDE.md met de projectregels hieronder.
Werk taak voor taak, en vertel na elke taak hoe ik het op mijn telefoon test.
```

### Inhoud voor CLAUDE.md

```markdown
# Virtuele Hond

- Mobile-first: ontwerp voor staand scherm, 375–430 px breed, duimbereik onderin.
- Taal van de UI: Nederlands. Code en commentaar: Engels.
- 3D: React Three Fiber + drei. Modellen als GLB in /public/models, max 3 MB.
- Performance: doel 60 fps op een middenklasse telefoon; geen zware post-processing.
- Meters: sla waarde + tijdstip op, bereken de huidige waarde bij openen. Geen timers op de server.
- De hond gaat nooit dood. Verwaarlozing = grappig gedrag, geen straf.
- Geheimen (API-sleutels) alleen in Supabase Edge Function secrets, nooit in de frontend.
- Elke Supabase-tabel heeft RLS aan.
- Houd docs/PLAN.md bij: vink afgeronde taken af.
```

## Open vragen en risico's

### Open vragen

- [ ] Naam en branding van de app
- [ ] Verdienmodel: gratis met cosmetische extra's, eenmalige premium, of eerst alleen gratis?
- [ ] Alleen honden, of later ook katten en andere huisdieren?
- [ ] Moet het in Nederlands én Engels?

### Risico's

| Risico | Gevolg | Aanpak |
| --- | --- | --- |
| Avatar lijkt niet op de echte hond | Kern van het concept valt weg | Handmatig bijstellen + meerdere basismodellen; vroeg testen met echte foto's |
| 3D te zwaar voor oudere telefoons | Haperen, afhaken | Prestatiebudget uit 3D-aanpak, testen op een oud toestel |
| Push op iPhone werkt alleen na installatie | Minder terugkomers op iOS | Sterke installatie-onboarding; app ook zonder push leuk maken |
| Licentie van gekochte/gratis modellen | Juridisch probleem bij publicatie | Alleen CC0 of commercieel licentievrij; vastleggen in ASSETS.md |
| Kosten AI-analyse per upload | Kosten lopen op bij groei | Analyse één keer per hond, resultaat opslaan; limiet op uploads |
| Privacy van foto's en video's | AVG-verplichtingen | Privé bucket, alleen eigen toegang, verwijderknop, korte privacyverklaring |
