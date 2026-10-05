/** Guided answers are parsed locally; identity and financial data never go to an LLM. */
export function conversationalMoney(reply: string): number | null {
  let value = reply.trim().toLowerCase().replace(/^(i (need|earn|make|spend)|my (monthly )?(income|salary|expenses) (is|are)|about|around)\s+/, '').replace(/^r\s*/, '').replace(/\s*(rand|zar|per month|a month|monthly)\s*$/g, '').trim();
  if (/^\d+,\d{1,2}k?$/.test(value)) value = value.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)) value = value.replace(/,/g, '');
  else if (value.includes(',')) return null;
  if (/^\d{1,3}( \d{3})+(\.\d{1,2})?$/.test(value)) value = value.replace(/ /g, '');
  if (!/^\d+(\.\d{1,2})?k?$/.test(value)) return null;
  const amount = Number(value.replace(/k$/, '')) * (value.endsWith('k') ? 1000 : 1);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1000000 ? Math.round(amount * 100) : null;
}
export function conversationalTerm(reply: string): number | null {
  const value = reply.trim().toLowerCase().replace(/^for\s+/, '').replace(/\s+please$/, '').replace(/\s*(months?|mos?)$/, '');
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 24 ? Number(value) : null;
}
