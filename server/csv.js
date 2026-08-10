export const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const devicesToCsv = (devices, schemaVersion) => {
  const columns = [
    "schemaVersion", "id", "name", "category", "brand", "status", "imagePath", "acquired", "lost",
    "buyPrice", "buyCurrency", "sellPrice", "sellCurrency", "acquiredLocation", "lostLocation",
    "parentId", "parent", "warrantyUntil", "tags", "specs", "acquiredTip", "lostTip"
  ];
  const rows = devices.map((device) => ({
    schemaVersion,
    ...device,
    tags: device.tags.join(" | "),
    specs: device.specs.join(" | ")
  }));
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
};
