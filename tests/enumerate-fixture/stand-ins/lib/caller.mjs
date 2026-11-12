import { buildPrompt, callModel } from './agent.mjs';

export function ask(question) {
  return callModel(buildPrompt(question)).text;
}
