import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { formatDistanceToNow, parseISO, differenceInMinutes } from "date-fns";
import {
  Search, ExternalLink, MapPin, Wifi, Clock, Loader2, Briefcase, Flag, Flame, Timer
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

function TimeLeft({ firstSeenAt }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  if (!firstSeenAt) return null;
  try {
    const seen = parseISO(firstSeenAt);
    const minsAgo = differenceInMinutes(now, seen);
    const minsLeft = 60 - minsAgo;
    if (minsLeft <= 0) return <span className="text-red-400 text-xs font-mono">expiring</span>;
    const pct = (minsLeft / 60) * 100;
    const color = minsLeft > 30 ? "bg-emerald-500" : minsLeft > 10 ? "bg-amber-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-zinc-400 font-mono w-10">{minsLeft}m</span>
      </div>
    );
  } catch {
    return null;
  }
}

export default function FreshJobs() {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [remoteFilter, setRemoteFilter] = useState("all");
  const [roleCategory, setRoleCategory] = useState("none");
  const [usOnly, setUsOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetchFresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("minutes", "60");
      params.append("limit", "200");
      if (search) params.append("title", search);
      if (remoteFilter === "remote") params.append("remote", "true");
      if (remoteFilter === "onsite") params.append("remote", "false");
      if (roleCategory !== "none") params.append("role_category", roleCategory);
      if (usOnly) params.append("us_only", "true");

      const res = await axios.get(`${API}/jobs/new?${params.toString()}`);
      setJobs(res.data.data);
      setTotal(res.data.meta.total);
    } catch (e) {
      console.error("Failed to fetch fresh jobs:", e);
    } finally {
      setLoading(false);
    }
  }, [search, remoteFilter, roleCategory, usOnly]);

  useEffect(() => {
    fetchFresh();
  }, [fetchFresh]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    intervalRef.current = setInterval(fetchFresh, 15000);
    return () => clearInterval(intervalRef.current);
  }, [fetchFresh]);

  const formatTime = (iso) => {
    if (!iso) return "--";
    try {
      return formatDistanceToNow(parseISO(iso), { addSuffix: true });
    } catch {
      return "--";
    }
  };

  return (
    <TooltipProvider>
      <div data-testid="fresh-jobs-page" className="p-6 md:p-8 lg:p-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Flame className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <div>
              <h1
                data-testid="fresh-jobs-title"
                className="font-heading text-2xl font-semibold text-zinc-100 tracking-tight"
              >
                Fresh Jobs
              </h1>
              <p className="text-sm text-zinc-500 font-body">
                Jobs discovered in the last 60 minutes. Auto-expires.
              </p>
            </div>
          </div>
        </div>

        {/* Live counter */}
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-zinc-900/50 border border-orange-500/10 rounded-lg px-5 py-3 flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-orange-400 animate-pulse" />
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-orange-400 animate-ping opacity-30" />
            </div>
            <div>
              <p className="text-2xl font-heading font-semibold text-zinc-100">{total}</p>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">fresh jobs</p>
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-white/5 rounded-lg px-5 py-3 flex items-center gap-3">
            <Timer className="w-4 h-4 text-zinc-500" />
            <div>
              <p className="text-sm font-medium text-zinc-300">60 min window</p>
              <p className="text-xs text-zinc-500">Auto-refreshes every 15s</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div
          data-testid="fresh-filters-toolbar"
          className="flex items-center gap-3 mb-5 flex-wrap"
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              data-testid="fresh-search-input"
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 h-9"
            />
          </div>

          <Select value={remoteFilter} onValueChange={setRemoteFilter}>
            <SelectTrigger
              data-testid="fresh-remote-filter"
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

          <Select value={roleCategory} onValueChange={setRoleCategory}>
            <SelectTrigger
              data-testid="fresh-role-filter"
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
                data-testid="fresh-us-only-toggle"
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
              <p>{usOnly ? "US jobs only" : "All countries"}</p>
            </TooltipContent>
          </Tooltip>

          {(search || remoteFilter !== "all" || roleCategory !== "none" || !usOnly) && (
            <Button
              data-testid="fresh-clear-filters"
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setRemoteFilter("all"); setRoleCategory("none"); setUsOnly(true); }}
              className="text-zinc-400 hover:text-zinc-100"
            >
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[240px]">Title</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[130px]">Company</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[170px]">Location</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[80px]">Remote</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[90px]">Source</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[110px]">Discovered</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[110px]">Expires In</TableHead>
                <TableHead className="text-zinc-400 uppercase text-xs tracking-wider font-medium bg-zinc-900/50 w-[50px]">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading fresh jobs...
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-zinc-500">
                    <Flame className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    No fresh jobs in the last 60 minutes.
                    <br />
                    <span className="text-xs">Trigger a crawl from the Live Feed page to discover new jobs.</span>
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job, i) => (
                  <TableRow
                    key={`${job.company_slug}-${job.source_ats}-${job.job_id}`}
                    data-testid={`fresh-job-row-${i}`}
                    className="border-b border-white/5 hover:bg-white/[0.03] transition-colors animate-fade-in border-l-2 border-l-orange-500/40"
                    style={{ animationDelay: `${i * 15}ms` }}
                  >
                    <TableCell className="py-2.5 px-4">
                      <span className="text-sm text-zinc-200 font-medium truncate max-w-[220px] block">
                        {job.title}
                      </span>
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
                        <span className="truncate max-w-[140px]">{job.location || "--"}</span>
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
                      <TimeLeft firstSeenAt={job.first_seen_at} />
                    </TableCell>
                    <TableCell className="py-2.5 px-4">
                      {job.job_url && (
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`fresh-job-link-${i}`}
                          className="text-orange-400 hover:text-orange-300 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {jobs.length > 0 && (
          <p className="text-xs text-zinc-500 mt-3 font-mono text-right">
            Showing {jobs.length} of {total} fresh jobs
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
