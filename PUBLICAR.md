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
- `MELHOR_ENVIO_TOKEN` e `MELHOR_ENVIO_CEP_ORIGEM` — token e CEP de origem da
  loja no Melhor Envio. Sem eles, o frete usa a regra local (grátis acima de
  R$150, R$15 fixo abaixo).
- `SITE_URL` — a URL final do site na Vercel (ex.: `https://vinho-harmonia.vercel.app`).

Depois de configurar, clique em "Redeploy".

## Trocar o catálogo (produtos, preços, fotos)

O catálogo é o array `MENU` no topo de `js/catalog.js`. Cada vinho é um objeto
`{ slug, name, category, price, country, grape, image, description }`. Para
adicionar categorias novas (Branco, Rosé, Espumante), basta usar esses nomes no
campo `category` de novos itens — a navegação por abas já lê `Catalog.CATEGORIES`
automaticamente.

Para trocar fotos: coloque o arquivo novo em `img/`, aponte `image` para ele no
`js/catalog.js`, e rode `python3 scripts/optimize_images.py` de novo se quiser
que o script também otimize as novas fotos (ajuste o `SOURCE_MAP` no script).

## Cupons

Editados em `COUPONS` dentro de `js/pricing.js` (hoje só `PRIMEIRA10` = 10%).

## Chave PIX

Como o site é um arquivo estático, a chave PIX fica escrita diretamente em
`js/store.js` (procure por `contato@vinhoharmonia.com.br`) em vez de vir de
uma variável de ambiente — troque direto lá se um dia mudar.
