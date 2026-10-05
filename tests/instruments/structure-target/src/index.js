import { billTotal } from './billing.js';
import { invoiceTotal } from './invoice.js';
import { formatAmount } from './format.js';

console.log(formatAmount(billTotal([1, 2])), formatAmount(invoiceTotal([3, 4])));
