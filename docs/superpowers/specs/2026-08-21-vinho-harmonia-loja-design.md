# Vinho & Harmonia — Loja online (design)

Data: 2026-08-21

## Contexto e origem

O pedido original foi colado a partir de um template genérico de "site de pedidos
para delivery de bebidas" (linguagem de fardo/unidade, cross-sell de gelo/energético/
carvão, WhatsApp como canal de fechamento, tema visual "noturno gelado"). Esse
template tem conflitos internos com o produto real (loja de vinhos, sem WhatsApp,
sem fardo) e com a premissa de "um único `index.html` sem backend" ao mesmo tempo
que pede integração real com Mercado Pago, Melhor Envio e armazenamento de pedidos.
As decisões abaixo resolvem esses conflitos com base nas respostas do usuário.

## Decisões confirmadas com o usuário

1. **Arquitetura:** site + backend leve na própria Vercel (Serverless Functions),
   não um HTML 100% estático. Frontend continua sem framework/build (HTML/CSS/JS
   puro); só o backend usa `package.json` e depende de Node.
2. **Armazenamento de pedidos:** Vercel Postgres.
3. **Fardo/unidade:** removido. Catálogo vendido só por unidade (garrafa).
4. **Cross-sell / "leve junto":** sugere outros vinhos do catálogo (por uva/país
   parecidos), não acessórios fictícios.
5. **Tema visual:** vinho + dourado/prata sobre fundo escuro elegante — não o tema
   "azul gelo noturno" do template original.
6. **Sem WhatsApp.** O fechamento do pedido é 100% pelo site:
   - Cliente: tela de confirmação no site com número do pedido e resumo completo.
   - Loja: painel `/admin` (senha única via env var) listando pedidos do Postgres.
7. **Gate de idade:** modal "18 anos ou mais?" na entrada do site, além do aviso
   fixo no rodapé e no checkout. Guardado em `localStorage` para não repetir.
8. **Horário:** loja sempre aberta — sem lógica de "aberto agora" condicional.
9. **Chave PIX:** `contato@vinhoeharmnia.com.br` (grafia informada pelo usuário —
   **confirmar antes do deploy final**, pois pode ser erro de digitação de
   "vinhoharmonia").
10. **Credenciais Mercado Pago / Melhor Envio / endereço da loja:** ainda não
    disponíveis. O sistema precisa funcionar sem elas (ver "Modo sem chaves"
    abaixo) e usar placeholders documentados em `.env.example`.
11. **Slogan:** não fornecido — usar um padrão em português coerente com
    curadoria de vinhos (ex.: "o vinho certo para cada momento").

## Escopo desta v1 (fora de escopo, registrado para depois)

Fora de escopo: múltiplas categorias reais de vinho (só há "Tinto" na planilha
atual, mas a navegação por abas fica pronta no código para quando houver mais),
notificação por e-mail de novo pedido, múltiplos logins de admin, webhook de
rastreio de entrega, edição de catálogo pela UI (catálogo é um array `MENU` no
código, editado manualmente).

## Estrutura do projeto

```
/index.html            loja: catálogo, carrinho, checkout
/admin.html             painel de pedidos (senha única)
/manifest.json, /sw.js  PWA
/icons/                 ícones 192/512
/img/                   fotos dos vinhos (otimizadas)
/api/
  create-payment.js      cria preferência de pagamento no Mercado Pago (Checkout Pro)
  freight-quote.js        cota frete no Melhor Envio, com fallback local
  orders.js                POST cria pedido; GET (autenticado) lista pedidos
  mp-webhook.js             recebe notificação de pagamento do Mercado Pago
/lib/
  db.js                    conexão com Vercel Postgres + query helpers
  auth.js                  checagem de senha do admin (cookie assinado simples)
package.json              dependências das functions
.env.example                variáveis a configurar (ver abaixo)
docs/superpowers/specs/…    este documento
```

O frontend (`index.html`, `admin.html`) continua HTML/CSS/JS puro, sem bundler.
Só as functions em `/api` precisam de `package.json`/`npm install` — é o mínimo
necessário para não expor tokens secretos no navegador e para persistir pedidos.

## Modo "sem chaves ainda"

Como as credenciais do Mercado Pago e do Melhor Envio, e o endereço/CEP de
origem da loja, ainda não foram fornecidos, o sistema deve continuar operável
sem eles:

- **Frete:** se `MELHOR_ENVIO_TOKEN` ou `MELHOR_ENVIO_CEP_ORIGEM` não estiverem
  configurados, `/api/freight-quote` cai para uma regra local simples: grátis
  acima de R$150, taxa fixa (ex.: R$15) abaixo disso. Quando as envs existirem,
  usa a cotação real da API do Melhor Envio, mantendo a regra de frete grátis
  acima de R$150 por cima do valor cotado.
- **Pagamento:** PIX funciona desde o primeiro dia (mostra a chave configurada
  com QR/copia-e-cola). Cartão via Mercado Pago fica visível na UI, mas se
  `MP_ACCESS_TOKEN` não estiver configurado, o botão mostra "pagamento por
  cartão em configuração" em vez de tentar criar uma preferência que vai falhar.
- **Endereço da loja:** placeholder claramente marcado no código
  (`ENDERECO_LOJA`, `CEP_ORIGEM`) fácil de substituir depois.

## Catálogo (fonte: `Planilha_Produto.xlsx`)

20 vinhos tintos, todos com foto correspondente em `/img`. Campos: nome, categoria
(hoje só "Tinto"), preço (BRL), país, uva. Duas correspondências de foto foram
inferidas por marca/estilo em vez de nome exato e precisam de confirmação visual
antes de publicar:

- `VESCOVO ROSSO.jpg` → **Rosso Toscana Igt Rifugio Del Vescovo**
- `MioloPinotNoir.jpg` → **SINGLE VINEYARD Pinot Noir** (Brasil, Miolo)

As outras 18 fotos batem por nome quase exato com o vinho correspondente.

## Fluxo do site

1. **Entrada:** modal de confirmação de idade (18+) antes de liberar o catálogo.
2. **Catálogo:** abas de categoria fixas no topo (scrollspy) — hoje só "Tinto"
   aparece, estrutura pronta para mais categorias. Card com foto, nome, país/uva,
   preço, +/− de quantidade. Clique abre modal: foto grande, descrição, campo de
   observação livre, quantidade, e "Harmoniza bem com" (1-2 outros vinhos do
   catálogo com uva/país parecidos).
3. **Carrinho:** botão flutuante com contador + total. Barra de progresso "Faltam
   R$X para frete grátis" até R$150; ao atingir, "Você ganhou entrega grátis!".
   Lista de itens com quantidade, observação e subtotal por linha.
4. **Checkout (bottom sheet, painel rolável, botão de enviar sempre visível —
   ver seção CSS abaixo):**
   - Entrega ou retirada no balcão.
   - Se entrega: CEP → chama `/api/freight-quote`, preenche endereço via CEP.
   - Dados obrigatórios: nome completo, data de nascimento (bloqueia <18),
     endereço completo (rua, número, complemento, CEP, bairro, cidade, estado),
     CPF, celular, e-mail.
   - Cupom de desconto, validado no JS (ex.: `PRIMEIRA10` = 10%).
   - Forma de pagamento: PIX (chave copia-e-cola/QR) ou Cartão (Mercado Pago
     Checkout Pro — redireciona para o checkout hospedado do Mercado Pago).
   - Resumo: subtotal, desconto, frete, total.
5. **Envio:** `POST /api/orders` grava no Postgres; resposta traz um número de
   pedido. Site mostra tela de confirmação com esse número e o resumo completo.
   Último pedido salvo em `localStorage` para o botão "🔁 Repetir último pedido"
   e para pré-preencher nome/telefone na próxima visita.
6. **Aviso de idade:** "Venda proibida para menores de 18 anos" visível no
   rodapé e repetido no checkout.

## Painel `/admin`

- Tela de login com campo de senha única, comparada contra `ADMIN_PASSWORD`
  (env var) no backend; sessão via cookie assinado simples (sem cadastro de
  usuários).
- Lista pedidos mais recentes primeiro: dados do cliente, itens, valores, status
  (novo/pago/entregue). Atualização de status é uma ação simples na própria
  linha (chama `/api/orders` com PATCH ou similar).

## Extras mantidos do briefing original

- PWA instalável (`manifest.json` + `sw.js`, ícones 192/512, barrinha "Instale no
  seu celular" só em mobile via `matchMedia`).
- SEO/compartilhamento: `<title>`, meta description, Open Graph com imagem
  absoluta, favicon, JSON-LD `LiquorStore`.
- Deep link `?item=coragem-reserva` abre o modal do produto direto.
- Seção "Sobre" curta.

## Visual

Tema escuro elegante: fundo grafite/bordô bem escuro, cartões um tom acima,
acentos em bordô/vinho e dourado, detalhes prata, texto claro. Tipografia
display forte (Anton) em títulos + Inter no corpo. Fotos com cantos arredondados
e sombra suave — sensação de curadoria premium.

## CSS crítico do checkout (evitar bug de botão fora da tela)

```css
.sh-body { flex: 0 1 auto; min-height: 0; overflow-y: auto; max-height: 34vh; }
.sh-foot { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.sh-foot .btn-enviar { position: sticky; bottom: 0; }
```

Testar sempre: abrir carrinho → escolher entrega → conferir que o botão de
enviar continua visível.

## Variáveis de ambiente (`.env.example`)

```
POSTGRES_URL=              # preenchido automaticamente pela integração Vercel Postgres
MP_ACCESS_TOKEN=           # token do Mercado Pago (Checkout Pro) — pegar depois
MELHOR_ENVIO_TOKEN=        # token da API do Melhor Envio — pegar depois
MELHOR_ENVIO_CEP_ORIGEM=   # CEP de origem da loja — pegar depois
ADMIN_PASSWORD=            # senha do painel /admin
PIX_KEY=contato@vinhoeharmnia.com.br   # confirmar grafia antes do deploy
```

## Deploy

1. Repositório Git local (criado nesta sessão) → push para o GitHub.
2. Import do repositório na Vercel; adicionar a integração Vercel Postgres ao
   projeto (cria `POSTGRES_URL` automaticamente).
3. Configurar as demais env vars no painel da Vercel; redeploy.
