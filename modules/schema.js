// @ts-check

/**
 * @typedef {Object} Device
 * @property {number} id
 * @property {string} name
 * @property {string | null} category
 * @property {string | null} brand
 * @property {string} status
 * @property {string | null} imagePath
 * @property {string | null} acquired
 * @property {string | null} lost
 * @property {string | null} acquiredTip
 * @property {string | null} lostTip
 * @property {string | null} acquiredLocation
 * @property {string | null} lostLocation
 * @property {string | null} parent
 * @property {number | null} buyPrice
 * @property {number | null} sellPrice
 * @property {string | null} buyCurrency
 * @property {string | null} sellCurrency
 * @property {string[]} specs
 */

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export const normalizeSpecs = (value) => {
  if (Array.isArray(value)) {
    return value.map((line) => String(line).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
};
