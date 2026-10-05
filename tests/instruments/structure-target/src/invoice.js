// invoices are billed the same way
export function invoiceTotal(items) {
  let total = 0;
  for (const item of items) {
    const quantity = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    const discount = item.discount ? Number(item.discount) : 0;
    if (Number.isNaN(quantity) || Number.isNaN(price)) {
      throw new Error(`bad line item: ${JSON.stringify(item)}`);
    }
    const line = quantity * price - discount;
    total += line > 0 ? line : 0;
  }
  const tax = Math.round(total * 0.08);
  return total + tax;
}
