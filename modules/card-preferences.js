import { readPreference, writePreference } from "./dom.js";

export const CARD_META_LIMIT = 5;

export const CARD_META_FIELDS = [
  { id: "brand", label: "品牌" },
  { id: "acquired", label: "入手时间" },
  { id: "days", label: "持有时间" },
  { id: "dailyCost", label: "成本 / 收益" },
  { id: "buyPrice", label: "入手价格" },
  { id: "sellPrice", label: "卖出价格" },
  { id: "category", label: "物品类别" },
  { id: "status", label: "当前状态" },
  { id: "tags", label: "设备标签" },
  { id: "warrantyUntil", label: "保修截止" },
  { id: "acquiredLocation", label: "入手地点" },
  { id: "parent", label: "所属设备" }
];

export const DEFAULT_CARD_META_FIELDS = ["brand", "acquired", "days", "dailyCost"];

const allowedIds = new Set(CARD_META_FIELDS.map(({ id }) => id));

export const getCardMetaFields = () => {
  try {
    const parsed = JSON.parse(readPreference("card-meta-fields", ""));
    const fields = Array.isArray(parsed) ? parsed.filter((id) => allowedIds.has(id)).slice(0, CARD_META_LIMIT) : [];
    return fields.length ? fields : DEFAULT_CARD_META_FIELDS;
  } catch {
    return DEFAULT_CARD_META_FIELDS;
  }
};

export const saveCardMetaFields = (fields) => {
  const unique = [...new Set(fields)].filter((id) => allowedIds.has(id)).slice(0, CARD_META_LIMIT);
  writePreference("card-meta-fields", JSON.stringify(unique.length ? unique : DEFAULT_CARD_META_FIELDS));
  return unique.length ? unique : DEFAULT_CARD_META_FIELDS;
};
