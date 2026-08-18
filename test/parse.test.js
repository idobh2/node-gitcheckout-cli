import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorktrees, parseBranchList } from "../parse.js";

const PORCELAIN = [
	"worktree /repo",
	"HEAD 1111111111111111111111111111111111111111",
	"branch refs/heads/master",
	"",
	"worktree /repo-feature",
	"HEAD 2222222222222222222222222222222222222222",
	"branch refs/heads/feature/login",
	"",
	"worktree /repo-detached",
	"HEAD 3333333333333333333333333333333333333333",
	"detached",
	"",
].join("\n");

test("parseWorktrees maps branches to paths and strips refs/heads/", () => {
	const { byBranch } = parseWorktrees(PORCELAIN, { currentTop: "/repo" });
	assert.deepEqual([...byBranch.entries()], [["feature/login", "/repo-feature"]]);
});

test("parseWorktrees excludes the current worktree", () => {
	const { byBranch } = parseWorktrees(PORCELAIN, { currentTop: "/repo" });
	assert.equal(byBranch.has("master"), false);
});

test("parseWorktrees uses samePath for current-worktree exclusion (symlinks)", () => {
	const samePath = (a, b) => a.replace(/^\/private/, "") === b.replace(/^\/private/, "");
	const { byBranch } = parseWorktrees(PORCELAIN, { currentTop: "/private/repo", samePath });
	assert.equal(byBranch.has("master"), false);
	assert.equal(byBranch.get("feature/login"), "/repo-feature");
});

test("parseWorktrees collects detached worktrees with their HEAD", () => {
	const { detached } = parseWorktrees(PORCELAIN, { currentTop: "/repo" });
	assert.equal(detached.length, 1);
	assert.equal(detached[0].path, "/repo-detached");
	assert.equal(detached[0].head, "3333333333333333333333333333333333333333");
});

test("parseWorktrees skips bare entries", () => {
	const out = "worktree /repo.git\nbare\n\nworktree /repo-wt\nHEAD 4444444444444444444444444444444444444444\nbranch refs/heads/dev\n";
	const { byBranch, detached } = parseWorktrees(out, { currentTop: "/elsewhere" });
	assert.deepEqual([...byBranch.entries()], [["dev", "/repo-wt"]]);
	assert.equal(detached.length, 0);
});

test("parseWorktrees handles CRLF output and a trailing block without a blank line", () => {
	const out = PORCELAIN.replace(/\n$/, "").replace(/\n/g, "\r\n");
	const { byBranch, detached } = parseWorktrees(out, { currentTop: "/repo" });
	assert.equal(byBranch.get("feature/login"), "/repo-feature");
	assert.equal(detached.length, 1);
});

test("parseWorktrees tolerates empty/failed output", () => {
	const { byBranch, detached } = parseWorktrees("", { currentTop: "/repo" });
	assert.equal(byBranch.size, 0);
	assert.equal(detached.length, 0);
});

const branchOut = (lines) => lines.join("\n") + "\n";

test("parseBranchList detects the current branch and keeps order", () => {
	const { entries, currentName } = parseBranchList(branchOut([
		"  develop",
		"* master",
		"  feature/x",
	]), new Map());
	assert.equal(currentName, "master");
	assert.deepEqual(entries.map((e) => e.branch), ["develop", "master", "feature/x"]);
	assert.ok(entries.every((e) => e.type === "branch"));
});

test("parseBranchList turns a '+' branch with a known path into a worktree entry", () => {
	const byBranch = new Map([["feature/login", "/repo-feature"]]);
	const { entries, unresolved } = parseBranchList(branchOut([
		"* master",
		"+ feature/login",
	]), byBranch);
	assert.deepEqual(entries[1], { type: "worktree", branch: "feature/login", path: "/repo-feature" });
	assert.deepEqual(unresolved, []);
});

test("parseBranchList reports a '+' branch whose path is unknown instead of silently downgrading", () => {
	const { entries, unresolved } = parseBranchList(branchOut([
		"* master",
		"+ feature/login",
	]), new Map());
	assert.deepEqual(unresolved, ["feature/login"]);
	assert.deepEqual(entries[1], { type: "branch", branch: "feature/login" });
});

test("parseBranchList never marks the current branch as a worktree", () => {
	const byBranch = new Map([["master", "/repo"]]);
	const { entries } = parseBranchList(branchOut(["* master"]), byBranch);
	assert.deepEqual(entries, [{ type: "branch", branch: "master" }]);
});

test("parseBranchList dedupes remotes and upgrades a branch a later line reveals as a worktree", () => {
	const byBranch = new Map([["feature/login", "/repo-feature"]]);
	const { entries } = parseBranchList(branchOut([
		"* master",
		"  remotes/origin/feature/login",
		"+ feature/login",
		"  remotes/origin/master",
	]), byBranch);
	assert.deepEqual(entries, [
		{ type: "branch", branch: "master" },
		{ type: "worktree", branch: "feature/login", path: "/repo-feature" },
	]);
});

test("parseBranchList skips the remote HEAD pointer but keeps a branch named with '->'", () => {
	const { entries } = parseBranchList(branchOut([
		"* master",
		"  remotes/origin/HEAD -> origin/master",
		"  remotes/upstream/HEAD -> upstream/master",
		"  a->b",
	]), new Map());
	assert.deepEqual(entries.map((e) => e.branch), ["master", "a->b"]);
});

test("parseBranchList handles CRLF output and blank lines", () => {
	const { entries, currentName } = parseBranchList("* master\r\n\r\n  develop\r\n", new Map());
	assert.equal(currentName, "master");
	assert.deepEqual(entries.map((e) => e.branch), ["master", "develop"]);
});
