# Publishing this to GitHub

Nothing here needs a server. GitHub hosts the code, runs the tests, and serves the website for free.

## Fastest way (GitHub CLI)

1. Install git and the GitHub CLI: https://cli.github.com
2. Sign in once: `gh auth login`
3. Tell git who you are (once per computer):
   ```bash
   git config --global user.name  "Your Name"
   git config --global user.email "you@example.com"
   ```
4. From the project folder:
   ```bash
   scripts/publish-to-github.sh botbench public
   ```
   It fills in your username in the badges and links, commits, creates the repository, pushes, and turns on GitHub Pages.

## By hand (no CLI)

1. On github.com press **New repository**. Name it, leave README, .gitignore and license **unchecked**.
2. In the project folder:
   ```bash
   scripts/set-repo.sh YOUR_USERNAME botbench        # fixes badges and links
   git init -b main
   git add -A
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/botbench.git
   git push -u origin main
   ```
   On Windows without bash, use Git Bash, or GitHub Desktop (File, Add local repository, Publish). In that case fix `OWNER/REPO` in README.md by search and replace.
3. Turn on the website: **Settings, Pages, Source: GitHub Actions**. After the first run, the site is at `https://YOUR_USERNAME.github.io/botbench/`.

## After it's live

- **Actions tab:** CI runs on every push and pull request. The first run may ask you to approve workflows.
- **Make a release** (attaches a zip and the SDK files):
  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  ```
- **Protect main** (optional): Settings, Branches, require the CI checks before merging.
- **Secrets:** never commit `.env`. To deploy the bots from Actions later, put the token in Settings, Secrets and variables, Actions.
- **Dependabot** is already configured and will open pull requests for dependency updates.

## Change the license or name

The license is MIT ("Bot Bench contributors" is the holder). Edit `LICENSE` to put your own name. Rename the project by searching for "Bot Bench" and "botbench".

## Troubleshooting

**The Pages workflow fails on its first run**, with a message that starts with "GitHub Pages isn't turned on for this repository yet" (or, on an older copy of this repo, a raw two-part error: `Get Pages site failed ... Not Found` followed by `Create Pages site failed ... Resource not accessible by integration`).

This is expected the very first time, and it's not something a workflow file can fix: turning Pages on is a repository-administration action, and GitHub never lets the Actions token do that, no matter what permissions the workflow requests (confirmed by GitHub staff in [actions/configure-pages#40](https://github.com/actions/configure-pages/issues/40)). It can only build and deploy to a Pages site that already exists. Turn it on once by hand:

1. On github.com, open the repository's **Settings**, then **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Go to the **Actions** tab, open the **Pages** workflow, and press **Run workflow** to start a brand new run.

Use **Run workflow**, not **Re-run jobs** on the old failed run — re-running jobs replays the workflow file exactly as it existed at that old commit, so if you've since updated `.github/workflows/pages.yml` (for example by pulling a newer copy of this repo), a re-run of the old failed run won't pick that up. A fresh run (from a new push, or **Run workflow**) always uses the current file on the branch.

After that one manual step, every future push builds and deploys the site automatically — nothing else needs to change.
