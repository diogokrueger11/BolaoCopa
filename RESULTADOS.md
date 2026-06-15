# Como atualizar o ranking

O ranking le os resultados oficiais em `data/results.json`.

Na pagina `/admin`, use o botao `Buscar resultados dos jogos` para consultar os
jogos finalizados e atualizar esse arquivo. A atualizacao e sempre manual e nao
altera `data/bets.json`, onde ficam as apostas dos usuarios.

Use o identificador do jogo e um dos valores `home`, `draw` ou `away`:

```json
{
  "D-USA-PAR": "home",
  "B-Catar-Suica": "draw"
}
```

Cada acerto de vencedor ou empate soma 3 pontos. Os palpites especiais ainda nao pontuam.

## Sincronizar funcionarios do Bitrix

Os funcionarios nao sao sincronizados automaticamente. O usuario administrador
`diogo.krueger@dcashcapital.com.br` possui um botao fixo para executar a sincronizacao.

Tambem e possivel sincronizar pelo terminal:

```powershell
node scripts/sync-bitrix.js
```

## Links individuais

O acesso aos palpites utiliza um token individual, sem expor o e-mail:

```text
http://localhost:8077/?token=TOKEN_INDIVIDUAL
```

O administrador pode abrir a tela `Links de acesso` pelo botao fixo exibido em seu acesso.
Para gerar tokens para registros antigos:

```powershell
node scripts/generate-tokens.js
```
