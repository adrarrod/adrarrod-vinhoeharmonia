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
`{ slug, name, category, price, country, grape, image, description, abv, pairings, initialStock }`. Para
adicionar categorias novas (Branco, Rosé, Espumante), basta usar esses nomes no
campo `category` de novos itens — a navegação por abas já lê `Catalog.CATEGORIES`
automaticamente.

Para trocar fotos: coloque o arquivo novo em `img/`, aponte `image` para ele no
`js/catalog.js`, e rode `python3 scripts/optimize_images.py` de novo se quiser
que o script também otimize as novas fotos (ajuste o `SOURCE_MAP` no script).

Os filtros **País** e **Uva** da home são montados sozinhos a partir dos campos
`country` e `grape` de cada vinho (o número entre parênteses é a quantidade de
vinhos). Por isso o valor desses campos precisa estar padronizado: "Itália" e
"italia" virariam duas opções diferentes, e um erro de digitação na planilha
(como "Aegentina") aparece como um país novo. Corte de uvas escrito com barra,
como `Pinot Grigio / Riesling`, é separado: o vinho aparece ao filtrar por
qualquer uma das duas.

> ⚠️ `js/catalog.js` e `js/pricing.js` fazem parte do app shell cacheado pelo service
> worker: depois de mexer em produtos, preços, fotos ou cupons, **incremente o
> `CACHE_NAME` em `sw.js`** — veja o aviso no fim da seção "Antes de divulgar o site".
> Sem isso, quem já visitou o site continua vendo preços e produtos antigos.

Uma observação sobre nomes de arquivo: a Vercel roda em Linux, que diferencia
maiúsculas de minúsculas. `img/Foto.jpg` e `img/foto.jpg` são arquivos diferentes lá
(no Windows, não) — o valor de `image` no catálogo precisa bater exatamente com o nome
do arquivo. O `npm test` verifica isso.

## Estoque

O cliente nunca consegue comprar mais garrafas do que existem. Como funciona:

- **Onde fica o estoque:** no banco (tabela `stock`). O campo `initialStock` de
  cada vinho em `js/catalog.js` (vindo da coluna *Estoque* da planilha) é só a
  **semente**: na primeira vez que o site roda, cada vinho recebe esse número.
  Depois disso o banco é a fonte de verdade — mudar `initialStock` no
  `catalog.js` **não** altera o estoque de um vinho que já existe. Vinho novo
  no catálogo é semeado automaticamente.
- **Baixa:** no momento em que o cliente envia o pedido, de forma atômica (dois
  clientes pedindo a última garrafa ao mesmo tempo: só um leva; o outro vê "Ops!
  Alguém levou antes de você" e o carrinho é ajustado). Se o pedido falhar ao
  ser gravado, as garrafas voltam sozinhas.
- **Vitrine:** vinho com estoque 0 aparece como "Esgotado", sem botão de compra;
  o carrinho respeita o limite de cada vinho.
- **Ajustar / repor:** em `/admin.html`, seção **Estoque** (digite a quantidade e
  clique em *Salvar*). É por aí que você atualiza o estoque, não pela planilha.
- **Pedido cancelado:** no card do pedido, botão **Cancelar pedido** — marca como
  "cancelado" e devolve as garrafas ao estoque (só na primeira vez).

Atenção: pedido em PIX que o cliente não pagar continua segurando as garrafas até
você cancelá-lo no painel; o mesmo vale para pedido com cartão recusado.

## Coleções com banner (ex.: Halloween)

O banner no alto da home (antes das Harmonizações) e a tela de sugestões que ele
abre vêm de `js/colecoes.js`. Clicar no banner abre `index.html#halloween`: a
própria home passa a mostrar só os vinhos da coleção, com carrinho, estoque,
popup e busca iguais aos da vitrine ("← Voltar à loja" ou o botão voltar do
navegador retornam). O link `index.html#halloween` também pode ser compartilhado.

Para criar uma coleção nova (Natal, Dia dos Namorados...):

1. Coloque dois recortes do banner em `colecoes-img/`: um largo para o computador
   (3:1, ex. 1600x533) e um mais fechado para o celular (2:1, ex. 960x480).
2. Em `js/colecoes.js`, acrescente um objeto a `COLLECTIONS` com `slug` (letras
   minúsculas, números e hífen — é o que aparece depois do `#`), `title`, `intro`,
   `ctaText`, `bannerAlt`, `bannerDesktop`, `bannerMobile`, `wines` (os `slug` dos
   vinhos, na ordem em que aparecem) e, se quiser, `until`.
3. Rode `npm test`: ele confere se todo vinho existe no catálogo, se as imagens
   existem e se nada sobrou na pasta.
4. Incremente o `CACHE_NAME` em `sw.js`.

**A coleção sai do ar sozinha.** `until` é o primeiro dia em que ela já NÃO
aparece (a do Halloween tem `until: '2026-11-01'`, ou seja, some no dia 1º de
novembro). Para estender, mude essa data; para deixá-la no ar sem prazo, apague a
linha `until`. Se um vinho da coleção for tirado do catálogo, o `npm test` falha
até você tirá-lo também de `wines`.

## Harmonizações (faixa da home e página de explicação)

A faixa "Harmonizações" da home (antes da lista de vinhos) e a página
`harmonizacao.html` leem os pratos de `js/harmonizacao.js`. Cada card da home leva
à seção do mesmo prato na página (`harmonizacao.html#slug`). Para acrescentar um
prato novo:

1. Coloque a foto em `harmonizacao-img/` (de preferência 960x600, horizontal,
   `.jpg`).
2. Em `js/harmonizacao.js`, acrescente um objeto ao fim de `TYPES` com `slug`
   (só letras minúsculas, números e hífen — é a âncora da página), `title`,
   `cardText` (até 180 caracteres), `intro` (até 600), `tips` (3 ou 4 dicas),
   `grapes` (uvas e estilos), `image` e `imageAlt`.
3. Rode `npm test` — ele confere os campos, os limites de texto e se toda foto
   existe na pasta, sem arquivo sobrando.
4. Incremente o `CACHE_NAME` em `sw.js`: `js/harmonizacao.js` faz parte do app
   shell cacheado (a página `harmonizacao.html` em si não é cacheada).

Assim como o blog, a página exige a confirmação de idade da home.

## Mini Blog (um tema novo por semana)

A página `blog.html` lê os posts de `js/blog.js`. Para publicar um tema novo:

1. Coloque a ilustração (de preferência 800x500, `.svg`, `.jpg` ou `.png`) na
   pasta `blog-img/`.
2. Em `js/blog.js`, acrescente um objeto **no início** de `POSTS` (o primeiro
   da lista aparece primeiro na página) com `slug`, `tag`, `title`, `summary`
   (texto curto, até 600 caracteres), `image` e `imageAlt` (descrição da
   imagem, para acessibilidade).
3. Rode `npm test` — ele confere se todo post tem imagem em `blog-img/` e se
   não sobrou arquivo sem uso na pasta.

O acesso ao blog exige a confirmação de idade da home: quem abre `blog.html`
direto, sem ter confirmado, é levado para a home primeiro. `blog.html` e
`js/blog.js` não ficam no cache do service worker, então não precisam de
troca de versão em `sw.js`; já o botão "Mini Blog" mora no `index.html`, que
precisa.

## Cupons

Editados em `COUPONS` dentro de `js/pricing.js` (hoje só `PRIMEIRA10` = 10%).

## Chave PIX

Como o site é um arquivo estático, a chave PIX fica escrita diretamente em
`js/store.js` (procure por `contato@vinhoharmonia.com.br`) em vez de vir de
uma variável de ambiente — troque direto lá se um dia mudar.
