# SISMIA V9 · Vercel Rebuild

Reconstrucción limpia de SISMIA V9 para Vercel.

## Objetivo

- Mantener el frontend y la experiencia V9 sin reescribirla dentro de Next.js.
- Sustituir Netlify Functions por Vercel Functions bajo `/api`.
- Mantener EMSC + USGS, mapas MapLibre/OpenFreeMap, análisis, alert score, sensores iPhone, histórico y PWA.
- Evitar dependencias de build innecesarias.

## Backend persistente

Las rutas de comunidad, red de sensores y suscripciones Push tienen un fallback en memoria. Ese fallback es válido para pruebas, pero no garantiza persistencia entre invocaciones serverless. Para una red multiusuario y Push 24/7 real hay que conectar un almacén persistente (por ejemplo Vercel Blob/Redis) y un scheduler.

## Seguridad científica

SISMIA es experimental. El Alert Score no es una probabilidad certificada y no predice con fiabilidad simultánea hora, epicentro y magnitud. Para decisiones de seguridad se deben priorizar IGN, Protección Civil y alertas oficiales.
