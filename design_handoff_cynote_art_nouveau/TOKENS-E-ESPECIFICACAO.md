# Cynote — Tokens e especificação (Art Nouveau × Solarpunk)

Protótipos de referência (todos com as mesmas variáveis, prontas para copiar):
- `Cynote Desktop.dc.html` — janela principal
- `Cynote Dashboard.dc.html` — Dashnotes (navegador de notas)
- `Cynote Mobile.dc.html` — Android
- `Cynote Bandeja e Icones.dc.html` — bandeja, ícone do app e folha de ícones
- Pasta `icons/` — todos os SVGs (16 × 16, `currentColor`) + ícones da bandeja + `icone-do-app.png`

## 1. Cores

| Token | Dia (estufa de manhã) | Noite (estufa à noite) | Uso |
|---|---|---|---|
| `--wall` | `#E4DECB` | `#070F0C` | Fundo da demo (fora da janela) |
| `--frame` | `#37604F` | `#10211A` | Ferro verdete: cabeçalho, barra de guias, status, barra de busca |
| `--frame-2` | `#274A3C` | `#0A1712` | Ferro escuro: ícone sobre dourado ativo, miolo da flor |
| `--frame-ink` | `#F3EBD3` | `#EADFC2` | Texto/ícones sobre o ferro |
| `--frame-ink-soft` | `#C3D3BC` | `#91A58E` | Texto secundário no ferro (status) |
| `--gold` | `#C9A04E` | `#E2B85C` | Ornamentos, ativo, pontos, anel de foco |
| `--gold-line` | `rgba(226,190,110,.55)` | `rgba(226,184,92,.55)` | Filetes e bordas de medalhões |
| `--gold-soft` | `rgba(226,190,110,.22)` | `rgba(226,184,92,.18)` | Hover no ferro, halo de foco |
| `--glow` | `rgba(240,200,110,.45)` | `rgba(236,190,90,.55)` | Luz de vitral / lampião |
| `--paper` | `#FBF6E9` | `#15251E` | Página da nota, menus, diálogos |
| `--paper-2` | `#F2EAD5` | `#1B2E26` | Hover em superfícies de papel, tela de desenho |
| `--rule` | `#DCCDA6` | `#2F4A3D` | Filete interno da página, divisores |
| `--ink` | `#2A2A22` | `#E9E2CC` | Corpo do texto |
| `--ink-soft` | `#645F4C` | `#AEB49E` | Descrições |
| `--ink-faint` | `#9C957C` | `#6F7F6D` | Atalhos, placeholders decorativos |
| `--accent` | `#3D7A4C` | `#86B96F` | Verde-folha: botão primário, interruptor ligado |
| `--accent-ink` | `#FFFDF4` | `#0E1C16` | Texto sobre accent |
| `--petrol` | `#2E6470` | `#7FC2CA` | Cursores extras |
| `--selection` | `rgba(214,170,76,.34)` | `rgba(226,184,92,.28)` | Seleção principal |
| `--extra-sel` | `rgba(46,100,112,.20)` | `rgba(127,194,202,.24)` | Seleções extras (multicursor) |
| `--match` | `rgba(143,184,120,.40)` | `rgba(134,185,111,.30)` | Todos os resultados de busca |
| `--match-cur` / `-ring` | `#EBC46C` / `#B8893A` | `rgba(226,184,92,.72)` / `#E2B85C` | Resultado atual (fundo + contorno 1px) |
| `--cursor` | `#2A2A22` | `#F2E7C8` | Cursor principal |
| `--danger` | `#A8483A` | `#E58A74` | Ações destrutivas sobre papel |
| `--alert` | `#F5B9A8` | `#F2A08C` | "Sem resultados", erro de sync (sobre o ferro) |
| `--lead` | `#1C3027` | `#040A08` | Chumbo do vitral (contorno das guias) |
| `--shadow` | `rgba(38,52,32,.30)` | `rgba(0,0,0,.55)` | Sombras |
| `--scrim` | `rgba(28,44,34,.38)` | `rgba(2,8,6,.55)` | Fundo de modal |
| `--field` / `--field-border` / `--field-ink` | `#FFFDF6` / `#CFBF97` / `#2A2A22` | `#0E1D17` / `#39584A` / `#E9E2CC` | Campos de texto |

**Vidros das guias** (rotacionam por guia, `hue % 4`):
Dia `#A9CB8F` sálvia · `#E3B45A` âmbar · `#7FB2B8` petróleo · `#9AAAD0` cobalto
Noite `#8CC474` · `#E5A945` · `#62A7B0` · `#8397C9`
- Ativa: vidro 100% + brilho `linear-gradient(180deg, rgba(255,255,255,.42) 0, transparent 52%)` + halo radial creme no topo; texto `#1B261F`; `box-shadow: 0 0 16px var(--glow)`.
- Inativa: `color-mix(in oklab, VIDRO 34%, transparent)` sobre o ferro; texto `--frame-ink`. Hover: 52%.

**Paleta de desenho:** Verde-folha `#4E8A4A` · Azul-petróleo `#2E6F7C` · Terracota `#A65A3A` · Âmbar `#C98A2E`.

## 2. Tipografia (todas OFL / Google Fonts)

| Papel | Fonte | Tamanho / altura | Peso |
|---|---|---|---|
| Logo, títulos, títulos de seção | **Marcellus** | Logo 15 / .1em tracking · Título de tela 22 · Diálogo 19 · Seção 15.5 | 400 |
| Corpo da nota | **Literata** (opsz auto) | 15 px / 1.65 · Modo leitura 18 px / 1.95, coluna ≈ 640 px · zoom multiplica o tamanho (60–200%) | 400 |
| Texto de diálogo, estados vazios (itálico) | Literata | 14 / 1.55 · 13.5 itálico | 400 |
| Interface miúda | **Jost** | Guias 12.5 · Botões 12.5–13 · Status 11.5 (tabular-nums) · Rótulos caps 10.5–11, tracking .08–.1em | 400 / 500 (ativo e primários) / 600 (Aa) |
| Código de pareamento, atalhos | **JetBrains Mono** | 12.5–13 (código) · 10.5 (atalhos) | 400 |

## 3. Espaçamento, raios, bordas

- Escala: 2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 22 · 30.
- Cabeçalho 48 px (arco sobe 10 px no centro; conteúdo nos 30 px de baixo). Barra de guias 36 px. Status 30 px. Moldura lateral de ferro 7 px.
- Página: padding 24 / 30 / 28 / 46 (compacta: 18 / 20 / 28 / 36). Margem clicável = padding esquerdo − 12 px.
- Raios: janela 16 (base), topo em arco; guia 9 9 0 0; barra de busca 14 14 10 10; menu 6 14 14 14 (o canto de origem é o reto); diálogo 22 22 16 16; campos 8–9; botões e segmentos 999 (pílula); medalhões 50%.
- Bordas: chumbo das guias 1.5 px `--lead`; filetes dourados 1 px `--gold-line`; filete interno da página 1 px `--rule` a 7 px da borda; vinhetas SVG de canto 22 px, traço 1.1.
- Medalhões: cabeçalho 28 px, janela 22 px, guias (todas/+) 24 px, halo de diálogo 62 px (anel duplo) com disco de 48 px.

## 4. Estados

- **Medalhão (cabeçalho):** repouso transparente + anel `--gold-line` · hover `--gold-soft` · ativo (menu/Note Styling/Configurações/Fixar abertos) fundo `--gold`, ícone `--frame-2`, `0 0 12px var(--glow)`. Fechar: hover `#B4533F`, ícone `#FFF6EE`.
- **Guia:** hover mostra alça (6 pontos) à esquerda e × à direita, esconde o ponto dourado de "não salvo". Arrastando: opacidade .5. Renomear: campo creme com contorno chumbo. Ativa ganha um botão dourado no topo (desabrocha).
- **Botões:** primário `--accent` / `--accent-ink`, hover `brightness(1.08)`; secundário borda `--field-border`; destrutivo texto `--danger`. Desabilitado: opacidade .45, cursor default.
- **Foco:** campos → borda `--gold` + `0 0 0 3px var(--gold-soft)`. Botões → mesmo anel (aplicar com `:focus-visible`).
- **Interruptor:** 40×22, ligado `--accent`, desligado `--paper-2`; botão 16 px creme com anel dourado.
- **Editor:** seleção `--selection`; cursores extras barra 2 px `--petrol` piscando (1.06 s, steps); seleções extras `--extra-sel`; busca `--match`, atual `--match-cur` + contorno. Margem: cursor de seta dourada apontando para a direita + folhinha verde indicando a linha.
- **Desenho colado:** hover → contorno tracejado dourado, mini-barra de ferro (editar/excluir) acima à direita, alça dourada de redimensionar 13 px no canto.
- **Sincronização (botão de flor):** *Sincronizado* broto aberto em três folhas douradas (se abre ao chegar) · *Sincronizando…* botão fechado pulsando · *Erro* botão murcho (tomba 38°) em `--alert`, texto "Erro de sincronização". Clique = salvar agora.
- **Busca:** "3 de 12" em `--frame-ink-soft`; "Sem resultados" em `--alert`. Aa ativo = fundo dourado.
- **Janela mínima (420×320):** some o nome "Cynote", as vinhetas do arco e dos cantos da página, "85 caracteres" e o rótulo de sync (fica só a flor); guias com mínimo 64 px; campo de busca 104 px.

## 5. Movimento

Curva padrão "crescer": `cubic-bezier(.3,.7,.2,1)`. Curva "subir": `cubic-bezier(.2,.8,.2,1)`. Nada abaixo de 180 ms nem acima de 900 ms (exceto loops ambientais).

| Momento | Animação | Duração / curva |
|---|---|---|
| Abrir menu | Painel cresce do canto de origem (scale .94→1, y 8→0) + vinha se desenha na lateral (stroke-dashoffset) + itens em cascata | 250 ms · vinha 550 ms · itens 250 ms, atraso 60 ms + 40 ms/item |
| Lista "todas as guias" | Igual ao menu, origem no canto superior direito | 250 ms, 35 ms/item |
| Guia ativa | Botão dourado desabrocha (scale .15→1.12→1, rotação −60°→0) | 450 ms crescer |
| Salvar / sincronizado | Flor desabrocha | 600 ms crescer |
| Sincronizando | Botão pulsa (scale .88↔1.04, opacidade .75↔1) | 1.2 s loop ease-in-out |
| Erro | Botão tomba 38° | 700 ms crescer, fica |
| Barra de busca | Sobe 6 px + fade | 280 ms subir; linha de substituir 220 ms |
| Configurações | Fade da tela; sublinhado do título se desenha; linhas em cascata | 300 ms · 900 ms · 50 ms/linha |
| Diálogo | Scrim fade 250 ms; placa cresce | 320 ms crescer |
| Atualizando | Barra verde cresce | 2.4 s `cubic-bezier(.4,.1,.3,1)` |
| Lampião do arco | Brilho respira | 4 s loop |
| Estado vazio | Broto balança ±3° | 6 s loop |
| Troca de tema | Cores de superfície | 500 ms ease |

Respeitar `prefers-reduced-motion`: manter só fades.

## 6. Ícones e logo

Arquivos em `icons/` — ver `Cynote Bandeja e Icones.dc.html` para a folha completa.

Todos em SVG 16×16, traço 1.4–1.8, pontas arredondadas, `currentColor` (ver o protótipo): menu (3 linhas desiguais) · Note Styling (pena) · Configurações (três controles deslizantes) · Fixar (alfinete) · minimizar · maximizar (**janela em arco**) · fechar · nova guia · todas as guias (chevron) · anterior/próximo · leitura (livro aberto) · editar · excluir · voltar.

Logo: medalhão de 24 px — anel dourado duplo sobre o ferro, "C" em Marcellus dourado e uma folha verde encostada no topo direito do C. Ícone do app / bandeja: usar o mesmo medalhão; em 16 px eliminar o anel interno e a folha (fica C dourado sobre disco verde, contorno escuro 1 px para ler em barras claras). "Piscar" da bandeja = alternar o disco para dourado com C verde.

## 7. Dashnotes (janela separada)

- Janela 880 × 600, mesmo cabeçalho em arco da janela principal (56 px), só com medalhão, "Dashnotes" e minimizar/maximizar/fechar.
- Barra de navegação no ferro, 44 px: Voltar (medalhão 30 px; desabilitado na raiz, opacidade .4) · breadcrumb em pílulas (Jost 13; atual `--frame-ink` 500, anteriores `--frame-ink-soft`; separador = losango dourado 8 px) · "Procurar de novo".
- **Pasta = janela de vitral**: mín. 128 px, raio 56 56 10 10, chumbo 1.5 px `--lead`, vidro da pasta a 88% sobre o papel + brilho superior; caixilhos em cruz (1.5 px) com medalhão de 22 px no cruzamento; placa de papel (mín. 50 px, cresce) na base com nome completo em até 2 linhas (Marcellus 14, nunca cortado) e contagem ("2 notas · 1 pasta", Jost 11). Hover: sobe 3 px + `0 0 22px var(--glow)` + brilho 1.07. Pressionado: scale .97.
- **Nota = folha**: `--paper-2`, raio 4 22 4 22, filete interno `--gold-soft`; folhinha 14 px colorida pela extensão (.cyte `--accent`, .md `--petrol`, .txt `--gold`), selo da extensão em JetBrains Mono 10.5; título Marcellus 15.5; prévia Literata 12.5, até 3 linhas.
- Grades: pastas `minmax(118px, 1fr)` gap 14; notas `minmax(190px, 1fr)` gap 14. Seções "Pastas"/"Notas" em Marcellus 15 + filete `--rule`.
- **Procurando notas…**: botão dourado pulsando + Literata itálico; 5 vitrais fantasma pulsando em cascata de 160 ms.
- **Pasta vazia**: broto balançando + "Pasta vazia" + "Notas salvas aqui aparecem sozinhas."
- Rodapé: caminho completo em JetBrains Mono 11 + "N itens". Entrada: pastas em cascata de 50 ms, notas continuam com 45 ms.

## 8. Bandeja do Windows

- Ícone 16 px (`icons/bandeja-16.svg`): disco `#37604F`, contorno 1 px `#1C3027` (lê em barra clara e escura), C monolinha dourado `#E2B85C`, traço 1.9. Em 32 px (`bandeja-32.svg`): anel interno + folhinha.
- **Alerta**: alterna com `bandeja-16-alerta.svg` (disco dourado, C verde-escuro) a cada 600 ms, `steps(1)`, até abrir o menu.
- Menu próprio (papel, borda `--gold-line`, raio 14 14 6 14 — canto reto aponta para o ícone): com pedido pendente, primeira linha destacada "Celular do Vini quer sincronizar" (abre o pareamento) · "Mostrar/Ocultar" (Ctrl+Shift+Space) · "Sair" em `--danger`. Cresce do canto inferior direito, 220 ms.
- Ícone do app: a logo final (`icons/icone-do-app.png`). Abaixo de 32 px usar os SVGs da bandeja.

## 9. Android

- Referência 390 × 844. **Todo alvo de toque ≥ 44 px.**
- **Cabeçalho**: ferro atrás da barra de status (34 px) + faixa de 60 px; borda inferior em arco que desce 14 px no centro, com filete `--gold-line` e lampião dourado (8 px, respirando 4 s) no ponto mais baixo. Botões = medalhões de 44 px.
- **Início (herbário)**: fundo `--paper-2` com pontilhado `--rule` 18 px; cartões `--paper`, raio 6 18 6 18, filete interno `--gold-soft`, bolinha de vidro 11 px, título Marcellus 17, horário Jost 12, prévia Literata 13.5 em 2 linhas. Hover/pressionar: sobe 2 px / scale .98. Cascata de 45 ms.
- **Botão +**: medalhão 66 px, ferro com anel dourado duplo e brilho; pressionado gira 90° e encolhe a .88.
- **Busca**: campo em pílula de 44 px; termo destacado no título (`--match-cur`) e na prévia (`--match`), recorte de ~30 caracteres antes do termo. Vazio: broto + "Nenhuma nota encontrada".
- **Editor**: título no cabeçalho (Marcellus 19, sublinhado dourado no foco); desfazer/refazer (desabilitados a .4); "Aa" abre a **folha de formatação** (sobe de baixo, 320 ms, raio 26 no topo, alça 40 × 4, vinha dourada, itens de 50 px: Lista com marcadores "— ", Lista numerada "1. ", Caixa de seleção "[ ] ", Inserir data e hora). Corpo Literata 16.5 / 1.7. Rodapé de ferro de 70 px com a pílula de sincronização (tocar = tentar de novo) e "N caracteres".
- **Sincronizar (primeira abertura)**: moldura em arco (raio 120 no topo) em `--rule`; medalhão 88 px com brilho; título Marcellus 26; computadores em cartões de raio 16 com "Conectar" de 44 px; "Continuar sem sincronizar" como link-botão.
- **Diálogos**: cartão até 318 px, botões em pílula de 44 px dividindo a largura; atualização mostra "Baixando a versão 0.1.24…" com barra verde.
