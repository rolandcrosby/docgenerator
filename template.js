const fs = require("fs");
const path = require("path");

const DocxTemplater = require("docxtemplater");
const PizZip = require("pizzip");
const { Type } = require("js-yaml");

class InputField {
  constructor({
    name,
    label,
    description,
    type,
    options,
    default: default_,
    required,
    dependsOn,
    placeholder
  }) {
    this.name = name;
    this.type = type || "string";
    this.label = label || name;
    this.description = description || "";
    this.dependsOn = dependsOn || null;
    this.placeholder = placeholder;
    if (type === "enum") {
      this.options = options;
    }
    if (required === false) {
      this.required = false;
    } else {
      this.required = true;
    }
    if (default_) {
      this.default = default_;
    } else {
      switch (this.type) {
        case "enum":
          this.default = this.options[0];
          break;
        case "string":
        case "longText":
          this.default = "";
          break;
        case "boolean":
          this.default = false;
          break;
        default:
          throw new TypeError(`unknown field type: ${this.type}`);
      }
    }
  }

  evaluate(input, fieldData) {
    let value = input;
    if (!value && this.default) {
      value = this.default;
    }
    if (
      (value === null || value === "" || typeof value === "undefined") &&
      this.required
    ) {
      if (this.dependsOn && !fieldData[this.dependsOn]) {
        return value;
      } else {
        throw new TypeError(`Field is required`);
      }
    }
    if (this.type === "enum" && !this.options.includes(value)) {
      throw new TypeError(
        `Value must be one of: ${this.options
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
        throw new TypeError(`Value must be true/false/yes/no`);
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
      if (typeof definition.group !== "undefined") {
        const group = {
          group: definition.group,
          label: definition.label,
          fields: [],
        };
        definition.fields.forEach((innerField) => {
          const fullFieldName = `${group.group}.${innerField.name}`;
          const label = innerField.label || innerField.name;
          this.inputFields[fullFieldName] = new InputField({
            ...innerField,
            label: label,
            name: fullFieldName,
          });
          group.fields.push(this.inputFields[fullFieldName]);
        });
        this.inputFieldList.push(group);
      } else {
        this.inputFields[definition.name] = new InputField(definition);
        this.inputFieldList.push(this.inputFields[definition.name]);
      }
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
    const result = { fields: {}, errors: {}, errorCount: 0 };
    Object.entries(this.inputFields).forEach(([fieldName, definition]) => {
      try {
        const normalized = definition.evaluate(input[fieldName], result.fields);
        result.fields[fieldName] = normalized;
        result.errors[fieldName] = null;
      } catch (e) {
        result.fields[fieldName] = input[fieldName];
        result.errors[fieldName] = e.message;
        result.errorCount += 1;
      }
    });
    if (result.errorCount === 0) {
      Object.entries(this.derivedFields).forEach(([fieldName, definition]) => {
        result.fields[fieldName] = derive(definition, result.fields);
      });
    }
    return result;
  }

  async loadFiles(zipFile) {
    this.documentList.forEach(async (document) => {
      document.fileContents = await zipFile
        .file(document.name)
        .async("nodebuffer");
    });
  }

  generateDocuments(fields, outDir) {
    const result = { generatedFiles: [], errors: [], errorCount: 0 };
    Object.entries(this.documents).forEach(([_, definition]) => {
      if (derive(definition.conditions, fields)) {
        const filename = path.join(
          outDir,
          path.basename(fields[definition.outFile]) + ".docx"
        );
        try {
          const document = new DocxTemplater(
            new PizZip(definition.fileContents),
            {
              delimiters: { start: "[[", end: "]]" },
            }
          );
          document.setData(fields);
          document.render();
          fs.writeFileSync(
            filename,
            document.getZip().generate({ type: "nodebuffer" })
          );
          result.generatedFiles.push({path: filename, filename: path.basename(filename)});
        } catch (e) {
          console.log("error generating document:", e, e.stack)
          result.errors.push({ filename: filename, error: e.message });
          result.errorCount += 1;
        }
      }
    });
    return result;
  }
}

module.exports = { Template: Template };
