# Project Spec

## Identity
name: launchpad
alias: fl
description: Plugin de Claude Code para ciclo completo de desenvolvimento de features

## Commands
build: claude plugin validate .
test: claude plugin validate .

## Hot files
- commands/discovery.md
- commands/planning.md
- commands/delivery.md
- commands/review.md
- commands/ship.md
- commands/try.md
- templates/prd-template.md
- templates/plan-template.md
- .claude-plugin/plugin.json
- .claude-plugin/marketplace.json

## Paths
learnings: LEARNINGS.md

## Conventions
branch-prefix: feat/
main-branch: master
