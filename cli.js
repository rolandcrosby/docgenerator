import fs from "fs";

import parseCSV from "csv-parse/lib/sync.js";

import { Template } from "./template.js";

const t = new Template("templates/template.yml");
const testData = parseCSV(fs.readFileSync("templates/sample.csv"), {
  columns: true,
});

for (let data of testData) {
  t.generateDocuments(data, 'out');
}
