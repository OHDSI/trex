// @ts-nocheck - Deno edge function
import type { AppTemplate } from "../templates.ts";

export const template: AppTemplate = {
  id: "blank",
  name: "Blank",
  description: "Empty project with package.json",
  tech_stack: "node",
  dev_command: "npm run dev",
  install_command: "npm install",
  build_command: "npm run build",
  files: {
    "AI_RULES.md": `# Tech Stack
- This is a blank project. Set up the tech stack as needed.
- UPDATE the main entry point to include new code. OTHERWISE, the user can NOT see any changes!
`,
    "package.json": `{
"name": "my-app",
"version": "1.0.0",
"private": true,
"scripts": {
  "dev": "echo 'No dev script configured'",
  "build": "echo 'No build script configured'"
}
}`,
  },
};
