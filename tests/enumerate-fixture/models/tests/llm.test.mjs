import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();
await client.messages.create({ model: 'a-model', max_tokens: 1, messages: [] });
