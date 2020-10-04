function defaults(template) {
  const fields = {};
  template.fields.forEach((f) => {
    if (typeof f.group !== "undefined") {
      f.fields.forEach((inner) => {
        fields[inner.name] = inner.default;
      });
    } else {
      fields[f.name] = f.default;
    }
  });
  return fields;
}

Vue.component("field", {
  props: ["definition", "value", "enabled", "error"],
  template: `<div :class="{disabled: !enabled, error: error}" :title="error">
  <label>{{definition.label}}</label>
  <template v-if="definition.type === 'string'">
    <input :value="value" :disabled="!enabled" @input="$emit('input', $event.target.value)">
  </template>
  <template v-else-if="definition.type === 'longText'">
    <textarea :value="value" :disabled="!enabled" @input="$emit('input', $event.target.value)"></textarea>
  </template>
  <template v-else-if="definition.type === 'enum'">
    <select :value="value" :disabled="!enabled" @input="$emit('input', $event.target.selectedOptions[0].value)">
      <option v-for="option in definition.options" :value="option">{{option}}</option>
    </select>
  </template>
  <template v-else-if="definition.type === 'boolean'">
    <label>
      <input
        type="radio"
        value="true"
        :checked="value"
        :disabled="!enabled"
        @change="$emit('input', true)">
      </input>
      yes
    </label>
    <label>
      <input
        type="radio"
        value="false"
        :checked="!value"
        :disabled="!enabled"
        @change="$emit('input', false)">
      </input>
      no
    </label>
  </template>
</div>`,
});

const app = new Vue({
  el: ".app",
  data: {
    template: null,
    fieldValues: {},
    fieldErrors: {},
    documents: [],
  },
  methods: {
    loadTemplate: function () {
      backend.loadTemplate().then((t) => {
        if (t) {
          this.template = t;
          this.fieldValues = defaults(t);
        }
      });
    },
    generate: function () {
      const result = backend.evaluateTemplate(this.fieldValues).then(result => {
        console.log(result);
        this.fieldValues = result.fields;
        this.fieldErrors = result.errors;
      });
    },
  },
});
