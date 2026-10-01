#!/usr/bin/env bash
# Hook "Stop" do Claude Code: ao fim de cada resposta, commita e envia
# para o GitHub qualquer mudança que ainda não tenha sido commitada.
cd "$(dirname "$0")/.." || exit 0
[ -z "$(git status --porcelain)" ] && exit 0
git add -A
git commit -q -m "Atualização automática ($(date '+%Y-%m-%d %H:%M'))

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || exit 0
git push -q origin main 2>&1 || echo '{"systemMessage":"Auto-commit feito, mas o push para o GitHub falhou."}'
exit 0
