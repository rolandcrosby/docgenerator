const fs = require("fs");
const path = require("path");

const DocxTemplater = require("docxtemplater");

class InputField {
  constructor({
    name,
    description,
    type,
    options,
    default: default_,
    required,
    dependsOn,
  }) {
    this.name = name;
    this.type = type || "string";
    this.description = description || "";
    this.dependsOn = dependsOn || null;
    this.default = default_ || null;
    if (type === "enum") {
      this.options = options;
    }
    if (required === false) {
      this.required = false;
    } else {
      this.required = true;
    }
  }

  evaluate(input, fieldData) {
    let value = input;
    if (!value && this.default) {
      value = this.default;
    }
    if (!value && this.required) {
      if (this.dependsOn && !fieldData[this.dependsOn]) {
        return value;
      } else {
        throw new TypeError(`Field ${this.name} is required`);
      }
    }
    if (this.type === "enum" && !this.options.includes(value)) {
      throw new TypeError(
        `Value of ${this.name} must be one of: ${this.options
          .map((o) => JSON.stringify(o))
          .join(", ")}`
      );
    }
    if (this.type === "boolean") {
      if (
        value === false ||
        ["false", "no", "f", "n", "", "1"].includes(
          value.toString().toLowerCase()
        )
      ) {
        value = false;
      } else if (
        value === true ||
        ["true", "yes", "t", "y", "0"].includes(value.toString().toLowerCase())
      ) {
        value = true;
      } else {
        throw new TypeError(`Value of ${this.name} must be true/false/yes/no`);
      }
    }
    return value;
  }
}

function derive(definition, fieldData) {
  if (typeof definition === "string" || typeof definition === "boolean") {
    return definition;
  }
  switch (definition.op) {
    case "literal":
      return definition.value;
    case "field":
      return fieldData[definition.name];
    case "concat":
      return definition.args.map((f) => derive(f, fieldData)).join("");
    case "if":
      if (derive(definition.condition, fieldData)) {
        return derive(definition.then, fieldData);
      } else {
        return derive(definition.else, fieldData);
      }
    case "split":
      return derive(definition.arg, fieldData).split(definition.delimiter);
    case "index":
      return derive(definition.arr, fieldData)[definition.pos];
    case "eq":
      return (
        derive(definition.left, fieldData) ===
        derive(definition.right, fieldData)
      );
    case "upper":
      return derive(definition.arg, fieldData).toUpperCase();
    case "lower":
      return derive(definition.arg, fieldData).toLowerCase();
    case "replace":
      return derive(definition.string, fieldData).replace(
        new RegExp(derive(definition.pattern, fieldData), "g"),
        derive(definition.replacement, fieldData)
      );
    default:
      throw new TypeError(
        `Unimplemented operation: ${definition.op} (${JSON.stringify(
          definition
        )})`
      );
  }
}

class Template {
  constructor(yamlData) {
    this.name = yamlData.name;
    this.inputFields = {};
    this.inputFieldList = [];
    yamlData.fields.forEach((definition) => {
      this.inputFields[definition.name] = new InputField(definition);
      this.inputFieldList.push(this.inputFields[definition.name]);
    });
    this.derivedFields = {};
    this.derivedFieldList = [];
    yamlData.derived.forEach((definition) => {
      this.derivedFields[definition.name] = definition;
      this.derivedFieldList.push(this.derivedFields[definition.name]);
    });
    this.documents = {};
    this.documentList = [];
    yamlData.documents.forEach((definition) => {
      this.documents[definition.name] = definition;
      this.documentList.push(this.documents[definition.name]);
    });
  }

  evaluate(input) {
    const fields = {};
    Object.entries(this.inputFields).forEach(([fieldName, definition]) => {
      fields[fieldName] = definition.evaluate(input[fieldName], fields);
    });
    Object.entries(this.derivedFields).forEach(([fieldName, definition]) => {
      fields[fieldName] = derive(definition, fields);
    });
    return fields;
  }

  async loadFiles(zipFile) {
    this.documentList.forEach(async (document) => {
      document.fileContents = await zipFile.file(document.name).async('nodebuffer');
    });
  }

  generateDocuments(input, outDir) {
    const data = this.evaluate(input);
    Object.entries(this.documents).forEach(([_, definition]) => {
      if (derive(definition.conditions, data)) {
        const document = new DocxTemplater(new PizZip(definition.data), {
          delimiters: { start: "[[", end: "]]" },
        });
        document.setData(data);
        document.render();
        fs.writeFileSync(
          path.join(outDir, path.basename(data[definition.outFile]) + ".docx"),
          document.getZip().generate({ type: "nodebuffer" })
        );
      }
    });
  }
}

module.exports = { Template: Template };
