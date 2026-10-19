-- Hash de la lógica de cada caso (plano, reglas, hechos y regla del crimen). Lo escribe `npm run publish-puzzle`.
-- Sirve para detectar que el JSON del caso cambió después de publicar su solución.
alter table public.cp_puzzles add column if not exists content_hash text;
