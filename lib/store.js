const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function makeJsonFileStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]");
  }

  function readAll() {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeAll(records) {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2));
    fs.renameSync(tmpPath, filePath);
  }

  function append(record) {
    const records = readAll();
    const withId = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...record };
    records.push(withId);
    writeAll(records);
    return withId;
  }

  function getById(id) {
    return readAll().find((r) => r.id === id) || null;
  }

  return { readAll, append, getById };
}

module.exports = { makeJsonFileStore };
