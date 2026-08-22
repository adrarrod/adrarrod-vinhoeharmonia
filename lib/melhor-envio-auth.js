// lib/melhor-envio-auth.js
const BASE_URL = 'https://melhorenvio.com.br';
const DEFAULT_EXPIRES_IN = 30 * 24 * 60 * 60; // 30 dias, conforme documentação da Melhor Envio

function buildAuthorizationUrl({ clientId, redirectUri, state, scope = 'shipping-calculate' }) {
  const url = new URL(`${BASE_URL}/oauth/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', scope);
  return url.toString();
}

async function requestToken(deps, extra) {
  const { env, fetchImpl } = deps;
  // As rotas OAuth2 são a única exceção à exigência de Content-Type: application/json
  // da API da Melhor Envio — o /oauth/token espera o formato padrão OAuth2
  // (application/x-www-form-urlencoded), não JSON.
  const params = new URLSearchParams({
    client_id: env.MELHOR_ENVIO_CLIENT_ID,
    client_secret: env.MELHOR_ENVIO_CLIENT_SECRET,
    ...extra
  });
  const response = await fetchImpl(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString()
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.message || body.error || `http ${response.status}`;
    throw new Error(`melhor envio oauth error: ${message}`);
  }
  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || DEFAULT_EXPIRES_IN
  };
}

function exchangeCodeForTokens(deps, code) {
  return requestToken(deps, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: deps.env.MELHOR_ENVIO_REDIRECT_URI
  });
}

function refreshTokens(deps, refreshToken) {
  return requestToken(deps, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

module.exports = { buildAuthorizationUrl, exchangeCodeForTokens, refreshTokens };
