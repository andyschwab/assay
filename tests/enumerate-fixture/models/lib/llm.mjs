import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
export async function summarize(text) {
  const reply = await client.messages.create({ model: 'a-model', max_tokens: 256, messages: [{ role: 'user', content: text }] });
  return reply.content;
}
