# Inline skill return contract

Run each skill in the current agent context. Coordinators can use the following compact record to hand results between phases; it is not a separate agent response and does not replace the actual artifacts or observed evidence.

```markdown
## Return
verdict: pass | warn | fail
summary: <one concise sentence>
artifacts:
  - <relevant path>
next_action: <next phase or none>
```

Use `pass` only for work and checks actually completed, `warn` for limitations that permit the authorized workflow to continue, and `fail` for a blocking issue. List existing artifacts when available and identify skipped or unavailable checks. Follow the user's instructions on tests, external access and reporting. No additional agent, fork or parallel dispatch is required.
