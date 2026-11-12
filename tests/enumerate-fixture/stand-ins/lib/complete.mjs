const canned = new Map([['ping', 'pong']]);

// A stand-in for the model call while the app runs offline:
// it answers from a canned table in place of the provider's API.
export const complete = async (prompt) => canned.get(prompt) ?? '';
