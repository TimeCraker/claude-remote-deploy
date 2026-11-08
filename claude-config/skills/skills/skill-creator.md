---
name: skill-creator
description: Auto-encapsulate successful workflows into reusable skills when user says "learn new skill"
user_invocable: true
---

# Skill Creator

When the user says "学习新技能" or "learn new skill", execute this workflow:

## Step 1: Identify the Workflow
- Review the current conversation for a successful, repeatable workflow
- Ask the user: "要封装哪个工作流为技能？" (which workflow to encapsulate?)
- Confirm the trigger phrase and expected behavior

## Step 2: Generate Skill File
Create a new `.md` file in `~/.claude/skills/` with:
```yaml
---
name: <kebab-case-name>
description: <one-line Chinese+English description>
user_invocable: true/false
---
```

## Step 3: Write Skill Body
- Document the exact steps, commands, and decision logic
- Include examples of valid inputs
- Add error handling and edge cases

## Step 4: Verify
- Test the skill trigger phrase
- Confirm it produces the expected output
- Update the description if needed

## Naming Convention
- Use kebab-case: `my-skill-name.md`
- Prefix domain-specific skills: `go-`, `ws-`, `novaflow-`
