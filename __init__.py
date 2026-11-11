from pathlib import Path

TOOLSET = "hermes-workflow"


def register(ctx) -> None:
    from . import schemas as s
    from . import tools as t

    # Skills
    skills_dir = Path(__file__).parent / "skills"
    for child in sorted(skills_dir.iterdir()):
        skill_md = child / "SKILL.md"
        if child.is_dir() and skill_md.exists():
            ctx.register_skill(child.name, skill_md)

    # Tools
    tools = (
        # Nodes
        (s.LIST_NODES, t.list_nodes),
        (s.GET_NODE_BY_ID, t.get_node_by_id),
        (s.CREATE_NODE, t.create_node),
        (s.UPDATE_NODE, t.update_node),
        (s.DELETE_NODE, t.delete_node),
        # Workflows
        (s.LIST_WORKFLOWS, t.list_workflows),
        (s.GET_WORKFLOW_BY_ID, t.get_workflow_by_id),
        (s.CREATE_WORKFLOW, t.create_workflow),
        (s.UPDATE_WORKFLOW, t.update_workflow),
        (s.DELETE_WORKFLOW, t.delete_workflow),
        (s.ADD_NODE_TO_WORKFLOW, t.add_node_to_workflow),
        (s.ADD_LIBRARY_NODE_TO_WORKFLOW, t.add_library_node_to_workflow),
        (s.UPDATE_WORKFLOW_NODE, t.update_workflow_node),
        (s.DELETE_WORKFLOW_NODE, t.delete_workflow_node),
        (s.DUPLICATE_WORKFLOW_NODE, t.duplicate_workflow_node),
        (s.ADD_WORKFLOW_EDGE, t.add_workflow_edge),
        (s.REMOVE_WORKFLOW_EDGE, t.remove_workflow_edge),
    )
    for schema, handler in tools:
        ctx.register_tool(
            name=schema["name"], toolset=TOOLSET, schema=schema, handler=handler
        )


__all__ = ["register"]
