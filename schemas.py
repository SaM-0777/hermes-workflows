DATA_TYPES = [
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
]

# Schemas

# Partial Correct:
OneOf = [
    {
        "properties": {
            "type": {"const": "String"},
            "defaultValue": {"type": "string"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Number"},
            "defaultValue": {"type": "number"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Boolean"},
            "defaultValue": {"type": "boolean"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Object"},
            "defaultValue": {"type": "object"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Array"},
            "defaultValue": {"type": "array"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Any"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Image"},
            "defaultValue": {"type": "string"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Audio"},
            "defaultValue": {"type": "string"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "Video"},
            "defaultValue": {"type": "string"},
        },
        "required": ["type", "defaultValue"],
    },
    {
        "properties": {
            "type": {"const": "File"},
            "defaultValue": {"type": "string"},
        },
        "required": ["type", "defaultValue"],
    },
]

PORT_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64,
            "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
            "description": "Unique name of the input or output port. Must start with a letter and contain only letters, numbers, underscores, or hyphens.",
        },
        "type": {
            "type": "string",
            "enum": DATA_TYPES,
            "description": "Data type accepted or produced by this port.",
        },
    },
    "required": ["name", "type"],
}

# Correct:
GENERAL_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64,
            "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
            "description": (
                "Unique name of the node. "
                "Must not duplicate the name of another node in the same workflow. "
                "Must start with a letter and contain only letters, numbers, "
                "underscores, or hyphens."
            ),
        },
        "description": {
            "type": "string",
            "maxLength": 500,
            "description": "Description of what the node does.",
        },
        "category": {
            "type": "string",
            "minLength": 1,
            "description": "Category used to classify the node.",
        },
    },
    "required": ["name", "description"],
}

# Correct:
IO_SCHEMA = {
    "type": "object",
    "description": "Node input and output port definitions.",
    "properties": {
        "inputs": {
            "type": "array",
            "items": PORT_SCHEMA,
            "description": "Input ports.",
        },
        "outputs": {
            "type": "array",
            "items": PORT_SCHEMA,
            "description": "Output ports.",
        },
    },
    "required": ["inputs", "outputs"],
}

# Correct:
CONFIG_SCHEMA = {
    "type": "object",
    "description": "Configuration parameters required by the node.",
    "properties": {
        "parameters": {
            "type": "array",
            "description": "List of configurable parameters exposed by the node.",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 64,
                        "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
                        "description": "Unique parameter name used to reference its value in the execution code.",
                    },
                    "type": {
                        "type": "string",
                        "enum": DATA_TYPES,
                        "description": "Data type of the parameter. The default value must match this type.",
                    },
                    "defaultValue": {
                        "type": "string",
                        "description": (
                            "Default value for this parameter, provided as a string. "
                            "Its actual value must match the selected parameter type. "
                            "Examples: type='Number', defaultValue='5'; "
                            "type='Boolean', defaultValue='true'; "
                            "type='String', defaultValue='hello'; "
                            "type='Array', defaultValue='[1, 2, 3]'; "
                            "type='Object', defaultValue='{\"key\": \"value\"}'."
                        ),
                    },
                },
                "required": ["name", "type", "defaultValue"],
            },
        },
    },
    "required": ["parameters"],
}

# Correct:
EXECUTION_SCHEMA = {
    "type": "object",
    "description": (
        "Python execution definition for the node. "
        "The execution code must remain synchronized with the node's "
        "general, io, and config definitions."
    ),
    "properties": {
        "pythonCode": {
            "type": "string",
            "description": (
                "Complete Python code defining the node's Execution class. "
                "Preserve the required Execution class blueprint exactly: "
                "name, description, and category must match general.name, "
                "general.description, and general.category respectively. "
                "The inputs list must contain every entry from io.inputs, "
                "using the corresponding Python type. The outputs list must "
                "contain every entry from io.outputs, also using the "
                "corresponding Python type. The parameters dictionary must "
                "contain every entry from config.parameters, with matching "
                "parameter names, Python types, and default values. "
                "Whenever an input, output, parameter, name, description, "
                "or category changes, the corresponding execution code must "
                "be updated to match. Do not omit, rename, or invent entries "
                "that conflict with these definitions. "
                "Preserve the required class structure and method signatures: "
                "run(self, inputs, parameters, context) and "
                "build_output(self, inputs, parameters, context). "
                "The run method contains the node's execution logic. "
                "build_output must call run, apply any required output "
                "formatting, and return the final output. "
                "The workflow runtime calls build_output. "
                "Do not remove or rename the required class, methods, "
                "or method arguments. Additional helper functions and "
                "additional classes are allowed, but additional classes "
                "must be defined outside the Execution class. "
                "Do not use class inheritance or replace the required "
                "blueprint with an abstraction."
            ),
        },
    },
    "required": ["pythonCode"],
}

# Correct:
NODE_DATA_SCHEMA = {
    "type": "object",
    "properties": {
        "general": GENERAL_SCHEMA,
        "io": IO_SCHEMA,
        "config": CONFIG_SCHEMA,
        "execution": EXECUTION_SCHEMA,
    },
    "required": ["general"],
}

# Node library schemas

# Correct:
LIST_NODES = {
    "name": "list_nodes",
    "description": (
        "List all nodes saved in the Workflow Studio node library. "
        "Returns the complete contents of the node library JSON file."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}

# Correct:
GET_NODE_BY_ID = {
    "name": "get_node_by_id",
    "description": (
        "Retrieve a single saved Workflow Studio node using its UUID. "
        "Returns the complete saved node including its ID, data, "
        "createdAt, and updatedAt."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "UUID of the saved node.",
            },
        },
        "required": ["id"],
    },
}

# Correct:
CREATE_NODE = {
    "name": "create_node",
    "description": (
        "Create a new reusable Workflow Studio node. "
        "Provide its general information and optional inputs, outputs, "
        "parameters, and Python execution code."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "data": NODE_DATA_SCHEMA,
        },
        "required": ["data"],
    },
}

# Optional, Only provide the data that needs to be updated ...
UPDATE_NODE = {
    "name": "update_node",
    "description": (
        "Update an existing Workflow Studio node. "
        "Provide the saved node ID and its complete updated data."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "ID of the saved node to update.",
            },
            "data": NODE_DATA_SCHEMA,
        },
        "required": ["id", "data"],
    },
}

# Correct:
DELETE_NODE = {
    "name": "delete_node",
    "description": (
        "Permanently remove a saved node from the Workflow Studio node library. "
        "Requires the saved node ID."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "ID of the saved node to delete.",
            },
        },
        "required": ["id"],
    },
}

# Workflow schemas

# DO NOT JUST DUMP EVERY WORKFLOW
LIST_WORKFLOWS = {
    "name": "list_workflows",
    "description": "List all saved Workflow Studio workflows.",
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}

# Correct:
GET_WORKFLOW_BY_ID = {
    "name": "get_workflow_by_id",
    "description": "Retrieve a complete workflow using its UUID.",
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "UUID of the workflow.",
            },
        },
        "required": ["id"],
    },
}

# Correct: Create an empty workflow
CREATE_WORKFLOW = {
    "name": "create_workflow",
    "description": (
        "Create a new empty Workflow Studio workflow. "
        "The workflow UUID and timestamps are generated automatically."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Name of the workflow.",
            },
        },
        "required": [],
    },
}

# Correct: Update the workflow properties, excluding nodes, edges
UPDATE_WORKFLOW = {
    "name": "update_workflow",
    "description": (
        "Save changes to an existing workflow. "
        "Provide its UUID, "
        "and its updated name."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "UUID of the existing workflow.",
            },
            "name": {
                "type": "string",
                "description": "Updated workflow name.",
            },
        },
        "required": ["id", "name"],
    },
}

# Correct:
DELETE_WORKFLOW = {
    "name": "delete_workflow",
    "description": "Delete a saved workflow using its UUID.",
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "string",
                "description": "UUID of the workflow to delete.",
            },
        },
        "required": ["id"],
    },
}


ADD_NODE_TO_WORKFLOW = {
    "name": "add_node_to_workflow",
    "description": (
        "Add a complete new node to an existing workflow. "
        "Provide the workflow ID and the node's data general, io, config, "
        "and execution sections. The node ID and position are generated "
        "automatically. The node is appended without modifying existing nodes or edges."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "UUID ID of the workflow to which the node will be added.",
            },
            "general": GENERAL_SCHEMA,
            "io": IO_SCHEMA,
            "config": CONFIG_SCHEMA,
            "execution": EXECUTION_SCHEMA,
        },
        "required": [
            "workflow_id",
            "general",
            "io",
            "config",
            "execution",
        ],
    },
}

ADD_LIBRARY_NODE_TO_WORKFLOW = {
    "name": "add_library_node_to_workflow",
    "description": (
        "Add a node from the saved node library to an existing workflow. "
        "Provide the workflow ID and the saved library node ID. "
        "The node data is copied from the library. A new node ID and "
        "position are generated automatically. The saved library node "
        "remains unchanged."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the destination workflow.",
            },
            "node_id": {
                "type": "string",
                "description": "ID of the node in the saved node library.",
            },
        },
        "required": ["workflow_id", "node_id"],
    },
}

UPDATE_WORKFLOW_NODE = {
    "name": "update_workflow_node",
    "description": (
        "Update an existing node in a workflow. "
        "Provide the workflow ID and node ID. "
        "Only include the node sections you want to update: "
        "general, io, config, or execution. "
        "Unprovided sections remain unchanged."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the workflow containing the node.",
            },
            "node_id": {
                "type": "string",
                "description": "ID of the node to update within the workflow.",
            },
            "general": GENERAL_SCHEMA,
            "io": IO_SCHEMA,
            "config": CONFIG_SCHEMA,
            "execution": EXECUTION_SCHEMA,
        },
        "required": [
            "workflow_id",
            "node_id",
        ],
    },
}

DELETE_WORKFLOW_NODE = {
    "name": "delete_workflow_node",
    "description": (
        "Delete a node from an existing workflow. "
        "Provide the workflow ID and the ID of the node to delete. "
        "All edges connected to the node, whether as a source or target, "
        "will also be deleted."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the workflow containing the node.",
            },
            "node_id": {
                "type": "string",
                "description": "ID of the node to delete from the workflow.",
            },
        },
        "required": [
            "workflow_id",
            "node_id",
        ],
    },
}

DUPLICATE_WORKFLOW_NODE = {
    "name": "duplicate_workflow_node",
    "description": (
        "Duplicate a node in an existing workflow. "
        "Provide the workflow ID and the ID of the node to duplicate. "
        "The node's data is copied into a new node with a newly generated ID "
        "and position. No edges are copied or created."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the workflow containing the original node.",
            },
            "node_id": {
                "type": "string",
                "description": "ID of the existing node to duplicate.",
            },
        },
        "required": [
            "workflow_id",
            "node_id",
        ],
    },
}

ADD_WORKFLOW_EDGE = {
    "name": "add_workflow_edge",
    "description": (
        "Connect two nodes in an existing workflow by creating an edge. "
        "Provide the workflow ID, source node ID, source output handle name, "
        "target node ID, and target input handle name. "
        "The source handle must exist in the source node's io.outputs, "
        "and the target handle must exist in the target node's io.inputs. "
        "Their data types must match exactly. "
        "An edge is created only when both handles exist and their types match."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the workflow containing both nodes.",
            },
            "source_node_id": {
                "type": "string",
                "description": "ID of the source node.",
            },
            "source_handle": {
                "type": "string",
                "description": (
                    "Exact name of an output port from the source node's "
                    "data.io.outputs array."
                ),
            },
            "target_node_id": {
                "type": "string",
                "description": "ID of the target node.",
            },
            "target_handle": {
                "type": "string",
                "description": (
                    "Exact name of an input port from the target node's "
                    "data.io.inputs array. Its type must match the source output type."
                ),
            },
        },
        "required": [
            "workflow_id",
            "source_node_id",
            "source_handle",
            "target_node_id",
            "target_handle",
        ],
    },
}

REMOVE_WORKFLOW_EDGE = {
    "name": "remove_workflow_edge",
    "description": (
        "Remove an existing edge from a workflow. "
        "Provide the workflow ID and the exact edge ID to remove. "
        "The edge ID must identify an existing edge in the specified workflow."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the workflow containing the edge.",
            },
            "edge_id": {
                "type": "string",
                "description": ("Exact ID of the edge to remove from the workflow."),
            },
        },
        "required": [
            "workflow_id",
            "edge_id",
        ],
    },
}

REQUEST_RUN_WORKFLOW = {
    "name": "request_run_workflow",
    "description": "Request user approval to Run a saved workflow in Workflow Studio using its workflow ID.",
    "parameters": {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": "ID of the saved workflow to execute.",
            },
        },
        "required": ["workflow_id"],
    },
}
