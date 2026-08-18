// Pure parsers for the git output the CLI consumes — kept free of child_process
// and fs so they can be unit-tested with plain strings.

// parse `git worktree list --porcelain` into a branch->path map (+ detached ones),
// excluding any bare repo entry and the current worktree (compared via samePath,
// so the caller can make it symlink/case tolerant).
export function parseWorktrees(out, { currentTop = "", samePath = (a, b) => a === b } = {}) {
	const byBranch = new Map();
	const detached = [];
	const register = (b) => {
		if (!b || !b.path || b.bare || samePath(b.path, currentTop)) return;
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

// parse `git branch [-a]` output into a deduped, ordered entry list, where a
// branch that lives in another worktree becomes a 'worktree' entry (with its
// path). Branches git marks '+' whose worktree path we couldn't resolve are
// reported in `unresolved` so the caller can warn instead of failing silently.
export function parseBranchList(out, byBranch) {
	const seen = new Map();
	const unresolved = [];
	let currentName = null;
	for (const rawLine of out.replace(/\r/g, "").split("\n")) {
		if (!rawLine) continue;
		const isCurrent = rawLine.startsWith("*"); // current branch in this worktree
		const isOtherWorktree = rawLine.startsWith("+"); // branch checked out in another worktree
		// drop the 2-char marker column ('* ', '+ ', '  ') and the remotes/origin/ prefix
		const clean = rawLine.slice(2).trim().replace(/^remotes\/origin\//, "");
		// skip the remote HEAD pointer ('HEAD -> origin/master', any remote name) —
		// anchored so a branch literally named 'a->b' is kept
		if (!clean || /^(remotes\/[^/]+\/)?HEAD -> /.test(clean)) continue;
		if (isCurrent) currentName = clean;

		const wtPath = byBranch.get(clean);
		if (isOtherWorktree && !wtPath && !unresolved.includes(clean)) unresolved.push(clean);
		const asWorktree = !isCurrent && Boolean(wtPath);
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
	return { entries: [...seen.values()], currentName, unresolved };
}
