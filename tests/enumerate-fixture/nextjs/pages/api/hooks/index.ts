// pages-router API route: the default export takes every method
import { STRIPE_WEBHOOK_SECRET } from '../../../lib/config';

export default function handler(req, res) {
  res.status(200).json({ received: Boolean(STRIPE_WEBHOOK_SECRET) });
}
