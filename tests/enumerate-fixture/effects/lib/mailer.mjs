// outbound mail: the definition is the send
export function sendEmail(to, subject, body) {
  return { to, subject, bytes: body.length };
}
