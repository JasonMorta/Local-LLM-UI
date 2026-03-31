/**
 * Provider definition for OpenClaw.
 * OpenClaw's Gateway can expose an OpenAI-compatible responses endpoint and can also require bearer auth.
 */
export const openClawProvider = {
  id: 'openclaw',
  label: 'OpenClaw',
  intro:
    'OpenClaw is configured here for its Gateway-style endpoint. You can paste the full endpoint URL or only the host and let the helper endpoint be appended. Bearer auth may be required.',
  defaultMethod: 'POST',
  methods: ['POST'],
  endpoints: [
    {
      value: '/v1/responses',
      label: '/v1/responses',
      requiresModel: true,
      defaultModel: ''
    }
  ]
};

/**
 * Build a complete OpenClaw request object.
 * OpenClaw is wired here around the responses endpoint and sends a single input string of "hello".
 */
export function buildOpenClawRequest({ inputUrl, endpoint, method, model, token }) {
  const normalized = resolveRequestUrl(inputUrl, endpoint);
  const headers = buildHeaders(token);
  const requestBody = {
    model,
    input: 'hello'
  };

  return {
    url: normalized.url,
    fetchOptions: {
      method,
      headers,
      body: JSON.stringify(requestBody)
    },
    diagnostics: {
      urlMode: normalized.mode,
      requestBody
    }
  };
}

/**
 * Extract a readable message from OpenClaw responses.
 * This follows the OpenAI-style responses output structure.
 */
export function parseOpenClawResponse(data) {
  return data?.output?.[0]?.content?.[0]?.text || 'Request succeeded, but no text output was returned.';
}

/**
 * Resolve the final request URL.
 * If the pasted URL already includes a non-root path, it is used as-is. Otherwise the helper endpoint is appended.
 */
function resolveRequestUrl(inputUrl, endpoint) {
  const trimmedInput = String(inputUrl || '').trim();

  try {
    const parsed = new URL(trimmedInput);

    if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== '') {
      return {
        url: parsed.toString(),
        mode: 'full-url'
      };
    }
  } catch (_error) {
    // Main UI validation handles invalid URLs before fetch.
  }

  const trimmedBase = trimmedInput.replace(/\/+$/, '');
  const trimmedEndpoint = String(endpoint || '').trim().replace(/^\/+/, '');
  return {
    url: `${trimmedBase}/${trimmedEndpoint}`,
    mode: 'base-plus-endpoint'
  };
}

/**
 * Build OpenClaw headers.
 * OpenClaw commonly uses a bearer token, so the token field is especially useful here.
 */
function buildHeaders(token) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}
