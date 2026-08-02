# Cynote

**App de notas multiplataforma com sincronização local entre dispositivos, sem nuvem e sem conta.**

## O que é

Cynote é um app de notas com duas frentes conectadas: um widget flutuante para desktop (Windows) e um app mobile. As duas pontas guardam as mesmas notas e ficam sincronizadas automaticamente entre si — computador, notebook e celular — sem depender de um servidor na nuvem ou de login.

O projeto partiu de um handoff de design em alta fidelidade (HTML/CSS de referência) e foi implementado do zero como dois aplicativos nativos de verdade, não apenas um protótipo visual.

## O que ele faz

**Desktop ("Modo Bloquinho")**
- Painel flutuante sem moldura, redimensionável, com posição/tamanho lembrados entre sessões
- Múltiplas notas em abas, com reordenação por arraste e painel "todas as guias"
- Editor de texto simples (contentEditable) com contagem de caracteres, zoom e modo leitura
- Overlay de desenho livre (canvas) para inserir esboços na nota
- Ícone na bandeja do sistema, atalho global (Ctrl+Shift+N) e opção de fixar a janela sempre no topo
- Opção de verificação ortográfica, salvamento manual (Ctrl+S) e autosave

**Mobile**
- Tela inicial com lista de notas, busca com filtro em tempo real, editor e configurações
- Tema claro/escuro
- Tela de sincronização com o computador na primeira abertura

**Sincronização entre dispositivos**
- Descoberta automática de outros dispositivos na mesma rede via mDNS (Bonjour/Zeroconf)
- Pareamento com confirmação mútua (nenhum dispositivo é confiável até os dois lados aceitarem)
- Motor de sincronização peer-to-peer via HTTP local, sem servidor externo
- Algoritmo de merge que nunca sobrescreve silenciosamente: se a mesma nota for editada em dois aparelhos ao mesmo tempo, as duas versões são mantidas (uma delas rotulada com o nome do outro dispositivo), evitando duplicação infinita em ciclos repetidos

## Como foi feito

| Camada | Tecnologia |
|---|---|
| Desktop | **Tauri** (Rust) + **React** + **TypeScript** + Vite |
| Mobile | **Flutter** (Dart) |
| Rede/sincronização (desktop) | `mdns-sd`, `tiny_http`, `ureq` (Rust) |
| Rede/sincronização (mobile) | `bonsoir`, `dart:io HttpServer` |
| Persistência local | Arquivos JSON no disco (via comandos Tauri / `path_provider`) |
| Testes | `vitest` (desktop) e `flutter_test` (mobile) — testes unitários do algoritmo de merge e testes de interface |
| Design | Tokens de design (cores, tipografia, espaçamento) portados de um handoff em HTML/CSS; fontes Bricolage Grotesque e Manrope |

**Destaques técnicos:**
- Protocolo de sincronização próprio, implementado de forma equivalente em Rust e Dart, com descoberta de rede (mDNS), pareamento seguro por confirmação mútua e resolução de conflitos sem perda de dados
- Cobertura de testes específica para os cenários mais delicados do algoritmo de merge (evitar duplicação em eco, evitar re-fork no mesmo ciclo)
- Persistência de estado da janela (tamanho/posição) e das notas entre reinicializações
