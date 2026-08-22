---
name: git-commit
description: Draft Conventional Commit messages and stage the right files without Co-Authored-By trailers
triggers: commit, git commit, conventional commit, staging, co-authored-by
---

# Skill: git commit

When the user asks to commit (or draft a commit):

1. **Safety check**: If there is no `.git` folder in the repository root, stop immediately.
   Do not run `git init`. Do not commit the entire tree. Return a message explaining
   that this command must be run inside a real git repository.
2. Run `git status`, `git diff` (staged + unstaged), and `git log -5 --oneline` first.
3. Stage only relevant source files — never `.env`, credentials, or secrets.
4. Write a Conventional Commit subject in English, imperative mood, ≤72 chars:
   `type(scope): subject` (or `type: subject` if scope is unclear).
5. **Never** add a `Co-Authored-By` trailer. Commits in this repo must have none.
6. Branches use `tipo/descripcion` (e.g. `feat/skills-loader`), never `TICKET-123-...`.
7. Pass the message via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
feat(skills): load markdown skills by keyword trigger

EOF
)"
```

8. Do not push unless the user explicitly asks.
