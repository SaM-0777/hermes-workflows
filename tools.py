from datetime import datetime, timezone
import json
from pathlib import Path
import re
import uuid

_NODE_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]*$")
_DATA_TYPES = {
    "Any",
    "String",
    "Number",
    "Boolean",
    "Object",
    "Array",
    "Image",
    "Audio",
    "Video",
    "File",
}

NODE_LIBRARY_PATH = (
    Path.home()
    / "Library"
    / "Application Support"
    / "Hermes"
    / "plugin-files"
    / "data"
    / "hermes-workflow"
    / "node-library.json"
)


def _now():
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _validate_name(value, field_name):
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string.")
    value = value.strip()
    if not 1 <= len(value) <= 64:
        raise ValueError(f"{field_name} must be between 1 and 64 characters.")
    if not _NODE_NAME_PATTERN.fullmatch(value):
        raise ValueError(
            f"{field_name} must start with a letter and contain "
            "only letters, numbers, underscores, or hyphens."
        )
    return value


def _read_node_library():
    if not NODE_LIBRARY_PATH.exists():
        return []
    with NODE_LIBRARY_PATH.open("r", encoding="utf-8") as file:
        nodes = json.load(file)
    if not isinstance(nodes, list):
        raise ValueError("Node library must contain a JSON array.")
    for node in nodes:
        if (
            not isinstance(node, dict)
            or not isinstance(node.get("id"), str)
            or not isinstance(node.get("data"), dict)
            or not isinstance(node.get("createdAt"), str)
            or not isinstance(node.get("updatedAt"), str)
        ):
            raise ValueError("Invalid node library structure.")
    return nodes


def _write_node_library(nodes):
    NODE_LIBRARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with NODE_LIBRARY_PATH.open("w", encoding="utf-8") as file:
        json.dump(nodes, file, ensure_ascii=False, indent=2)


def _validate_node_general_data(general):
    if not isinstance(general, dict):
        raise ValueError("Node data must contain a general object.")
    name = general.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Node name is required.")
    if len(name) > 64:
        raise ValueError("Node name must be 64 characters or fewer.")
    if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]*", name):
        raise ValueError(
            "Node name must start with a letter and contain only "
            "letters, numbers, underscores, or hyphens."
        )
    description = general.get("description")
    if not isinstance(description, str):
        raise ValueError("Node description must be a string.")
    if len(description) > 500:
        raise ValueError("Node description must be 500 characters or fewer.")
    category = general.get("category")
    if category is not None and (not isinstance(category, str) or not category):
        raise ValueError("Node category must be a non-empty string.")
    return general


def _validate_node_io_data(io):
    if not isinstance(io, dict):
        raise ValueError("Node data must contain an io object.")
    normalized_io = {}
    for direction in ("inputs", "outputs"):
        ports = io.get(direction)
        if not isinstance(ports, list):
            raise ValueError(f"Node io.{direction} must be an array.")
        seen_names = set()
        validated_ports = []
        for index, port in enumerate(ports):
            if not isinstance(port, dict):
                raise ValueError(f"Node io.{direction}[{index}] must be an object.")
            name = port.get("name")
            if not isinstance(name, str) or not name.strip():
                raise ValueError(f"Node io.{direction}[{index}].name is required.")
            if len(name) > 64:
                raise ValueError(
                    f"Node io.{direction}[{index}].name must be "
                    "64 characters or fewer."
                )
            if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]*", name):
                raise ValueError(
                    f"Node io.{direction}[{index}].name must start "
                    "with a letter and contain only letters, numbers, "
                    "underscores, or hyphens."
                )
            port_type = port.get("type")
            if not isinstance(port_type, str) or port_type not in _DATA_TYPES:
                raise ValueError(
                    f"Node io.{direction}[{index}].type must be one of: "
                    f"{', '.join(_DATA_TYPES)}."
                )
            normalized_name = name.lower()
            if normalized_name in seen_names:
                raise ValueError(f"Node io.{direction} port names must be unique.")
            seen_names.add(normalized_name)
            validated_ports.append(port)
        normalized_io[direction] = validated_ports
    return normalized_io


def _validate_node_config_data(config):
    if not isinstance(config, dict):
        raise ValueError("Node data must contain a config object.")
    parameters = config.get("parameters")
    if not isinstance(parameters, list):
        raise ValueError("Node config.parameters must be an array.")
    seen_names = set()
    for index, parameter in enumerate(parameters):
        if not isinstance(parameter, dict):
            raise ValueError(f"Node config.parameters[{index}] must be an object.")
        name = parameter.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"Node config.parameters[{index}].name is required.")
        if len(name) > 64:
            raise ValueError(
                f"Node config.parameters[{index}].name must be "
                "64 characters or fewer."
            )
        if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]*", name):
            raise ValueError(
                f"Node config.parameters[{index}].name must start "
                "with a letter and contain only letters, numbers, "
                "underscores, or hyphens."
            )
        parameter_type = parameter.get("type")
        if not isinstance(parameter_type, str) or parameter_type not in _DATA_TYPES:
            raise ValueError(
                f"Node config.parameters[{index}].type must be one of: "
                f"{', '.join(_DATA_TYPES)}."
            )
        default_value = parameter.get("defaultValue")
        if not isinstance(default_value, str):
            raise ValueError(
                f"Node config.parameters[{index}].defaultValue must be a string."
            )
        normalized_name = name.lower()
        if normalized_name in seen_names:
            raise ValueError("Node config parameter names must be unique.")
        seen_names.add(normalized_name)
    return config


def _validate_node_execution_data(execution):
    if not isinstance(execution, dict):
        raise ValueError("Node data must contain an execution object.")
    python_code = execution.get("pythonCode")
    if not isinstance(python_code, str):
        raise ValueError("Node execution.pythonCode must be a string.")
    return execution


def _result(payload):
    return json.dumps(payload, ensure_ascii=False)


def _error(message):
    return _result(
        {
            "success": False,
            "error": message,
        }
    )


def list_nodes(params, **kwargs):
    try:
        nodes = _read_node_library()
        return _result(
            {
                "success": True,
                "count": len(nodes),
                "node_library": nodes,
            }
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return _error(str(exc))


def get_node_by_id(params, **kwargs):
    try:
        node_id = params.get("id")
        if not isinstance(node_id, str):
            raise ValueError("A valid node UUID is required.")
        try:
            parsed_id = uuid.UUID(node_id)
        except ValueError:
            raise ValueError("Invalid node UUID.")
        if str(parsed_id) != node_id.lower():
            raise ValueError("Node ID must be a valid canonical UUID.")
        nodes = _read_node_library()
        node = next(
            (node for node in nodes if node["id"] == node_id),
            None,
        )
        if node is None:
            raise ValueError(f"Node not found: {node_id}")
        return _result(
            {
                "success": True,
                "node": node,
            }
        )
    except (AttributeError, OSError, json.JSONDecodeError, ValueError) as exc:
        return _error(str(exc))


# Check
def create_node(params, **kwargs):
    try:
        data = params.get("data")
        if not isinstance(data, dict):
            raise ValueError("Node data must be an object.")

        general = _validate_node_general_data(data.get("general"))
        io = _validate_node_io_data(data.get("io"))
        config = _validate_node_config_data(data.get("config"))
        execution = _validate_node_execution_data(data.get("execution"))

        nodes = _read_node_library()
        now = _now()
        node = {
            "id": str(uuid.uuid4()),
            "data": {
                "general": general,
                "io": io,
                "config": config,
                "execution": execution,
            },
            "createdAt": now,
            "updatedAt": now,
        }
        nodes.append(node)
        _write_node_library(nodes)
        return _result(
            {
                "success": True,
                "message": "Node created successfully.",
                "node": node,
                "count": len(nodes),
            }
        )
    except (AttributeError, OSError, json.JSONDecodeError, ValueError) as exc:
        return _error(str(exc))


# Check
def update_node(params, **kwargs):
    try:
        node_id = params.get("id")
        if not isinstance(node_id, str) or not node_id.strip():
            raise ValueError("A valid node ID is required.")
        data = params.get("data")
        if not isinstance(data, dict):
            raise ValueError("Node data must be an object.")

        general = _validate_node_general_data(data.get("general"))
        io = _validate_node_io_data(data.get("io"))
        config = _validate_node_config_data(data.get("config"))
        execution = _validate_node_execution_data(data.get("execution"))

        nodes = _read_node_library()
        existing = next(
            (node for node in nodes if node["id"] == node_id),
            None,
        )
        if existing is None:
            raise ValueError(f"Node not found: {node_id}")
        updated_node = {
            **existing,
            "data": {
                "general": general,
                "io": io,
                "config": config,
                "execution": execution,
            },
            "updatedAt": _now(),
        }
        updated_nodes = [
            updated_node if node["id"] == node_id else node for node in nodes
        ]
        _write_node_library(updated_nodes)
        return _result(
            {
                "success": True,
                "message": "Node updated successfully.",
                "node": updated_node,
            }
        )
    except (AttributeError, OSError, json.JSONDecodeError, ValueError) as exc:
        return _error(str(exc))


def delete_node(params, **kwargs):
    try:
        node_id = params.get("id")
        if not isinstance(node_id, str) or not node_id.strip():
            raise ValueError("A valid node ID is required.")
        nodes = _read_node_library()
        updated_nodes = [node for node in nodes if node["id"] != node_id]
        if len(updated_nodes) == len(nodes):
            raise ValueError(f"Node not found: {node_id}")
        _write_node_library(updated_nodes)
        return _result(
            {
                "success": True,
                "message": "Node deleted successfully.",
                "deleted_id": node_id,
                "count": len(updated_nodes),
            }
        )
    except (AttributeError, OSError, json.JSONDecodeError, ValueError) as exc:
        return _error(str(exc))


# Workflow Tools
WORKFLOW_PREFIX = "workflow-"
WORKFLOW_DIR = Path(
    Path.home()
    / "Library"
    / "Application Support"
    / "Hermes"
    / "plugin-files"
    / "data"
    / "hermes-workflow"
)


def _workflow_path(workflow_id):
    return WORKFLOW_DIR / f"{WORKFLOW_PREFIX}{workflow_id}.json"


def _validate_workflow_id(workflow_id):
    if not isinstance(workflow_id, str):
        raise ValueError("Workflow UUID is required.")
    try:
        parsed = uuid.UUID(workflow_id)
    except ValueError:
        raise ValueError("Invalid workflow UUID.")
    if str(parsed) != workflow_id.lower():
        raise ValueError("Workflow ID must be a canonical UUID.")
    return workflow_id


def _read_workflow(workflow_id):
    path = _workflow_path(workflow_id)
    if not path.is_file():
        raise ValueError(f"Workflow not found: {workflow_id}")
    with path.open("r", encoding="utf-8") as file:
        workflow = json.load(file)
    if not isinstance(workflow, dict):
        raise ValueError("Invalid workflow document.")
    required = [
        "id",
        "name",
        "createdAt",
        "updatedAt",
        "nodes",
        "edges",
    ]
    if not all(key in workflow for key in required):
        raise ValueError("Invalid workflow document structure.")
    if (
        workflow["id"] != workflow_id
        or not isinstance(workflow["name"], str)
        or not isinstance(workflow["createdAt"], str)
        or not isinstance(workflow["updatedAt"], str)
        or not isinstance(workflow["nodes"], list)
        or not isinstance(workflow["edges"], list)
    ):
        raise ValueError("Invalid workflow document structure.")
    return workflow


def _write_workflow(workflow):
    path = _workflow_path(workflow["id"])
    temporary_path = path.with_suffix(".json.tmp")
    with temporary_path.open("w", encoding="utf-8") as file:
        json.dump(workflow, file, ensure_ascii=False, indent=2)
    temporary_path.replace(path)


# FIX this, do not just dump all the workflow
def list_workflows(params, **kwargs):
    try:
        WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
        workflows = []
        for path in WORKFLOW_DIR.glob(f"{WORKFLOW_PREFIX}*.json"):
            try:
                workflow_id = path.name[len(WORKFLOW_PREFIX) : -len(".json")]
                workflow_id = _validate_workflow_id(workflow_id)
                workflow = _read_workflow(workflow_id)
                workflows.append(workflow)
            except (ValueError, json.JSONDecodeError, OSError):
                continue
        workflows.sort(
            key=lambda workflow: workflow["updatedAt"],
            reverse=True,
        )
        return _result(
            {
                "success": True,
                "count": len(workflows),
                "workflows": workflows,
            }
        )
    except OSError as exc:
        return _error(str(exc))


def get_workflow_by_id(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("id"))
        workflow = _read_workflow(workflow_id)
        return _result(
            {
                "success": True,
                "workflow": workflow,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def create_workflow(params, **kwargs):
    try:
        name = params.get("name")
        if name is not None and not isinstance(name, str):
            raise ValueError("Workflow name must be a string.")
        name = name.strip() if name else ""
        if len(name) > 120:
            raise ValueError("Workflow name must be 120 characters or fewer.")
        workflow_id = str(uuid.uuid4())
        now = _now()
        workflow = {
            "id": workflow_id,
            "name": name or f"workflow-{workflow_id}",
            "createdAt": now,
            "updatedAt": now,
            "nodes": [],
            "edges": [],
        }
        WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
        path = _workflow_path(workflow_id)
        with path.open("x", encoding="utf-8") as file:
            json.dump(workflow, file, ensure_ascii=False, indent=2)
        return _result(
            {
                "success": True,
                "message": "Workflow created successfully.",
                "workflow": workflow,
            }
        )
    except (ValueError, OSError) as exc:
        return _error(str(exc))


def update_workflow(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("id"))
        name = params.get("name")
        if name is not None and not isinstance(name, str):
            raise ValueError("Workflow name must be a string.")
        if name is not None and len(name.strip()) > 120:
            raise ValueError("Workflow name must be 120 characters or fewer.")
        existing = _read_workflow(workflow_id)
        workflow = {
            "id": workflow_id,
            "name": (name.strip() if name and name.strip() else existing["name"]),
            "createdAt": existing["createdAt"],
            "updatedAt": _now(),
            "nodes": existing["nodes"],
            "edges": existing["edges"],
        }
        _write_workflow(workflow)
        return _result(
            {
                "success": True,
                "message": "Workflow updated successfully.",
                "workflow": workflow,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def delete_workflow(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("id"))
        path = _workflow_path(workflow_id)
        if not path.is_file():
            raise ValueError(f"Workflow not found: {workflow_id}")
        path.unlink()
        return _result(
            {
                "success": True,
                "message": "Workflow deleted successfully.",
                "deleted_id": workflow_id,
            }
        )
    except (ValueError, OSError) as exc:
        return _error(str(exc))


def add_node_to_workflow(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("workflow_id"))
        general = _validate_node_general_data(params.get("general"))
        io = _validate_node_io_data(params.get("io"))
        config = _validate_node_config_data(params.get("config"))
        execution = _validate_node_config_data(params.get("execution"))

        workflow = _read_workflow(workflow_id)
        node_id = str(uuid.uuid4())

        existing_positions = [
            node.get("position", {})
            for node in workflow["nodes"]
            if isinstance(node, dict) and isinstance(node.get("position"), dict)
        ]
        max_y = max(
            (
                position.get("y", 0)
                for position in existing_positions
                if isinstance(position.get("y", 0), (int, float))
                and not isinstance(position.get("y", 0), bool)
            ),
            default=0,
        )

        node = {
            "type": "base",
            "id": node_id,
            "position": {
                "x": 100,
                "y": max_y + 250,
            },
            "data": {
                "general": general,
                "io": io,
                "config": config,
                "execution": execution,
            },
            "selected": False,
            "dragging": False,
        }

        workflow["nodes"].append(node)
        workflow["updatedAt"] = _now()

        _write_workflow(workflow)

        return _result(
            {
                "success": True,
                "message": "Node added to workflow successfully.",
                "workflow_id": workflow_id,
                "node": node,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def add_library_node_to_workflow(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("workflow_id"))
        library_node_id = params.get("node_id")
        if not isinstance(library_node_id, str) or not library_node_id:
            raise ValueError("Saved node library ID is required.")
        if not NODE_LIBRARY_PATH.is_file():
            raise ValueError("Node library file does not exist.")
        with NODE_LIBRARY_PATH.open("r", encoding="utf-8") as file:
            library_nodes = json.load(file)
        if not isinstance(library_nodes, list):
            raise ValueError("Invalid node library format.")
        library_node = next(
            (
                item
                for item in library_nodes
                if isinstance(item, dict) and item.get("id") == library_node_id
            ),
            None,
        )
        if library_node is None:
            raise ValueError(f"Saved node not found: {library_node_id}")
        node_data = library_node.get("data")
        if not isinstance(node_data, dict):
            raise ValueError("Saved node contains invalid data.")

        workflow = _read_workflow(workflow_id)
        new_node_id = str(uuid.uuid4())

        existing_positions = [
            node.get("position", {})
            for node in workflow["nodes"]
            if isinstance(node, dict) and isinstance(node.get("position"), dict)
        ]
        max_y = max(
            (
                position.get("y", 0)
                for position in existing_positions
                if isinstance(position.get("y", 0), (int, float))
                and not isinstance(position.get("y", 0), bool)
            ),
            default=0,
        )

        node = {
            "type": "base",
            "id": new_node_id,
            "position": {
                "x": 100,
                "y": max_y + 250,
            },
            "data": node_data,
            "selected": False,
            "dragging": False,
        }

        workflow["nodes"].append(node)
        workflow["updatedAt"] = _now()

        _write_workflow(workflow)

        return _result(
            {
                "success": True,
                "message": "Saved node added to workflow successfully.",
                "workflow_id": workflow_id,
                "library_node_id": library_node_id,
                "node": node,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def update_workflow_node(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("workflow_id"))
        node_id = params.get("node_id")
        if not isinstance(node_id, str) or not node_id:
            raise ValueError("Workflow node ID is required.")
        updatable_sections = (
            "general",
            "io",
            "config",
            "execution",
        )
        updates = {
            section: params[section]
            for section in updatable_sections
            if section in params
        }
        if not updates:
            raise ValueError(
                "Provide at least one section to update: "
                "general, io, config, or execution."
            )
        validators = {
            "general": _validate_node_general_data,
            "io": _validate_node_io_data,
            "config": _validate_node_config_data,
            "execution": _validate_node_execution_data,
        }
        for section, value in updates.items():
            validators[section](value)
        workflow = _read_workflow(workflow_id)
        target_node = next(
            (
                node
                for node in workflow["nodes"]
                if isinstance(node, dict) and node.get("id") == node_id
            ),
            None,
        )
        if target_node is None:
            raise ValueError(f"Node not found in workflow: {node_id}")
        node_data = target_node.get("data")
        if not isinstance(node_data, dict):
            raise ValueError(f"Node {node_id} contains invalid data.")
        for section, value in updates.items():
            node_data[section] = value
        target_node["data"] = node_data
        workflow["updatedAt"] = _now()
        _write_workflow(workflow)
        return _result(
            {
                "success": True,
                "message": "Workflow node updated successfully.",
                "workflow_id": workflow_id,
                "node_id": node_id,
                "updated_sections": list(updates.keys()),
                "node": target_node,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def delete_workflow_node(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("workflow_id"))
        node_id = params.get("node_id")
        if not isinstance(node_id, str) or not node_id:
            raise ValueError("Workflow node ID is required.")
        workflow = _read_workflow(workflow_id)
        node_index = next(
            (
                index
                for index, node in enumerate(workflow["nodes"])
                if isinstance(node, dict) and node.get("id") == node_id
            ),
            None,
        )
        if node_index is None:
            raise ValueError(f"Node not found in workflow: {node_id}")
        deleted_node = workflow["nodes"].pop(node_index)
        original_edge_count = len(workflow["edges"])
        workflow["edges"] = [
            edge
            for edge in workflow["edges"]
            if not (
                isinstance(edge, dict)
                and (edge.get("source") == node_id or edge.get("target") == node_id)
            )
        ]
        deleted_edge_count = original_edge_count - len(workflow["edges"])
        workflow["updatedAt"] = _now()
        _write_workflow(workflow)
        return _result(
            {
                "success": True,
                "message": "Workflow node and its connected edges deleted successfully.",
                "workflow_id": workflow_id,
                "deleted_node_id": node_id,
                "deleted_edge_count": deleted_edge_count,
                "deleted_node": deleted_node,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def duplicate_workflow_node(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("workflow_id"))
        node_id = params.get("node_id")
        if not isinstance(node_id, str) or not node_id:
            raise ValueError("Workflow node ID is required.")
        workflow = _read_workflow(workflow_id)
        original_node = next(
            (
                node
                for node in workflow["nodes"]
                if isinstance(node, dict) and node.get("id") == node_id
            ),
            None,
        )
        if original_node is None:
            raise ValueError(f"Node not found in workflow: {node_id}")
        duplicated_node_id = str(uuid.uuid4())
        duplicated_node = json.loads(json.dumps(original_node))
        duplicated_node["id"] = duplicated_node_id
        original_position = original_node.get("position", {})
        if not isinstance(original_position, dict):
            original_position = {}
        original_x = original_position.get("x", 100)
        original_y = original_position.get("y", 100)
        duplicated_node["position"] = {
            "x": original_x + 50,
            "y": original_y + 50,
        }
        duplicated_node["selected"] = False
        duplicated_node["dragging"] = False
        workflow["nodes"].append(duplicated_node)
        workflow["updatedAt"] = _now()
        _write_workflow(workflow)
        return _result(
            {
                "success": True,
                "message": "Workflow node duplicated successfully.",
                "workflow_id": workflow_id,
                "original_node_id": node_id,
                "duplicated_node": duplicated_node,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def add_workflow_edge(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("workflow_id"))
        source_node_id = params.get("source_node_id")
        source_handle = params.get("source_handle")
        target_node_id = params.get("target_node_id")
        target_handle = params.get("target_handle")
        if not isinstance(source_node_id, str) or not source_node_id:
            raise ValueError("Source node ID is required.")
        if not isinstance(source_handle, str) or not source_handle:
            raise ValueError("Source handle is required.")
        if not isinstance(target_node_id, str) or not target_node_id:
            raise ValueError("Target node ID is required.")
        if not isinstance(target_handle, str) or not target_handle:
            raise ValueError("Target handle is required.")
        if source_node_id == target_node_id:
            raise ValueError("Source and target nodes cannot be the same.")
        workflow = _read_workflow(workflow_id)
        source_node = next(
            (
                node
                for node in workflow["nodes"]
                if isinstance(node, dict) and node.get("id") == source_node_id
            ),
            None,
        )
        if source_node is None:
            raise ValueError(f"Source node not found: {source_node_id}")
        source_io = source_node.get("data", {}).get("io", {})
        source_outputs = source_io.get("outputs", [])
        if not isinstance(source_outputs, list):
            raise ValueError("Source node has invalid output definitions.")
        source_port = next(
            (
                port
                for port in source_outputs
                if isinstance(port, dict) and port.get("name") == source_handle
            ),
            None,
        )
        if source_port is None:
            raise ValueError(
                f"Source handle '{source_handle}' does not exist "
                f"on source node '{source_node_id}'."
            )
        source_type = source_port.get("type")
        target_node = next(
            (
                node
                for node in workflow["nodes"]
                if isinstance(node, dict) and node.get("id") == target_node_id
            ),
            None,
        )
        if target_node is None:
            raise ValueError(f"Target node not found: {target_node_id}")
        target_io = target_node.get("data", {}).get("io", {})
        target_inputs = target_io.get("inputs", [])
        if not isinstance(target_inputs, list):
            raise ValueError("Target node has invalid input definitions.")
        target_port = next(
            (
                port
                for port in target_inputs
                if isinstance(port, dict) and port.get("name") == target_handle
            ),
            None,
        )
        if target_port is None:
            raise ValueError(
                f"Target handle '{target_handle}' does not exist "
                f"on target node '{target_node_id}'."
            )
        target_type = target_port.get("type")
        if source_type != target_type:
            raise ValueError(
                f"Port type mismatch: source handle '{source_handle}' "
                f"has type '{source_type}', but target handle "
                f"'{target_handle}' has type '{target_type}'."
            )
        for edge in workflow["edges"]:
            if not isinstance(edge, dict):
                continue
            if (
                edge.get("source") == source_node_id
                and edge.get("sourceHandle") == source_handle
                and edge.get("target") == target_node_id
                and edge.get("targetHandle") == target_handle
            ):
                raise ValueError("An edge already exists between these exact handles.")
        edge_id = (
            f"xy-edge__{source_node_id}{source_handle}-"
            f"{target_node_id}{target_handle}"
        )
        edge = {
            "id": edge_id,
            "type": "smoothstep",
            "animated": True,
            "style": {
                "stroke": "#64748b",
                "strokeWidth": 2,
            },
            "source": source_node_id,
            "sourceHandle": source_handle,
            "target": target_node_id,
            "targetHandle": target_handle,
        }
        workflow["edges"].append(edge)
        workflow["updatedAt"] = _now()
        _write_workflow(workflow)
        return _result(
            {
                "success": True,
                "message": "Workflow edge created successfully.",
                "workflow_id": workflow_id,
                "edge": edge,
                "connection": {
                    "source_type": source_type,
                    "target_type": target_type,
                },
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def remove_workflow_edge(params, **kwargs):
    try:
        workflow_id = _validate_workflow_id(params.get("workflow_id"))
        edge_id = params.get("edge_id")
        if not isinstance(edge_id, str) or not edge_id:
            raise ValueError("Edge ID is required.")
        workflow = _read_workflow(workflow_id)
        edge_index = next(
            (
                index
                for index, edge in enumerate(workflow["edges"])
                if isinstance(edge, dict) and edge.get("id") == edge_id
            ),
            None,
        )
        if edge_index is None:
            raise ValueError(f"Edge not found in workflow: {edge_id}")
        removed_edge = workflow["edges"].pop(edge_index)
        workflow["updatedAt"] = _now()
        _write_workflow(workflow)
        return _result(
            {
                "success": True,
                "message": "Workflow edge removed successfully.",
                "workflow_id": workflow_id,
                "removed_edge_id": edge_id,
                "edge": removed_edge,
            }
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        return _error(str(exc))


def request_run_workflow(params, **kwargs):
    from hermes_cli.plugin_events import broadcast_plugin_event # pyright: ignore[reportMissingImports]

    workflow_id = params.get("workflow_id")
    if not isinstance(workflow_id, str) or not workflow_id.strip():
        return json.dumps(
            {
                "success": False,
                "error": "A valid workflow_id is required.",
            }
        )
    try:
        broadcast_plugin_event(
            "hermes-workflow",
            "workflow.run",
            {
                "workflow_id": workflow_id,
            },
        )
        return json.dumps(
            {
                "success": True,
                "message": "Workflow execution request broadcast.",
                "workflow_id": workflow_id,
            }
        )
    except Exception as exc:
        return json.dumps(
            {
                "success": False,
                "error": str(exc),
            }
        )
