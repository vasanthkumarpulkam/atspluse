# ATS Pulse - PRD & Implementation Status

## Original Problem Statement
Build ATS Pulse - a production-ready service that polls public ATS job APIs (Greenhouse, Lever, Workday, Ashby), normalizes them, stores in MongoDB, and exposes REST API + web UI with live job feed and filters. Focus on US-based Data/Analytics roles.

## Architecture
- Backend: FastAPI + MongoDB (Motor async driver)
- Frontend: React + Tailwind CSS + Shadcn UI
- ATS Adapters: Greenhouse (GET), Lever (GET), Ashby (GET), Workday (POST with pagination)

## Scale (March 2026)
- 18,178 total jobs across 144 companies on 4 ATS platforms
- 9,275 US-only jobs
- 431 US Data/Analytics roles
- Greenhouse: 78 companies | Ashby: 31 | Workday: 28 | Lever: 9

## Key Features
- Background async crawl with status polling
- US-only location filter (default ON) with comprehensive regex matching
- 7 Data/Analytics role category filters covering 150+ job title patterns
- Auto-refresh every 45s, fresh job highlighting, pagination
- Companies grouped by ATS platform with collapsible sections

## Role Category Filters
- All Data/Analytics Roles, Data/Analytics, Business Intelligence
- Business Analyst, Financial/FP&A, Operations/GTM
- Data Engineering/ETL, Compliance/Governance

## Backlog
- P1: Background cron crawling, mark inactive jobs after 7 days
- P2: Analytics dashboard, email/webhook notifications, CSV export
