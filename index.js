#!/usr/bin/env node

const { exec } = require("child_process");
const inquirer = require("inquirer");
const co = require("co");
inquirer.registerPrompt("autocomplete", require('inquirer-autocomplete-prompt'));

const showHelp = process.argv.includes("-h");
const includeOrigin = process.argv.includes("-l") ? "" : " -a";
const fetchFirst = process.argv.includes("-f");

if (showHelp) {
	console.log(`
Command: gitcheckout [-l] [-f]
Select a branch using the keyboard arrows, hit Enter, and watch the magic as it happens.
The current checked out branch is the default selection.

-l: include only local branches in branches list
-f: fetch before listing branches (quietly skips if failed)
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

co(function* run() {
	if (fetchFirst) {
		yield execute(`git fetch`).catch(() => {
			console.log("Couldn't fetch. Fetch manually before to display new remote branches");
		});
	}
	const gitBranchOut = yield execute(`git branch --sort=-committerdate${includeOrigin}`, false);
	let checkedOutBranch = 0;
	let branches = gitBranchOut
		// removed output whitespace
		.trim()
		// deal with windows
		.replace(/\r/, "")
		// split to rows - each one is a branch
		.split("\n")
		// removed the checked out branch indicator '*', origin/ if branch -a was executed and trim whitespace
		.map((n, i) => {
			if (n.match(/^\s*\*/)) {
				checkedOutBranch = i;
			}
			return n.replace(/^\s*\*|^\s*remotes\/origin\//g, "").trim()
		});

	// dedup (if local was or is checked out and origins are included)
	branches = [...new Set(branches)];
	const { branch } = yield inquirer.prompt([
		{
			type: "autocomplete",
			message: "Select branch to checkout:",
			name: "branch",
			source: (answersSoFar, input) => {
				return Promise.resolve(null === input ? branches : branches.filter(n => n.includes(input)));
			},
			pageSize: 10,
			default: checkedOutBranch,
		}
	]);
	yield execute(`git checkout ${branch}`);

})
	.catch((e) => {
		process.exit(1);
	});
