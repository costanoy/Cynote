# Cynote — Briefing de redesign: Art Nouveau × Solarpunk

## O que é o Cynote

Um bloco de notas rápido para Windows, com app companheiro no Android. A ideia é ser o "bloquinho" sempre à mão: fica escondido na bandeja do Windows, aparece na hora com **Ctrl+Shift+Space**, pode ficar fixado por cima das outras janelas e sincroniza as notas com o celular (pela rede local ou pela internet, via código de pareamento).

Por baixo, é um editor de texto puro com recursos de editor de código (múltiplos cursores, localizar/substituir, atalhos de linha do VS Code), abas como no Notepad do Windows 11, e a possibilidade de desenhar e colar desenhos sobre a nota.

O app funciona bem — o que quero agora é **estética**. O visual atual é genérico (escuro, cantos arredondados, um acento laranja) e deve ser **totalmente substituído**. Não precisa manter nenhuma cor, fonte ou forma atual, nem o laranja da marca.

---

## Direção estética: Art Nouveau × Solarpunk

A **ornamentação orgânica do Art Nouveau** (1890–1910) com a **luz, o frescor e o otimismo do Solarpunk**. Um bloco de notas que parece uma estufa de vidro e ferro batido cheia de plantas, sob luz de sol — ou, no modo escuro, a mesma estufa à noite, com os ornamentos dourados acesos.

**Art Nouveau — o que pegar:**
- **Linhas "chicote"**: curvas longas e ondulantes inspiradas em caules, cipós, folhas, flores e cabelos. Nada de ângulo reto onde puder haver uma curva orgânica.
- **Molduras e arcos ornamentados**, como as entradas do metrô de Paris (Hector Guimard): ferro fundido verde, arcos de ramos, luminárias em forma de botão de flor.
- **Vitral**: painéis de vidro colorido com contorno escuro (chumbo), como as luminárias Tiffany — cores que brilham quando "acesas".
- **Cartazes de Alphonse Mucha**: composição emoldurada, halos circulares ornamentados, faixas decorativas, tipografia desenhada à mão.
- **Paleta de vitral**: verde-garrafa, verde-sálvia, âmbar, dourado envelhecido, azul-petróleo, rosa-antigo, creme de papel.

**Solarpunk — o que pegar:**
- **Luz**: dourado de sol, céu claro, sensação de manhã. É o que impede o Art Nouveau de ficar pesado ou "de museu".
- **Verde vivo**: plantas saudáveis, folhas novas, musgo.
- **Tecnologia e natureza convivendo**: a interface é moderna e funcional, só que "cresce" como uma planta.

**Como isso pode aparecer no Cynote (sugestões — fique à vontade para ir além):**
- A nota é uma **página emoldurada**: borda fina de ramos/folhas, com um **arco ornamentado** no topo (entrada do metrô de Paris), sem roubar espaço do texto.
- As **guias viram pequenos painéis de vitral**; a guia ativa "acende" (a luz passa pelo vidro).
- Os **botões** (fixar, configurações, fechar…) como pequenos medalhões ou botões de flor em ferro/dourado.
- **Salvar** faz uma folha ou flor **desabrochar**; o **indicador de sincronização** pode ser um botão de flor (fechado = sincronizando, aberto = sincronizado, murcho/vermelho = erro).
- **Modo claro**: papel creme, luz de manhã, verdes e dourados. **Modo escuro**: estufa à noite — vidro verde-escuro, ornamentos dourados levemente iluminados, como lampiões.
- A **tela de desenho** como um caderno de botânica / aquarela.
- O **Dashboard** (grade de pastas e notas) como um **jardim** ou uma parede de vitrais — cada pasta um painel.
- **Movimento**: coisas que **crescem e desabrocham** (vinhas que se desenham ao abrir um menu, folhas que se abrem), suaves e orgânicas — nunca bruscas.

**Referências para pesquisar:** Alphonse Mucha (cartazes), Hector Guimard (metrô de Paris), luminárias Tiffany, Casa Batlló (Gaudí), Victor Horta (Hôtel Tassel), William Morris (padrões florais), "solarpunk art", "solarpunk city", Studio Ghibli (a luz e o verde de *Nausicaä* / *O Castelo no Céu*).

**Cuidado:** ornamento é tempero, não o prato. O **texto da nota precisa continuar limpo e confortável** — os ornamentos vivem nas bordas, no cabeçalho, nos botões e nos momentos (salvar, abrir), nunca atrás ou em cima do texto.

---

## Restrições importantes

- **Janela pequena**: tamanho padrão **643 × 523 px**, mínimo **420 × 320 px**. Tudo precisa funcionar e ficar bonito pequeno. Pode ser maximizada.
- **Janela sem moldura do Windows**: não há barra de título do sistema — os botões **minimizar, maximizar e fechar** são desenhados pelo próprio app, assim como **fixar por cima**. A janela é transparente por trás, então o formato do "painel" (bordas, cantos) é livre.
- **Modo escuro e modo claro**: os dois precisam ser de primeira classe (dia na estufa × noite na estufa).
- **Legibilidade do texto da nota** vem antes de tudo: a estética pode ser ousada em volta, mas o corpo do texto precisa ser confortável para ler e escrever por horas.
- **Fontes**: precisam ser gratuitas e embutíveis no app (desktop e Android) — Google Fonts / licença OFL. Sugestões: para títulos e detalhes, algo com caráter Art Nouveau (ex.: *Federo*, *Marcellus*, *Cormorant*); para o **texto da nota**, uma serifa muito legível (ex.: *Lora*, *Literata*, *EB Garamond*); para a interface miúda (status, botões), uma fonte simples e legível em tamanho pequeno. Pode propor outras.
- **Ornamentos em SVG**, para escalar bem e poderem ser animados; eles precisam "encolher com elegância" na janela mínima de 420 × 320 (menos detalhe, não detalhe espremido).
- **Textos da interface em português** (os rótulos abaixo são os reais).
- **Não mudar funcionalidade**, só a aparência. Todos os itens abaixo precisam existir no novo design.

---

## Inventário completo — Desktop (Windows)

### Janela principal

**1. Cabeçalho**
- Logo do Cynote (pode ser redesenhado).
- Botão de **menu** que abre: *Salvar como…* (Ctrl+Shift+S), *Exportar como .txt*, *Localizar* (Ctrl+F), *Substituir* (Ctrl+H), *Ir para a linha* (Ctrl+G).
- Botão **Note Styling** (abre a tela de desenho) — tem estado ativo.
- Botão **Configurações** — tem estado ativo (enquanto as configurações estão abertas, fica destacado; clicar de novo fecha).
- Botão **Fixar janela** (fica por cima das outras) — tem estado ativo.
- **Minimizar, maximizar, fechar.** (Fechar esconde para a bandeja.)
- A área do cabeçalho serve para arrastar a janela.

**2. Barra de guias (abas)**
- Uma guia por nota aberta. A ativa se destaca.
- Cada guia pode ter um **ponto de "alterações não salvas"**.
- Ao passar o mouse: botão **fechar** e uma **alça para arrastar e reordenar**.
- Duplo clique renomeia (vira um campo de texto).
- A fileira rola horizontalmente quando há muitas guias.
- Botão **"todas as guias"** (abre lista; notas favoritas marcadas) e botão **"+" nova guia**.
- 💡 Sugestão: painéis de vitral — a guia ativa "acesa".

**3. Editor (a nota)**
- Texto puro, com quebra de linha automática.
- **Margem à esquerda** clicável: clicar seleciona/copia a linha inteira (aparece um cursor de seta customizado ao passar).
- **Múltiplos cursores** (estilo VS Code): além do cursor principal, desenhar **cursores extras** (barra piscando) e **seleções extras**.
- **Resultados de busca**: todos destacados + o **resultado atual** com destaque mais forte.
- **Cor da seleção** de texto.
- **Desenhos colados** flutuam sobre o texto; ao passar o mouse mostram mini-barra com *editar* e *excluir*, e uma alça de redimensionar no canto.
- **Modo leitura**: texto maior, mais espaçado.
- Estado vazio (nota nova, sem texto) — hoje é só um vazio; merece algo.

**4. Barra de localizar / substituir / ir para linha** (flutua no topo direito do editor)
- Linha 1: botão de expandir substituição · campo "Localizar" · botão **Aa** (diferenciar maiúsculas, com estado ativo) · status "**3 de 12**" ou "**Sem resultados**" (em cor de alerta) · anterior ↑ · próximo ↓ · fechar ×.
- Linha 2 (substituir): campo "Substituir por" · botões **Substituir** e **Tudo**.
- Modo "Ir para a linha": um campo "Ir para a linha (1–N)" + fechar.

**5. Barra de status (rodapé)**
- "**Ln 3, Col 26**" · "**85 caracteres**" · zoom **− 100% +** · botão **modo leitura** · **indicador de sincronização** (3 estados: *sincronizado*, *sincronizando*, *erro* — hoje é um pontinho colorido; clicar salva agora).
- 💡 Sugestão: o indicador de sincronização como botão de flor; o salvar como um pequeno desabrochar.

**6. Configurações** (substitui o editor enquanto aberta; tem botão **Voltar**)
- Título "Configurações".
- **Tema escuro** (interruptor liga/desliga) — "Ativa a interface escura do bloquinho".
- **Verificação ortográfica** (interruptor) — "Sublinhado vermelho embaixo de possíveis erros".
- **Iniciar com o Windows** (interruptor) — "Abre o Cynote em segundo plano ao ligar o computador, para o atalho Ctrl+Shift+Space estar sempre disponível".
- **Sincronização — Dispositivos na mesma rede**: lista de dispositivos já sincronizados (nome + "Sincronizado"), lista de dispositivos encontrados (nome + botão "Conectar" / "Conectando…"), ou "Procurando dispositivos…".
- **Sincronização pela internet**: se não configurada → botão "Gerar código" + "Ou cole um código gerado em outro dispositivo:" + campo "Código de pareamento" + botão "Conectar". Se configurada → caixa com o código (ex.: `4F2A9-C81D0-...`, fonte monoespaçada) + botão "Copiar"/"Copiado!" + "Digite esse código no outro dispositivo para conectá-lo" + link "Desativar sincronização pela internet".

**7. Tela de desenho ("Note Styling")** — sobreposição sobre a nota
- Área de desenho livre.
- Paleta de **4 cores** (hoje tons de laranja — pode redefinir) com a selecionada marcada.
- Botões **Limpar**, **Cancelar**, **Inserir no texto**.

**8. Diálogos (modais)**
- **Alterações não salvas** ao fechar guia / sair / atualizar: texto + *Salvar*, *Não salvar*, *Cancelar*.
- **Pareamento**: "Sincronizar dispositivo" · "Sincronizar com "Celular do Vini"?" · *Recusar* / *Aceitar*.
- **Atualização disponível**: "O Cynote 0.1.24 está disponível" · *Agora não* / *Atualizar* (e estado "instalando…").

**9. Menu "todas as guias"** (lista suspensa com as notas; favoritas marcadas; a atual destacada).

### Janela "Cynote Dashboard" (janela separada)
Navegador das notas salvas no computador (.cyte, .txt, .md), organizadas por pastas: cabeçalho com título, **breadcrumb** (caminho de pastas, clicável) e botão voltar, **grade** de pastas e notas, estado "Procurando notas…". Tem seus próprios botões minimizar/maximizar/fechar.
💡 Pode virar um jardim ou uma parede de vitrais — cada pasta um painel, cada nota uma folha/cartão.

### Bandeja do Windows
Ícone na bandeja (menu: *Mostrar/Ocultar*, *Sair*). O ícone "pisca" quando outro dispositivo pede para sincronizar. → Precisa de **ícone do app** e **ícone de bandeja** (16/32 px, legível em barra clara e escura).

---

## Inventário completo — Android (Flutter)

Mesmo produto, versão de bolso — a mesma estufa, no bolso.

1. **Tela de sincronização** (primeira abertura): logo, "Sincronize com seu computador", explicação, lista de computadores encontrados com "Conectar" (ou "Procurando dispositivos…" com indicador), link "Continuar sem sincronizar".
2. **Início**: título "Cynote", lista de notas (título, horário, prévia), botão de **busca**, botão de **configurações**, botão flutuante **+** (nova nota).
3. **Busca**: campo de busca, resultados filtrando ao digitar, estado "Nenhuma nota encontrada", voltar.
4. **Editor**: voltar, título editável, corpo, status de sincronização ("Sincronizado", "Sincronizando…", "Erro de sincronização"), desfazer/refazer, menu de formatação.
5. **Configurações**: tema escuro; **sincronização pela internet** (mesmos estados do desktop: gerar código / colar código + Conectar / mostrar código + Copiar + Desativar).
6. **Diálogos**: pedido de pareamento (*Recusar*/*Aceitar*) e atualização disponível (*Agora não*/*Atualizar*, "Baixando a versão…").

💡 Início = um "herbário": notas como cartões ou páginas emolduradas; o botão + como um botão de flor/medalhão.

---

## O que eu preciso receber de volta

Para eu (Claude, na conta principal) implementar fielmente:

1. **Protótipo navegável em HTML/CSS** da janela principal do desktop (editor com guias, barra de busca aberta, configurações), idealmente também do Dashboard e das telas do celular.
2. **Tokens de design**: todas as cores (escuro e claro), fontes e pesos/tamanhos, espaçamentos, raios de canto, espessuras de borda.
3. **Estados**: hover, ativo/pressionado, foco, desabilitado, seleção, cursores extras, destaques de busca, os 3 estados de sincronização.
4. **Movimento**: quais animações existem, duração e curva (ex.: "entrada em cascata, 250 ms, 40 ms entre itens").
5. **Ícones** (SVG) e **logo/ícone do app** novos, se mudarem.

Obrigado! 💜
