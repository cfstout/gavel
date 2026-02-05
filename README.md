# Gavel

A local-first AI code review assistant with a kanban-style PR inbox that helps you manage and conduct GitHub PR reviews with Claude.

![Gavel Screenshot](docs/screenshot.png)

## What is Gavel?

Gavel transforms PR review from a chore into a streamlined workflow. It provides a **PR Inbox** that automatically tracks pull requests from your configured sources, then helps you review them with AI assistance.

**The Workflow:**

1. **Inbox** — PRs from GitHub searches or Slack channels appear here
2. **Review** — Select a PR, choose a review persona, get AI-generated comments
3. **Refine** — Approve, reject, or chat with Claude to refine each comment
4. **Submit** — Post approved comments to GitHub; PR moves to "Reviewed"
5. **Track** — PRs with new commits move to "Needs Attention"; merged PRs auto-clear

**Key Features:**
- **Kanban inbox** — Four columns: Inbox, Needs Attention, Reviewed, Done
- **Multiple PR sources** — GitHub search queries and Slack channel monitoring
- **Change detection** — New commits on reviewed PRs trigger re-review prompts
- **Local staging** — Nothing posts until you explicitly approve and submit
- **Session persistence** — Quit mid-review and pick up where you left off

## Prerequisites

Before using Gavel, you need:

1. **GitHub CLI (`gh`)** — for GitHub authentication and API access
   ```bash
   # macOS
   brew install gh

   # Then authenticate
   gh auth login
   ```

2. **Claude Code CLI (`claude`)** — for AI analysis
   ```bash
   # Install from https://claude.ai/code
   # Then authenticate
   claude login
   ```

3. **Slack User OAuth Token** (optional) — for Slack channel monitoring
   - Create a Slack app at https://api.slack.com/apps
   - Add User Token Scopes: `channels:history`, `channels:read`, `groups:history`, `groups:read`
   - Install to your workspace and copy the User OAuth Token (`xoxp-...`)
   - Either set `SLACK_USER_TOKEN` env var or enter the token in Gavel's source config

## Installation

```bash
# Clone the repository
git clone https://github.com/cfstout/gavel.git
cd gavel

# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build for production
npm run build
```

## Usage

### Setting Up PR Sources

When you first launch Gavel, you'll see an empty inbox. Click **"Add PR Source"** to configure where to find PRs:

**GitHub Search Sources:**
- `review-requested:@me` — PRs where you're requested as reviewer
- `author:@me is:open` — Your open PRs
- `involves:@me` — PRs you're involved in
- `org:mycompany is:pr is:open` — All open PRs in an organization

**Slack Channel Sources:**
- Enter a channel name (e.g., `code-reviews`) to monitor for PR links
- Requires Slack MCP plugin to be enabled

### The Kanban Board

| Column | Description |
|--------|-------------|
| **Inbox** | New PRs from your sources |
| **Needs Attention** | PRs with new commits since your last review |
| **Reviewed** | PRs you've submitted comments on |
| **Done** | Merged/closed PRs (auto-clears after 24 hours) |

### Reviewing a PR

1. Click **"Review"** on any PR card
2. Select a review persona:
   - **General Review** — Balanced code quality review
   - **Security Audit** — Focus on vulnerabilities
   - **Performance Review** — Efficiency and scalability
   - **Code Style** — Readability and consistency
3. Wait for Claude to analyze the diff
4. For each AI comment:
   - ✓ **Approve** — Mark for submission
   - ✗ **Reject** — Discard the comment
   - 💬 **Refine** — Chat with Claude to modify
5. Click **Submit** to post approved comments

### Manual PR Entry

Click **"Enter a PR manually"** to review any PR not in your inbox:
- Format: `owner/repo#123`
- Or paste a GitHub PR URL

## Custom Personas

Create your own review personas by adding markdown files to your Gavel data directory:

- **macOS**: `~/Library/Application Support/gavel/personas/`
- **Linux**: `~/.config/gavel/personas/`
- **Windows**: `%APPDATA%/gavel/personas/`

```markdown
---
name: My Team's Standards
description: Review against our team's coding guidelines
---

# Review Instructions

Focus on:
- Our naming conventions (camelCase for functions, PascalCase for classes)
- Required error handling patterns
- Test coverage requirements

When commenting:
- Be constructive and specific
- Reference our style guide where applicable
```

## Project Structure

```
gavel/
├── electron/              # Electron main process
│   ├── main.ts            # App entry point
│   ├── github.ts          # GitHub CLI wrapper (fetch, search, post)
│   ├── claude.ts          # Claude CLI wrapper
│   ├── personas.ts        # Persona loading
│   ├── inbox.ts           # Inbox state persistence
│   ├── polling.ts         # Background polling orchestration
│   ├── slack.ts           # Slack MCP integration
│   ├── ipc.ts             # IPC handler registration
│   └── preload.ts         # Renderer API exposure
├── src/
│   ├── renderer/          # React frontend
│   │   ├── components/    # UI components
│   │   │   ├── InboxScreen.tsx      # Kanban inbox view
│   │   │   ├── KanbanColumn.tsx     # Column component
│   │   │   ├── PRCard.tsx           # PR card component
│   │   │   ├── SourceConfigModal.tsx # Source management
│   │   │   └── ...                  # Review components
│   │   ├── store/
│   │   │   ├── reviewStore.ts       # Review session state
│   │   │   └── inboxStore.ts        # Inbox state
│   │   └── styles/
│   │       ├── Inbox.css            # Inbox styles
│   │       └── ...
│   └── shared/
│       └── types.ts       # Shared TypeScript types
├── personas/              # Built-in review personas
└── package.json
```

## Development

```bash
# Run in development with hot reload
npm run dev

# Type check
npx tsc --noEmit

# Build for production
npm run build
```

## How It Works

1. **GitHub Integration** — Uses `gh` CLI for all GitHub operations. PR search, status checks, and comment posting all go through your authenticated `gh` session.

2. **Polling** — Background polling (default: 5 minutes) checks your configured sources for new PRs and monitors existing PRs for changes (new commits, merges).

3. **Claude Integration** — Uses `claude` CLI to analyze code diffs. Your Claude Code authentication is used—no API keys required.

4. **Slack Integration** — When configured, calls the Slack API directly to fetch channel messages and extract GitHub PR URLs. Token stored securely via Electron's safeStorage.

5. **Local-First** — All state is stored locally. Nothing is sent to external servers except GitHub (for PRs) and Claude (for analysis).

## Troubleshooting

### "GitHub CLI not authenticated"
Run `gh auth login` and complete the authentication flow.

### "Claude CLI not found"
Install Claude Code from https://claude.ai/code and run `claude login`.

### "No Slack token configured"
Either set the `SLACK_USER_TOKEN` environment variable or enter a token in Configure Sources > Slack Channel.
See Prerequisites for how to create a Slack app and get a token.

### PRs not appearing in inbox
- Check that your source is enabled (Configure Sources > Active Sources)
- Verify your GitHub search query returns results: `gh search prs "your query"`
- For Slack sources, ensure the MCP plugin is configured

### "Rate limited"
GitHub API limits apply. Gavel will automatically back off and retry. If persistent, try:
- Reducing the number of sources
- Increasing poll interval in settings

### Comments not appearing on GitHub
Ensure you have write access to the repository and the PR is still open.

## License

MIT
