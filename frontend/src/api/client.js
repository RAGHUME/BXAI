const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const request = async (path, { method = 'GET', body, headers = {}, responseType = 'json' } = {}) => {
  const finalHeaders = { ...headers };
  const hasBody = body !== undefined && body !== null;

  let requestBody = body;
  if (hasBody) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData && !finalHeaders['Content-Type']) {
      finalHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: Object.keys(finalHeaders).length > 0 ? finalHeaders : undefined,
    body: hasBody ? requestBody : undefined,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errorData = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(errorData.message || 'Request failed');
    }

    const message = await response.text().catch(() => 'Request failed');
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  if (responseType === 'blob') {
    return response.blob();
  }

  if (responseType === 'text') {
    return response.text();
  }

  if (responseType === 'arraybuffer') {
    return response.arrayBuffer();
  }

  return response.json();
};

export const apiClient = {
  post(path, body, options) {
    return request(path, { method: 'POST', body, ...(options || {}) });
  },

  get(path, options) {
    return request(path, { method: 'GET', ...(options || {}) });
  },

  delete(path, body, options) {
    return request(path, { method: 'DELETE', body, ...(options || {}) });
  },
};
