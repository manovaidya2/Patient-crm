// Old formulation and ledger records keep the stock code used when they were made.
const stockCodes = (item) => [...new Set([item.code, ...(item.codeAliases || [])].filter(Boolean))];
const stockCodeQuery = (codes) => ({ $or: [{ code: { $in: codes } }, { codeAliases: { $in: codes } }] });
const stockCodeMap = (items) => new Map(items.flatMap((item) => stockCodes(item).map((code) => [code, item])));

module.exports = { stockCodes, stockCodeQuery, stockCodeMap };
