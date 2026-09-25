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
