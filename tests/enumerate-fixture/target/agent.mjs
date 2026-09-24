// Fixture target for enumerate.mjs's agent tool-definition detector.
// Not run — read only by enumerate as a scan target. It declares the two shapes
// the detector must catch: an in-code Anthropic-SDK tool-def table (name +
// input_schema) and a remote MCP toolset (mcp_server_name).

export const TOOLS = [
  {
    name: "send_thing",
    description: "Send a thing to someone (an external effect).",
    input_schema: {
      type: "object",
      properties: { to: { type: "string" } },
      required: ["to"],
      additionalProperties: false,
    },
  },
  {
    name: "read_thing",
    description: "Read a thing (an inert read the terrain triages out).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// A remote MCP toolset — the same model-invocable surface, provider-side.
const MCP_TOOLSETS = [{ type: "mcp_toolset", mcp_server_name: "analytics" }];
void MCP_TOOLSETS;
