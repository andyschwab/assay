// The assistant. The model is a deterministic offline stub: no provider, no network.

export function buildPrompt(question) {
  return `Answer briefly: ${question}`;
}

export function callModel(prompt) {
  return { text: `echo: ${prompt}` };
}
