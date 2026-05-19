// @ts-nocheck - Deno edge function
import type { AppTemplate } from "../templates.ts";

export const template: AppTemplate = {
  id: "nextjs",
  name: "Next.js",
  description: "Next.js + TypeScript + Tailwind",
  tech_stack: "nextjs",
  dev_command: "npm run dev",
  install_command: "npm install",
  build_command: "npm run build",
  files: {
    "AI_RULES.md": `# Tech Stack
- You are building a Next.js application with the App Router.
- Use TypeScript.
- Always put source code in the src folder.
- Put pages into src/app/ using the App Router file conventions (page.tsx, layout.tsx).
- Put components into src/components/
- The main page is src/app/page.tsx
- UPDATE the main page to include the new components. OTHERWISE, the user can NOT see any components!
- Tailwind CSS: always use Tailwind CSS for styling components. Utilize Tailwind classes extensively for layout, spacing, colors, and other design aspects.

Available packages and libraries:
- The lucide-react package can be used for icons.
- Use Tailwind CSS utility classes for all styling.
`,
    "package.json": `{
"name": "my-nextjs-app",
"version": "0.1.0",
"private": true,
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
},
"dependencies": {
  "next": "^15.1.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
},
"devDependencies": {
  "@types/node": "^22.10.1",
  "@types/react": "^18.3.12",
  "@types/react-dom": "^18.3.1",
  "typescript": "^5.6.3",
  "tailwindcss": "^3.4.16",
  "postcss": "^8.4.49",
  "autoprefixer": "^10.4.20"
}
}`,
    "tsconfig.json": `{
"compilerOptions": {
  "target": "ES2017",
  "lib": ["dom", "dom.iterable", "esnext"],
  "allowJs": true,
  "skipLibCheck": true,
  "strict": true,
  "noEmit": true,
  "esModuleInterop": true,
  "module": "esnext",
  "moduleResolution": "bundler",
  "resolveJsonModule": true,
  "isolatedModules": true,
  "jsx": "preserve",
  "incremental": true,
  "plugins": [{ "name": "next" }],
  "paths": { "@/*": ["./src/*"] }
},
"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
"exclude": ["node_modules"]
}`,
    "next.config.ts": `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;`,
    "tailwind.config.ts": `import type { Config } from "tailwindcss";

const config: Config = {
content: [
  "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
  "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
],
theme: {
  extend: {},
},
plugins: [],
};
export default config;`,
    "postcss.config.mjs": `/** @type {import('postcss-load-config').Config} */
const config = {
plugins: {
  tailwindcss: {},
  autoprefixer: {},
},
};

export default config;`,
    "src/app/globals.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}`,
    "src/app/layout.tsx": `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
title: "Next.js App",
description: "Created with Next.js",
};

export default function RootLayout({
children,
}: Readonly<{
children: React.ReactNode;
}>) {
return (
  <html lang="en">
    <body>{children}</body>
  </html>
);
}`,
    "src/app/page.tsx": `export default function Home() {
return (
  <main className="flex min-h-screen flex-col items-center justify-center p-24">
    <h1 className="text-4xl font-bold">Welcome to Next.js</h1>
    <p className="mt-4 text-lg text-gray-600">
      Edit <code className="bg-gray-100 px-2 py-1 rounded">src/app/page.tsx</code> to get started.
    </p>
  </main>
);
}`,
  },
};
