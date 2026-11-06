const JIKAN_BASE = 'https://api.jikan.moe/v4';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function requestJikan(path) {
  let lastError;

  // Keep the total execution comfortably within a serverless request window.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(JIKAN_BASE + path, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });

      if (response.ok) {
        return { data: await response.json(), status: response.status };
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 1) {
        const error = new Error(
          response.status === 429
            ? 'O catálogo está recebendo muitas consultas. Aguarde alguns segundos e tente novamente.'
            : 'O catálogo de animes respondeu com erro (' + response.status + ').'
        );
        error.status = response.status === 429 ? 429 : 502;
        throw error;
      }

      lastError = new Error('Jikan HTTP ' + response.status);
    } catch (error) {
      if (error.status) throw error;
      lastError = error.name === 'AbortError'
        ? new Error('O catálogo demorou demais para responder.')
        : error;

      if (attempt === 1) {
        const unavailable = new Error(
          'Não foi possível conectar ao catálogo de animes agora. Tente novamente em instantes.'
        );
        unavailable.status = 504;
        throw unavailable;
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(200);
  }

  const unavailable = new Error(lastError?.message || 'Catálogo temporariamente indisponível.');
  unavailable.status = 502;
  throw unavailable;
}

export function sendApiError(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 502;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({
    error: 'catalog_unavailable',
    message: error.message || 'Não foi possível consultar o catálogo de animes.'
  });
}
