# Bolão da Copa 2026

Aplicação web para palpites de vencedor ou empate nos jogos da Copa de 2026.

## Executar

Requer Node.js 18 ou superior:

```powershell
node server.js
```

Abra:

```text
http://localhost:3000/?email=pessoa@exemplo.com
```

O e-mail da URL é usado como chave dos palpites no arquivo `data/bets.json`.

## Regras implementadas

- Começa em Estados Unidos x Paraguai, na noite de 12 de junho.
- Jogos anteriores e Canadá x Bósnia foram removidos.
- Cada palpite de jogo trava no horário de início da partida.
- Especiais incluem campeão, vice, terceiro lugar e fase alcançada pelo Brasil.
- Especiais ficam disponíveis até `15/06/2026 23:59:59` no horário de Brasília.
- Depois de salvar os especiais, eles não podem mais ser alterados.

Antes de publicar, revise os horários das partidas em `public/app.js` conforme a grade oficial utilizada pela organização do bolão.
