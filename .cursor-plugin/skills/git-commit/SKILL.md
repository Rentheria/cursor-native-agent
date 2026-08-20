---
name: git-commit
description: Draft Conventional Commit messages and stage the right files without Co-Authored-By trailers
triggers: commit, git commit, conventional commit, staging, co-authored-by
---

# Skill: git commit

When the user asks to commit (or draft a commit):

1. Run `git status`, `git diff` (staged + unstaged), and `git log -5 --oneline` first.
2. Stage only relevant source files — never `.env`, credentials, or secrets.
3. Write a Conventional Commit subject in English, imperative mood, ≤72 chars:
   `type(scope): subject` (or `type: subject` if scope is unclear).
4. **Never** add a `Co-Authored-By` trailer. Commits in this repo must have none.
5. Branches use `tipo/descripcion` (e.g. `feat/skills-loader`), never `TICKET-123-...`.
6. Pass the message via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
feat(skills): load markdown skills by keyword trigger

EOF
)"
```

7. Do not push unless the user explicitly asks.
