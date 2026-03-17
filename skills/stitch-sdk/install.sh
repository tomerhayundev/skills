#!/usr/bin/env bash
# ┌──────────────────────────────────────────────────────────┐
# │  Stitch SDK — One-Command Installer for Claude Code      │
# │  Installs the SDK globally + adds the skill to Claude    │
# └──────────────────────────────────────────────────────────┘
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

header() { echo -e "\n${BLUE}${BOLD}▸ $1${NC}"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

echo -e "${CYAN}${BOLD}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   Stitch SDK Installer                ║"
echo "  ║   AI-Powered UI Generation            ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ── Check prerequisites ──────────────────────────────────────
header "Checking prerequisites"

if ! command -v node &>/dev/null; then
  fail "Node.js is required (v18+). Install from https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js v18+ required (found v$(node -v))"
fi
success "Node.js $(node -v)"

if ! command -v npm &>/dev/null; then
  fail "npm is required"
fi
success "npm $(npm -v)"

# ── Install @google/stitch-sdk globally ──────────────────────
header "Installing @google/stitch-sdk globally"

if npm list -g @google/stitch-sdk &>/dev/null 2>&1; then
  CURRENT=$(npm list -g @google/stitch-sdk --depth=0 2>/dev/null | grep stitch-sdk | sed 's/.*@//')
  warn "Already installed (v${CURRENT}), upgrading..."
  npm install -g @google/stitch-sdk@latest
else
  npm install -g @google/stitch-sdk@latest
fi
success "@google/stitch-sdk installed globally"

# ── Install Claude Code skill ────────────────────────────────
header "Installing Claude Code skill"

if command -v claude &>/dev/null; then
  claude skill add --source github:tomerhayundev/skills --skill stitch-sdk 2>/dev/null && \
    success "Skill 'stitch-sdk' added to Claude Code" || \
    warn "Could not auto-add skill. Add manually: claude skill add --source github:tomerhayundev/skills --skill stitch-sdk"
else
  warn "Claude Code CLI not found. Install the skill manually after installing Claude Code:"
  echo -e "    ${CYAN}claude skill add --source github:tomerhayundev/skills --skill stitch-sdk${NC}"
fi

# ── API Key setup ────────────────────────────────────────────
header "API Key configuration"

if [ -n "${STITCH_API_KEY:-}" ]; then
  success "STITCH_API_KEY is already set"
else
  warn "STITCH_API_KEY not found in environment"
  echo ""
  echo -e "  ${BOLD}Get your API key:${NC}"
  echo -e "    1. Go to ${CYAN}https://aistudio.google.com/apikey${NC}"
  echo -e "    2. Create or select an API key"
  echo -e "    3. Add to your shell profile:"
  echo ""
  echo -e "    ${CYAN}# bash${NC}"
  echo -e "    echo 'export STITCH_API_KEY=\"your-key-here\"' >> ~/.bashrc"
  echo ""
  echo -e "    ${CYAN}# zsh${NC}"
  echo -e "    echo 'export STITCH_API_KEY=\"your-key-here\"' >> ~/.zshrc"
  echo ""
  echo -e "    ${CYAN}# PowerShell (Windows)${NC}"
  echo -e "    [System.Environment]::SetEnvironmentVariable('STITCH_API_KEY','your-key-here','User')"
  echo ""
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ╔═══════════════════════════════════════╗"
echo -e "  ║   Installation complete!              ║"
echo -e "  ╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Quick start:${NC}"
echo -e "    ${CYAN}import { stitch } from '@google/stitch-sdk';${NC}"
echo -e "    ${CYAN}const project = await stitch.createProject('My App');${NC}"
echo -e "    ${CYAN}const screen = await project.generate('A login page');${NC}"
echo -e "    ${CYAN}const html = await screen.getHtml();${NC}"
echo ""
echo -e "  ${BOLD}In Claude Code:${NC}"
echo -e "    Just ask Claude to generate UI with Stitch — the skill handles the rest."
echo ""
