// keeps a list of chat messages; calls no model
export const log = { messages: [] };
export function add(m) { log.messages.push(m); return log.messages.length; }
