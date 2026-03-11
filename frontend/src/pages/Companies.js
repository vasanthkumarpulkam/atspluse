import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import {
  Plus, Building2, Trash2, Loader2, Globe, Link2, ChevronDown, ChevronRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ATS_PLATFORMS = [
  {
    key: "greenhouse",
    name: "Greenhouse",
    pattern: "https://boards-api.greenhouse.io/v1/boards/{company}/jobs",
    color: "emerald",
    buildUrl: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
  },
  {
    key: "lever",
    name: "Lever",
    pattern: "https://api.lever.co/v0/postings/{company}",
    color: "sky",
    buildUrl: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
  },
  {
    key: "ashby",
    name: "Ashby",
    pattern: "https://api.ashbyhq.com/posting-public/job-board/{company}",
    color: "violet",
    buildUrl: (slug) => `https://api.ashbyhq.com/posting-public/job-board/${slug}`,
  },
  {
    key: "workday",
    name: "Workday",
    pattern: "https://{company}.wd1.myworkdayjobs.com/wday/cxs/{company}/careers/jobs",
    color: "amber",
    buildUrl: (slug) => `https://${slug}.wd1.myworkdayjobs.com/wday/cxs/${slug}/careers/jobs`,
  },
];

const PLATFORM_COLORS = {
  greenhouse: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  lever: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/20", dot: "bg-sky-400" },
  ashby: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20", dot: "bg-violet-400" },
  workday: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-400" },
};

function CompanyRow({ company, onToggle, onDelete }) {
  const colors = PLATFORM_COLORS[company.ats_type] || PLATFORM_COLORS.greenhouse;

  return (
    <div
      data-testid={`company-card-${company.company_slug}`}
      className="flex items-center gap-4 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
    >
      <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center text-xs font-heading font-semibold text-zinc-300 uppercase shrink-0">
        {company.company_name.slice(0, 2)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">{company.company_name}</span>
          <span className="text-xs text-zinc-500 font-mono">{company.company_slug}</span>
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-500 max-w-[300px] truncate cursor-default">
            <Link2 className="w-3 h-3 shrink-0" />
            <span className="truncate font-mono">{company.api_url}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700 text-zinc-200 max-w-md">
          <p className="font-mono text-xs break-all">{company.api_url}</p>
        </TooltipContent>
      </Tooltip>

      <Badge
        className={`${company.is_active
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : "bg-zinc-800 text-zinc-500 border-zinc-700"
          } text-xs shrink-0`}
      >
        {company.is_active ? "Active" : "Inactive"}
      </Badge>

      <Switch
        data-testid={`toggle-${company.company_slug}`}
        checked={company.is_active}
        onCheckedChange={() => onToggle(company)}
        className="data-[state=checked]:bg-emerald-600 shrink-0"
      />

      <Button
        data-testid={`delete-${company.company_slug}`}
        variant="ghost"
        size="icon"
        onClick={() => onDelete(company)}
        className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function PlatformSection({ platform, companies, onToggle, onDelete, onAdd }) {
  const [collapsed, setCollapsed] = useState(false);
  const colors = PLATFORM_COLORS[platform.key] || PLATFORM_COLORS.greenhouse;
  const count = companies.length;
  const activeCount = companies.filter((c) => c.is_active).length;

  return (
    <div
      data-testid={`platform-section-${platform.key}`}
      className="border border-white/5 rounded-lg overflow-hidden mb-5"
    >
      {/* Platform Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 bg-zinc-900/50 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
        data-testid={`platform-header-${platform.key}`}
      >
        <button className="text-zinc-400 hover:text-zinc-200 transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <div className={`w-2 h-2 rounded-full ${colors.dot}`} />

        <h2 className="font-heading text-base font-semibold text-zinc-100">
          {platform.name}
        </h2>

        <Badge className={`${colors.bg} ${colors.text} ${colors.border} text-xs`}>
          {activeCount}/{count} active
        </Badge>

        <div className="flex-1" />

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 font-mono bg-zinc-800/50 rounded px-2.5 py-1 border border-white/5">
          <Globe className="w-3 h-3 shrink-0 text-zinc-600" />
          <span>{platform.pattern}</span>
        </div>

        <Button
          data-testid={`add-to-${platform.key}`}
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onAdd(platform.key); }}
          className="text-zinc-400 hover:text-zinc-100 hover:bg-white/5 h-7 px-2 ml-2"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add
        </Button>
      </div>

      {/* Company Rows */}
      {!collapsed && (
        <div>
          {count === 0 ? (
            <div className="px-5 py-8 text-center text-zinc-500 text-sm">
              No companies tracked on {platform.name} yet.
            </div>
          ) : (
            companies.map((company) => (
              <CompanyRow
                key={company.id}
                company={company}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addAtsType, setAddAtsType] = useState("greenhouse");
  const [form, setForm] = useState({
    company_slug: "",
    company_name: "",
    ats_type: "greenhouse",
    api_url: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/companies`);
      setCompanies(res.data);
    } catch (e) {
      console.error("Failed to fetch companies:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const grouped = useMemo(() => {
    const map = {};
    ATS_PLATFORMS.forEach((p) => { map[p.key] = []; });
    companies.forEach((c) => {
      if (map[c.ats_type]) map[c.ats_type].push(c);
      else {
        map[c.ats_type] = map[c.ats_type] || [];
        map[c.ats_type].push(c);
      }
    });
    return map;
  }, [companies]);

  const toggleActive = async (company) => {
    try {
      await axios.patch(`${API}/companies/${company.id}`, {
        is_active: !company.is_active,
      });
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === company.id ? { ...c, is_active: !c.is_active } : c
        )
      );
      toast.success(`${company.company_name} ${!company.is_active ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error("Failed to update company");
    }
  };

  const deleteCompany = async (company) => {
    if (!window.confirm(`Delete ${company.company_name}? This also removes all its jobs.`)) return;
    try {
      await axios.delete(`${API}/companies/${company.id}`);
      setCompanies((prev) => prev.filter((c) => c.id !== company.id));
      toast.success(`${company.company_name} deleted`);
    } catch (e) {
      toast.error("Failed to delete company");
    }
  };

  const openAddDialog = (atsType) => {
    setAddAtsType(atsType);
    const platform = ATS_PLATFORMS.find((p) => p.key === atsType);
    setForm({
      company_slug: "",
      company_name: "",
      ats_type: atsType,
      api_url: "",
    });
    setShowAdd(true);
  };

  const handleAdd = async () => {
    if (!form.company_slug || !form.company_name || !form.api_url) {
      toast.error("Please fill all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/companies`, form);
      setCompanies((prev) => [...prev, res.data]);
      setShowAdd(false);
      toast.success(`${res.data.company_name} added to ${form.ats_type}`);
    } catch (e) {
      const msg = e.response?.data?.detail || "Failed to add company";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSlugChange = (slug) => {
    const cleaned = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const platform = ATS_PLATFORMS.find((p) => p.key === form.ats_type);
    const url = platform ? platform.buildUrl(cleaned) : "";
    setForm((prev) => ({ ...prev, company_slug: cleaned, api_url: url }));
  };

  const handleAtsChange = (atsType) => {
    const platform = ATS_PLATFORMS.find((p) => p.key === atsType);
    const url = platform && form.company_slug ? platform.buildUrl(form.company_slug) : "";
    setForm((prev) => ({ ...prev, ats_type: atsType, api_url: url || prev.api_url }));
  };

  const currentPlatform = ATS_PLATFORMS.find((p) => p.key === form.ats_type);

  return (
    <TooltipProvider>
      <div data-testid="companies-page" className="p-6 md:p-8 lg:p-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1
              data-testid="companies-title"
              className="font-heading text-2xl font-semibold text-zinc-100 tracking-tight"
            >
              Companies
            </h1>
            <p className="text-sm text-zinc-500 mt-1 font-body">
              {companies.length} companies across {ATS_PLATFORMS.length} ATS platforms
            </p>
          </div>
          <Button
            data-testid="add-company-button"
            onClick={() => openAddDialog("greenhouse")}
            className="bg-indigo-600 hover:bg-indigo-500 text-white h-9 px-4 text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Company
          </Button>
        </div>

        {/* Platform Sections */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : (
          ATS_PLATFORMS.map((platform) => (
            <PlatformSection
              key={platform.key}
              platform={platform}
              companies={grouped[platform.key] || []}
              onToggle={toggleActive}
              onDelete={deleteCompany}
              onAdd={openAddDialog}
            />
          ))
        )}

        {/* Add Company Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading text-lg">
                Add Company
              </DialogTitle>
              <DialogDescription className="text-zinc-400 text-sm">
                Add a new company to track on{" "}
                <span className={PLATFORM_COLORS[form.ats_type]?.text || "text-zinc-300"}>
                  {currentPlatform?.name || form.ats_type}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-zinc-300 text-sm">ATS Platform</Label>
                <Select value={form.ats_type} onValueChange={handleAtsChange}>
                  <SelectTrigger
                    data-testid="add-company-ats-type"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {ATS_PLATFORMS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300 text-sm">Company Name</Label>
                <Input
                  data-testid="add-company-name"
                  placeholder="Acme Corp"
                  value={form.company_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300 text-sm">Slug</Label>
                <Input
                  data-testid="add-company-slug"
                  placeholder="acme"
                  value={form.company_slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono"
                />
                <p className="text-xs text-zinc-500">
                  Used in the API URL to identify the company
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300 text-sm">API URL</Label>
                <Input
                  data-testid="add-company-api-url"
                  placeholder={currentPlatform?.pattern || "API endpoint URL"}
                  value={form.api_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, api_url: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono text-xs"
                />
                <p className="text-xs text-zinc-500 font-mono">
                  Pattern: {currentPlatform?.pattern}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                data-testid="add-company-cancel"
                variant="outline"
                onClick={() => setShowAdd(false)}
                className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                data-testid="add-company-submit"
                onClick={handleAdd}
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
