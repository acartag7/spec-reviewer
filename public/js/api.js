async function request(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body == null ? undefined : { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text.trim() === "" ? null : JSON.parse(text);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? response.statusText);
  }
  return data;
}

export const api = {
  config: () => request("GET", "/api/config"),
  recentReviews: () => request("GET", "/api/reviews"),
  openDocument: (path) => request("GET", `/api/document?path=${encodeURIComponent(path)}`),
  uploadDocument: (file) => request("POST", "/api/document-upload", file),
  saveReview: (review) => request("POST", "/api/review", review),
  exportReview: (path) => request("GET", `/api/export?path=${encodeURIComponent(path)}`),
};
