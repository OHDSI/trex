// @ts-nocheck - Deno edge function
import type { AppTemplate } from "../templates.ts";

export const template: AppTemplate = {
  id: "d2e-researcher-plugin",
  name: "D2E Researcher Plugin",
  description: "Full-stack single-spa researcher portal plugin with Deno backend",
  tech_stack: "d2e-react",
  dev_command: "npm run dev",
  install_command: "npm install",
  build_command: "npm run build",
  files: {
    "AI_RULES.md": `# Tech Stack
- You are building a D2E portal plugin (micro-frontend).
- Tech stack: React 18 + MUI 5 + single-spa + Vite (SystemJS output) frontend; Deno edge functions backend.
- D2E theme: primary #000080 (navy), background #f2f0f1, table header #ebf1f8.
- Use TypeScript throughout.
- Production entry: src/lifecycles.tsx (single-spa lifecycle exports, SystemJS format).
- Dev entry: src/main.tsx (standalone portal mock for devx preview).
- Use @emotion/styled and MUI sx prop for styling. Do NOT use Tailwind CSS.
- Put components in src/components/
- Put pages in src/pages/
- Put backend Deno functions in functions/
- Portal props available via PortalContext: getToken, username, datasetId, studyId, features, locale, containerId, appId, apiBase.
- Always use PortalContext to access portal APIs (e.g. getToken() for auth headers).
- Use apiBase from PortalContext as the base URL for all backend API calls (e.g. fetch(\`\${apiBase}/items\`)).
- NEVER change apiBase in main.tsx — it must stay as '/plugins/trex/__APP_ID__/api'. The trex server routes requests to the backend functions.
- NEVER change getToken in main.tsx — the preview passes the auth token via URL query parameter.
- UPDATE src/pages/HomePage.tsx or add new pages. The App.tsx routes to pages.

## D2E Portal Styling Guidelines
- Font sizes: h4 page titles 1.5rem (24px) bold, h5 1.25rem (20px) semibold, h6 section headers 1.125rem (18px) semibold, body/tables/buttons 0.875rem (14px), small text 12px
- Border radius: 8px for buttons, 16px for cards, 32px for dialogs
- Buttons: disableElevation, textTransform "none", fontSize 0.875rem (14px), outlined variant uses 2px border
- Cards: borderRadius 16px, boxShadow "0 3px 12px 0 #dedcda", border "1px solid #dedcda"
- Card header: padding 20px 24px, border-bottom 1px solid #dedcda, title 18px weight 500
- Tables: header background #ebf1f8, header text #000080 weight 500 14px, body text #555555 14px
- Dialogs: borderRadius 32px on paper, title 18px semibold
- Colors: primary #000080, text.secondary #555555, divider #dedcda, background #f2f0f1
- Spacing: use multiples of 8px (8, 16, 24, 32)
- Shadows: cards use "0 3px 12px 0 #dedcda"
- Tabs: textTransform "none", indicator height 4px
- All MUI buttons must set disableElevation
`,
    "package.json": `{
"name": "@trex/__APP_ID__",
"private": true,
"version": "0.0.0",
"type": "module",
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
},
"dependencies": {
  "@emotion/react": "^11.11.1",
  "@emotion/styled": "^11.11.0",
  "@mui/icons-material": "^5.8.3",
  "@mui/material": "^5.8.3",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "single-spa-react": "^6.0.2"
},
"devDependencies": {
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0",
  "@vitejs/plugin-react": "^4.3.4",
  "typescript": "~5.6.2",
  "vite": "^6.0.1",
  "vite-plugin-css-injected-by-js": "^3.5.2"
},
"trex": {
  "functions": {
    "api": [
      {
        "source": "/__APP_ID__/api",
        "function": "/functions"
      }
    ],
    "roles": {
      "__APP_ID__-user": ["__APP_ID__:read", "__APP_ID__:write"]
    },
    "scopes": [
      { "path": "/plugins/trex/__APP_ID__/api/.*", "scopes": ["__APP_ID__:read"] }
    ]
  },
  "ui": {
    "routes": [
      {
        "path": "/app",
        "dir": "dist",
        "spa": true
      }
    ]
  }
}
}`,
    "vite.config.ts": `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
plugins: [react(), cssInjectedByJsPlugin()],
build: {
  lib: {
    entry: 'src/lifecycles.tsx',
    formats: ['system'],
    fileName: 'lifecycles',
  },
  rollupOptions: {
    external: ['react', 'react-dom'],
  },
},
});`,
    "tsconfig.json": `{
"compilerOptions": {
  "target": "ES2020",
  "useDefineForClassFields": true,
  "lib": ["ES2020", "DOM", "DOM.Iterable"],
  "module": "ESNext",
  "skipLibCheck": true,
  "moduleResolution": "bundler",
  "allowImportingTsExtensions": true,
  "isolatedModules": true,
  "noEmit": true,
  "jsx": "react-jsx",
  "strict": true
},
"include": ["src"]
}`,
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>D2E Researcher Plugin</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`,
    "src/main.tsx": `import { createRoot } from 'react-dom/client';
import App from './App';
import type { PortalProps } from './types/portal';

/**
 * Portal mock harness for standalone dev preview.
 * Simulates the D2E portal shell so the plugin renders in the devx iframe.
 */
const mockPortalProps: PortalProps = {
appId: '__APP_ID__',
containerId: 'root',
getToken: async () => new URLSearchParams(window.location.search).get('token') || import.meta.env.VITE_MOCK_TOKEN || 'mock-jwt-token-for-dev',
username: 'researcher',
userId: 'user-1',
datasetId: 'dataset-1',
studyId: 'study-1',
features: [],
locale: 'en',
apiBase: '/plugins/trex/__APP_ID__/api',
autoMount: true,
};

// Simulate portal prop change events (for testing prop update handling)
window.addEventListener('DOMContentLoaded', () => {
setTimeout(() => {
  window.dispatchEvent(new CustomEvent('custom-props-changed', { detail: mockPortalProps }));
}, 100);
});

const root = createRoot(document.getElementById('root')!);
root.render(<App {...mockPortalProps} />);
`,
    "src/lifecycles.tsx": `import React from 'react';
import ReactDOM from 'react-dom';
import singleSpaReact from 'single-spa-react';
import App from './App';

const lifecycles = singleSpaReact({
React,
ReactDOM,
rootComponent: App,
domElementGetter: (props: any) => {
  return document.getElementById(props.containerId) || document.createElement('div');
},
errorBoundary() {
  return <div>Plugin failed to load.</div>;
},
});

export const { bootstrap, mount, unmount } = lifecycles;
`,
    "src/components/PortalShell.tsx": `import { AppBar, Toolbar, Typography, Button, Chip, Box } from '@mui/material';
import { usePortal } from '../context/PortalContext';

/**
 * Fake portal header shown only in dev preview.
 * Simulates the D2E portal navigation bar so the plugin
 * looks closer to its production environment during development.
 */
export default function PortalShell() {
const { username, appId } = usePortal();
return (
  <AppBar position="static" sx={{ bgcolor: '#000080', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
    <Toolbar variant="dense" sx={{ minHeight: 48, gap: 1 }}>
      <Typography sx={{ fontWeight: 300, letterSpacing: '0.15em', fontSize: '1.1rem', color: '#fff' }}>
        D2E
      </Typography>
      <Chip label="DEV PREVIEW" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.65rem', height: 20 }} />
      <Box sx={{ flex: 1 }} />
      {['Studies', 'Datasets', 'Plugins'].map((item) => (
        <Button key={item} size="small" sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'none', fontSize: '0.8rem', minWidth: 'auto' }}>
          {item}
        </Button>
      ))}
      <Box sx={{ flex: 1 }} />
      <Chip label={username} size="small" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }} />
    </Toolbar>
  </AppBar>
);
}
`,
    "src/App.tsx": `import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme';
import { PortalProvider } from './context/PortalContext';
import PortalShell from './components/PortalShell';
import HomePage from './pages/HomePage';
import type { PortalProps } from './types/portal';

export default function App(props: PortalProps) {
return (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <PortalProvider value={props}>
      {import.meta.env.DEV && <PortalShell />}
      <HomePage />
    </PortalProvider>
  </ThemeProvider>
);
}
`,
    "src/theme.ts": `import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
shape: { borderRadius: 8 },
palette: {
  primary: { main: '#000080' },
  background: { default: '#f2f0f1', paper: '#ffffff' },
  text: { primary: '#000080', secondary: '#555555' },
  divider: '#dedcda',
},
typography: {
  fontFamily: '"GT-America", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
  h4: { fontSize: '1.5rem', fontWeight: 700 },
  h5: { fontSize: '1.25rem', fontWeight: 600 },
  h6: { fontSize: '1.125rem', fontWeight: 600 },
  body1: { fontSize: '0.875rem' },
  body2: { fontSize: '0.875rem' },
},
components: {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: { borderRadius: 8, textTransform: 'none', fontSize: '0.875rem' },
      outlined: { borderWidth: 2 },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: { borderRadius: 16, boxShadow: '0 3px 12px 0 #dedcda', border: '1px solid #dedcda' },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: { borderRadius: 32 },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: { backgroundColor: '#ebf1f8' },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      head: { fontWeight: 500, color: '#000080', fontSize: '14px' },
      body: { fontSize: '14px', color: '#555555' },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: { textTransform: 'none' },
    },
  },
},
});
`,
    "src/types/portal.ts": `export interface PortalProps {
appId: string;
containerId: string;
getToken: () => Promise<string>;
username: string;
userId: string;
datasetId: string;
studyId: string;
features: string[];
locale: string;
apiBase: string;
autoMount?: boolean;
}
`,
    "src/context/PortalContext.tsx": `import { createContext, useContext } from 'react';
import type { PortalProps } from '../types/portal';

const PortalContext = createContext<PortalProps | null>(null);

export function PortalProvider({ value, children }: { value: PortalProps; children: React.ReactNode }) {
return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalProps {
const ctx = useContext(PortalContext);
if (!ctx) throw new Error('usePortal must be used within a PortalProvider');
return ctx;
}
`,
    "src/pages/HomePage.tsx": `import { useState, useEffect, useCallback } from 'react';
import { Container, Typography, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Box, Button, CircularProgress, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { usePortal } from '../context/PortalContext';

interface Item {
id: string;
name: string;
description: string;
createdAt: string;
}

export default function HomePage() {
const { username, datasetId, getToken, apiBase } = usePortal();
const [items, setItems] = useState<Item[]>([]);
const [loading, setLoading] = useState(true);
const [dialogOpen, setDialogOpen] = useState(false);
const [newName, setNewName] = useState('');
const [newDesc, setNewDesc] = useState('');

const fetchItems = useCallback(async () => {
  setLoading(true);
  try {
    const token = await getToken();
    const res = await fetch(\`\${apiBase}/items\`, {
      headers: { Authorization: \`Bearer \${token}\` },
    });
    const json = await res.json();
    setItems(json.data || []);
  } catch (err) {
    console.error('Failed to fetch items:', err);
  } finally {
    setLoading(false);
  }
}, [getToken, apiBase]);

useEffect(() => { fetchItems(); }, [fetchItems]);

const handleAdd = async () => {
  try {
    const token = await getToken();
    await fetch(\`\${apiBase}/items\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    setDialogOpen(false);
    setNewName('');
    setNewDesc('');
    fetchItems();
  } catch (err) {
    console.error('Failed to create item:', err);
  }
};

return (
  <Container maxWidth="md" sx={{ py: 4 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Researcher Plugin
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Welcome, {username}. Dataset: {datasetId}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchItems}>
          Refresh
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Add Item
        </Button>
      </Box>
    </Box>

    <Card sx={{ mb: 3 }}>
      <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid #dedcda' }}>
        <Typography sx={{ fontSize: '18px', fontWeight: 500 }}>
          Dataset Overview
        </Typography>
      </Box>
      <CardContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                      No items yet. Click "Add Item" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>

    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">
        This is a starter template. Edit <code>src/pages/HomePage.tsx</code> to build your researcher plugin.
      </Typography>
    </Box>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Item</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth />
        <TextField label="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} fullWidth multiline rows={3} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!newName.trim()}>Create</Button>
      </DialogActions>
    </Dialog>
  </Container>
);
}
`,
    "functions/deno.json": `{
"compilerOptions": {
  "strict": true,
  "noImplicitAny": true
}
}`,
    "functions/index.ts": `const corsHeaders = {
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

import { getItems, createItem } from './routes/items.ts';

Deno.serve({ port: 8000 }, async (req: Request) => {
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}

const url = new URL(req.url);
// Strip plugin prefix — the full path includes /plugins/trex/{appId}/api/...
// We only need the /api/... suffix for routing.
const fullPath = url.pathname;
const apiIdx = fullPath.indexOf('/api');
const path = apiIdx >= 0 ? fullPath.slice(apiIdx) : fullPath;

try {
  if (path === '/api/health' && req.method === 'GET') {
    return Response.json({ status: 'ok', timestamp: new Date().toISOString() }, { headers: corsHeaders });
  }
  if (path === '/api/items' && req.method === 'GET') {
    return Response.json(await getItems(), { headers: corsHeaders });
  }
  if (path === '/api/items' && req.method === 'POST') {
    const body = await req.json();
    return Response.json(await createItem(body), { status: 201, headers: corsHeaders });
  }

  return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
} catch (err) {
  return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders });
}
});
`,
    "functions/routes/items.ts": `import type { Item, ApiResponse } from '../types.ts';

const items: Item[] = [
{ id: '1', name: 'Sample Item 1', description: 'First sample item', createdAt: new Date().toISOString() },
{ id: '2', name: 'Sample Item 2', description: 'Second sample item', createdAt: new Date().toISOString() },
];

export async function getItems(): Promise<ApiResponse<Item[]>> {
return { data: items, total: items.length };
}

export async function createItem(input: Partial<Item>): Promise<ApiResponse<Item>> {
const item: Item = {
  id: crypto.randomUUID(),
  name: input.name || 'Untitled',
  description: input.description || '',
  createdAt: new Date().toISOString(),
};
items.push(item);
return { data: item, total: items.length };
}
`,
    "functions/types.ts": `export interface Item {
id: string;
name: string;
description: string;
createdAt: string;
}

export interface ApiResponse<T> {
data: T;
total: number;
}

export interface ErrorResponse {
error: string;
details?: string;
}
`,
  },
};
