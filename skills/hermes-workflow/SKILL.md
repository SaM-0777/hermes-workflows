---
name: hermes-workflow
description: description: Build and execute general-purpose, agent-driven workflows to automate complex, multi-step tasks across tools, services, and systems.
version: 0.0.1
author: SaM-0777
license: MIT
platforms: [macos]
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
---

# Hermes Workflow Operations

Use the Hermes Workflow tools to manage the reusable node library, create and edit saved workflows, define Python-backed node behavior, connect compatible ports, remove exact edges, and verify persisted results.

## When to Use

Load this skill for requests involving Hermes Workflow Studio nodes, saved workflows, node IO, node parameters, Python Execution classes, workflow edges, or workflow execution.

## Quick Reference

Use the exact registered tool names and schema field names below. Tool responses are JSON strings; parse each response and inspect success before continuing.

| Area           | Tool                         | Parameters and behavior                                                                                                                                   |
| -------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node library   | list_nodes                   | {} ; returns the saved node library and count.                                                                                                            |
| Node library   | get_node_by_id               | { "id": "<saved-node-uuid>" } ; returns one saved node.                                                                                                   |
| Node library   | create_node                  | { "data": { "general": ..., "io": ..., "config": ..., "execution": ... } } ; validates and saves a reusable node.                                         |
| Node library   | update_node                  | { "id": "<saved-node-uuid>", "data": { ...complete node data... } } ; validates and replaces the saved node data.                                         |
| Node library   | delete_node                  | { "id": "<saved-node-uuid>" } ; removes a saved node.                                                                                                     |
| Workflow       | list_workflows               | {} ; returns saved workflows and count.                                                                                                                   |
| Workflow       | get_workflow_by_id           | { "id": "<workflow-uuid>" } ; returns the complete workflow.                                                                                              |
| Workflow       | create_workflow              | { "name": "<name>" } ; creates a workflow with generated UUID, empty nodes, and empty edges.                                                              |
| Workflow       | update_workflow              | { "id": "<workflow-uuid>", "name": "<name>" } ; updates workflow naming metadata.                                                                         |
| Workflow       | delete_workflow              | { "id": "<workflow-uuid>" } ; deletes the saved workflow.                                                                                                 |
| Workflow nodes | add_node_to_workflow         | workflow_id, general, io, config, and execution; creates a new workflow node with generated ID and position.                                              |
| Workflow nodes | add_library_node_to_workflow | workflow_id and saved library node_id; copies node data into a new workflow node with generated ID and position.                                          |
| Workflow nodes | update_workflow_node         | workflow_id, node_id, plus one or more of general, io, config, execution; updates supplied sections and preserves the others.                             |
| Workflow nodes | delete_workflow_node         | workflow_id and node_id; removes the node and all edges attached to it.                                                                                   |
| Workflow nodes | duplicate_workflow_node      | workflow_id and node_id; copies node data into a new node with a generated ID and offset position.                                                        |
| Edges          | add_workflow_edge            | workflow_id, source_node_id, source_handle, target_node_id, target_handle; validates ports, exact type equality, and duplicate connections before saving. |
| Edges          | remove_workflow_edge         | workflow_id and exact edge_id; removes the matching edge and returns the removed edge.                                                                    |

## Procedure

### 1. Identify the target and read current state

1. Select the operation: node-library management, workflow management, node editing, edge creation, edge removal, or execution.
2. Use list_nodes or list_workflows for discovery.
3. Use get_node_by_id or get_workflow_by_id before editing an existing object.
4. Treat returned IDs, node data, port names, port types, and edge records as the live source of truth.
5. Pass workflow IDs as canonical UUID strings. Pass exact node IDs, saved library IDs, and handle names returned by the tools.

### 2. Create or update reusable node definitions

1. Build data.general with name, description, and category. Node names start with a letter and use letters, numbers, underscores, or hyphens; names are 1–64 characters. Descriptions are at most 500 characters.
2. Build data.io with inputs and outputs. Each port has an exact name and one of Any, String, Number, Boolean, Object, Array, Image, Audio, Video, or File as its UI type.
3. Build data.config.parameters as a list of objects containing name, type, and string defaultValue. Parameter names are unique within the configuration.
4. Build data.execution.pythonCode with a complete Python source string containing the required Execution class described below.
5. Call create_node for a new reusable library node. Call update_node with the saved node UUID and complete updated data for an existing library node.
6. Use get_node_by_id after the write to confirm the persisted definition.

### 3. Add and edit nodes inside a workflow

1. Call create_workflow when a new workflow is required, then record its generated UUID.
2. Call add_node_to_workflow with the workflow ID and complete general, io, config, and execution sections when creating a node directly in the workflow.
3. Call add_library_node_to_workflow with the workflow ID and saved library node ID when reusing a library definition. The tool creates a fresh workflow node ID.
4. Call update_workflow_node with the workflow ID, node ID, and each section that needs a change. The tool preserves sections that are absent from the update.
5. Keep general, io, config, and execution.pythonCode synchronized whenever a node definition changes.
6. Call duplicate_workflow_node when a new node should inherit an existing node's data. Reconnect its ports explicitly after duplication because the duplicate receives a new node ID and its edges are created separately.
7. Call delete_workflow_node for a node removal. The tool removes every edge whose source or target equals that node ID.

### 4. Define Python execution code

Use this exact blueprint as the starting point for every node. Preserve the Execution class shape, class attributes, run method, and build_output method. Add node-specific metadata and logic inside this structure.

```
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

The blueprint is preserved as a standalone Execution class with direct methods. Helper functions may be added inside or outside the class. Additional classes may be defined outside Execution and called from it. Type annotations for variables, method arguments, and return values improve clarity and remain recommended.

Apply these execution rules:

1. Keep name, description, and category identical to data.general.
2. Keep inputs, outputs, and parameters identical to data.io and data.config using the Python representations shown below.
3. Put the node computation in run(self, inputs, parameters, context).
4. Make build_output(self, inputs, parameters, context) the runtime entry method. It calls run, applies any required output formatting, and returns the final value.
5. Use imports available in the Hermes runtime. Runtime code is self-contained within the submitted source and its available environment.
6. Dependency installation requires explicit user permission and a demonstrated need. Use the existing Hermes runtime first.
7. Keep class metadata as literal values that the editor can extract through Python AST parsing.
8. The current dashboard execution endpoint calls build_output with inputs, an empty parameters dictionary, and an empty context dictionary. Write logic that handles those runtime values and uses declared defaults where appropriate.

#### Bidirectional IO and configuration mapping

Every edit to node metadata has a matching edit in the Execution class:

| Node definition           | Python class representation                                               |
| ------------------------- | ------------------------------------------------------------------------- |
| data.general.name         | Execution.name                                                            |
| data.general.description  | Execution.description                                                     |
| data.general.category     | Execution.category                                                        |
| data.io.inputs            | Execution.inputs                                                          |
| data.io.outputs           | Execution.outputs                                                         |
| data.config.parameters    | Execution.parameters                                                      |
| data.execution.pythonCode | The complete source containing all of the above and the execution methods |

For two Number inputs named a and b, use:

```
inputs: list[dict] = [
       {"name": "a", "type": float},
       {"name": "b", "type": float},
   ]
```

For a Number output named result, use:

```
outputs: list[dict] = [
       {"name": "result", "type": float},
   ]
```

For a Number parameter named scale with default 5, use:

```
parameters: dict = {
       "scale": {
           "type": float,
           "default": 5,
       },
   }
```

The Python-to-UI type mapping is Any → Any, str → String, float or int → Number, bool → Boolean, dict → Object, list → Array, and Image, Audio, Video, File → their matching UI types. Use matching representations in both directions whenever metadata changes.

### 5. Connect compatible nodes

1. Call get_workflow_by_id and locate the source and target nodes in workflow.nodes.
2. Find source_handle as the exact name of an object in source_node.data.io.outputs.
3. Read that output object's type.
4. Find target_handle as the exact name of an object in target_node.data.io.inputs.
5. Read that input object's type.
6. Require exact equality between the two type strings, including capitalization.
7. Use distinct source and target node IDs.
8. Compare the complete connection tuple (source, sourceHandle, target, targetHandle) against every existing edge. The tuple must be new.
9. Call add_workflow_edge with the five required fields.
10. Record the returned edge object and its exact ID.

The saved edge has this structure:

```
{
  "id": "xy-edge__<source_node_id><source_handle>-<target_node_id><target_handle>",
  "type": "smoothstep",
  "animated": true,
  "style": {"stroke": "#64748b", "strokeWidth": 2},
  "source": "<source_node_id>",
  "sourceHandle": "<source_handle>",
  "target": "<target_node_id>",
  "targetHandle": "<target_handle>"
}
```

Construct an edge ID with this exact formula:

```
edge_id = (
    f"xy-edge__{source_node_id}{source_handle}-"
    f"{target_node_id}{target_handle}"
)
```

The formula places the source node ID immediately before the source handle, places a single hyphen between the source side and target side, and places the target node ID immediately before the target handle. A connection from nodeA output x to nodeB input a produces xy-edge\_\_nodeAx-nodeBa.

### 6. Remove an exact edge

1. Call get_workflow_by_id with the workflow UUID.
2. Inspect workflow.edges and select the edge whose four connection fields match the intended source node, source handle, target node, and target handle.
3. Use the saved edge.id as the authoritative value. For an edge created by add_workflow_edge, derive it with the exact formula above and confirm the derived value matches the saved edge ID.
4. Call remove_workflow_edge with { "workflow_id": "<workflow-uuid>", "edge_id": "<exact-edge-id>" }.
5. Confirm the response has success: true, the expected removed_edge_id, and the removed edge record.

The handler removes the exact matching edge, updates the workflow timestamp, and preserves every node and every other edge.

### 7. Verify execution and persistence

1. Validate Python syntax in the Workflow Studio Execution editor with Validate Code.
2. Confirm the editor extracts a literal Execution.name, description, category, inputs, outputs, and parameters definition.
3. Execute the node with representative inputs and inspect the returned output and status.
4. Re-read the saved node or workflow after every write.
5. For an edge addition, verify the edge ID and all four connection fields in workflow.edges.
6. For an edge removal, verify that the target edge ID is absent and that the remaining edge records are unchanged.
7. For a node deletion, verify the node is absent and all connected edges are absent.
8. Treat success: true plus a matching read-back as completion evidence.

## Pitfalls

- Tool names are exact and belong to the hermes-workflow toolset. Use the registered names from Quick Reference.
- Workflow IDs are canonical UUID strings. Read the ID from create_workflow, list_workflows, or get_workflow_by_id.
- Saved node IDs and workflow node IDs represent different objects. A saved library ID selects reusable data; a workflow node ID identifies the instance inside a workflow.
- create_node and add_node_to_workflow require valid general, io, config, and execution sections.
- The current add_node_to_workflow handler routes its execution argument through the config validator, while its schema describes execution.pythonCode. Treat the schema and handler as an implementation mismatch, inspect the live response, and use add_library_node_to_workflow or update_workflow_node for a verified Python-backed node path.
- update_node receives complete replacement data. update_workflow_node receives selected sections and preserves the remaining sections.
- Port names are unique within each input or output direction and are matched exactly when edges are created.
- Python type metadata uses the Python vocabulary while persisted JSON uses the UI vocabulary. Keep the mapping synchronized.
- Python metadata values are literal class attributes so the editor can extract them through AST parsing.
- build_output is the execution entry point. Put the calculation in run and return the final formatted value from build_output.
- The runtime receives ordinary dictionaries for inputs, parameters, and context. Access missing keys with explicit defaults or validation.
- Python source uses the Hermes runtime environment and available imports. Permission and a concrete requirement precede any dependency installation.
- Edge compatibility uses exact type equality. Match Number with Number, String with String, and each other type with its identical counterpart.
- Edge duplicate detection uses the complete four-field connection tuple, so handle names are part of connection identity.
- Edge IDs use the exact concatenation formula. Preserve capitalization, underscores, hyphens, and every character in both handle names.
- Edge removal accepts a workflow UUID and an exact existing edge ID. Read the workflow before removal and use the saved edge record.
- Deleting a workflow node also removes its connected edges. Duplicating a node creates data and a new ID, then requires explicit reconnection.
- Tool handlers persist JSON workflow and node-library data through the plugin storage layer. Use the tools as the write interface and verify through read-back.

## Verification

Verification is complete when the operation's response and a subsequent read agree:

| Operation                     | Verification read-back                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create or update library node | get_node_by_id returns the intended general, io, config, and execution data.                                                       |
| Create or rename workflow     | get_workflow_by_id returns the intended workflow UUID and name.                                                                    |
| Add or update workflow node   | get_workflow_by_id contains the intended node ID and synchronized node definition.                                                 |
| Duplicate workflow node       | The returned new node ID appears once with copied data and the expected offset position.                                           |
| Add workflow edge             | The returned edge and read-back edge share the expected ID, source, source handle, target, target handle, and matching port types. |
| Remove workflow edge          | The read-back workflow contains no edge with the removed ID, while all unrelated edges remain present.                             |
| Delete workflow node          | The read-back workflow contains neither the node nor any edge referencing its ID.                                                  |
| Execute node                  | Python validation succeeds, build_output returns a value, and the runtime result reports status: "completed".                      |

The plugin registers this skill by scanning skills/hermes-workflow/SKILL.md from its **init**.py. The plugin metadata targets macOS and requires Hermes >=0.23.0.
