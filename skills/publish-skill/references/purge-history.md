# Purge something from a repo's history

Used once for real: a private product's skill (two folder paths over time, a README
section, commit-message lines) removed from a public repo's full history.

**Rotate any leaked secret first.** Rewriting history does not un-leak it.

## 1. Back up and inventory

```bash
git clone https://github.com/<owner>/<repo>.git rewrite && cd rewrite
git config core.longpaths true
git bundle create ../<repo>-backup.bundle --all
git ls-remote origin                                  # every branch and tag you must rewrite
git log --all --name-only --format= | grep -i <term> | sort -u   # every path it ever had
git log --all --format=%B | grep -in <term>                        # commit messages naming it
```

Also grep file contents across history (`git grep -il <term> $(git rev-list --all)`):
README sections and docs mention things long after the folder moves.

## 2. Rewrite

`git filter-repo` is cleanest if installed. Without it, `filter-branch` works:

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --index-filter 'git rm -r -q --cached --ignore-unmatch <path1> <path2>' \
  --msg-filter 'node /abs/path/scrub-message.cjs' \
  --prune-empty -- --all
```

To scrub text inside a file that must stay (e.g. a README section), extend the
index filter: `git cat-file blob :README.md | node scrub.cjs | git hash-object -w --stdin`,
then `git update-index --cacheinfo "<mode>,<sha>,README.md"`.

## 3. Verify before pushing

```bash
git for-each-ref --format="%(refname)" refs/original/ | xargs -r -n1 git update-ref -d
git reflog expire --expire=now --all && git gc -q --prune=now
git rev-list --all --objects | grep -ic <term>     # 0
git log --all --format=%B | grep -ic <term>        # 0
git rev-parse HEAD^{tree}                          # equal to before, if HEAD already lacked it
```

## 4. Push and close out

```bash
git push --force-with-lease=main:<old-head-sha> origin main
```

The lease makes the push fail if anyone pushed in between. Then:
- CI must go green on the new head.
- Old commits remain fetchable by exact SHA until GitHub garbage-collects them. The
  owner files a "remove sensitive data" request at https://support.github.com/contact
  with the repo and the affected SHAs (list them from the backup bundle).
- Anyone with a clone must re-clone; the marketplace clone in Claude Code refreshes
  on `claude plugin marketplace update <name>` (it re-clones when the fetch fails).
