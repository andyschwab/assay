// the one external effect: a weekly digest mail, sent through the provider's API
export async function sendDigest(to, body, send) {
  return send({ to, subject: 'Weekly digest', body });
}
