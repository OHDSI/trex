import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    {
      type: "category",
      label: "Quickstarts",
      collapsed: false,
      items: [
        "quickstarts/deploy",
        "quickstarts/federate-postgres",
        "quickstarts/connect-with-cli",
        "quickstarts/distributed-cluster",
      ],
    },
    {
      type: "category",
      label: "Tutorials",
      items: [
        "tutorials/embed-trex-in-an-app",
        "tutorials/multi-source-analytics",
        "tutorials/incremental-data-warehouse",
        "tutorials/llm-augmented-sql",
        "tutorials/agentic-trex-with-mcp",
        "tutorials/clinical-analytics",
        "tutorials/build-a-plugin",
        "tutorials/publish-a-plugin",
      ],
    },
    {
      type: "category",
      label: "Concepts",
      items: [
        "concepts/architecture",
        "concepts/auth-model",
        "concepts/plugin-system",
        "concepts/connection-pool",
        "concepts/query-pipeline",
      ],
    },
    {
      type: "category",
      label: "SQL Reference",
      items: [
        {
          type: "category",
          label: "Engine",
          items: [
            "sql-reference/db",
            "sql-reference/pgwire",
            "sql-reference/migration",
            "sql-reference/tpm",
            "sql-reference/runtime",
          ],
        },
        {
          type: "category",
          label: "Federated Sources",
          items: [
            "sql-reference/hana",
            "sql-reference/chdb",
            "sql-reference/etl",
            "sql-reference/cache",
          ],
        },
        {
          type: "category",
          label: "Domain",
          items: [
            "sql-reference/fhir",
            "sql-reference/cql2elm",
            "sql-reference/atlas",
            "sql-reference/ai",
            "sql-reference/webapi",
            "sql-reference/hades",
          ],
        },
        {
          type: "category",
          label: "Transformations",
          items: ["sql-reference/transform"],
        },
      ],
    },
    {
      type: "category",
      label: "Plugins",
      items: [
        "plugins/overview",
        "plugins/developing",
        "plugins/ui-plugins",
        "plugins/function-plugins",
        "plugins/flow-plugins",
        "plugins/transform-plugins",
        "plugins/agent-plugins",
        "plugins/memory-plugins",
      ],
    },
    {
      type: "category",
      label: "APIs",
      items: [
        "apis/rest",
        "apis/graphql",
        "apis/realtime",
        "apis/auth",
        "apis/mcp",
        "apis/functions",
        "apis/storage",
        "apis/pg-meta",
        "apis/fhir",
      ],
    },
    "cli",
    {
      type: "category",
      label: "Deployment",
      items: [
        "deployment/docker",
        "deployment/environment",
        "deployment/distributed",
      ],
    },
  ],
};

export default sidebars;
