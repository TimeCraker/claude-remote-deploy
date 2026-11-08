---
name: planning-with-files
description: Force plan.md generation before complex tasks, with real-time updates during development
user_invocable: false
---

# Planning with Files

When a task involves 3+ files or is flagged as complex, follow this workflow:

## Pre-Development
1. Analyze the request and identify scope, dependencies, and risks.
2. Generate `plan.md` in the project root with:
   - **Objective**: one-sentence goal
   - **Files to modify**: list with brief description of changes
   - **Implementation steps**: numbered, each with file path and action
   - **Testing strategy**: how to verify each step
   - **Risks**: what could go wrong and mitigations

## During Development
- After completing each step in plan.md, update its status: `[ ]` -> `[x]`
- If the approach changes, update the plan before continuing
- If new files are discovered, add them to the plan

## Post-Development
- Verify all plan items are checked off
- Run the testing strategy described in the plan
- Archive or gitignore plan.md after completion
