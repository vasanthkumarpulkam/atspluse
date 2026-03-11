# ATS Pulse - PRD & Implementation Status

## Original Problem Statement
Build ATS Pulse - a production-ready service that polls public ATS job APIs (Greenhouse, Lever, Workday, Ashby), normalizes them, stores in MongoDB, and exposes REST API + web UI with live job feed and filters.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **ATS Adapters**: Greenhouse (GET), Lever (GET), Ashby (GET), Workday (POST with pagination)

## User Personas
- Primary: Internal power user tracking fresh jobs across ATS platforms
- Secondary: API consumers

## What's Been Implemented (March 2026)

### Backend
- MongoDB collections: `companies`, `jobs` with unique compound indexes
- 4 ATS Adapters: Greenhouse, Lever, Ashby, Workday (all verified working with real APIs)
- Workday: multi-page POST-based fetching with proper URL construction
- POST /api/internal/crawl - Trigger full crawl across all active companies
- GET /api/jobs - General search with filters (title, location, remote, company, source_ats, posted_after, first_seen_after, pagination)
- GET /api/jobs/new - Fresh jobs by time window
- GET /api/stats - Dashboard statistics
- Companies CRUD: GET, POST, PATCH, DELETE
- Upsert logic with first_seen_at / last_seen_at tracking
- Seed data: 18 companies across 4 ATS platforms

### Frontend
- Dark theme (zinc-950) with Manrope/IBM Plex Sans/JetBrains Mono fonts
- Sidebar navigation (Live Feed, Companies)
- Live Feed page: job table with search, remote/time filters, auto-refresh (45s), fresh job highlighting, pagination
- Companies page: grouped by ATS platform (Greenhouse, Lever, Ashby, Workday) with API pattern display, collapsible sections, per-platform Add button, toggle/delete per company
- Toast notifications via Sonner

### Seeded Companies
- **Greenhouse (10)**: Airbnb, Figma, Discord, Cloudflare, Stripe, Notion, Datadog, HashiCorp, Plaid, Twitch
- **Lever (2)**: Netlify, Lever
- **Ashby (2)**: Ramp, Linear
- **Workday (4)**: Adobe, Capital One, Booz Allen Hamilton, Broadcom

## Prioritized Backlog
### P0
- None (MVP complete)

### P1
- WebSocket/SSE for real-time job feed instead of polling
- Background scheduled crawling (every 5-10 min cron)
- Mark jobs as inactive when not seen for 7 days

### P2
- Auth and API keys for external consumers
- Analytics dashboard (jobs per company per day, trending titles)
- Job deduplication across ATS platforms
- Export/download job data as CSV
- Email/webhook notifications for new jobs matching criteria

## Next Tasks
1. Add background cron-based crawling (currently manual via Crawl Now button)
2. Add more Workday companies (custom URLs needed per company)
3. Add job detail view with full description
4. Analytics page with charts
