import { initialize } from 'monaco-editor/esm/vs/editor/editor.worker';
import { GraphQLWorker } from './GraphQLWorker';
globalThis.onmessage = () => {
    initialize((ctx, createData) => new GraphQLWorker(ctx, createData));
};
//# sourceMappingURL=graphql.worker.js.map