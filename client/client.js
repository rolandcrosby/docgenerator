console.log("client ready");

const app = new Vue({
  el: ".app",
  data: {
    template: null,
  },
  methods: {
    loadTemplate: function () {
      backend.loadTemplate().then((t) => {
        if (t) {
          this.template = t;
        }
      });
    },
  },
});
