#!/usr/bin/env node

import { exec, spawn } from "child_process";
import { homedir } from "os";
import inquirer from 'inquirer';
import inquirerPrompt from 'inquirer-autocomplete-prompt';

inquirer.registerPrompt("autocomplete", inquirerPrompt);

const showHelp = process.argv.includes("-h");
const fetchFirst = process.argv.includes("-f");
const deleteBranches = process.argv.includes("-d");
const includeOrigin = process.argv.includes("-l") || deleteBranches ? "" : " -a";

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

function execute(cmd, pipe = true) {
	return new Promise((resolve, reject) => {
		exec(cmd, (err, stdout) => {
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

// parse `git worktree list --porcelain` into a branch->path map (+ detached ones),
// excluding the current worktree and any bare repo entry.
async function getWorktrees() {
	const out = await execute(`git worktree list --porcelain`).catch(() => "");
	const currentTop = (await execute(`git rev-parse --show-toplevel`).catch(() => "")).trim();

	const byBranch = new Map();
	const detached = [];
	const register = (b) => {
		if (!b || !b.path || b.bare || b.path === currentTop) return;
		if (b.branch) byBranch.set(b.branch, b.path);
		else detached.push(b);
	};

	let block = {};
	for (const line of out.replace(/\r/g, "").split("\n")) {
		if (line.startsWith("worktree ")) block = { path: line.slice("worktree ".length).trim() };
		else if (line.startsWith("HEAD ")) block.head = line.slice("HEAD ".length).trim();
		else if (line.startsWith("branch ")) block.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "").trim();
		else if (line === "detached") block.detached = true;
		else if (line === "bare") block.bare = true;
		else if (line === "") { register(block); block = {}; }
	}
	register(block);

	return { byBranch, detached };
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
		await execute(`git worktree remove "${wt.path}"`).catch((err) => {
			console.log(`Could not remove worktree ${tildify(wt.path)}: ${(err.message || err).trim()}`);
		});
	}
	if (branches.length) {
		await execute(`git branch -D ${branches.join(" ")}`);
	}
}

(async function run() {
	if (fetchFirst) {
		await execute(`git fetch`).catch(() => {
			console.log("Couldn't fetch. Fetch manually before to display new remote branches");
			return;
		});
	}

	const { byBranch, detached } = await getWorktrees();
	const gitBranchOut = await execute(`git branch --sort=-committerdate${includeOrigin}`, false);

	// build a deduped, ordered map of branch-name -> entry, where a branch that
	// lives in another worktree becomes a 'worktree' entry (with its path).
	const seen = new Map();
	let currentName = null;
	for (const rawLine of gitBranchOut.replace(/\r/g, "").trim().split("\n")) {
		if (!rawLine) continue;
		const isCurrent = rawLine.startsWith("*"); // current branch in this worktree
		const isOtherWorktree = rawLine.startsWith("+"); // branch checked out in another worktree
		// drop the 2-char marker column ('* ', '+ ', '  ') and the remotes/origin/ prefix
		const clean = rawLine.slice(2).trim().replace(/^remotes\/origin\//, "");
		if (!clean || clean.includes("->")) continue; // skip the 'HEAD -> origin/master' pointer
		if (isCurrent) currentName = clean;

		const wtPath = byBranch.get(clean);
		const asWorktree = !isCurrent && (isOtherWorktree || wtPath) && wtPath;
		const existing = seen.get(clean);
		if (!existing) {
			seen.set(clean, asWorktree
				? { type: "worktree", branch: clean, path: wtPath }
				: { type: "branch", branch: clean });
		} else if (existing.type === "branch" && asWorktree) {
			// a later line revealed this branch is actually in a worktree — upgrade it
			seen.set(clean, { type: "worktree", branch: clean, path: wtPath });
		}
	}

	const entries = [
		...seen.values(),
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
				return Promise.resolve(!input ? choices : choices.filter((c) => c.name.includes(input)));
			},
			pageSize: 10,
			default: defaultEntry,
		}
	]);

	if (chosen.type === "worktree") {
		openShell(chosen.path);
	} else {
		await execute(`git checkout ${chosen.branch}`);
	}

})()
	.catch((e) => {
		console.log(e.message || e);
		process.exit(1);
	});
