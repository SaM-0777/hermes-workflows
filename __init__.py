def register(ctx):
    def workflow_run(args, **kwargs):
        code = args.get("code", "")
        if not code:
            return {"ok": False, "error": "no code"}

        # delegation
        result = ctx.dispatch_tool("execute_code", {"code": code})
        return {"ok": True, "result": result}

    ctx.register_tool(
        name="workflow_run",
        toolset="hermes-workflow",
        schema={
            "name": "workflow_run",
            "description": "Run workflow node code via Hermes execute_code",
            "parameters": {
                "type": "object",
                "properties": {"code": {"type": "string"}},
                "required": ["code"],
            },
        },
        handler=workflow_run,
    )
