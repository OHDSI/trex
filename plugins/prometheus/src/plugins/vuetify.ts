import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import "../../vendor/atlas-ui/atlas-ui.css";
import { createVuetify } from "vuetify";
import { buildVuetifyOptions } from "@atlas-ui";

// buildVuetifyOptions() supplies the genuine Atlas theme (Atlas primary + accent).
const opts = buildVuetifyOptions();
export const vuetify = createVuetify({
  ...opts,
  defaults: {
    ...(opts.defaults ?? {}),
    // Collapse the empty ~22px .v-input__details strip when there are no hints/errors.
    // hideDetails:"auto" still renders the strip (and shows validation messages) whenever
    // there ARE messages — so validation errors remain fully visible.
    global: { ...((opts.defaults as any)?.global ?? {}), hideDetails: "auto", density: "compact" },
  },
});
