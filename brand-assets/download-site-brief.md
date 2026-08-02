# Cynote — briefing para o site de download

## ⚠️ Importante: deixar claro em destaque no site
O Cynote está em **fase Beta**. O download é uma **versão de testes** — pode ter bugs, mudanças de comportamento entre versões, e os dados ainda não têm um caminho de migração garantido entre atualizações. Sugestão de texto para um banner/aviso na página:

> **Cynote está em Beta.** Você está baixando uma versão de testes do aplicativo — funcionalidades podem mudar e bugs podem acontecer. Recomendado para quem quer experimentar cedo e não para uso crítico do dia a dia ainda.

## Texto do produto (usar como base para a copy do site)
Ver `PORTFOLIO.md` na raiz do projeto — descrição completa do que é o app, o que ele faz (desktop + mobile + sincronização) e como foi feito.

Resumo curto (para hero/topo da página):
> Um notepad focado em produtividade e sincronização entre plataformas, com os documentos podendo ser acessados e editados facilmente entre computador e celular. Os dados não ficam salvos em um servidor e não é necessário criar conta. Roda nativamente no desktop (Tauri) e no mobile (Flutter).

## Assets inclusos nesta pasta (`brand-assets/`)
- `cynote-logo.svg` — logo vetorial (fundo transparente)
- `cynote-logo-256.png`, `cynote-logo-512.png`, `cynote-logo-1024.png` — logo em PNG, fundo transparente, várias resoluções
- `cynote-logo-on-dark-1024.png` — logo já montada num quadrado escuro (estilo ícone de app), pronta pra usar sem precisar montar fundo
- `color-palette.md` — todas as cores em hex (tema escuro, tema claro, cor de marca, cores de status)
- `color-palette-swatch.png` — a paleta acima em formato visual (quadradinhos de cor)

## Falta você adicionar: screenshots
Não consegui tirar prints do app com segurança nesta sessão (sem acesso confiável à tela). Sugiro capturar você mesmo, com os dois apps abertos:
1. Desktop — o painel "Modo Bloquinho" com uma nota aberta (mostra abas, texto, barra de status)
2. Desktop — o menu de Configurações aberto (mostra sincronização com dispositivos)
3. Mobile — a tela inicial com a lista de notas
4. Mobile — o editor de uma nota aberta

Windows: `Win+Shift+S` pra recortar só a janela do app.

## Estrutura sugerida pro Claude Design
1. Hero: nome + tagline curta + logo + aviso de Beta + botão de download
2. Seção "o que é" (resumo do PORTFOLIO.md)
3. Screenshots lado a lado (desktop + mobile)
4. Seção de destaques técnicos (sincronização local, sem conta, sem nuvem) — esse é o diferencial, vale destaque visual
5. Rodapé com aviso de Beta novamente + link/contato
