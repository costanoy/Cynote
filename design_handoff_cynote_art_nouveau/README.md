# Handoff: Cynote — redesign Art Nouveau × Solarpunk

## Visão geral
Redesign visual completo do **Cynote** (bloco de notas rápido para Windows + Android, com sincronização entre dispositivos). A estética: **estufa vitoriana de ferro e vidro** — molduras em ferro verdete, filetes e ornamentos dourados, guias como painéis de vitral, papel creme, e movimento que "cresce" (vinhas que se desenham, brotos que se abrem). Tom sóbrio e arquitetônico — **nada de flores/pétalas/rosa** (decisão explícita do cliente).

Superfícies cobertas:
1. **Janela principal (desktop)** — editor com guias, busca/substituir/ir para linha, multicursor, desenhos colados, Note Styling (tela de desenho), Configurações, menu, lista de guias, diálogos, barra de status com sincronização.
2. **Dashnotes** — janela separada que navega as notas salvas (.cyte/.txt/.md) por pastas. (Antigo "Cynote Dashboard" — **renomeado para Dashnotes**.)
3. **Android** — início (herbário de notas), busca, editor com folha de formatação, primeira sincronização, diálogos.
4. **Bandeja do Windows** + ícone do app + conjunto de ícones.

## Sobre os arquivos de design
Os arquivos em `prototipos/` são **referências de design feitas em HTML** — protótipos que mostram aparência e comportamento, **não código de produção para copiar**. A tarefa é **recriar esses designs no ambiente existente do Cynote** (o stack atual do app desktop e do app Android), usando os padrões e bibliotecas já estabelecidos no código. Se alguma parte ainda não tiver ambiente, escolha o framework mais adequado ao projeto.

Para abrir os protótipos: sirva a pasta `prototipos/` por HTTP (ex.: `npx serve prototipos`) e abra cada `.dc.html` no navegador. Cada um tem, no topo, uma **"bancada de demonstração"** (fora da janela) para alternar tema, tamanho e estados — ela não faz parte do app.

## Fidelidade
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, raios, estados e animações são finais. Recrie pixel a pixel. Todos os valores exatos estão em **`TOKENS-E-ESPECIFICACAO.md`** (fonte da verdade) e como variáveis CSS nos protótipos.

---

## Telas

### 1. Janela principal — `prototipos/Cynote Desktop.dc.html`
Tamanhos: padrão **643 × 523**, mínimo **420 × 320**, maximizada. Sem moldura nativa (frameless, arrastável pelo cabeçalho).

**Estrutura vertical:**
- **Cabeçalho em arco — 56 px.** Forma SVG: retângulo com cantos superiores de 11 px e um arco central que sobe 10 px (path em `viewBox 0 0 600 56`, `preserveAspectRatio="none"`), preenchido `--frame`. Filete dourado de 1 px (`--gold-line`) acompanhando o topo, `vector-effect: non-scaling-stroke`. Lampião: ponto dourado 7 px no ápice, `box-shadow` respirando (4 s). Conteúdo numa faixa de 30 px a 3 px da base (o filete **não pode encostar** nos botões — foi um ajuste pedido).
  - Esquerda: medalhão do logo 24 px (anel dourado duplo, "C" Marcellus 14 dourado, folhinha verde no topo direito) + "Cynote" (Marcellus 15, tracking .1em, `--frame-ink`; some na janela mínima) + botão Menu.
  - Direita: Note Styling (pena) · Configurações (3 sliders) · Fixar (alfinete) · divisor 1 px · Minimizar · Maximizar (janela em arco) · Fechar. Medalhões de 28 px (22 px nos 3 de janela), borda 1 px `--gold-line`.
- **Barra de guias — 36 px**, sobre o ferro. Guias = **painéis de vitral**: borda 1.5 px `--lead` (chumbo), sem borda inferior, raio 9 9 0 0, filete interno de 1 px a 3 px. Inativa 26 px de altura, vidro a 34% (hover 52%); **ativa 30 px**, vidro 100% + brilho + `0 0 16px var(--glow)` + botão dourado 7 px no topo que "desabrocha". Largura 84–168 px (mín. 64 na janela pequena). Padding esquerdo fixo 15 px (**o título não se move no hover**). Hover mostra alça de arrastar (6 pontos, posição absoluta a 6 px da esquerda, **sem sobrepor o filete**) e ×; ponto dourado = não salvo (escondido no hover). Duplo clique renomeia (campo papel, borda dourada, halo `--gold-soft`). Arrastar reordena. À direita: "todas as guias" (chevron) e "+" (24 px).
- **Página**: margem lateral 7 px do ferro, fundo `--paper`, filete `--rule` a 7 px da borda, vinhetas SVG de 22 px nos 4 cantos (somem na janela mínima). Texto em Literata 15/1.65, padding 24/30/28/46.
  - **Margem esquerda clicável** (largura = padding − 12): cursor de seta dourada; folhinha verde marca a linha sob o mouse; clique seleciona e copia a linha → toast "Linha copiada".
  - **Busca** flutuante no canto superior direito (painel de ferro, raio 14 14 10 10): expandir substituir (chevron gira 90°) · campo 150 px · "Aa" · "3 de 12" / "Sem resultados" (`--alert`) · anterior · próximo · fechar. Linha de substituir: campo + "Substituir" + "Tudo". Modo "Ir para a linha": campo único "Ir para a linha (1–N)".
  - Destaques: todos os resultados `--match`, atual `--match-cur` + contorno 1 px `--match-cur-ring`. Multicursor: barras 2 px `--petrol` piscando 1.06 s, seleções extras `--extra-sel`.
  - **Desenho colado**: imagem posicionada livremente; hover → contorno tracejado dourado, mini-barra (editar/excluir) acima, alça dourada 13 px de redimensionar.
  - Estado vazio: broto balançando + "Página em branco" + "Plante a primeira linha — o resto cresce."
- **Barra de status — 30 px**, Jost 11.5 tabular: "Ln X, Col Y" · "N caracteres" · zoom −/100%/+ (60–200%) · modo leitura (livro; corpo 18/1.95 em coluna ~640 px) · **botão de sincronização** (ver estados).

**Sobreposições:**
- **Menu** (botão ☰): papel, raio 6 14 14 14, vinha verde se desenhando na lateral, itens em cascata: Salvar como… (Ctrl+Shift+S) · Exportar como .txt · Localizar (Ctrl+F) · Substituir (Ctrl+H) · Ir para a linha (Ctrl+G).
- **Todas as guias**: lista com conta de vidro por guia, folha dourada = favorita, atual destacada.
- **Note Styling**: substitui a página; fundo `--paper-2` pontilhado; canvas à mão livre; paleta Verde-folha `#4E8A4A` · Azul-petróleo `#2E6F7C` · Terracota `#A65A3A` · Âmbar `#C98A2E`; Limpar · Cancelar · **Inserir no texto** (recorta o desenho pela caixa delimitadora + 8 px).
- **Configurações**: Voltar · título Marcellus 22 com sublinhado de vinha · interruptores (Tema escuro, Verificação ortográfica, Iniciar com o Windows) · Sincronização na rede (dispositivos sincronizados / encontrados com "Conectar" → "Conectando…" / "Procurando dispositivos…") · Sincronização pela internet (Gerar código → código em mono + Copiar/Copiado! + "Desativar"; ou colar código + Conectar, desabilitado se vazio).
- **Diálogos** (scrim + placa raio 22 22 16 16 com medalhão de 62 px no topo): *Alterações não salvas* (Cancelar / Não salvar [danger] / Salvar) · *Sincronizar dispositivo* (Recusar / Aceitar) · *Atualização disponível* (Agora não / Atualizar → barra de progresso 2.4 s).

### 2. Dashnotes — `prototipos/Cynote Dashboard.dc.html`
Janela 880 × 600, mesmo cabeçalho em arco, título **"Dashnotes"**, só minimizar/maximizar/fechar.
- Barra de navegação 44 px: Voltar (30 px, desabilitado na raiz) · breadcrumb clicável (separador losango dourado) · "Procurar de novo".
- **Pastas = janelas de vitral**: min 128 px, raio 56 56 10 10, chumbo 1.5 px, caixilhos em cruz, medalhão de 22 px; placa de papel na base com **nome completo** (até 2 linhas, nunca cortado) e contagem. Grade `minmax(118px,1fr)` gap 14.
- **Notas = folhas**: raio 4 22 4 22, folhinha por extensão (.cyte `--accent`, .md `--petrol`, .txt `--gold`), selo da extensão, título Marcellus 15.5, prévia 3 linhas. Grade `minmax(190px,1fr)` gap 14.
- Estados: *Procurando notas…* (vitrais fantasma pulsando) · *Pasta vazia* · carregado. Rodapé: caminho completo (mono) + "N itens".

### 3. Android — `prototipos/Cynote Mobile.dc.html`
Referência 390 × 844. **Alvos de toque ≥ 44 px.** Cabeçalho de ferro com borda inferior em arco (desce 14 px no centro) + lampião. Telas: Início (cartões-herbário + botão "+" 66 px), Busca (termo destacado), Editor (título editável, desfazer/refazer, folha de formatação "Aa", rodapé com sincronização), Primeira sincronização, Diálogos. Detalhes na seção 9 do arquivo de tokens.

### 4. Bandeja e ícones — `prototipos/Cynote Bandeja e Icones.dc.html`
Ícone 16/32 px, estado de alerta piscando (600 ms, `steps(1)`) quando outro dispositivo pede sincronização; menu próprio: [pedido pendente] · Mostrar/Ocultar (Ctrl+Shift+Space) · Sair.

---

## Interações e comportamento
- **Atalhos**: Ctrl+F localizar · Ctrl+H substituir · Ctrl+G ir para linha · Ctrl+S salvar · Ctrl+Shift+S salvar como · Ctrl+Shift+Space mostrar/ocultar (global) · Enter/Shift+Enter próximo/anterior na busca · Esc fecha na ordem: diálogo → menus → Note Styling → busca → multicursor.
- Fechar a janela **vai para a bandeja** (não encerra).
- Fechar guia com alterações → diálogo "Alterações não salvas". Fechar a última guia cria "Sem título".
- **Hover/clique em TODO clicável** (pedido explícito do cliente):
  - Medalhões: hover sobe 1 px + `0 0 0 1px var(--gold), 0 0 12px var(--glow)`; ativo `scale(.88)` + brilho .92.
  - Pílulas: hover sobe 1 px + sombra `0 4px 10px var(--shadow)`; ativo `scale(.95)`.
  - Itens de menu: hover desliza 3 px à direita + filete dourado interno de 2 px à esquerda; ativo `scale(.98)`.
  - Guias: hover brilho 1.08; ativo desce 1 px, brilho .92.
  - Cartões/pastas: hover sobe 3 px + glow; ativo `scale(.97)`.
  - Cores da paleta: hover `scale(1.18) rotate(-8deg)`; ativo `scale(.9)`.
  - Fechar janela: hover fundo `#B4533F`, ícone `#FFF6EE`.
  - Transição base: `background .2s, color .2s, border-color .2s, box-shadow .25s, filter .2s, transform .18s cubic-bezier(.3,.7,.2,1)`.
- **Sincronização (3 estados)**: *Sincronizado* — broto de 3 folhas douradas abrindo (600 ms) · *Sincronizando…* — botão pulsando (1.2 s loop) · *Erro de sincronização* — botão murcho, tomba 38°, cor `--alert`. Clique = salvar/tentar de novo.
- Animações completas (durações e curvas): seção 5 do arquivo de tokens. Respeitar `prefers-reduced-motion` (só fades).

## Estado
- Guias: `{id, title, text, dirty, fav, hue}` + ativa, renomeando, arrastando.
- Busca: `{open, mode: find|goto, replace, q, r, caseSensitive, idx}`.
- Multicursor: lista de cursores e seleções por guia.
- Desenhos por guia: `{id, src(PNG), x, y, w}` (posição em px do conteúdo, rola junto).
- Visão: editor | configurações; Note Styling aberto; diálogo atual.
- Sincronização: `ok | syncing | error`; dispositivos sincronizados/encontrados; internet on/off + código.
- Preferências: tema, ortografia, iniciar com o Windows, zoom, modo leitura, fixar janela.
- Dashnotes: caminho atual, carregando, árvore de pastas/notas do disco.

## Tokens de design
**Tudo em `TOKENS-E-ESPECIFICACAO.md`**: 32 variáveis de cor × 2 temas (Dia "estufa de manhã" / Noite "estufa à noite"), vidros das guias, tipografia, escala de espaçamento (2·4·6·8·10·12·14·16·18·22·30), raios, bordas, sombras, estados, movimento.

Resumo de cores (Dia / Noite): ferro `#37604F` / `#10211A` · dourado `#C9A04E` / `#E2B85C` · papel `#FBF6E9` / `#15251E` · tinta `#2A2A22` / `#E9E2CC` · verde-folha `#3D7A4C` / `#86B96F` · chumbo `#1C3027` / `#040A08`. Vidros (Dia): sálvia `#A9CB8F` · âmbar `#E3B45A` · petróleo `#7FB2B8` · cobalto `#9AAAD0`.

Fontes (Google Fonts, OFL): **Marcellus** (títulos/logo) · **Literata** (corpo das notas) · **Jost** (interface) · **JetBrains Mono** (código de pareamento, atalhos, caminhos).

## Assets
- `prototipos/icons/*.svg` — 27 ícones de interface, 16 × 16, traço 1.5, `currentColor`.
- `prototipos/icons/bandeja-16.svg`, `bandeja-32.svg` (+ `-alerta`) — ícones da bandeja.
- `prototipos/icons/icone-do-app.png` e `logo/` — logo final (gerada pelo cliente no Canva). **A logo não entra dentro do app**; dentro da interface usa-se o medalhão "C" descrito acima.
- Ornamentos (arco do cabeçalho, vinhetas dos cantos, vinhas, broto, flor da sincronização) são SVG inline nos protótipos — copiar os `path` de lá.

## Site de apresentação: `site/`
**Diferente dos protótipos, o site já é código final.** HTML, CSS e JS puro, sem framework, pronto para o GitHub Pages. Não recriar: só publicar.
- Publicar: copiar o conteúdo de `site/` para a pasta `docs/` do repositório (ou para a branch `gh-pages`) e ativar o GitHub Pages em Settings → Pages.
- Tema: começa pelo do sistema, lembra a escolha manual em `localStorage` (`cynote-tema`).
- Antes de publicar, conferir:
  1. Domínio: `cynote.cyberhat.com.br` (arquivo `CNAME` já incluso). No DNS, criar um registro CNAME `cynote` → `costanoy.github.io` e marcar "Enforce HTTPS" no GitHub Pages.
  2. Botões do Android apontam para `releases/latest`; se o nome do APK for fixo, apontar direto para `releases/latest/download/<nome>.apk`.
  3. Perguntas frequentes: conferidas com o PORTFOLIO.md (mDNS + HTTP local, peer-to-peer, pareamento com confirmação mútua, merge sem perda).

## Arquivos
- `README.md` — este documento
- `TOKENS-E-ESPECIFICACAO.md` — tokens, estados, movimento, specs por tela (fonte da verdade)
- `BRIEFING-ORIGINAL.md` — briefing do cliente (inventário funcional completo)
- `prototipos/Cynote Desktop.dc.html` — janela principal
- `prototipos/Cynote Dashboard.dc.html` — Dashnotes
- `prototipos/Cynote Mobile.dc.html` — Android
- `prototipos/Cynote Bandeja e Icones.dc.html` — bandeja, ícone do app, folha de ícones
- `prototipos/support.js` — runtime dos protótipos (necessário só para abri-los)
- `prototipos/icons/`, `logo/` — assets
- `site/` — site de apresentação e download (código final, pronto para publicar)
