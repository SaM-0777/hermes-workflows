---
name: hermes-workflow
description: Build and execute general-purpose, agent-driven workflows to automate complex, multi-step tasks across tools, services, and systems.
version: 0.0.1
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
      - check_workflow_runtime
      - setup_workflow_runtime
---

# Hermes Workflow Operations

Use the Hermes Workflow tools to manage the reusable node library, create and edit saved workflows, define Python-backed node behavior, connect compatible ports, remove exact edges, check the container that executes nodes, and verify persisted results.

## When to Use

Load this skill for requests involving Hermes Workflow Studio nodes, saved workflows, node IO, node parameters, Python Execution classes, workflow edges, workflow execution, or checking and provisioning the Docker runtime that node code executes in.

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
| Edges          | add_workflow_edge            | workflow_id, source_node_id, source_handle, target_node_id, target_handle, optional kind and label; data edges validate ports and exact type equality, control edges use flow → then and carry no value. |
| Edges          | remove_workflow_edge         | workflow_id and exact edge_id; removes the matching edge and returns the removed edge.                                                                    |
| Execution      | request_run_workflow        | { "workflow_id": "<workflow-uuid>" }; requests user approval before Workflow execution.                                                          |
| Runtime        | check_workflow_runtime      | {} ; returns docker (binary, running, server_version), image (name, present), container (name, state), status, ready, message, and next_action. Starts nothing. |
| Runtime        | setup_workflow_runtime      | {} ; builds the image and/or starts the container. Approval-gated: the pre_tool_call hook blocks it when the daemon is down and otherwise asks the user to approve before any Docker command runs. |

## Procedure

### 1. Identify the target and read current state

1. Select the operation: node-library management, workflow management, node editing, edge creation, edge removal, or execution.
2. Use list_nodes or list_workflows for discovery.
3. Use get_node_by_id or get_workflow_by_id before editing an existing object.
4. Treat returned IDs, node data, port names, port types, and edge records as the live source of truth.
5. Pass workflow IDs as canonical UUID strings. Pass exact node IDs, saved library IDs, and handle names returned by the tools.

### 2. Create or update reusable node definitions

1. Build data.general with name, description, and category. Node names start with a letter and use letters, numbers, underscores, or hyphens; names are 1–64 characters. Descriptions are at most 500 characters.
2. Build data.io with inputs and outputs. Each port has an exact name and one of Text, Dataset, Images, Videos, or Audios as its UI type.
3. Build data.config.parameters as a list of objects containing name, type, and string defaultValue. Parameter names are unique within the configuration. The string defaultValue must encode a value that matches the selected parameter type. Use Text values as their literal text, Dataset values as a local path or an http(s) URL, and Images, Videos, and Audios values as a JSON array of path references such as ["/data/a.png"].
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
5. Node code executes inside the plugin's long-lived `hermes-workflow` container, not in Hermes' own interpreter. It sees that container's Python 3.12 + uv install, its installed packages, and the mounted `/work` volume; host paths outside the mounts are unavailable. The standard library plus anything installed in the container is importable.
6. Install a dependency into the node environment with `docker exec hermes-workflow uv pip install <package>`. There is no venv to activate: PATH already points at /opt/venv, and that directory is a named volume, so the package keeps working across container restarts, container recreation, and image rebuilds. Only `docker compose down -v` (deleting volumes) removes it.
7. Keep class metadata as literal values that the editor can extract through Python AST parsing.
8. The dashboard execution endpoint calls build_output with inputs, the node's declared parameter defaults resolved to typed values (parameters), and an empty context dictionary. Read with parameters.get(name, <fallback>) so a parameter without a default still works; a parameter left blank in the editor is omitted entirely.

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

For two Text inputs named a and b, use:

```
inputs: list[dict] = [
       {"name": "a", "type": str},
       {"name": "b", "type": str},
   ]
```

For a Text output named result, use:

```
outputs: list[dict] = [
       {"name": "result", "type": str},
   ]
```

For a Dataset parameter named data_path with a default, use:

```
parameters: dict = {
       "data_path": {
           "type": str,
           "default": "/data/mnist",
       },
   }
```

The persisted configuration schema stores defaultValue as a string while requiring its encoded value to match the selected type. Use these representations:

| Selected parameter type | Correct data.config.parameters defaultValue | Execution.parameters default |
| --- | --- | --- |
| Text | "hello" | "hello" |
| Dataset | "/data/mnist" or "https://example.com/data.csv" | The same string |
| Images, Videos, Audios | "[\"/data/a.png\"]" (JSON array of path references) | ["/data/a.png"] |

Before calling create_node, add_node_to_workflow, update_node, or update_workflow_node, parse and type-check each defaultValue according to its selected type. Then mirror the parsed value in Execution.parameters using the matching Python type. The Python-to-UI type mapping is str → Text (or Dataset) and list → Images, Videos, or Audios (the port's "media" key decides which). Annotations with no UI counterpart — dict, a bare list, and the legacy float, int, bool, and Any — resolve to no studio type, so keeping metadata synchronized means using str and list only. Use matching representations in both directions whenever metadata changes.

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
  "kind": "data",
  "animated": true,
  "style": {"stroke": "#64748b", "strokeWidth": 2},
  "source": "<source_node_id>",
  "sourceHandle": "<source_handle>",
  "target": "<target_node_id>",
  "targetHandle": "<target_handle>",
  "label": "<optional name shown on the canvas>"
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

### 6. Connect control flow (no data)

Use a control edge when the connection only orders execution: a node with no outputs, or one whose
result is not an object, still needs to say what runs next.

1. Every node has two reserved handles that are not ports: flow (output side) and then (input side).
   No data port may be named flow or then; create_node, update_node, add_node_to_workflow and
   update_workflow_node reject those names.
2. Call add_workflow_edge with source_handle "flow" and target_handle "then". kind is inferred as
   control from that pair; passing kind "control" explicitly is equivalent.
3. flow and then are not interchangeable with port handles: flow to a port, a port to then, and
   flow to flow are all rejected. A control edge always runs flow → then.
4. Control edges carry no value. The target executes with only the inputs it receives from data
   edges, so a node fed solely by control edges runs with an empty inputs dictionary.
5. A control edge may target a node that also has data inputs. Ordering and data binding combine.
6. Fan-in waits for every parent: a node with three control parents runs after all three finish.
7. Loops are allowed: a control edge may close a cycle back to an earlier node. The run stops at the
   graph recursion limit (100) rather than looping forever, and today the cycle is traversed once per
   pass because the graph has no branch condition to decide about repeating.
8. Verify with get_workflow_by_id: the edge has kind "control", sourceHandle "flow", targetHandle
   "then", the same stroke colour as a data edge, a dashed path, and animated false.
9. Optional: pass label (max 80 characters) on any edge, control or data, to name it on the canvas.
   Labels are display text; they do not affect execution.

The saved control edge has this structure:

```
{
  "id": "xy-edge__<source_node_id>flow-<target_node_id>then",
  "type": "smoothstep",
  "kind": "control",
  "animated": false,
  "style": {"stroke": "#64748b", "strokeWidth": 2, "strokeDasharray": "6 4"},
  "source": "<source_node_id>",
  "sourceHandle": "flow",
  "target": "<target_node_id>",
  "targetHandle": "then",
  "label": "<optional name>"
}
```

### 7. Remove an exact edge

1. Call get_workflow_by_id with the workflow UUID.
2. Inspect workflow.edges and select the edge whose four connection fields match the intended source node, source handle, target node, and target handle.
3. Use the saved edge.id as the authoritative value. For an edge created by add_workflow_edge, derive it with the exact formula above and confirm the derived value matches the saved edge ID.
4. Call remove_workflow_edge with { "workflow_id": "<workflow-uuid>", "edge_id": "<exact-edge-id>" }.
5. Confirm the response has success: true, the expected removed_edge_id, and the removed edge record.

The handler removes the exact matching edge, updates the workflow timestamp, and preserves every node and every other edge.

### 8. Request approval to run a saved workflow

1. Call get_workflow_by_id with the workflow UUID and inspect its nodes and edges.
2. Confirm the workflow contains a connected execution graph. The Workflow Studio runtime selects nodes referenced by edges and adds start and end boundaries around the connected graph.
3. Review every connected node's general metadata, IO definitions, parameters, and Python execution code. Confirm the workflow topology, edge handles, and code match the user's intended operation.
4. Confirm every connected node has a valid Execution class and Python code whose build_output method returns the node result.
5. Call request_run_workflow with { "workflow_id": "<workflow-uuid>" }.
6. Treat success: true and the message Workflow execution request broadcast. as approval-request dispatch confirmation.
7. The Workflow Studio event consumer receives plugin.hermes-workflow.workflow.run, loads the saved workflow, sends a WORKFLOW_RUN message to the workflow canvas, and opens the Review before running this workflow approval dialog.
8. Wait for the user to inspect the workflow and agent-generated Python code. User approval occurs through Approve and run in the Workflow Studio dialog.
9. Execution starts after approval. A canceled or dismissed approval leaves the workflow idle.
10. Observe per-node runtime states: ready, running, success, or error. Inspect node inputs, outputs, and error details in the Workflow Studio canvas.
11. Use get_workflow_by_id to confirm the requested workflow ID and topology. Use user approval plus canvas runtime states and node outputs as execution evidence.

### 9. Check and provision the node runtime

1. Each saved workflow carries a runtime: `local` (the studio default) runs every node through Hermes' own `execute_code` kernel child, `docker` runs it inside the `hermes-workflow` container. The choice is stored on the workflow and sent with each `POST /run`; a request without one falls back to `HERMES_WORKFLOW_RUNNER` (default `docker`). check_workflow_runtime describes the container, which only the `docker` runtime uses.
2. Call check_workflow_runtime before a docker run when the outcome matters. Read status, ready, message, and next_action from the response.
3. status ready means the container is running and nodes will execute inside it. next_action none means nothing is required.
4. status docker_unavailable means the Docker daemon is not reachable (or the CLI is missing). next_action is ask_user_to_start_docker. Tell the user to start Docker Desktop and stop there: never start the daemon yourself, and setup_workflow_runtime refuses in this state too.
5. status image_missing or container_missing means the image or the container has to be created. next_action is request_setup_permission. Ask the user whether they want it built and started.
6. Only after the user agrees, call setup_workflow_runtime. The pre_tool_call hook intercepts it and returns the approval prompt describing the exact Docker commands; the tool runs only after the user approves.
7. Read setup_workflow_runtime's response: status ready with success true means the container reached running. A non-zero returncode in steps means the build or start failed; report the captured stderr to the user instead of retrying blindly.
8. status container_stopped means the container exists but is not running. A workflow run starts it automatically; setup_workflow_runtime can start it immediately if the user prefers.
9. status local_runner means HERMES_WORKFLOW_RUNNER=local: nodes run in Hermes' own execute_code kernel and no container is involved.
10. Re-run check_workflow_runtime after setup to confirm, then proceed to request_run_workflow.

### 10. Verify execution and persistence

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
- The current add_node_to_workflow handler routes its execution argument through the config validator, while its schema describes execution.pythonCode. Treat the schema and handler as an implementation mismatch, inspect the live response, and use add_library_node_to_workflow or update_workflow_node for a verified Python-backed node path. A working direct path: pass execution as {"pythonCode": ..., "parameters": []} so the config validator's array check passes, then call update_workflow_node with execution {"pythonCode": ...} to strip the placeholder key.
- update_node receives complete replacement data. update_workflow_node receives selected sections and preserves the remaining sections.
- Parameter defaultValue is serialized as a string in the tool schema and carries a type-specific value. Match Text and Dataset with plain text, and Images, Videos, and Audios with a JSON array of path references.
- The execution class stores the same parameter default as a native Python value. Keep data.config.parameters.defaultValue and Execution.parameters[name].default synchronized.
- Port names are unique within each input or output direction and are matched exactly when edges are created.
- Python type metadata uses the Python vocabulary while persisted JSON uses the UI vocabulary. Keep the mapping synchronized.
- Python metadata values are literal class attributes so the editor can extract them through AST parsing.
- build_output is the execution entry point. Put the calculation in run and return the final formatted value from build_output.
- The runtime receives ordinary dictionaries for inputs, parameters, and context. Access missing keys with explicit defaults or validation.
- Python source runs inside the `hermes-workflow` container: its interpreter, its packages, and the mounted `/work` volume. Anything installed only in Hermes' interpreter is absent, and host paths outside the mounts do not exist for node code.
- Edge compatibility uses exact type equality. Match Text with Text, Dataset with Dataset, Images with Images, Videos with Videos, and Audios with Audios. The five types in lib/node.ts dataTypes are the only ones the backend and the editor accept.
- Edge duplicate detection uses the complete four-field connection tuple, so handle names are part of connection identity.
- Edge IDs use the exact concatenation formula. Preserve capitalization, underscores, hyphens, and every character in both handle names.
- Edge removal accepts a workflow UUID and an exact existing edge ID. Read the workflow before removal and use the saved edge record.
- request_run_workflow validates a non-empty workflow_id and broadcasts the approval-request event. Workflow Studio loads the saved workflow and opens the approval dialog when it receives the event.
- User review covers the saved workflow topology and every agent-generated Python node implementation. The Approve and run action authorizes graph execution.
- request_run_workflow success confirms approval-request dispatch. User approval and Workflow Studio node statuses confirm execution progress and completion.
- A workflow run requires connected nodes. The runtime reports No connected nodes found in workflow. when the edge graph contains no connected node IDs.
- Upstream outputs use the sourceHandle key and feed the targetHandle key. Each upstream node returns an object-shaped output for downstream handle lookup.
- Deleting a workflow node also removes its connected edges. Duplicating a node creates data and a new ID, then requires explicit reconnection.
- Tool handlers persist JSON workflow and node-library data through the plugin storage layer. Use the tools as the write interface and verify through read-back.
- flow and then are reserved handle names on every node, added by the canvas for control edges. A data port may not use them, and add_workflow_edge rejects mixing a control handle with a port handle.
- A control edge passes no payload. Downstream inputs come only from data edges, so a node reached only by flow/then runs with an empty inputs dictionary.
- Control edges are identified by kind "control"; when kind is omitted the tool infers it from the flow/then pair. A data edge that happens to name its port then is rejected, not reinterpreted.
- Cycles are allowed in the graph and execute one pass per run; the graph has no branch condition yet, so a loop does not repeat and the recursion limit (100) is what bounds a runaway graph.
- Edge labels are display text of at most 80 characters, stored as edge.label on both kinds. They never change routing or ordering.

- check_workflow_runtime never starts anything: no daemon, image, or container. It reports state and the next action, so a missing Docker daemon stays the user's decision.
- A stopped Docker daemon is the user's action to take. Inform the user and stop; neither tool starts Docker Desktop, and setup_workflow_runtime returns docker_unavailable rather than guessing.
- setup_workflow_runtime is approval-gated by the plugin's pre_tool_call hook. The hook blocks it while the daemon is down and otherwise returns the approval prompt describing the exact Docker commands; the handler runs only after the user approves.
- Building the image means `docker compose -f docker-compose.yml up -d --build` at the plugin root, which needs network access for the base image and can take minutes. Report the captured step output on failure.
- HERMES_WORKFLOW_IMAGE and HERMES_WORKFLOW_CONTAINER select what the check reports, but docker-compose.yml fixes the names it creates. setup_workflow_runtime refuses when either override is set, instead of building something the compose file never produces.
- A GUI-launched Hermes process has a minimal PATH, so the docker CLI is located through HERMES_WORKFLOW_DOCKER_BIN, PATH, then the usual Docker Desktop install paths. A "Docker CLI not found" result names everything that was searched.
- The node environment is durable by design: `restart: unless-stopped` brings the container back with Docker, and `/opt/venv`, `/work`, and the uv cache are named volumes, so packages and files survive container recreation and image rebuilds. `docker compose down -v` is the one command that deletes them; never run it without asking.
- OS-level packages (apt) live in the image, not the volume: add them to the Dockerfile and rebuild. Python packages belong in `/opt/venv` via `uv pip install`.

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
| Add control edge              | get_workflow_by_id returns an edge with kind "control", sourceHandle "flow", targetHandle "then", and the dashed style; a run then executes the target after the source with no added inputs. |
| Request and run workflow     | request_run_workflow returns success with the approval-request broadcast, the user reviews the workflow and code, selects Approve and run, and connected nodes reach success with visible outputs. |
| Delete workflow node          | The read-back workflow contains neither the node nor any edge referencing its ID.                                                  |
| Execute node                  | Python validation succeeds, build_output returns a value, and the runtime result reports status: "completed".                      |
| Check runtime                | check_workflow_runtime reports status ready with container.state running, image.present true, and docker.running true. |
| Provision runtime            | User approves the prompt, setup_workflow_runtime returns success true with status ready, and a re-run of check_workflow_runtime still reports ready. |
