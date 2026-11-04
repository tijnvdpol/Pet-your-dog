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

## Commands

- `npm run dev -- --host` – dev server (open the network URL on a phone)
- `npm run build` – typecheck + production build
- `npm test` – unit tests (vitest)
- `npm run lint` / `npm run format`
