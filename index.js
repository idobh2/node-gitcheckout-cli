#!/usr/bin/env node

import { execFile, spawn } from "child_process";
import { realpathSync } from "fs";
import { homedir } from "os";
import inquirer from 'inquirer';
import inquirerPrompt from 'inquirer-autocomplete-prompt';
import { parseWorktrees, parseBranchList } from "./parse.js";

inquirer.registerPrompt("autocomplete", inquirerPrompt);

const showHelp = process.argv.includes("-h");
const fetchFirst = process.argv.includes("-f");
const deleteBranches = process.argv.includes("-d");
const localOnly = process.argv.includes("-l") || deleteBranches;

if (showHelp) {
	console.log(`
Command: gitcheckout [-l] [-f] [-d]
Select a branch using the keyboard arrows, hit Enter, and watch the magic as it happens.
The current checked out branch is the default selection.
Worktrees appear in the list marked with a '+' (just like 'git branch'). Selecting
one opens a new shell in that directory; type 'exit' to return to where you came from.

-l: include only local branches in branches list
-f: fetch before listing branches (quietly skips if failed)
-d: select local branches/worktrees to delete (worktrees are removed via 'git worktree remove')
`)
	process.exit(0);
}

// run git with an argv array (no shell), so branch names and worktree paths
// are never interpolated into a shell string
function git(args) {
	return new Promise((resolve, reject) => {
		execFile("git", args, (err, stdout) => {
			if (err) {
				return reject(err);
			}
			resolve(stdout);
		});
	});
}

const home = homedir();
// prettify long paths by collapsing the home directory to '~'
function tildify(p) {
	return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

// compare paths through realpath so symlinked mounts (e.g. macOS /var vs
// /private/var) still match; fall back to a raw compare if resolution fails
function samePath(a, b) {
	try {
		return realpathSync(a) === realpathSync(b);
	} catch {
		return a === b;
	}
}

// how an entry is shown in the list (worktrees keep git's '+' marker)
function displayName(entry) {
	if (entry.type === "worktree") {
		if (entry.branch) return `+ ${entry.branch}`;
		return `+ (detached${entry.head ? ` ${entry.head.slice(0, 7)}` : ""})`;
	}
	return entry.branch;
}

// open a brand-new shell sitting inside the worktree dir. A child process can't
// cd its parent shell, so we drop the user into a fresh interactive shell there.
function openShell(cwd) {
	const shell = process.env.SHELL
		|| process.env.ComSpec
		|| (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
	console.log(`\nEntering worktree: ${tildify(cwd)}  (type 'exit' to return)\n`);
	const child = spawn(shell, [], { cwd, stdio: "inherit" });
	child.on("exit", (code) => process.exit(code == null ? 0 : code));
	child.on("error", (err) => {
		console.log(`Couldn't open a shell: ${err.message}`);
		process.exit(1);
	});
}

async function getWorktrees() {
	const out = await git(["worktree", "list", "--porcelain"]).catch(() => "");
	const currentTop = (await git(["rev-parse", "--show-toplevel"]).catch(() => "")).trim();
	return parseWorktrees(out, { currentTop, samePath });
}

async function execDelete(choices) {
	const { selected } = await inquirer.prompt([
		{
			type: "checkbox",
			message: "Select branches/worktrees to delete:",
			name: "selected",
			choices,
			pageSize: 10,
		}
	]);
	const worktrees = selected.filter((e) => e.type === "worktree");
	const branches = selected.filter((e) => e.type === "branch").map((e) => e.branch);

	// remove worktrees one by one so a single failure (e.g. dirty/locked) doesn't abort the rest
	for (const wt of worktrees) {
		await git(["worktree", "remove", wt.path]).catch((err) => {
			// keep only git's own message, not the exec 'Command failed: ...' echo of the argv
			const reason = String(err.message || err).split("\n")
				.filter((l) => l.trim() && !l.startsWith("Command failed:"))
				.join(" ");
			console.log(`Could not remove worktree ${tildify(wt.path)}: ${reason}`);
		});
	}
	if (branches.length) {
		await git(["branch", "-D", ...branches]);
	}
}

(async function run() {
	if (fetchFirst) {
		await git(["fetch"]).catch(() => {
			console.log("Couldn't fetch. Fetch manually before to display new remote branches");
			return;
		});
	}

	const { byBranch, detached } = await getWorktrees();
	const branchArgs = ["branch", "--sort=-committerdate"];
	if (!localOnly) branchArgs.push("-a");
	const gitBranchOut = await git(branchArgs);

	const { entries: branchEntries, currentName, unresolved } = parseBranchList(gitBranchOut, byBranch);
	if (unresolved.length) {
		console.log(`Note: git marks ${unresolved.join(", ")} as checked out in another worktree, but the worktree path couldn't be resolved — listing as regular branch(es).`);
	}

	const entries = [
		...branchEntries,
		...detached.map((wt) => ({ type: "worktree", branch: null, path: wt.path, head: wt.head })),
	];
	const choices = entries.map((e) => ({ name: displayName(e), value: e }));

	if (deleteBranches) {
		return execDelete(choices);
	}

	const defaultEntry = entries.find((e) => e.type === "branch" && e.branch === currentName);
	const { chosen } = await inquirer.prompt([
		{
			type: "autocomplete",
			message: "Select branch/worktree:",
			name: "chosen",
			source: (answersSoFar, input) => {
				// filters on the display name on purpose, so typing '+' narrows to worktrees
				return Promise.resolve(!input ? choices : choices.filter((c) => c.name.includes(input)));
			},
			pageSize: 10,
			default: defaultEntry,
		}
	]);

	if (chosen.type === "worktree") {
		openShell(chosen.path);
	} else {
		await git(["checkout", chosen.branch]);
	}

})()
	.catch((e) => {
		console.log(e.message || e);
		process.exit(1);
	});
