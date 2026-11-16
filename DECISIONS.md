# Decisions tècniques

Una línia per decisió, la més recent a dalt: data — decisió — perquè.

- 2026-11-16 — Base comuna dels informes PDF a js/ui/informePdf.js (jsPDF 2.5.1 per CDN) — Anàlisi, Camp i Reg en repetien la mateixa base; les apps hi passaran quan es toquin, no de cop
- 2026-11-14 — ProveidorLemonSqueezy: pagament web sense servidor propi (checkout + License API pública activate/validate, sense clau secreta); només accepta llicències de la botiga i dels productes configurats; 'auto' el tria a la web quan l'app passa `lemon`, mai dins d'una app nativa — les apps no tenen servidor i Google Play no permet cobrar fora de Play Billing
- 2026-11-13 — La IA es pot fer servir per desenvolupar el nucli — el projecte de NLnet no està aprovat; si l'aproven, el nucli es refarà amb IA només en mode lectura
