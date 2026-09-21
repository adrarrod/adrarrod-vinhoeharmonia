# Como publicar o Vinho & Harmonia

## 1. Suba o código para o GitHub

    git remote add origin <url-do-seu-repositorio-no-github>
    git push -u origin master

## 2. Importe na Vercel

Em vercel.com → "Add New Project" → selecione este repositório. A Vercel detecta
automaticamente as funções em `/api`. Antes do primeiro deploy, adicione a
integração **Vercel Postgres** ao projeto (aba Storage) — ela cria a variável
`POSTGRES_URL` sozinha.

## 3. Configure as variáveis de ambiente

Em Project Settings → Environment Variables, adicione (veja `.env.example`):

- `ADMIN_PASSWORD` — senha do painel `/admin`.
- `ADMIN_SESSION_SECRET` — qualquer texto longo e aleatório.
- `PIX_KEY` — já vem como `contato@vinhoharmonia.com.br`, troque se mudar.
- `MP_ACCESS_TOKEN` — token do Mercado Pago (Checkout Pro). Sem ele, o
  pagamento por cartão fica "em configuração" e só PIX funciona — o site
  continua operando normalmente.

> ✅ Os dois pontos que bloqueavam o pagamento por cartão foram corrigidos:
> 1. `lib/handlers/payment.js` agora relê o pedido gravado no banco (só o `orderId`
>    vem do navegador) — o valor cobrado não pode mais ser manipulado pelo cliente.
> 2. O retorno do Mercado Pago (`?pedido=X&pagamento=sucesso|falha|pendente`) é
>    tratado em `js/store.js`: a confirmação aparece e o carrinho é limpo.
>
> ⚠️ **`SITE_URL` precisa ser a URL pública em https.** O Mercado Pago recusa a
> criação da preferência (`400 auto_return invalid. back_url.success must be
> defined`) quando as `back_urls` apontam para `http://localhost`. Em produção,
> com a URL da Vercel, a preferência é criada normalmente.

- `MP_WEBHOOK_SECRET` — chave secreta que confirma que uma notificação de
  pagamento realmente veio do Mercado Pago (sem ela, `/api/mp-webhook` ignora
  toda notificação em vez de processar sem verificar a origem — e sem
  processar as notificações, o `status` do pedido não muda sozinho para
  "pago"/"pagamento_recusado"). Para configurar:
  1. No painel do Mercado Pago, vá em **Suas integrações** → sua aplicação →
     **Webhooks** → **Configurar notificação**.
  2. Em **URL de produção**, informe `https://vinho-harmonia.vercel.app/api/mp-webhook`
     (troque pelo seu domínio se for diferente).
  3. Marque o evento **Pagamentos**.
  4. Salve e copie a **chave secreta** exibida — esse é o valor de `MP_WEBHOOK_SECRET`.
- `MELHOR_ENVIO_CLIENT_ID`, `MELHOR_ENVIO_CLIENT_SECRET`, `MELHOR_ENVIO_REDIRECT_URI`
  e `MELHOR_ENVIO_CEP_ORIGEM` — integração com o Melhor Envio. Sem elas (ou
  antes de conectar a conta), o frete usa a regra local (grátis a partir de
  R$150, R$15 fixo abaixo). Para configurar:
  1. Crie um app em **melhorenvio.com.br** → **Gerenciar** → **Meus Apps** →
     **Adicionar aplicação**. Anote o **Client ID** e o **Client Secret**.
  2. Em **Redirecionar para**, cadastre `https://vinho-harmonia.vercel.app/api/melhor-envio-callback`
     (troque pelo seu domínio se for diferente) — esse mesmo valor vai em
     `MELHOR_ENVIO_REDIRECT_URI`.
  3. Defina `MELHOR_ENVIO_CEP_ORIGEM` com o CEP de onde os pacotes saem.
  4. Faça o deploy com essas variáveis configuradas, entre em `/admin.html`
     com a senha do painel e clique em **"Conectar Melhor Envio"** na seção
     "Frete — Melhor Envio". Você será levado à tela de login do Melhor Envio
     — **essa etapa é pessoal e intransferível: só você deve digitar sua senha
     ali**, nunca compartilhe essa senha com ninguém, incluindo o assistente
     que te ajudou a montar o site. Depois de autorizar, o painel volta
     mostrando "Conectado ✅".
  5. O token de acesso dura 30 dias e é renovado automaticamente pelo site
     usando o token de renovação (válido por 45 dias) — nenhuma ação manual é
     necessária depois da primeira conexão, a menos que o token de renovação
     também expire (aí basta clicar em "Conectar Melhor Envio" de novo).
- `SITE_URL` — a URL final do site na Vercel (ex.: `https://vinho-harmonia.vercel.app`).

Depois de configurar, clique em "Redeploy".

## Antes de divulgar o site

O `index.html` sobe com alguns valores de exemplo que ficam **visíveis para o
público** (e para o Google) até serem trocados. Abra o arquivo e ajuste:

- **Cidade.** Procure por `[sua cidade]` — aparece no `<title>`, na
  `<meta name="description">`, nas descrições de Open Graph/Twitter e no JSON-LD.
  Troque todas as ocorrências pela cidade real de entrega.
- **Telefone e endereço no JSON-LD.** No bloco `<script type="application/ld+json">`
  (o `LiquorStore`), troque `"telephone": "+55 00 00000-0000"` e o `address` de
  exemplo (`"streetAddress": "Rua Exemplo, 000"`) pelos dados reais da loja. Esses
  campos alimentam a ficha do negócio na busca do Google.
- **Telefone e endereço no rodapé.** O mesmo endereço e telefone de exemplo também
  aparecem no rodapé visível da página — procure por `Rua Exemplo, 000` e
  `(00) 00000-0000`.
- **Domínio.** `https://vinho-harmonia.vercel.app` está escrito direto no HTML em
  cinco lugares: `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image` e,
  no JSON-LD, os campos `url` e `image`. Se o site for para outro domínio, troque
  todos (uma busca-e-substitui por `vinho-harmonia.vercel.app` resolve). URLs
  canônicas erradas atrapalham a indexação e quebram a prévia dos links no
  WhatsApp e nas redes sociais.
- **Chave PIX.** Confira se `contato@vinhoharmonia.com.br` em `js/store.js` é mesmo
  a chave que deve receber os pagamentos (veja a seção "Chave PIX" abaixo).

> ⚠️ **Depois de editar qualquer arquivo do app shell, incremente a versão do cache
> em `sw.js`.** O service worker serve esses arquivos do cache primeiro, sem
> revalidar — quem já visitou o site continua vendo a cidade, o telefone, o endereço,
> os preços e o domínio antigos até o nome do cache mudar. Troque
> `CACHE_NAME = 'vinho-harmonia-shell-v1'` para `'...-v2'`, depois `'...-v3'`, e assim
> por diante. Os arquivos cacheados são `index.html`, `css/styles.css`,
> `js/catalog.js`, `js/pricing.js` e `js/store.js` — a lista completa e atual está em
> `SHELL_ASSETS`, no topo do `sw.js`.

## Trocar o catálogo (produtos, preços, fotos)

O catálogo é o array `MENU` no topo de `js/catalog.js`. Cada vinho é um objeto
`{ slug, name, category, price, country, grape, image, description }`. Para
adicionar categorias novas (Branco, Rosé, Espumante), basta usar esses nomes no
campo `category` de novos itens — a navegação por abas já lê `Catalog.CATEGORIES`
automaticamente.

Para trocar fotos: coloque o arquivo novo em `img/`, aponte `image` para ele no
`js/catalog.js`, e rode `python3 scripts/optimize_images.py` de novo se quiser
que o script também otimize as novas fotos (ajuste o `SOURCE_MAP` no script).

> ⚠️ `js/catalog.js` e `js/pricing.js` fazem parte do app shell cacheado pelo service
> worker: depois de mexer em produtos, preços, fotos ou cupons, **incremente o
> `CACHE_NAME` em `sw.js`** — veja o aviso no fim da seção "Antes de divulgar o site".
> Sem isso, quem já visitou o site continua vendo preços e produtos antigos.

Uma observação sobre nomes de arquivo: a Vercel roda em Linux, que diferencia
maiúsculas de minúsculas. `img/Foto.jpg` e `img/foto.jpg` são arquivos diferentes lá
(no Windows, não) — o valor de `image` no catálogo precisa bater exatamente com o nome
do arquivo. O `npm test` verifica isso.

## Cupons

Editados em `COUPONS` dentro de `js/pricing.js` (hoje só `PRIMEIRA10` = 10%).

## Chave PIX

Como o site é um arquivo estático, a chave PIX fica escrita diretamente em
`js/store.js` (procure por `contato@vinhoharmonia.com.br`) em vez de vir de
uma variável de ambiente — troque direto lá se um dia mudar.
