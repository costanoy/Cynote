# Vídeo do Cynote

Resultado: `out/cynote.mp4` — 45 s, 1920×1080, 30 fps, com a música e os 9 efeitos.

## Como refazer
1. `node render.js` — gera os 1350 quadros em `frames/` (cerca de 2,5 min). `node render.js 30 35` refaz só um trecho.
2. `node build.js` — junta quadros, música e efeitos em `out/cynote.mp4`.

Para ver um instante sem renderizar tudo: `node shot.js <pasta> 17.5 33.2` salva imagens desses segundos.

## Onde mexer
- `anim/anim.js` — a linha do tempo inteira. Cada quadro é calculado só a partir do tempo; os textos da nota, das guias, das legendas e do final estão no começo do arquivo e na lista `CAPTIONS`.
- `anim/anim.css` — o que não vem do app (fundo, teclas, celular, parede de vitrais, final). As telas usam os próprios `theme.css`, `styles.css` e `dashboard.css` do desktop.
- `build.js` — tempo e volume de cada efeito (lista `SFX`).

## Roteiro final (ajustado às batidas da música: 15, 25, 30, 35 e 40 s)
| Tempo | Cena |
|---|---|
| 0–5 s | A vinha desenha o arco, o lampião acende (3 s), o medalhão desabrocha |
| 5–10 s | "Uma ideia aparece." |
| 10–15 s | A tela escurece; Ctrl + Shift + Space pressionadas no silêncio de 14–15 s |
| 15–20 s | A janela cresce do arco (15 s), as guias acendem (16 s), o texto é digitado (17 s) |
| 20–30 s | Múltiplos cursores, busca (destaques em 25 s), desenho no Note Styling |
| 30–35 s | O celular entra (30 s), a vinha liga os dois, a flor desabrocha (32,5 s) |
| 35–37,5 s | O dia vira noite (35 s), os lampiões acendem |
| 37,5–40 s | Dashnotes, que vira uma parede de vitrais |
| 40–45 s | Tudo se recolhe no medalhão (40 s); "Cynote  notas que crescem." (sem travessão, nome em dourado) e "Windows e Android · grátis" |
