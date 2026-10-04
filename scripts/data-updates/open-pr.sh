#!/usr/bin/env bash
# Open, or refresh, one rolling pull request for a data update. Never merges,
# never pushes to the default branch.
#   BRANCH  bot-owned branch, e.g. data/pmms-rate
#   TITLE   PR title (also the commit subject)
#   REPORT  Markdown file for the PR body
#   GH_TOKEN, GITHUB_REF_NAME, GITHUB_WORKFLOW come from Actions.
# If people have pushed their own commits to the branch (say, updating
# golden tests for the last rate change), it comments the new figures on the
# PR instead of force-pushing over their work.
set -euo pipefail
BASE="${GITHUB_REF_NAME:-main}"
BOT_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
git config user.name "github-actions[bot]"
git config user.email "$BOT_EMAIL"

existing="$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')"
if [ -n "$existing" ] && git fetch -q origin "$BRANCH"; then
  others="$(git log --format=%ae "origin/$BASE..origin/$BRANCH" | grep -vxF "$BOT_EMAIL" || true)"
  if [ -n "$others" ]; then
    { echo "**Newer data is available.** Not overwriting this branch because people have pushed commits to it. Rerun the workflow after merging or closing this PR, or apply the figures below by hand."; echo; cat "$REPORT"; } > "$RUNNER_TEMP/comment.md"
    gh pr comment "$existing" --body-file "$RUNNER_TEMP/comment.md"
    exit 0
  fi
fi

git checkout -B "$BRANCH"
git add -A src
git commit -q -m "$TITLE" -m "Opened by the ${GITHUB_WORKFLOW:-data update} workflow. Review before merging."
git push -q --force origin "$BRANCH"

if [ -n "$existing" ]; then
  gh pr edit "$existing" --title "$TITLE" --body-file "$REPORT"
  echo "Refreshed PR #$existing"
else
  # Draft when the plan supports it; otherwise a regular PR.
  gh pr create --draft --base "$BASE" --head "$BRANCH" --title "$TITLE" --body-file "$REPORT" \
    || gh pr create --base "$BASE" --head "$BRANCH" --title "$TITLE" --body-file "$REPORT"
fi
