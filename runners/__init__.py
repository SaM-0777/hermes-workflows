"""Runtime providers for Workflow Studio node execution.

`base` holds everything provider-agnostic: descriptors, the result marker, file
reference scanning and rewriting, and run records. Each provider contributes one
adapter module named after its descriptor id, plus — for providers that execute
code somewhere else — a driver script that the provider's own CLI runs.

Adding a provider is: a descriptor in providers.json, an adapter here, and a
driver if it needs one. Nothing in the graph, the studio or the run records
changes.
"""
