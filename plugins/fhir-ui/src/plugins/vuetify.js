import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import "../../vendor/atlas-ui/atlas-ui.css";
import { createVuetify } from "vuetify";
import { buildVuetifyOptions } from "@atlas-ui";
// buildVuetifyOptions() supplies the Atlas theme (primary #1f425a, accent #eb6622,
// compact density, outlined inputs). Falls back to a literal theme if the export shape differs.
export const vuetify = createVuetify(buildVuetifyOptions());
