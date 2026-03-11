from fastapi import FastAPI, APIRouter, Query, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── Models ───────────────────────────────────────────────────────────────────

class CompanyCreate(BaseModel):
    company_slug: str
    company_name: str
    ats_type: str
    api_url: str
    is_active: bool = True

class CompanyUpdate(BaseModel):
    company_name: Optional[str] = None
    ats_type: Optional[str] = None
    api_url: Optional[str] = None
    is_active: Optional[bool] = None

class CompanyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    company_slug: str
    company_name: str
    ats_type: str
    api_url: str
    is_active: bool
    created_at: str
    updated_at: str

class JobResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    company_slug: str
    source_ats: str
    job_id: str
    title: str
    location: str
    is_remote: bool
    department: Optional[str] = None
    employment_type: Optional[str] = None
    posted_at: Optional[str] = None
    job_url: str
    first_seen_at: str
    last_seen_at: str
    is_active: bool

class JobsListResponse(BaseModel):
    data: List[JobResponse]
    meta: dict

class CrawlResponse(BaseModel):
    status: str
    companies_processed: int
    new_jobs_total: int

# ─── ATS Adapters ─────────────────────────────────────────────────────────────

async def fetch_with_retry(url: str, retries: int = 1, timeout: float = 30.0) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http_client:
        for attempt in range(retries + 1):
            try:
                resp = await http_client.get(url)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.warning(f"Fetch attempt {attempt+1} failed for {url}: {e}")
                if attempt < retries:
                    await asyncio.sleep(1)
    return None

def normalize_greenhouse_jobs(company_slug: str, data: dict) -> list:
    jobs = data.get("jobs", [])
    normalized = []
    for job in jobs:
        loc = ""
        if job.get("location"):
            loc = job["location"].get("name", "") if isinstance(job["location"], dict) else str(job["location"])
        
        is_remote = "remote" in loc.lower() if loc else False
        
        department = None
        if job.get("departments") and len(job["departments"]) > 0:
            department = job["departments"][0].get("name")
        
        posted_at = job.get("updated_at") or job.get("created_at")
        
        normalized.append({
            "source_ats": "greenhouse",
            "company_slug": company_slug,
            "job_id": str(job.get("id", "")),
            "title": job.get("title", ""),
            "location": loc,
            "is_remote": is_remote,
            "department": department,
            "employment_type": None,
            "posted_at": posted_at,
            "job_url": job.get("absolute_url", ""),
            "raw": job,
        })
    return normalized

def normalize_lever_jobs(company_slug: str, data) -> list:
    if not isinstance(data, list):
        return []
    normalized = []
    for job in data:
        categories = job.get("categories", {})
        loc = categories.get("location", "") or ""
        tags = job.get("tags", [])
        
        is_remote = "remote" in loc.lower() or any("remote" in t.lower() for t in tags)
        
        department = categories.get("team")
        
        created_ms = job.get("createdAt")
        posted_at = None
        if created_ms:
            posted_at = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc).isoformat()
        
        normalized.append({
            "source_ats": "lever",
            "company_slug": company_slug,
            "job_id": str(job.get("id", "")),
            "title": job.get("text", ""),
            "location": loc,
            "is_remote": is_remote,
            "department": department,
            "employment_type": categories.get("commitment"),
            "posted_at": posted_at,
            "job_url": job.get("hostedUrl", ""),
            "raw": job,
        })
    return normalized

def normalize_ashby_jobs(company_slug: str, data: dict) -> list:
    jobs = data.get("jobs", [])
    normalized = []
    for job in jobs:
        loc = job.get("location", "") or ""
        is_remote = job.get("isRemote", False) or ("remote" in loc.lower())
        
        department = job.get("departmentName") or job.get("department")
        employment_type = job.get("employmentType")
        posted_at = job.get("publishedAt") or job.get("createdAt")
        
        job_url = job.get("jobUrl", "")
        if not job_url and job.get("id"):
            job_url = f"https://jobs.ashbyhq.com/{company_slug}/{job['id']}"
        
        normalized.append({
            "source_ats": "ashby",
            "company_slug": company_slug,
            "job_id": str(job.get("id", "")),
            "title": job.get("title", ""),
            "location": loc,
            "is_remote": is_remote,
            "department": department,
            "employment_type": employment_type,
            "posted_at": posted_at,
            "job_url": job_url,
            "raw": job,
        })
    return normalized

def normalize_workday_jobs(company_slug: str, base_url: str, data: dict) -> list:
    job_postings = data.get("jobPostings", [])
    normalized = []
    # Extract base site URL for building job links
    # e.g. https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs
    # -> https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced
    parts = base_url.split("/wday/cxs/")
    site_base = parts[0] if parts else ""
    board_path = parts[1].split("/jobs")[0] if len(parts) > 1 else ""
    # board_path like "adobe/external_experienced" -> take the part after company slug
    board_segments = board_path.split("/", 1)
    board_name = board_segments[1] if len(board_segments) > 1 else board_segments[0]
    
    for job in job_postings:
        loc = job.get("locationsText", "") or ""
        is_remote = "remote" in loc.lower()
        
        posted_on = job.get("postedOn", "")
        
        external_path = job.get("externalPath", "")
        job_url = f"{site_base}/en-US/{board_name}{external_path}" if external_path else ""
        
        # Use bulletFields[0] as job_id (Workday requisition ID)
        bullet = job.get("bulletFields", [])
        job_id = str(bullet[0]) if bullet else str(hash(job.get("title", "") + loc))
        
        normalized.append({
            "source_ats": "workday",
            "company_slug": company_slug,
            "job_id": job_id,
            "title": job.get("title", ""),
            "location": loc,
            "is_remote": is_remote,
            "department": None,
            "employment_type": None,
            "posted_at": posted_on if posted_on and posted_on != "Posted Today" else None,
            "job_url": job_url,
            "raw": job,
        })
    return normalized

async def fetch_workday_all_pages(api_url: str, company_slug: str, max_pages: int = 50) -> list:
    """Fetch multiple pages from Workday (using 200 per page for efficiency)."""
    all_jobs = []
    offset = 0
    limit = 200  # Workday supports up to 200 per request
    total = 0
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as http_client:
            for _ in range(max_pages):
                payload = {"limit": limit, "offset": offset, "appliedFacets": {}, "searchText": ""}
                resp = await http_client.post(api_url, json=payload, headers={"Content-Type": "application/json", "Accept": "application/json"})
                resp.raise_for_status()
                data = resp.json()
                postings = data.get("jobPostings", [])
                all_jobs.extend(normalize_workday_jobs(company_slug, api_url, data))
                total = data.get("total", 0)
                offset += limit
                if offset >= total or len(postings) == 0:
                    break
        logger.info(f"Workday {company_slug}: fetched {len(all_jobs)} of {total} total jobs")
    except Exception as e:
        logger.error(f"Failed to fetch Workday jobs for {company_slug} at offset {offset}: {e}")
    return all_jobs

async def fetch_and_normalize(company: dict) -> list:
    ats_type = company["ats_type"]
    api_url = company["api_url"]
    slug = company["company_slug"]
    
    if ats_type == "workday":
        return await fetch_workday_all_pages(api_url, slug)
    
    data = await fetch_with_retry(api_url)
    if data is None:
        logger.error(f"Failed to fetch jobs for {slug} ({ats_type})")
        return []
    
    if ats_type == "greenhouse":
        return normalize_greenhouse_jobs(slug, data)
    elif ats_type == "lever":
        return normalize_lever_jobs(slug, data)
    elif ats_type == "ashby":
        return normalize_ashby_jobs(slug, data)
    else:
        logger.warning(f"Unsupported ATS type: {ats_type} for {slug}")
        return []

# ─── Upsert Logic ─────────────────────────────────────────────────────────────

async def upsert_jobs_and_get_new(company: dict, normalized_jobs: list) -> list:
    new_jobs = []
    now = datetime.now(timezone.utc).isoformat()
    
    for job in normalized_jobs:
        existing = await db.jobs.find_one(
            {
                "company_slug": job["company_slug"],
                "source_ats": job["source_ats"],
                "job_id": job["job_id"],
            },
            {"_id": 0, "first_seen_at": 1}
        )
        
        if existing is None:
            doc = {
                "id": str(uuid.uuid4()),
                "company_id": company["id"],
                "company_slug": job["company_slug"],
                "source_ats": job["source_ats"],
                "job_id": job["job_id"],
                "title": job["title"],
                "location": job["location"],
                "is_remote": job["is_remote"],
                "department": job.get("department"),
                "employment_type": job.get("employment_type"),
                "posted_at": job.get("posted_at"),
                "job_url": job["job_url"],
                "raw": job.get("raw", {}),
                "first_seen_at": now,
                "last_seen_at": now,
                "is_active": True,
            }
            await db.jobs.insert_one(doc)
            new_jobs.append(job)
        else:
            await db.jobs.update_one(
                {
                    "company_slug": job["company_slug"],
                    "source_ats": job["source_ats"],
                    "job_id": job["job_id"],
                },
                {"$set": {
                    "title": job["title"],
                    "location": job["location"],
                    "is_remote": job["is_remote"],
                    "department": job.get("department"),
                    "employment_type": job.get("employment_type"),
                    "posted_at": job.get("posted_at"),
                    "job_url": job["job_url"],
                    "raw": job.get("raw", {}),
                    "last_seen_at": now,
                }}
            )
    return new_jobs

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "ATS Pulse API"}

# --- Companies ---

@api_router.get("/companies", response_model=List[CompanyResponse])
async def list_companies():
    companies = await db.companies.find({}, {"_id": 0}).to_list(500)
    return companies

@api_router.post("/companies", response_model=CompanyResponse)
async def create_company(payload: CompanyCreate):
    existing = await db.companies.find_one({"company_slug": payload.company_slug}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Company slug already exists")
    
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "company_slug": payload.company_slug,
        "company_name": payload.company_name,
        "ats_type": payload.ats_type,
        "api_url": payload.api_url,
        "is_active": payload.is_active,
        "created_at": now,
        "updated_at": now,
    }
    await db.companies.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.patch("/companies/{company_id}", response_model=CompanyResponse)
async def update_company(company_id: str, payload: CompanyUpdate):
    update_fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.companies.find_one_and_update(
        {"id": company_id},
        {"$set": update_fields},
        return_document=True,
        projection={"_id": 0}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")
    return result

@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str):
    result = await db.companies.delete_one({"id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.jobs.delete_many({"company_id": company_id})
    return {"status": "deleted"}

# --- Internal Crawl ---

# Global crawl state
crawl_status = {"running": False, "last_result": None}

async def run_crawl_task():
    crawl_status["running"] = True
    companies = await db.companies.find({"is_active": True}, {"_id": 0}).to_list(500)
    total_new = 0
    
    for company in companies:
        try:
            normalized = await fetch_and_normalize(company)
            new_jobs = await upsert_jobs_and_get_new(company, normalized)
            total_new += len(new_jobs)
            logger.info(f"Crawled {company['company_slug']}: {len(normalized)} jobs, {len(new_jobs)} new")
        except Exception as e:
            logger.error(f"Error crawling {company['company_slug']}: {e}")
    
    crawl_status["last_result"] = {
        "status": "ok",
        "companies_processed": len(companies),
        "new_jobs_total": total_new,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    crawl_status["running"] = False
    logger.info(f"Crawl complete: {len(companies)} companies, {total_new} new jobs")

@api_router.post("/internal/crawl")
async def trigger_crawl():
    if crawl_status["running"]:
        return {"status": "already_running", "companies_processed": 0, "new_jobs_total": 0}
    
    asyncio.create_task(run_crawl_task())
    return {"status": "started", "companies_processed": 0, "new_jobs_total": 0}

@api_router.get("/internal/crawl/status")
async def get_crawl_status():
    return {
        "running": crawl_status["running"],
        "last_result": crawl_status["last_result"],
    }

# --- Role Category Patterns (Data/Analytics focused) ---

ROLE_CATEGORIES = {
    "data_analytics": r"(?i)(data\s*(analyst|analytics|specialist|insights)|analytics\s*(analyst|specialist)|reporting\s*analyst|insights\s*analyst)",
    "business_intelligence": r"(?i)(business\s*intelligence|BI\s*(analyst|developer|engineer)|power\s*bi|tableau|looker|qlik|microstrategy|data\s*visualization|dashboard\s*(developer|analyst)|reporting\s*developer)",
    "business_analyst": r"(?i)(business\s*(analyst|systems\s*analyst)|IT\s*business\s*analyst|technical\s*business\s*analyst|functional\s*analyst|systems\s*analyst|ERP\s*analyst|SAP\s*analyst|salesforce\s*analyst|CRM\s*analyst|product\s*(analyst|data\s*analyst))",
    "financial_fpa": r"(?i)(financial\s*(analyst|planning|data)|finance\s*(analyst|data)|FP&?A\s*analyst|budget\s*analyst|revenue\s*(analyst|operations)|RevOps\s*analyst|pricing\s*analyst|cost\s*analyst|treasury\s*analyst|controller\s*analyst)",
    "operations_gtm": r"(?i)(operations\s*analyst|business\s*operations|sales\s*(operations|ops)|marketing\s*(operations|analyst)|GTM\s*analyst|go.to.market|supply\s*chain|logistics\s*analyst|workforce\s*(management|analyst)|capacity\s*planning|demand\s*planning|procurement\s*analyst|strategy\s*analyst|planning\s*analyst)",
    "data_engineering": r"(?i)(data\s*(engineer|pipeline|infrastructure|platform|integration|warehouse)|ETL\s*(developer|analyst|engineer)|analytics\s*engineer|database\s*(analyst|developer)|SQL\s*(developer|analyst)|snowflake\s*developer|dbt\s*developer|databricks)",
    "compliance_governance": r"(?i)(compliance\s*(analyst|data)|regulatory\s*analyst|data\s*(governance|quality|steward|management)|master\s*data|MDM\s*analyst|information\s*analyst|records\s*analyst|risk\s*(analyst|data)|audit\s*analyst|internal\s*audit)",
    "all_data_roles": None,  # Combined pattern built below
}

# Build combined "all" pattern
_all_patterns = [v for v in ROLE_CATEGORIES.values() if v is not None]
ROLE_CATEGORIES["all_data_roles"] = "|".join(f"({p})" for p in _all_patterns)

# --- US Location Filter ---

US_STATES_ABBR = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC"
US_CITIES = "New York|San Francisco|Los Angeles|Chicago|Seattle|Austin|Boston|Denver|Atlanta|Dallas|Houston|Miami|Phoenix|Portland|San Diego|San Jose|Minneapolis|Detroit|Philadelphia|Charlotte|Nashville|Raleigh|Salt Lake|Tampa|Orlando|Pittsburgh|Columbus|Indianapolis|Kansas City|Palo Alto|Mountain View|Sunnyvale|Cupertino|Menlo Park|Santa Clara|Redwood City|Cambridge|Brooklyn|Manhattan|Burbank|Glendale|Celebration|Lake Buena Vista|Kissimmee|Manassas|McLean|Tysons|Herndon|Reston|Arlington|Bethesda|Plano|Irving|Frisco|Round Rock|Durham|Madison|Ann Arbor|Boulder|Irvine|Santa Monica|Bellevue|Redmond|Scottsdale|Tempe|San Antonio|Sacramento|Oakland|Berkeley|Fremont|Milpitas"
US_STATES_FULL = "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming"

US_LOCATION_PATTERN = (
    f"(?i)"
    f"(\\bUSA\\b|United States|\\bU\\.S\\.|\\bUS\\b[,\\s\\)])"
    f"|\\b({US_STATES_ABBR}),?\\s*(USA|$)"
    f"|({US_CITIES})"
    f"|(Remote.*US|US.*Remote|Remote.*USA|USA.*Remote|Remote \\(US\\))"
    f"|(North America|AMER\\b)"
    f"|({US_STATES_FULL})"
    f"|(\\w+,\\s*({US_STATES_ABBR})\\b)"
)

def apply_us_filter(query: dict, us_only: str):
    if us_only != "true":
        return
    us_cond = {"location": {"$regex": US_LOCATION_PATTERN}}
    if "$and" in query:
        query["$and"].append(us_cond)
    else:
        query.setdefault("$and", []).append(us_cond)

# --- Jobs ---

@api_router.get("/jobs", response_model=JobsListResponse)
async def list_jobs(
    title: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    remote: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    source_ats: Optional[str] = Query(None),
    posted_after: Optional[str] = Query(None),
    first_seen_after: Optional[str] = Query(None),
    role_category: Optional[str] = Query(None),
    us_only: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    query = {"is_active": True}
    
    if role_category and role_category in ROLE_CATEGORIES:
        pattern = ROLE_CATEGORIES[role_category]
        if pattern:
            query["title"] = {"$regex": pattern}
            if title:
                query["$and"] = [
                    {"title": {"$regex": pattern}},
                    {"title": {"$regex": title, "$options": "i"}},
                ]
                del query["title"]
    elif title:
        query["title"] = {"$regex": title, "$options": "i"}
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    if remote == "true":
        query["is_remote"] = True
    elif remote == "false":
        query["is_remote"] = False
    if company:
        slugs = [s.strip() for s in company.split(",")]
        query["company_slug"] = {"$in": slugs}
    if source_ats:
        sources = [s.strip() for s in source_ats.split(",")]
        query["source_ats"] = {"$in": sources}
    if posted_after:
        query["posted_at"] = {"$gte": posted_after}
    if first_seen_after:
        query["first_seen_at"] = {"$gte": first_seen_after}
    
    apply_us_filter(query, us_only)
    
    total = await db.jobs.count_documents(query)
    jobs = await db.jobs.find(query, {"_id": 0, "raw": 0, "company_id": 0, "id": 0}).sort("first_seen_at", -1).skip(offset).limit(limit).to_list(limit)
    
    return JobsListResponse(
        data=jobs,
        meta={"total": total, "limit": limit, "offset": offset}
    )

@api_router.get("/jobs/new", response_model=JobsListResponse)
async def list_new_jobs(
    minutes: int = Query(10, ge=1),
    title: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    remote: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    source_ats: Optional[str] = Query(None),
    role_category: Optional[str] = Query(None),
    us_only: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    ref_time = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    query = {"is_active": True, "first_seen_at": {"$gte": ref_time}}
    
    if role_category and role_category in ROLE_CATEGORIES:
        pattern = ROLE_CATEGORIES[role_category]
        if pattern:
            query["title"] = {"$regex": pattern}
            if title:
                query["$and"] = [
                    {"title": {"$regex": pattern}},
                    {"title": {"$regex": title, "$options": "i"}},
                ]
                del query["title"]
    elif title:
        query["title"] = {"$regex": title, "$options": "i"}
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    if remote == "true":
        query["is_remote"] = True
    elif remote == "false":
        query["is_remote"] = False
    if company:
        slugs = [s.strip() for s in company.split(",")]
        query["company_slug"] = {"$in": slugs}
    if source_ats:
        sources = [s.strip() for s in source_ats.split(",")]
        query["source_ats"] = {"$in": sources}
    
    apply_us_filter(query, us_only)
    
    total = await db.jobs.count_documents(query)
    jobs = await db.jobs.find(query, {"_id": 0, "raw": 0, "company_id": 0, "id": 0}).sort("first_seen_at", -1).skip(offset).limit(limit).to_list(limit)
    
    return JobsListResponse(
        data=jobs,
        meta={"total": total, "limit": limit, "offset": offset}
    )

# --- Stats ---

@api_router.get("/stats")
async def get_stats():
    total_jobs = await db.jobs.count_documents({"is_active": True})
    total_companies = await db.companies.count_documents({"is_active": True})
    
    ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    fresh_jobs = await db.jobs.count_documents({"is_active": True, "first_seen_at": {"$gte": ten_min_ago}})
    
    return {"total_jobs": total_jobs, "active_companies": total_companies, "fresh_jobs": fresh_jobs}

@api_router.get("/role-categories")
async def get_role_categories():
    return {
        "categories": [
            {"key": "all_data_roles", "label": "All Data/Analytics Roles"},
            {"key": "data_analytics", "label": "Data / Analytics"},
            {"key": "business_intelligence", "label": "Business Intelligence"},
            {"key": "business_analyst", "label": "Business Analyst"},
            {"key": "financial_fpa", "label": "Financial / FP&A"},
            {"key": "operations_gtm", "label": "Operations / GTM"},
            {"key": "data_engineering", "label": "Data Engineering / ETL"},
            {"key": "compliance_governance", "label": "Compliance / Governance"},
        ]
    }

# ─── Startup ──────────────────────────────────────────────────────────────────

SEED_COMPANIES = [
    # Greenhouse
    {"company_slug": "airbnb", "company_name": "Airbnb", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/airbnb/jobs"},
    {"company_slug": "figma", "company_name": "Figma", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/figma/jobs"},
    {"company_slug": "discord", "company_name": "Discord", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/discord/jobs"},
    {"company_slug": "cloudflare", "company_name": "Cloudflare", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs"},
    {"company_slug": "stripe", "company_name": "Stripe", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/stripe/jobs"},
    {"company_slug": "notion", "company_name": "Notion", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/notion/jobs"},
    {"company_slug": "datadog", "company_name": "Datadog", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/datadog/jobs"},
    {"company_slug": "hashicorp", "company_name": "HashiCorp", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/hashicorp/jobs"},
    {"company_slug": "plaid", "company_name": "Plaid", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/plaid/jobs"},
    {"company_slug": "twitch", "company_name": "Twitch", "ats_type": "greenhouse", "api_url": "https://boards-api.greenhouse.io/v1/boards/twitch/jobs"},
    # Lever
    {"company_slug": "netlify", "company_name": "Netlify", "ats_type": "lever", "api_url": "https://api.lever.co/v0/postings/netlify?mode=json"},
    {"company_slug": "lever", "company_name": "Lever", "ats_type": "lever", "api_url": "https://api.lever.co/v0/postings/lever?mode=json"},
    # Ashby
    {"company_slug": "ramp", "company_name": "Ramp", "ats_type": "ashby", "api_url": "https://api.ashbyhq.com/posting-api/job-board/ramp"},
    {"company_slug": "linear", "company_name": "Linear", "ats_type": "ashby", "api_url": "https://api.ashbyhq.com/posting-api/job-board/linear"},
    # Workday (18 verified working endpoints)
    {"company_slug": "walmart", "company_name": "Walmart", "ats_type": "workday", "api_url": "https://walmart.wd5.myworkdayjobs.com/wday/cxs/walmart/WalmartExternal/jobs"},
    {"company_slug": "nvidia", "company_name": "NVIDIA", "ats_type": "workday", "api_url": "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs"},
    {"company_slug": "capitalone", "company_name": "Capital One", "ats_type": "workday", "api_url": "https://capitalone.wd12.myworkdayjobs.com/wday/cxs/capitalone/Capital_One/jobs"},
    {"company_slug": "bah", "company_name": "Booz Allen Hamilton", "ats_type": "workday", "api_url": "https://bah.wd1.myworkdayjobs.com/wday/cxs/bah/BAH_Jobs/jobs"},
    {"company_slug": "amgen", "company_name": "Amgen", "ats_type": "workday", "api_url": "https://amgen.wd1.myworkdayjobs.com/wday/cxs/amgen/Careers/jobs"},
    {"company_slug": "adobe", "company_name": "Adobe", "ats_type": "workday", "api_url": "https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs"},
    {"company_slug": "comcast", "company_name": "Comcast", "ats_type": "workday", "api_url": "https://comcast.wd5.myworkdayjobs.com/wday/cxs/comcast/Comcast_Careers/jobs"},
    {"company_slug": "pfizer", "company_name": "Pfizer", "ats_type": "workday", "api_url": "https://pfizer.wd1.myworkdayjobs.com/wday/cxs/pfizer/PfizerCareers/jobs"},
    {"company_slug": "disney", "company_name": "Disney", "ats_type": "workday", "api_url": "https://disney.wd5.myworkdayjobs.com/wday/cxs/disney/disneycareer/jobs"},
    {"company_slug": "paypal", "company_name": "PayPal", "ats_type": "workday", "api_url": "https://paypal.wd1.myworkdayjobs.com/wday/cxs/paypal/jobs/jobs"},
    {"company_slug": "dell", "company_name": "Dell Technologies", "ats_type": "workday", "api_url": "https://dell.wd1.myworkdayjobs.com/wday/cxs/dell/External/jobs"},
    {"company_slug": "intel", "company_name": "Intel", "ats_type": "workday", "api_url": "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External/jobs"},
    {"company_slug": "unilever", "company_name": "Unilever", "ats_type": "workday", "api_url": "https://unilever.wd3.myworkdayjobs.com/wday/cxs/unilever/Unilever_Experienced_Professionals/jobs"},
    {"company_slug": "workday-hq", "company_name": "Workday", "ats_type": "workday", "api_url": "https://workday.wd5.myworkdayjobs.com/wday/cxs/workday/Workday/jobs"},
    {"company_slug": "broadcom", "company_name": "Broadcom", "ats_type": "workday", "api_url": "https://broadcom.wd1.myworkdayjobs.com/wday/cxs/broadcom/External_Career/jobs"},
    {"company_slug": "zoom", "company_name": "Zoom", "ats_type": "workday", "api_url": "https://zoom.wd5.myworkdayjobs.com/wday/cxs/zoom/Zoom/jobs"},
    {"company_slug": "swift", "company_name": "Swift", "ats_type": "workday", "api_url": "https://swift.wd3.myworkdayjobs.com/wday/cxs/swift/Join-Swift/jobs"},
    {"company_slug": "capgroup", "company_name": "Capital Group", "ats_type": "workday", "api_url": "https://capgroup.wd1.myworkdayjobs.com/wday/cxs/capgroup/capitalgroupcareers/jobs"},
]

@app.on_event("startup")
async def startup():
    # Create indexes
    await db.jobs.create_index(
        [("company_slug", 1), ("source_ats", 1), ("job_id", 1)],
        unique=True
    )
    await db.jobs.create_index([("first_seen_at", -1)])
    await db.jobs.create_index([("is_active", 1)])
    await db.companies.create_index([("company_slug", 1)], unique=True)
    
    # Seed companies if empty
    count = await db.companies.count_documents({})
    if count == 0:
        now = datetime.now(timezone.utc).isoformat()
        for c in SEED_COMPANIES:
            doc = {
                "id": str(uuid.uuid4()),
                **c,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            try:
                await db.companies.insert_one(doc)
            except Exception:
                pass
        logger.info(f"Seeded {len(SEED_COMPANIES)} companies")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
