#!/usr/bin/env node

const { exec } = require("child_process");
const inquirer = require("inquirer");

if (process.argv.includes("-h")) {
	console.log(`
Command: gitcheckout [-o]
Select a branch using the keyboard arrows, hit Enter, and watch the magic as it happens.
The current checked out branch is the default selection.

-o: include remote branches in branches list	
`)
	process.exit(0);
}

const includeOrigin = process.argv.includes("-o") ? " -a" : ""

exec(`git branch --sort=-committerdate${includeOrigin}`, (err, stdout) => {
	if (err) {
		console.error(`Error: ${err.message}`);
		process.exit(1);
		return;
	}
	let checkedOutBranch = 0;
	let branches = stdout
		// removed output whitespace
		.trim()
		// deal with windows
		.replace(/\r/, "")
		// split to rows - each one is a branch
		.split("\n")
		// removed the checked out branch indicator '*', origin/ if branch -a was executed and trim whitespace
		.map((n, i) => {
			if(n.match(/^\s*\*/)){
				checkedOutBranch = i;
			}
			return n.replace(/^\s*\*|^\s*remotes\/origin\//g, "").trim()
		});

	// dedup (if local was or is checked out and origins are included)
	branches = [...new Set(branches)];
	inquirer.prompt([
		{
			type: "list",
			message: "Select branch to checkout:",
			name: "branch",
			choices: branches,
			pageSize: 10,
			default: checkedOutBranch,
		}
	]).then(({ branch }) => {
		const checkout = exec(`git checkout ${branch}`, (err) => {
			if(err){
				return process.exit(1);
			}
			process.exit(0);
		});
		checkout.stdout.pipe(process.stdout);
		checkout.stderr.pipe(process.stderr);
	})
})
