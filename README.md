# Bolão da Copa 2026

Aplicação web para palpites de vencedor ou empate nos jogos da Copa de 2026.

## Executar

Requer Node.js 18 ou superior:

```powershell
node server.js
```

Abra:

```text
http://localhost:8077/
```

Os participantes acessam seus links individuais com token. A administração usa o token configurado em `data/admin.json`.

Para abrir diretamente a página administrativa, acesse:

```text
http://10.10.0.25:8077/admin
```

No servidor Linux, configure porta, endereço dos convites e token administrativo ao iniciar:

```bash
PORT=8077 \
APP_BASE_URL=http://10.10.0.25:8077 \
ADMIN_ACCESS_TOKEN=2f503736c316fa1b72d685d232967ed4b8890d93581f86c4 \
node server.js
```

O arquivo `data/admin.json` é ignorado pelo Git. Portanto, no servidor, copie esse arquivo manualmente ou configure `ADMIN_ACCESS_TOKEN`.

## Regras implementadas

- Começa em Estados Unidos x Paraguai, na noite de 12 de junho.
- Jogos anteriores e Canadá x Bósnia foram removidos.
- Cada palpite de jogo trava no horário de início da partida.
- Especiais incluem campeão, vice, terceiro lugar e fase alcançada pelo Brasil.
- Especiais ficam disponíveis até `15/06/2026 23:59:59` no horário de Brasília.
- Depois de salvar os especiais, eles não podem mais ser alterados.

Antes de publicar, revise os horários das partidas em `public/app.js` conforme a grade oficial utilizada pela organização do bolão.
