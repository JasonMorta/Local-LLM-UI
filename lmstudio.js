/**
 * Provider definition for LM Studio.
 * This module keeps LM Studio-specific endpoint options and request builders isolated
 * from the rest of the app so the main UI logic can stay generic.
 */
export const lmStudioProvider = {
  id: 'lmstudio',
  label: 'LM Studio',
  intro:
    'LM Studio uses OpenAI-compatible endpoints. You can paste the full working URL from Postman. If you paste a full URL, that exact URL is used. If you paste only a host, the helper endpoint path is appended.',
  defaultMethod: 'POST',
  methods: ['POST'],
  endpoints: [
    {
      value: '/v1/chat/completions',
      label: '/v1/chat/completions',
      requiresModel: true,
      defaultModel: 'qwen/qwen3-vl-30b'
    },
    {
      value: '/v1/responses',
      label: '/v1/responses',
      requiresModel: true,
      defaultModel: 'qwen/qwen3-vl-30b'
    },
    {
      value: '/v1/models',
      label: '/v1/models',
      requiresModel: false,
      defaultModel: ''
    }
  ]
};

/**
 * Build a complete LM Studio request object.
 * The function switches body format based on the chosen endpoint because LM Studio exposes
 * multiple OpenAI-style endpoints that do not all use the same payload shape.
 */
export function buildLmStudioRequest({ inputUrl, endpoint, method, model, token }) {
  const normalized = resolveRequestUrl(inputUrl, endpoint);
  const headers = buildHeaders(token);

  // The models endpoint is a simple endpoint test, so no JSON body is needed.
  if (endpoint === '/v1/models') {
    return {
      url: normalized.url,
      fetchOptions: {
        method,
        headers
      },
      diagnostics: {
        urlMode: normalized.mode,
        requestBody: null
      }
    };
  }

  // The responses endpoint expects a single input string instead of a messages array.
  if (endpoint === '/v1/responses') {
    const requestBody = {
      model,
      input: 'hello',
      temperature: 0.7
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

  // The chat completions endpoint expects a messages array.
  const requestBody = {
    model,
    messages: [
      {
        role: 'user',
        content: 'hello'
      }
    ],
    temperature: 0.7
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
 * Extract a human-readable message from LM Studio responses.
 * Different LM Studio endpoints return different JSON shapes, so this function checks each one.
 */
export function parseLmStudioResponse(data, endpoint) {
  if (endpoint === '/v1/models') {
    const count = Array.isArray(data?.data) ? data.data.length : 0;
    return `Connected successfully. Found ${count} model(s).`;
  }

  if (endpoint === '/v1/responses') {
    return data?.output?.[0]?.content?.[0]?.text || 'Request succeeded, but no text output was returned.';
  }

  return data?.choices?.[0]?.message?.content || 'Request succeeded, but no text output was returned.';
}

/**
 * Resolve the final request URL.
 * If the user pasted a full URL that already contains a non-root path, that exact URL is preserved.
 * If the user pasted only a host or root path, the selected helper endpoint is appended.
 */
function resolveRequestUrl(inputUrl, endpoint) {
  const trimmedInput = String(inputUrl || '').trim();

  try {
    const parsed = new URL(trimmedInput);

    // A non-root path means the user likely pasted the full working endpoint URL.
    if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== '') {
      return {
        url: parsed.toString(),
        mode: 'full-url'
      };
    }
  } catch (_error) {
    // Invalid URL validation is handled elsewhere in the main UI before fetch is attempted.
  }

  const trimmedBase = trimmedInput.replace(/\/+$/, '');
  const trimmedEndpoint = String(endpoint || '').trim().replace(/^\/+/, '');
  return {
    url: `${trimmedBase}/${trimmedEndpoint}`,
    mode: 'base-plus-endpoint'
  };
}

/**
 * Build common headers for LM Studio requests.
 * If a bearer token is provided, it is attached. Otherwise only JSON headers are used.
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
