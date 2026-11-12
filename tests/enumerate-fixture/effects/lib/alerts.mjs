import { sendEmail } from './mailer.mjs';

// a call of the mail send, and an outward notify
export async function alert(ops, text) {
  sendEmail(ops, 'alert', text);
  await notifySlack('#ops', text);
}
export const notifySlack = async (channel, text) => ({ channel, text });

// in-process: not a send
export function changed(listeners, socket) {
  for (const l of listeners) l.notify('changed');
  notify(listeners);
  socket.send('ping');
  return resendEmailLater;
}
