# gitcheckout

This simple CLI tool will prompt you to conveniently choose a git branch, using keyboard arrows navigation, and check it out like a boss.

# Why??
Because we're lazy.
And sometimes you're so dedicated to writing long descriptive branch names, and so awesome you're working on 10 features at the same time. The least you can ask for is a CLI list with cool arrows navigation.

# Installation
`npm install -g gitcheckout-cli`

# Usage
In your git repo directory:

`gitcheckout`

If you want to choose a branch only from local branches:

`gitcheckout -l`

If you want to fetch first, before listing branches:

`gitcheckout -f`
> Note: Currently, the "-f" option doesn't handle credentials prompt, and will not fetch in that case, or any other case of "git fetch" failure.

`gitcheckout -d`
If you want to delete local branches interactively:

This will display a list of local branches. You can select one or more branches to delete using the spacebar, then press Enter to confirm deletion.

Example prompt:

```
? Select branches to delete: (Press <space> to select, <a> to toggle all, <i> to invert selection)
 ◯ develop
 ◯ hotfix/some-very-long-name-no-way-ill-remember
 ◯ feature/my-awesome-feature
 ◯ feature/gitcheckout-is-so-cool
 ◯ hotfix/fish-tacos-for-lunch
 ◯ master
```

> Note: The -d flag deletes local branches and removes worktrees. Use with caution—deleted branches cannot be recovered unless pushed to remote. (Worktrees that have uncommitted changes are skipped, with a message, rather than force-removed.)

Then you'll be displayed with the available branches list. Simple pick one and hit Enter.
```
? Select branch to checkout: (Use arrow keys)
  develop
  hotfix/some-very-long-name-no-way-ill-remember
  feature/my-awesome-feature
  feature/gitcheckout-is-so-cool
  hotfix/fish-tacos-for-lunch
> master
```

When prompted, you can type in to filter results
```
? Select branch to checkout: fish-t
> hotfix/fish-tacos-for-lunch
```

# Worktrees

Branches that are checked out in another [git worktree](https://git-scm.com/docs/git-worktree) show up in the list automatically, marked with a `+` (the same marker `git branch` uses):

```
? Select branch/worktree:
  feature/my-awesome-feature
+ master
> add-d-to-help-text
```

Picking a worktree opens a **new shell in that directory** — you land there ready to work, and type `exit` to return to where you started. (A CLI can't change its parent shell's directory, so it spawns a shell instead.) This works on macOS, Linux and Windows — it launches your `$SHELL`, or `cmd`/PowerShell on Windows.

With `-d`, selecting a worktree runs `git worktree remove` on it (the underlying branch is kept), while a regular branch still gets `git branch -D`.

Display help (yes, it has a '-h' arg)

`gitcheckout -h`


