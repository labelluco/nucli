# Decisions tècniques

Una línia per decisió, la més recent a dalt: data — decisió — perquè.

- 2026-11-16 — Base comuna dels informes PDF a js/ui/informePdf.js (jsPDF 2.5.1 per CDN) — Anàlisi, Camp i Reg en repetien la mateixa base; les apps hi passaran quan es toquin, no de cop
- 2026-11-17 — ProveidorPolar en lloc de ProveidorLemonSqueezy: pagament web sense servidor propi (checkout de Polar + API pública de llicències activate/validate/deactivate, sense clau secreta); només accepta claus de la nostra organització i del benefit de l'app; 'auto' el tria a la web quan l'app passa `polar`, mai dins d'una app nativa — Lemon Squeezy tanca i no accepta botigues noves; Polar fa de venedor (IVA) i la seva API de llicències funciona igual des del navegador
- 2026-11-13 — La IA es pot fer servir per desenvolupar el nucli — el projecte de NLnet no està aprovat; si l'aproven, el nucli es refarà amb IA només en mode lectura
