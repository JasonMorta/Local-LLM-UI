import { lmStudioProvider, buildLmStudioRequest, parseLmStudioResponse } from './lmstudio.js';
import { ollamaProvider, buildOllamaRequest, parseOllamaResponse } from './ollama.js';
import { openClawProvider, buildOpenClawRequest, parseOpenClawResponse } from './openclaw.js';

/**
 * Registry of supported providers.
 * Each provider object supplies the UI metadata plus its own request builder and response parser.
 */
const providers = {
  [lmStudioProvider.id]: {
    ...lmStudioProvider,
    buildRequest: buildLmStudioRequest,
    parseResponse: parseLmStudioResponse
  },
  [ollamaProvider.id]: {
    ...ollamaProvider,
    buildRequest: buildOllamaRequest,
    parseResponse: parseOllamaResponse
  },
  [openClawProvider.id]: {
    ...openClawProvider,
    buildRequest: buildOpenClawRequest,
    parseResponse: parseOpenClawResponse
  }
};

const providerSelect = document.getElementById('providerSelect');
const dynamicControls = document.getElementById('dynamicControls');
const providerIntro = document.getElementById('providerIntro');
const methodSelect = document.getElementById('methodSelect');
const requestUrlInput = document.getElementById('requestUrlInput');
const requestUrlHelpText = document.getElementById('requestUrlHelpText');
const endpointSelect = document.getElementById('endpointSelect');
const modelInput = document.getElementById('modelInput');
const authTokenInput = document.getElementById('authTokenInput');
const connectButton = document.getElementById('connectButton');
const clearButton = document.getElementById('clearButton');
const statusBox = document.getElementById('statusBox');
const messages = document.getElementById('messages');

/**
 * Attach the core UI event listeners once the module loads.
 * The event flow is: choose provider, then endpoint helper, then connect.
 */
function init() {
  providerSelect.addEventListener('change', handleProviderChange);
  endpointSelect.addEventListener('change', handleEndpointChange);
  connectButton.addEventListener('click', handleConnect);
  clearButton.addEventListener('click', clearMessages);
}

/**
 * React to provider changes.
 * This repopulates all dynamic controls based on the selected app and only shows the controls panel
 * once a valid provider has actually been chosen.
 */
function handleProviderChange() {
  const provider = getSelectedProvider();

  // If no provider is selected, hide the dynamic controls and reset the status text.
  if (!provider) {
    dynamicControls.classList.add('hidden');
    connectButton.classList.add('hidden');
    setStatus('Status: Waiting for provider selection.');
    return;
  }

  dynamicControls.classList.remove('hidden');
  providerIntro.textContent = provider.intro;

  populateMethodSelect(provider);
  populateEndpointSelect(provider);
  applyEndpointDefaults(provider);
  updateRequestUrlHelpText();
  updateConnectVisibility();
  setStatus(`Status: ${provider.label} selected. Enter a full request URL or a host and use the helper endpoint.`, 'warning');
  addMessage('system', `${provider.label} selected. Paste a full working URL from Postman or enter only a host and let the helper endpoint be appended.`);
}

/**
 * React to endpoint helper changes.
 * The selected endpoint can change whether a model is required, so the model field is updated here.
 */
function handleEndpointChange() {
  const provider = getSelectedProvider();

  if (!provider) {
    return;
  }

  applyEndpointDefaults(provider);
  updateRequestUrlHelpText();
  updateConnectVisibility();
}

/**
 * Populate the HTTP method dropdown.
 * The current providers all use POST for the hello test, but the UI keeps the method as an explicit field.
 */
function populateMethodSelect(provider) {
  methodSelect.innerHTML = '';

  provider.methods.forEach((method) => {
    const option = document.createElement('option');
    option.value = method;
    option.textContent = method;
    methodSelect.appendChild(option);
  });

  methodSelect.value = provider.defaultMethod;
}

/**
 * Populate the endpoint helper dropdown for the selected provider.
 * The endpoint options are provider-specific and are loaded directly from the provider adapter module.
 */
function populateEndpointSelect(provider) {
  endpointSelect.innerHTML = '';

  provider.endpoints.forEach((endpoint) => {
    const option = document.createElement('option');
    option.value = endpoint.value;
    option.textContent = endpoint.label;
    endpointSelect.appendChild(option);
  });
}

/**
 * Apply endpoint-specific defaults to the model field.
 * If the selected endpoint does not need a model, the input is disabled to make the UI clearer.
 */
function applyEndpointDefaults(provider) {
  const selectedEndpoint = getSelectedEndpoint(provider);

  if (!selectedEndpoint) {
    modelInput.value = '';
    modelInput.disabled = false;
    return;
  }

  modelInput.value = selectedEndpoint.defaultModel || '';
  modelInput.disabled = !selectedEndpoint.requiresModel;
  modelInput.placeholder = selectedEndpoint.requiresModel
    ? 'Enter a model name if the selected endpoint needs one'
    : 'This endpoint does not need a model';
}

/**
 * Update the helper text below the URL field.
 * This text explains that a pasted full URL takes priority over the helper endpoint dropdown.
 */
function updateRequestUrlHelpText() {
  const provider = getSelectedProvider();
  const endpoint = provider ? getSelectedEndpoint(provider) : null;
  const endpointText = endpoint ? endpoint.value : 'the selected helper endpoint';

  requestUrlHelpText.textContent = `Enter the full request URL if you already have a working endpoint like Postman. If the entered URL already contains a path, that exact URL is used. If you enter only a host or root URL, ${endpointText} is appended automatically.`;
}

/**
 * Show or hide the connect button based on the currently visible selections.
 * The button appears only after a provider and helper endpoint are in place, matching the requested flow.
 */
function updateConnectVisibility() {
  const provider = getSelectedProvider();
  const endpoint = provider ? getSelectedEndpoint(provider) : null;

  if (provider && endpoint) {
    connectButton.classList.remove('hidden');
  } else {
    connectButton.classList.add('hidden');
  }
}

/**
 * Send the provider-specific hello request and display the response.
 * This function delegates the request-building details to the selected provider adapter.
 */
async function handleConnect() {
  const provider = getSelectedProvider();

  if (!provider) {
    setStatus('Please select a provider first.', 'error');
    return;
  }

  const selectedEndpoint = getSelectedEndpoint(provider);
  const inputUrl = requestUrlInput.value.trim();
  const method = methodSelect.value;
  const model = modelInput.value.trim();
  const token = authTokenInput.value.trim();

  // A request URL is always required because the tester either uses it as-is or appends the helper endpoint.
  if (!inputUrl) {
    setStatus('Please enter a request URL first.', 'error');
    addMessage('system', 'A request URL is required before a request can be sent.');
    return;
  }

  // Validate that the value is at least a syntactically valid absolute URL before fetch is attempted.
  if (!isAbsoluteHttpUrl(inputUrl)) {
    setStatus('Please enter a valid absolute http or https URL.', 'error');
    addMessage('system', `Invalid URL: ${inputUrl}`);
    return;
  }

  // If the selected endpoint needs a model, require it before sending the request.
  if (selectedEndpoint?.requiresModel && !model) {
    setStatus('Please enter a model for the selected endpoint.', 'error');
    addMessage('system', 'This endpoint requires a model value before the hello test can run.');
    return;
  }

  const { url, fetchOptions, diagnostics } = provider.buildRequest({
    inputUrl,
    endpoint: selectedEndpoint.value,
    method,
    model,
    token
  });

  const requestSummary = buildRequestSummary({
    providerLabel: provider.label,
    method,
    inputUrl,
    resolvedUrl: url,
    helperEndpoint: selectedEndpoint.value,
    urlMode: diagnostics.urlMode,
    headers: redactHeaders(fetchOptions.headers),
    requestBody: diagnostics.requestBody
  });

  addMessage('user', requestSummary);
  setStatus(`Connecting to ${url} ...`, 'warning');
  connectButton.disabled = true;

  try {
    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();

    // If the response is not OK, surface the raw response text because it is often the most useful debug output.
    if (!response.ok) {
      const failureSummary = buildFailureSummary({
        status: response.status,
        statusText: response.statusText,
        responseText
      });
      throw new Error(failureSummary);
    }

    const data = safeJsonParse(responseText);
    const parsedMessage = provider.parseResponse(data, selectedEndpoint.value);

    setStatus('Connected successfully.', 'ok');
    addMessage('assistant', `${parsedMessage}\n\nHTTP ${response.status} ${response.statusText || ''}`.trim());
  } catch (error) {
    const detailedMessage = buildRuntimeErrorMessage(error);
    setStatus(`Connection failed. See details below.`, 'error');
    addMessage('system', detailedMessage);
  } finally {
    connectButton.disabled = false;
  }
}

/**
 * Build a readable request summary.
 * This makes it obvious whether the app used the pasted full URL exactly as entered or appended a helper path.
 */
function buildRequestSummary({ providerLabel, method, inputUrl, resolvedUrl, helperEndpoint, urlMode, headers, requestBody }) {
  const bodyText = requestBody ? JSON.stringify(requestBody, null, 2) : '(no request body)';
  const modeLabel = urlMode === 'full-url' ? 'full URL from input' : 'input host/root + helper endpoint';

  return [
    `Connect test`,
    `Provider: ${providerLabel}`,
    `Method: ${method}`,
    `Input URL: ${inputUrl}`,
    `Helper endpoint: ${helperEndpoint}`,
    `Resolved URL: ${resolvedUrl}`,
    `URL mode: ${modeLabel}`,
    `Headers:`,
    JSON.stringify(headers, null, 2),
    `Body:`,
    bodyText
  ].join('\n');
}

/**
 * Redact sensitive headers before showing them in the UI.
 * Authorization values are replaced so the diagnostics stay useful without exposing the token.
 */
function redactHeaders(headers) {
  const safeHeaders = { ...(headers || {}) };

  if (safeHeaders.Authorization) {
    safeHeaders.Authorization = 'Bearer ********';
  }

  return safeHeaders;
}

/**
 * Build a detailed non-OK response summary.
 * Returning the raw response text makes debugging much easier when the server does answer but rejects the request.
 */
function buildFailureSummary({ status, statusText, responseText }) {
  const text = responseText && String(responseText).trim() ? responseText : '(empty response body)';
  return `HTTP ${status} ${statusText || ''}\n\nResponse body:\n${text}`.trim();
}

/**
 * Build a detailed runtime error message.
 * Browser CORS failures often surface as a generic failed fetch without a real HTTP response, so this helper
 * adds that explanation instead of only echoing a vague error string.
 */
function buildRuntimeErrorMessage(error) {
  const rawMessage = error && error.message ? error.message : 'Unknown error';
  const isLikelyCorsOrNetwork = /Failed to fetch|NetworkError|Load failed/i.test(rawMessage);

  if (isLikelyCorsOrNetwork) {
    return [
      'Connection failed before a readable HTTP response was returned.',
      '',
      `Browser error: ${rawMessage}`,
      '',
      'This often means one of these:',
      '- the browser blocked the request because of CORS',
      '- the tunnel URL is unreachable from the browser',
      '- the endpoint requires auth or Cloudflare Access before the request can complete',
      '- the hostname or SSL setup is not reachable from your current environment'
    ].join('\n');
  }

  return `Connection failed:\n\n${rawMessage}`;
}

/**
 * Safely parse JSON text.
 * If parsing fails, an empty object is returned so the UI can still show a clean fallback message.
 */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return {};
  }
}

/**
 * Add a chat-style message bubble to the response area.
 * The role name controls the CSS styling so request and response messages are easy to distinguish.
 */
function addMessage(role, content) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  article.textContent = content;
  messages.appendChild(article);
  messages.scrollTop = messages.scrollHeight;
}

/**
 * Clear all visible messages and restore the default helper text.
 */
function clearMessages() {
  messages.innerHTML = '';
  addMessage('system', 'Messages cleared. Select an app and run another hello test when ready.');
}

/**
 * Update the status box styling and message.
 * The optional state class controls the green success, yellow info, and red error color variants.
 */
function setStatus(text, state = '') {
  statusBox.className = `status-box${state ? ` ${state}` : ''}`;
  statusBox.textContent = text;
}

/**
 * Get the selected provider adapter object.
 * If nothing valid is selected, return null so the caller can handle the empty state safely.
 */
function getSelectedProvider() {
  return providers[providerSelect.value] || null;
}

/**
 * Get the currently selected endpoint metadata from the provider.
 * This lets the UI know whether a model is required and which default should be shown.
 */
function getSelectedEndpoint(provider) {
  return provider.endpoints.find((endpoint) => endpoint.value === endpointSelect.value) || provider.endpoints[0] || null;
}

/**
 * Confirm that the entered value is an absolute http or https URL.
 * This avoids confusing fetch errors caused by incomplete hostnames or missing protocols.
 */
function isAbsoluteHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

init();
