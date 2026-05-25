/** Parse compact cell: 300g|199,1kg|549,1.5kg|799 */
function parsePackPricesString(value) {
  const priceByWeight = {};
  if (value == null || value === "") return priceByWeight;

  const text = String(value).trim();
  if (!text) return priceByWeight;

  text.split(/[,;\n]+/).forEach(part => {
    const piece = part.trim();
    if (!piece) return;
    const sepIdx = piece.search(/[|:]/);
    if (sepIdx < 0) return;
    const qty = piece.slice(0, sepIdx).trim();
    const priceStr = piece.slice(sepIdx + 1).trim();
    const price = Number(priceStr);
    if (qty && !isNaN(price)) priceByWeight[qty] = price;
  });

  return priceByWeight;
}

const PACK_PRICE_HEADERS = new Set([
  "packprices",
  "pack_prices",
  "quantityprices",
  "quantity_prices",
  "sizes",
  "weight_prices",
  "packs"
]);

function isPackPriceHeader(header) {
  return PACK_PRICE_HEADERS.has((header || "").toLowerCase().trim().replace(/\s+/g, "_"));
}

module.exports = { parsePackPricesString, isPackPriceHeader, PACK_PRICE_HEADERS };
