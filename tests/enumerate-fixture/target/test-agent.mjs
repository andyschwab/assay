// A TEST file in the fixture target. It declares a tool-def-shaped fixture that
// enumerate MUST NOT surface as a channel candidate — test files build fixture
// tool defs, and scanning them manufactures channels outside the shipped surface.
// The regression assertion checks `fixture_only_tool` never appears in output.

export const FIXTURE_TOOLS = [
  {
    name: "fixture_only_tool",
    description: "Only exists in a test file; must not be enumerated.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];
