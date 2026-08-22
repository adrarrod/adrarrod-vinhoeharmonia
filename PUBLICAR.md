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

> ⚠️ **Antes de configurar `MP_ACCESS_TOKEN` em produção**, dois pontos precisam ser
> resolvidos no código (hoje o pagamento por cartão está inerte, então isso não afeta
> a loja rodando só com PIX):
> 1. `lib/handlers/payment.js` cobra o valor que o NAVEGADOR envia, sem reler o pedido
>    gravado no banco — um cliente poderia manipular o valor cobrado.
> 2. O retorno do Mercado Pago (sucesso/falha/pendente) não é tratado pelo site — o
>    cliente volta sem confirmação e o carrinho não é limpo, risco de pedido duplicado.
>
> Só habilite pagamento por cartão depois de corrigir os dois pontos.

- `MELHOR_ENVIO_TOKEN` e `MELHOR_ENVIO_CEP_ORIGEM` — token e CEP de origem da
  loja no Melhor Envio. Sem eles, o frete usa a regra local (grátis acima de
  R$150, R$15 fixo abaixo).
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
- **Domínio.** `https://vinhoeharmonia.vercel.app` está escrito direto no HTML em
  cinco lugares: `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image` e,
  no JSON-LD, os campos `url` e `image`. Se o site for para outro domínio, troque
  todos (uma busca-e-substitui por `vinhoeharmonia.vercel.app` resolve). URLs
  canônicas erradas atrapalham a indexação e quebram a prévia dos links no
  WhatsApp e nas redes sociais.
- **Chave PIX.** Confira se `contato@vinhoharmonia.com.br` em `js/store.js` é mesmo
  a chave que deve receber os pagamentos (veja a seção "Chave PIX" abaixo).

## Trocar o catálogo (produtos, preços, fotos)

O catálogo é o array `MENU` no topo de `js/catalog.js`. Cada vinho é um objeto
`{ slug, name, category, price, country, grape, image, description }`. Para
adicionar categorias novas (Branco, Rosé, Espumante), basta usar esses nomes no
campo `category` de novos itens — a navegação por abas já lê `Catalog.CATEGORIES`
automaticamente.

Para trocar fotos: coloque o arquivo novo em `img/`, aponte `image` para ele no
`js/catalog.js`, e rode `python3 scripts/optimize_images.py` de novo se quiser
que o script também otimize as novas fotos (ajuste o `SOURCE_MAP` no script).

> ⚠️ **Sempre que editar `js/catalog.js` (produtos, preços, fotos) ou `js/pricing.js`
> (cupons), incremente a versão do cache em `sw.js`** — troque
> `CACHE_NAME = 'vinho-harmonia-shell-v1'` para `'...-v2'`, depois `'...-v3'`, e assim
> por diante. O service worker serve esses arquivos do cache primeiro, então quem já
> visitou o site continua vendo preços e produtos antigos até o nome do cache mudar.

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
