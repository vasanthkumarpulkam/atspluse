import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { formatDistanceToNow, parseISO, isAfter, subMinutes } from "date-fns";
import {
  Search, ExternalLink, MapPin, RefreshCw, Wifi, Clock, Loader2, ChevronLeft, ChevronRight, Zap, Briefcase, Flag
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROLE_CATEGORIES = [
  { key: "none", label: "All Jobs" },
  { key: "all_data_roles", label: "All Data/Analytics Roles" },
  { key: "data_analytics", label: "Data / Analytics" },
  { key: "business_intelligence", label: "Business Intelligence" },
  { key: "business_analyst", label: "Business Analyst" },
  { key: "financial_fpa", label: "Financial / FP&A" },
  { key: "operations_gtm", label: "Operations / GTM" },
  { key: "data_engineering", label: "Data Engineering / ETL" },
  { key: "compliance_governance", label: "Compliance / Governance" },
];

export default function LiveFeed() {
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ total: 0, limit: 50, offset: 0 });
  const [stats, setStats] = useState({ total_jobs: 0, active_companies: 0, fresh_jobs: 0 });
  const [search, setSearch] = useState("");
  const [remoteFilter, setRemoteFilter] = useState("all");
  const [timeWindow, setTimeWindow] = useState("all");
  const [roleCategory, setRoleCategory] = useState("none");
  const [usOnly, setUsOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [page, setPage] = useState(0);
  const intervalRef = useRef(null);
  const LIMIT = 50;

  const fetchJobs = useCallback(async (currentPage = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("title", search);
      if (remoteFilter === "remote") params.append("remote", "true");
      if (remoteFilter === "onsite") params.append("remote", "false");
      if (roleCategory !== "none") params.append("role_category", roleCategory);
      if (usOnly) params.append("us_only", "true");

      if (timeWindow !== "all") {
        const now = new Date();
        let ref;
        if (timeWindow === "10m") ref = subMinutes(now, 10);
        else if (timeWindow === "1h") ref = subMinutes(now, 60);
        else if (timeWindow === "today") {
          ref = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        if (ref) params.append("first_seen_after", ref.toISOString());
      }

      params.append("limit", LIMIT.toString());
      params.append("offset", (currentPage * LIMIT).toString());

      const res = await axios.get(`${API}/jobs?${params.toString()}`);
      setJobs(res.data.data);
      setMeta(res.data.meta);
    } catch (e) {
      console.error("Failed to fetch jobs:", e);
    } finally {
      setLoading(false);
    }
  }, [search, remoteFilter, timeWindow, roleCategory, usOnly]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/stats`);
      setStats(res.data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }, []);

  const triggerCrawl = async () => {
    setCrawling(true);
    try {
      const res = await axios.post(`${API}/internal/crawl`);
      if (res.data.status === "already_running") {
        toast.info("Crawl already in progress...");
      } else {
        toast.success("Crawl started! Fetching jobs in background...");
      }
      // Poll crawl status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await axios.get(`${API}/internal/crawl/status`);
          if (!statusRes.data.running) {
            clearInterval(pollInterval);
            setCrawling(false);
            const result = statusRes.data.last_result;
            if (result) {
              toast.success(`Crawl complete: ${result.companies_processed} companies, ${result.new_jobs_total} new jobs`);
            }
            fetchJobs(page);
            fetchStats();
          }
        } catch { /* ignore poll errors */ }
      }, 3000);
    } catch (e) {
      toast.error("Crawl failed to start");
      setCrawling(false);
    }
  };

  useEffect(() => {
    fetchJobs(page);
    fetchStats();
  }, [page, fetchJobs, fetchStats]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchJobs(page);
        fetchStats();
      }, 45000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, page, fetchJobs, fetchStats]);

  useEffect(() => {
    setPage(0);
  }, [search, remoteFilter, timeWindow, roleCategory, usOnly]);

  const isFresh = (firstSeenAt) => {
    if (!firstSeenAt) return false;
    try {
      return isAfter(parseISO(firstSeenAt), subMinutes(new Date(), 30));
    } catch {
      return false;
    }
  };

  const formatTime = (iso) => {
    if (!iso) return "—";
    try {
      return formatDistanceToNow(parseISO(iso), { addSuffix: true });
    } catch {
      return "—";
    }
  };

  const totalPages = Math.ceil(meta.total / LIMIT);

  return (
    <TooltipProvider>
      <div data-testid="live-feed-page" className="p-6 md:p-8 lg:p-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1
              data-testid="live-feed-title"
              className="font-heading text-2xl font-semibold text-zinc-100 tracking-tight"
            >
              Live Feed
            </h1>
            <p className="text-sm text-zinc-500 mt-1 font-body">
              Tracking jobs across ATS platforms
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              data-testid="crawl-button"
              onClick={triggerCrawl}
              disabled={crawling}
              className="bg-indigo-600 hover:bg-indigo-500 text-white h-9 px-4 text-sm"
            >
              {crawling ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              {crawling ? "Crawling..." : "Crawl Now"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="auto-refresh-toggle"
                  variant={autoRefresh ? "default" : "outline"}
                  size="icon"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={autoRefresh
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }
                >
                  <RefreshCw className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`}
                    style={autoRefresh ? { animationDuration: "3s" } : {}} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{autoRefresh ? "Auto-refresh ON (45s)" : "Auto-refresh OFF"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Jobs", value: stats.total_jobs, icon: "briefcase" },
            { label: "Active Companies", value: stats.active_companies, icon: "building" },
            { label: "Fresh (10m)", value: stats.fresh_jobs, icon: "sparkle" },
          ].map((s) => (
            <div
              key={s.label}
              data-testid={`stat-${s.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              className="bg-zinc-900/50 border border-white/5 rounded-lg p-4"
            >
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1">
                {s.label}
              </p>
              <p className="text-2xl font-heading font-semibold text-zinc-100">
                {s.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div
          data-testid="filters-toolbar"
          className="flex items-center gap-3 mb-5 flex-wrap"
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              data-testid="search-input"
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 h-9"
            />
          </div>

          <Select
            value={remoteFilter}
            onValueChange={setRemoteFilter}
          >
            <SelectTrigger
              data-testid="remote-filter"
              className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-100 h-9"
            >
              <Wifi className="w-3.5 h-3.5 mr-2 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="onsite">On-site</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={timeWindow}
            onValueChange={setTimeWindow}
          >
            <SelectTrigger
              data-testid="time-filter"
              className="w-[160px] bg-zinc-900 border-zinc-800 text-zinc-100 h-9"
            >
              <Clock className="w-3.5 h-3.5 mr-2 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="10m">Last 10 min</SelectItem>
              <SelectItem value="1h">Last 1 hour</SelectItem>
              <SelectItem value="today">Today</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={roleCategory}
            onValueChange={setRoleCategory}
          >
            <SelectTrigger
              data-testid="role-category-filter"
              className="w-[220px] bg-zinc-900 border-zinc-800 text-zinc-100 h-9"
            >
              <Briefcase className="w-3.5 h-3.5 mr-2 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {ROLE_CATEGORIES.map((cat) => (
                <SelectItem key={cat.key} value={cat.key}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="us-only-toggle"
                variant={usOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setUsOnly(!usOnly)}
                className={usOnly
                  ? "bg-blue-600 hover:bg-blue-500 text-white h-9 px-3 gap-1.5"
                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 h-9 px-3 gap-1.5"
                }
              >
                <Flag className="w-3.5 h-3.5" />
                US Only
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{usOnly ? "Showing US jobs only. Click to show all." : "Showing all countries. Click for US only."}</p>
            </TooltipContent>
          </Tooltip>

          {(search || remoteFilter !== "all" || timeWindow !== "all" || roleCategory !== "none" || !usOnly) && (
            <Button
              data-testid="clear-filters-button"
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setRemoteFilter("all"); setTimeWindow("all"); setRoleCategory("none"); setUsOnly(true); }}
              className="text-zinc-400 hover:text-zinc-100"
            >
              Clear
            </Button>
          )}

          <div className="ml-auto text-xs text-zinc-500 font-mono">
            {meta.total} results
          </div>
        </div>

        {/* Table */}
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[240px]">Title</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[140px]">Company</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[180px]">Location</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[80px]">Remote</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[100px]">Source</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[120px]">First Seen</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[60px]">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading jobs...
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-zinc-500">
                    No jobs found. Try triggering a crawl or adjusting filters.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job, i) => {
                  const fresh = isFresh(job.first_seen_at);
                  return (
                    <TableRow
                      key={`${job.company_slug}-${job.source_ats}-${job.job_id}`}
                      data-testid={`job-row-${i}`}
                      className={`border-b border-white/5 transition-colors animate-fade-in ${
                        fresh
                          ? "bg-emerald-500/5 border-l-2 border-l-emerald-500"
                          : "hover:bg-white/[0.03]"
                      }`}
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      <TableCell className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          {fresh && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          )}
                          <span className="text-sm text-zinc-200 font-medium truncate max-w-[220px]">
                            {job.title}
                          </span>
                        </div>
                        {job.department && (
                          <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[220px]">{job.department}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <span className="text-sm text-zinc-300 capitalize">{job.company_slug}</span>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[150px]">{job.location || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        {job.is_remote ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                            Remote
                          </Badge>
                        ) : (
                          <span className="text-xs text-zinc-500">On-site</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs font-mono capitalize">
                          {job.source_ats}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <span className="text-xs text-zinc-400 font-mono">
                          {formatTime(job.first_seen_at)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        {job.job_url && (
                          <a
                            href={job.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`job-link-${i}`}
                            className="text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            data-testid="pagination"
            className="flex items-center justify-between mt-4"
          >
            <p className="text-xs text-zinc-500 font-mono">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                data-testid="prev-page-button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 h-8"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                data-testid="next-page-button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 h-8"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
