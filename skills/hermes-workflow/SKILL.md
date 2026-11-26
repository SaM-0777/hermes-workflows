---
name: hermes-workflow
description: Visual workflow studio for designing, running, and iterating on multi-step agent and automation flows inside Hermes Desktop.
version: 0.2.0
author: SaM-0777
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [workflow, nodes, python, automation]
    requires_toolsets: [hermes-workflow]
    requires_tools:
      - list_nodes
      - get_node_by_id
      - create_node
      - update_node
      - delete_node
      - list_workflows
      - get_workflow_by_id
      - create_workflow
      - update_workflow
      - delete_workflow
      - add_node_to_workflow
      - add_library_node_to_workflow
      - update_workflow_node
      - delete_workflow_node
      - duplicate_workflow_node
      - add_workflow_edge
      - remove_workflow_edge
      - request_run_workflow
---

# Hermes Workflow Operations

Use the registered Hermes Workflow tools to manage the reusable node library,
create and edit saved workflows, connect data and control edges, and request
user-approved execution.

## When to Use

Use this skill for requests involving Workflow Studio nodes, saved workflows,
node IO, node configuration parameters, Python `Execution` classes, workflow
edges, or workflow execution.

## Tool Usage

Use the exact registered tool names and field names below. Every handler returns
a JSON string; parse it and inspect `success` before continuing.

| Area | Tool | Parameters and behavior |
| --- | --- | --- |
| Node library | `list_nodes` | `{}`; returns the saved node library and count. |
| Node library | `get_node_by_id` | `{ "id": "<saved-node-uuid>" }`; returns one saved node. |
| Node library | `create_node` | `{ "data": { "general": ..., "io": ..., "config": ..., "execution": ... } }`; validates and saves a reusable node. |
| Node library | `update_node` | `{ "id": "<saved-node-uuid>", "data": { ...complete node data... } }`; validates and replaces saved node data. |
| Node library | `delete_node` | `{ "id": "<saved-node-uuid>" }`; removes a saved node. |
| Workflows | `list_workflows` | `{}`; returns saved workflows and count. |
| Workflows | `get_workflow_by_id` | `{ "id": "<workflow-uuid>" }`; returns the complete workflow. |
| Workflows | `create_workflow` | `{ "name": "<name>" }`; creates a workflow with a generated UUID, empty nodes, and empty edges. |
| Workflows | `update_workflow` | `{ "id": "<workflow-uuid>", "name": "<name>" }`; updates workflow naming metadata. |
| Workflows | `delete_workflow` | `{ "id": "<workflow-uuid>" }`; deletes a saved workflow. |
| Workflow nodes | `add_node_to_workflow` | Adds a complete node with `workflow_id`, `general`, `io`, `config`, and `execution`. The node ID and position are generated. |
| Workflow nodes | `add_library_node_to_workflow` | `{ "workflow_id": "<workflow-uuid>", "node_id": "<saved-node-uuid>" }`; copies a library node and generates a new workflow node ID. |
| Workflow nodes | `update_workflow_node` | Uses `workflow_id`, `node_id`, and any sections among `general`, `io`, `config`, and `execution`; omitted sections remain unchanged. |
| Workflow nodes | `delete_workflow_node` | Deletes a node and every edge connected to it. |
| Workflow nodes | `duplicate_workflow_node` | Copies node data into a new node with a generated ID and offset position; edges are not copied. |
| Edges | `add_workflow_edge` | Connects data ports with exact matching types, or connects control handles `flow` to `then`. Accepts optional `kind` and `label`. |
| Edges | `remove_workflow_edge` | `{ "workflow_id": "<workflow-uuid>", "edge_id": "<exact-edge-id>" }`; removes the matching edge. |
| Execution | `request_run_workflow` | `{ "workflow_id": "<workflow-uuid>" }`; broadcasts a request that opens the user approval flow for the saved workflow. |

## Procedure

### 1. Identify the target and read current state

1. Select the operation: node-library management, workflow management, node
   editing, edge creation, edge removal, or execution.
2. Use `list_nodes` or `list_workflows` for discovery.
3. Use `get_node_by_id` or `get_workflow_by_id` before editing an existing
   object.
4. Treat returned IDs, node data, port names, port types, and edge records as
   the live source of truth.
5. Pass canonical UUID strings to workflow and node tools.

### 2. Create or update reusable node definitions

1. Build `data.general` with `name`, `description`, and optional `category`.
   Names are 1–64 characters, start with a letter, and contain only letters,
   numbers, underscores, or hyphens. Descriptions are at most 500 characters.
2. Build `data.io` with `inputs` and `outputs`. Each port contains `name` and
   one of the exact UI types `Text`, `Dataset`, `Images`, `Videos`, or
   `Audios`.
3. Build `data.config.parameters` as a list of objects containing `name`,
   `type`, and string `defaultValue`. Parameter names are unique within the
   configuration, using the same name rules as ports.
4. Make every `defaultValue` string encode a value of its selected type:

   | Selected type | `defaultValue` encoding |
   | --- | --- |
   | `Text` | Literal text, such as `"hello"` |
   | `Dataset` | A local path or HTTP(S) URL, such as `"/data/mnist"` or `"https://example.com/data.csv"` |
   | `Images` | JSON array string, such as `"[\"/data/a.png\"]"` |
   | `Videos` | JSON array string containing video path references |
   | `Audios` | JSON array string containing audio path references |
   | `JSON` | JSON object |

5. Build `data.execution.pythonCode` as a complete Python source string with
   the required `Execution` class.
6. Use `create_node` for a new reusable library node.
7. Use `update_node` with the saved node UUID and complete updated data for an
   existing library node.
8. Use `get_node_by_id` after every write to confirm persistence.

### 3. Add and edit nodes inside a workflow

1. Call `create_workflow` for a new workflow and record its generated UUID.
2. Call `add_node_to_workflow` with the workflow ID and complete node sections
   when creating a node directly in the workflow.
3. Call `add_library_node_to_workflow` with the workflow ID and saved library
   node ID when reusing a library definition. The copied node receives a new
   workflow node ID.
4. Call `update_workflow_node` with the workflow ID, node ID, and each section
   that needs a change. The handler preserves sections omitted from the update.
5. Keep `general`, `io`, `config`, and `execution.pythonCode` synchronized
   whenever a node definition changes.
6. Call `duplicate_workflow_node` when a new node should inherit an existing
   node's data. Reconnect its ports explicitly because the duplicate receives
   a new node ID and no edges are copied.
7. Call `delete_workflow_node` for a node removal. The handler removes every
   edge whose source or target equals that node ID.

### 4. Define Python execution code

Use this exact blueprint as the starting point for every node. Preserve the
`Execution` class shape, class attributes, method names, and method signatures.
Add node-specific metadata and logic inside this structure.

```python
from typing import Any


class Execution:
   name: str = ""
   description: str = ""
   category: str = ""

   inputs: list[dict] = [

   ]

   outputs: list[dict] = [

   ]

   parameters: dict = {

   }

   def run(self, inputs, parameters, context):
       pass

   def build_output(self, inputs, parameters, context):
       return self.run(inputs, parameters, context)
```

The source is parsed with Python AST checks before execution. The source must
define a module-level `Execution` class. The editor can extract literal class
metadata for `name`, `description`, `category`, `inputs`, `outputs`, and
`parameters`; keep those class attributes as literal values.

Apply these execution rules:

1. Keep `Execution.name`, `Execution.description`, and `Execution.category`
   identical to `data.general`.
2. Keep `Execution.inputs` and `Execution.outputs` synchronized with
   `data.io`.
3. Keep `Execution.parameters` synchronized with `data.config.parameters`.
4. Put the node computation in `run(self, inputs, parameters, context)`.
5. Make `build_output(self, inputs, parameters, context)` the runtime entry
   method. It calls `run`, applies required output formatting, and returns the
   final value.
6. The dashboard execution route invokes Hermes' registered `execute_code` tool
   through `tools.registry`. The generated driver runs in the execute-code
   child process, loads the node source there, instantiates `Execution`, and
   calls `build_output`.
7. The current node run request contains `node_id`, `code`, and `inputs`. The
   dashboard calls `build_output(inputs, {}, {})`, so node logic must provide
   explicit parameter fallbacks when it needs configuration defaults.
8. Use `parameters.get(name, fallback)` for runtime values. Keep the matching
   default in `Execution.parameters` so the source remains self-describing.
9. The driver supports both synchronous and asynchronous `build_output`
   results.
10. Return JSON-safe values from `build_output`: `None`, booleans, numbers,
    strings, lists, tuples, sets, dictionaries, dataclasses, model objects,
    and ordinary objects with public attributes are converted to JSON-safe
    output.
11. Keep the node result compact and structured. The driver writes the result
    to a temporary result file and emits a fixed-size marker so large outputs do
    not depend on the execute-code stdout capture.

#### Bidirectional IO and configuration mapping

Every edit to node metadata has a matching edit in the `Execution` class:

| Node definition | Python class representation |
| --- | --- |
| `data.general.name` | `Execution.name` |
| `data.general.description` | `Execution.description` |
| `data.general.category` | `Execution.category` |
| `data.io.inputs` | `Execution.inputs` |
| `data.io.outputs` | `Execution.outputs` |
| `data.config.parameters` | `Execution.parameters` |
| `data.execution.pythonCode` | Complete source containing all metadata and execution methods |

For two `Text` inputs named `a` and `b`, use:

```python
inputs: list[dict] = [
       {"name": "a", "type": str},
       {"name": "b", "type": str},
   ]
```

For a `Text` output named `result`, use:

```python
outputs: list[dict] = [
       {"name": "result", "type": str},
   ]
```

For a `Dataset` parameter named `data_path`, use:

```python
parameters: dict = {
       "data_path": {
           "type": str,
           "default": "/data/mnist",
       },
   }
```

Use these Python representations for persisted parameter values:

| UI type | `data.config.parameters.defaultValue` | `Execution.parameters` default |
| --- | --- | --- |
| `Text` | `"hello"` | `"hello"` |
| `Dataset` | `"/data/mnist"` or an HTTP(S) URL | Same string |
| `Images`, `Videos`, `Audios` | JSON array string such as `"[\"/data/a.png\"]"` | Python list such as `["/data/a.png"]` |

Before a node write, validate each default string against its selected UI
type, then mirror the decoded value in `Execution.parameters` using the
corresponding Python type. Use `str` for `Text` and `Dataset`, and `list` for
`Images`, `Videos`, and `Audios`.

### 5. Connect compatible data nodes

1. Call `get_workflow_by_id` and locate the source and target nodes in
   `workflow.nodes`.
2. Find `source_handle` as the exact `name` of an object in
   `source_node.data.io.outputs`.
3. Read its exact UI `type`.
4. Find `target_handle` as the exact `name` of an object in
   `target_node.data.io.inputs`.
5. Require exact equality between source and target type strings, including
   capitalization.
6. Use distinct source and target node IDs.
7. Compare the complete connection tuple against every existing edge.
8. Call `add_workflow_edge` with the five required fields and optionally
   `kind: "data"` or a label.
9. Record the returned edge object and exact edge ID.

The edge ID is constructed exactly as follows:

```python
edge_id = (
    f"xy-edge__{source_node_id}{source_handle}-"
    f"{target_node_id}{target_handle}"
)
```

A data edge has `kind: "data"`, `animated: true`, and the standard solid edge
style. Its `sourceHandle` is an output port and its `targetHandle` is an input
port.

### 6. Connect control flow

Use a control edge when the connection only orders execution and carries no
value.

1. Every node reserves `flow` as its control output handle and `then` as its
   control input handle. Data ports cannot use those names, case-insensitively.
2. Call `add_workflow_edge` with `source_handle: "flow"` and
   `target_handle: "then"`. The tool infers `kind: "control"`; passing
   `kind: "control"` explicitly is equivalent.
3. A control edge always connects `flow` to `then`.
4. The target receives data from its data edges. A target fed only by control
   edges receives an empty `inputs` dictionary.
5. Control ordering can combine with data binding. Fan-in waits for all parent
   nodes.
6. Optional labels are display text and may be at most 80 characters.

A control edge has this shape:

```json
{
  "id": "xy-edge__<source_node_id>flow-<target_node_id>then",
  "type": "smoothstep",
  "kind": "control",
  "animated": false,
  "style": {
    "stroke": "#64748b",
    "strokeWidth": 2,
    "strokeDasharray": "6 4"
  },
  "source": "<source_node_id>",
  "sourceHandle": "flow",
  "target": "<target_node_id>",
  "targetHandle": "then"
}
```

### 7. Remove an exact edge

1. Call `get_workflow_by_id` with the workflow UUID.
2. Inspect `workflow.edges` and select the edge whose source, sourceHandle,
   target, and targetHandle match the intended connection.
3. Use the saved `edge.id` as the authoritative value. For an edge created by
   `add_workflow_edge`, derive the ID with the exact formula above and confirm
   it matches the saved ID.
4. Call `remove_workflow_edge` with the workflow ID and exact edge ID.
5. Confirm `success: true`, the expected `removed_edge_id`, and the removed
   edge record.

### 8. Request approval to run a workflow

1. Call `get_workflow_by_id` with the workflow UUID.
2. Inspect every node, edge, handle, parameter, and Python execution source.
3. Confirm the graph contains the intended connected execution path.
4. Confirm every node defines `Execution` and that `build_output` returns the
   node result.
5. Call `request_run_workflow` with `{ "workflow_id": "<workflow-uuid>" }`.
6. Treat `success: true` and the message `Workflow execution request
   broadcast.` as confirmation that the approval request was dispatched.
7. The plugin pre-tool hook reads the saved workflow and includes each node's
   name and Python code in the approval prompt.
8. Wait for the user to inspect the saved workflow and generated Python code,
   then approve execution through the Workflow Studio approval flow.
9. Observe the Workflow Studio runtime states and node outputs after approval.
10. Use the requested workflow ID, user approval, node states, outputs, and
    error details as execution evidence.

## Pitfalls

- Parse every tool response as JSON and stop the current operation when
  `success` is false.
- Use canonical UUID strings for workflow IDs and saved node IDs.
- Keep parameter names unique and keep every `defaultValue` a string whose
  encoded value matches its selected type.
- Keep `Execution` metadata synchronized with `general`, `io`, and `config`.
- `build_output` is the runtime entry point. Put computation in `run` and
  return the final formatted value from `build_output`.
- The current `add_node_to_workflow` handler routes its `execution` argument
  through the configuration validator. A normal `{ "pythonCode": "..." }`
  execution object therefore fails that handler's current validation path. Use
  `add_library_node_to_workflow` when possible. For a direct add, the current
  compatible staged path is to provide `execution` with a valid `parameters`
  array plus `pythonCode`, then call `update_workflow_node` with the proper
  `execution: { "pythonCode": "..." }` object.
- `update_node` requires complete node data: `general`, `io`, `config`, and
  `execution`.
- `update_workflow_node` accepts one or more sections and preserves omitted
  sections.
- Data edges require exact port-type equality. Control edges use only
  `flow` → `then`.
- Duplicating a node creates a new node ID and no edges; reconnect edges
  explicitly.
- `request_run_workflow` dispatches the approval request. Execution evidence
  comes from the user approval flow and Workflow Studio runtime results.
- The dashboard node route passes an empty parameters dictionary and an empty
  context dictionary to `build_output`; use explicit fallbacks for values that
  come from `Execution.parameters`.
- Node execution is delegated to Hermes `execute_code` through the public
  registry. The plugin uses a separate child-process kernel for the node source,
  and the source is executed inside that child process.

## Verification

| Operation | Evidence |
| --- | --- |
| Create or update library node | `get_node_by_id` returns the intended general, io, config, and execution data. |
| Create or update workflow | `get_workflow_by_id` returns the intended workflow name, nodes, and edges. |
| Add data edge | The response contains the expected edge ID, source/target handles, `kind: "data"`, and matching connection types. |
| Add control edge | The response contains `kind: "control"`, sourceHandle `flow`, targetHandle `then`, and `animated: false`. |
| Remove edge | The response contains the expected `removed_edge_id`; a subsequent workflow read omits that edge and preserves the others. |
| Request workflow run | `request_run_workflow` returns the approval-request broadcast; the user approves the workflow and Workflow Studio reports node progress and outputs. |
| Execute node | AST validation succeeds, `Execution` is present, `build_output` returns a JSON-safe value, and the node result reports `status: "completed"`. |
