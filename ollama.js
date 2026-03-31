/**
 * Provider definition for Ollama.
 * This module uses Ollama's native API shapes instead of the OpenAI-compatible compatibility layer.
 */
export const ollamaProvider = {
  id: 'ollama',
  label: 'Ollama',
  intro:
    'Ollama is configured here using its native local API. You can paste the full working endpoint URL or just the host and let the endpoint helper be appended.',
  defaultMethod: 'POST',
  methods: ['POST'],
  endpoints: [
    {
      value: '/api/generate',
      label: '/api/generate',
      requiresModel: true,
      defaultModel: 'llama3.2'
    },
    {
      value: '/api/chat',
      label: '/api/chat',
      requiresModel: true,
      defaultModel: 'llama3.2'
    },
    {
      value: '/api/tags',
      label: '/api/tags',
      requiresModel: false,
      defaultModel: ''
    }
  ]
};

/**
 * Build a complete Ollama request object.
 * The endpoint determines whether the payload uses prompt-based generation or chat-style messages.
 */
export function buildOllamaRequest({ inputUrl, endpoint, method, model, token, messageText, history }) {
  const normalized = resolveRequestUrl(inputUrl, endpoint);
  const headers = buildHeaders(token);

  // The tags endpoint is used as a simple connectivity and models-list check.
  if (endpoint === '/api/tags') {
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

  // Native Ollama generate uses a model plus a single prompt string, so the chat history is flattened.
  if (endpoint === '/api/generate') {
    const requestBody = {
      model,
      prompt: buildTranscriptInput(history, messageText),
      stream: false
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

  // Native Ollama chat uses a model plus messages, so structured history can be preserved.
  const requestBody = {
    model,
    stream: false,
    messages: buildChatMessages(history, messageText)
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
 * Extract a readable message from Ollama responses.
 * This checks each supported native endpoint shape and falls back to a success message if needed.
 */
export function parseOllamaResponse(data, endpoint) {
  if (endpoint === '/api/tags') {
    const count = Array.isArray(data?.models) ? data.models.length : 0;
    return `Connected successfully. Found ${count} model(s).`;
  }

  if (endpoint === '/api/generate') {
    return data?.response || 'Request succeeded, but no text output was returned.';
  }

  return data?.message?.content || 'Request succeeded, but no text output was returned.';
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
 * Build common headers for Ollama requests.
 * Ollama usually does not need auth locally, but the optional bearer token is supported for flexibility.
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

/**
 * Convert the visible conversation history plus the new message into Ollama chat messages.
 * Only user and assistant turns are sent back to the provider.
 */
function buildChatMessages(history, messageText) {
  const normalizedHistory = Array.isArray(history)
    ? history.filter((item) => item && (item.role === 'user' || item.role === 'assistant')).map((item) => ({
        role: item.role,
        content: item.content
      }))
    : [];

  normalizedHistory.push({
    role: 'user',
    content: messageText
  });

  return normalizedHistory;
}

/**
 * Flatten the conversation into a plain text transcript.
 * This is used for Ollama endpoints that accept a single prompt string.
 */
function buildTranscriptInput(history, messageText) {
  const transcript = Array.isArray(history)
    ? history
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
        .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    : [];

  transcript.push(`USER: ${messageText}`);
  return transcript.join('\n\n');
}
