"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  Box,
  ChevronDown,
  CircleAlert,
  Clock3,
  GitBranch,
  GripVertical,
  History,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  UploadCloud,
  Workflow,
  X,
  Zap,
} from "lucide-react";

import {
  J10_FLOW_NODE_CATALOG,
  type J10FlowNodeCatalogEntry,
} from "@/lib/automation/node-catalog";
import { validateJ10FlowGraph } from "@/lib/automation/graph-contract";
import type {
  J10FlowActionNode,
  J10FlowConditionNode,
  J10FlowEdge,
  J10FlowEdgeKind,
  J10FlowGraph,
  J10FlowNode,
  J10FlowValidationResult,
} from "@/types/automation-graph";

const NODE_WIDTH = 230;
const NODE_HEIGHT = 116;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.65;

type FlowConnection = {
  id: string;
  providerId: string;
  name: string;
  status: string;
  environment: string;
  readiness: {
    state: string;
    nextAction: string;
    checks: Array<{ code: string; status: string; message: string }>;
  };
};

type FlowEmployee = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
};

type AutomationInfo = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  publishedVersionId: string | null;
  lastPublishedAt: string | null;
  updatedAt: string;
};

type FlowLoadResponse = {
  success: boolean;
  error?: string;
  automation?: AutomationInfo;
  draft?: {
    graph: J10FlowGraph;
    revision: number;
    updatedAt: string | null;
    validation: J10FlowValidationResult;
  };
  connections?: FlowConnection[];
  employees?: FlowEmployee[];
};

type VersionRow = {
  id: string;
  version_number: number;
  status: string;
  graph_version: string;
  graph_checksum: string;
  rollback_of_version_id: string | null;
  publication_note: string | null;
  published_at: string | null;
  retired_at: string | null;
  created_at: string;
  validation_warnings: unknown[];
};

type RunRow = {
  id: string;
  status: string;
  executionMode: string;
  apiCalled: boolean;
  totalCostUSD: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  versionTrace: {
    automationVersionId: string | null;
    graphVersion: string | null;
    hasGraphSnapshot: boolean;
  };
  steps: Array<{
    id: string;
    stepOrder: number;
    stepType: string;
    status: string;
    versionTrace: {
      automationVersionId: string | null;
      graphNodeId: string | null;
    };
  }>;
};

type ConnectSource = {
  nodeId: string;
  kind: J10FlowEdgeKind;
};

type DragState = {
  nodeId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  before: J10FlowGraph;
};

type PanDragState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type InspectorTab = "properties" | "validation" | "versions" | "runs";

export default function J10FlowBuilder({ automationId }: { automationId: string }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<J10FlowGraph | null>(null);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const mutationRef = useRef(0);

  const [automation, setAutomation] = useState<AutomationInfo | null>(null);
  const [graph, setGraph] = useState<J10FlowGraph | null>(null);
  const [revision, setRevision] = useState(0);
  const [connections, setConnections] = useState<FlowConnection[]>([]);
  const [employees, setEmployees] = useState<FlowEmployee[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [validation, setValidation] = useState<J10FlowValidationResult>({
    valid: false,
    errors: [],
    warnings: [],
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectSource, setConnectSource] = useState<ConnectSource | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panDragState, setPanDragState] = useState<PanDragState | null>(null);
  const [pan, setPan] = useState({ x: 120, y: 80 });
  const [zoom, setZoom] = useState(0.82);
  const [past, setPast] = useState<J10FlowGraph[]>([]);
  const [future, setFuture] = useState<J10FlowGraph[]>([]);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteCategory, setPaletteCategory] = useState("all");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const loadVersions = useCallback(async () => {
    const response = await fetch(`/api/automations/${automationId}/versions`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await response.json()) as {
      success: boolean;
      versions?: VersionRow[];
    };

    if (response.ok && data.success) {
      setVersions(data.versions ?? []);
    }
  }, [automationId]);

  const loadRuns = useCallback(async () => {
    const response = await fetch(
      `/api/automation-runs?automationId=${encodeURIComponent(automationId)}&limit=12`,
      { credentials: "include", cache: "no-store" },
    );
    const data = (await response.json()) as {
      success: boolean;
      runs?: RunRow[];
    };

    if (response.ok && data.success) {
      setRuns(data.runs ?? []);
    }
  }, [automationId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/automations/${automationId}/flow`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json()) as FlowLoadResponse;

      if (!response.ok || !data.success || !data.automation || !data.draft) {
        throw new Error(data.error || "Could not load J10 Flow.");
      }

      setAutomation(data.automation);
      setGraph(data.draft.graph);
      setRevision(data.draft.revision);
      setValidation(data.draft.validation);
      setConnections(data.connections ?? []);
      setEmployees(data.employees ?? []);
      setDirty(false);
      setPast([]);
      setFuture([]);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setStatusMessage("Draft loaded from the J10 runtime.");
      await Promise.all([loadVersions(), loadRuns()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load J10 Flow.");
    } finally {
      setLoading(false);
    }
  }, [automationId, loadRuns, loadVersions]);

  useEffect(() => {
    void load();
  }, [load]);

  const commitGraph = useCallback((next: J10FlowGraph) => {
    const current = graphRef.current;

    if (current) {
      setPast((items) => [...items.slice(-39), structuredClone(current)]);
    }

    setFuture([]);
    setGraph(next);
    setValidation(validateJ10FlowGraph(next));
    setDirty(true);
    mutationRef.current += 1;
  }, []);

  const saveDraft = useCallback(async (manual = false): Promise<boolean> => {
    const currentGraph = graphRef.current;

    if (!currentGraph) {
      return false;
    }

    if (savingRef.current) {
      return false;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    const mutationAtStart = mutationRef.current;

    try {
      const response = await fetch(`/api/automations/${automationId}/flow`, {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph: currentGraph,
          expectedRevision: revisionRef.current,
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        code?: string;
        draft?: { revision?: number; draftUpdatedAt?: string };
        validation?: J10FlowValidationResult;
      };

      if (!response.ok || !data.success) {
        if (data.code === "J10_FLOW_DRAFT_CONFLICT") {
          setStatusMessage("Draft conflict detected. Refresh before overwriting another session.");
        }
        throw new Error(data.error || "Could not save workflow draft.");
      }

      const nextRevision = Number(data.draft?.revision ?? revisionRef.current + 1);
      setRevision(nextRevision);
      setValidation(data.validation ?? validateJ10FlowGraph(currentGraph));

      if (mutationAtStart === mutationRef.current) {
        setDirty(false);
      }

      if (manual) {
        setStatusMessage(`Draft revision ${nextRevision} saved.`);
      }
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save workflow draft.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [automationId]);

  useEffect(() => {
    if (!dirty || loading || publishing) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveDraft(false);
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, [dirty, graph, loading, publishing, saveDraft]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph, selectedNodeId],
  );

  const filteredCatalog = useMemo(() => {
    const query = paletteSearch.trim().toLowerCase();

    return J10_FLOW_NODE_CATALOG.filter((entry) => {
      if (paletteCategory !== "all" && entry.category !== paletteCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${entry.title} ${entry.description}`.toLowerCase().includes(query);
    });
  }, [paletteCategory, paletteSearch]);

  function addNode(entry: J10FlowNodeCatalogEntry) {
    const current = graphRef.current;

    if (!current || !entry.available || !entry.createNode) {
      setStatusMessage(entry.unavailableReason || "This node is not available yet.");
      return;
    }

    if (
      entry.nodeKind === "trigger" &&
      current.nodes.some((node) => node.kind === "trigger" && node.enabled)
    ) {
      setStatusMessage("A workflow can have exactly one enabled trigger. Edit or delete the current trigger first.");
      return;
    }

    const bounds = canvasRef.current?.getBoundingClientRect();
    const position = {
      x: Math.max(40, ((bounds?.width ?? 900) / 2 - pan.x) / zoom - NODE_WIDTH / 2),
      y: Math.max(40, ((bounds?.height ?? 650) / 2 - pan.y) / zoom - NODE_HEIGHT / 2),
    };
    const node = entry.createNode(`node_${crypto.randomUUID()}`, position);
    const next = structuredClone(current);
    next.nodes.push(node);
    commitGraph(next);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setInspectorTab("properties");
  }

  function updateNode(nodeId: string, updater: (node: J10FlowNode) => J10FlowNode) {
    const current = graphRef.current;

    if (!current) {
      return;
    }

    const next = structuredClone(current);
    next.nodes = next.nodes.map((node) => (node.id === nodeId ? updater(node) : node));
    commitGraph(next);
  }

  function updateGraphIdentity(field: "name" | "description", value: string) {
    const current = graphRef.current;

    if (!current) {
      return;
    }

    commitGraph({ ...structuredClone(current), [field]: value });
  }

  function deleteSelected() {
    const current = graphRef.current;

    if (!current) {
      return;
    }

    if (selectedEdgeId) {
      const next = structuredClone(current);
      next.edges = next.edges.filter((edge) => edge.id !== selectedEdgeId);
      commitGraph(next);
      setSelectedEdgeId(null);
      return;
    }

    if (!selectedNodeId) {
      return;
    }

    const next = structuredClone(current);
    next.nodes = next.nodes.filter((node) => node.id !== selectedNodeId);
    next.edges = next.edges.filter(
      (edge) => edge.sourceNodeId !== selectedNodeId && edge.targetNodeId !== selectedNodeId,
    );
    commitGraph(next);
    setSelectedNodeId(null);
    setConnectSource(null);
  }

  function completeConnection(targetNodeId: string) {
    const current = graphRef.current;

    if (!current || !connectSource || connectSource.nodeId === targetNodeId) {
      return;
    }

    const duplicate = current.edges.some(
      (edge) =>
        edge.sourceNodeId === connectSource.nodeId &&
        edge.targetNodeId === targetNodeId &&
        edge.kind === connectSource.kind,
    );

    if (duplicate) {
      setStatusMessage("That connection already exists.");
      setConnectSource(null);
      return;
    }

    const next = structuredClone(current);
    next.edges.push({
      id: `edge_${crypto.randomUUID()}`,
      sourceNodeId: connectSource.nodeId,
      targetNodeId,
      kind: connectSource.kind,
      sourcePortId: edgePort(connectSource.kind),
      targetPortId: "input",
    });
    commitGraph(next);
    setConnectSource(null);
  }

  function undo() {
    const current = graphRef.current;
    const previous = past.at(-1);

    if (!current || !previous) {
      return;
    }

    setPast((items) => items.slice(0, -1));
    setFuture((items) => [structuredClone(current), ...items.slice(0, 39)]);
    setGraph(structuredClone(previous));
    setValidation(validateJ10FlowGraph(previous));
    setDirty(true);
    mutationRef.current += 1;
  }

  function redo() {
    const current = graphRef.current;
    const nextGraph = future[0];

    if (!current || !nextGraph) {
      return;
    }

    setPast((items) => [...items.slice(-39), structuredClone(current)]);
    setFuture((items) => items.slice(1));
    setGraph(structuredClone(nextGraph));
    setValidation(validateJ10FlowGraph(nextGraph));
    setDirty(true);
    mutationRef.current += 1;
  }

  async function publish() {
    const current = graphRef.current;

    if (!current) {
      return;
    }

    const currentValidation = validateJ10FlowGraph(current);
    setValidation(currentValidation);

    if (!currentValidation.valid) {
      setInspectorTab("validation");
      setError("Fix the validation errors before publishing.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      if (dirtyRef.current) {
        const saved = await saveDraft(true);

        if (!saved) {
          throw new Error("Publish stopped because the draft could not be saved.");
        }
      }

      const response = await fetch(`/api/automations/${automationId}/publish`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: current, activate: true }),
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        version?: { id: string; version_number: number };
        warnings?: Array<{ message: string }>;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not publish workflow.");
      }

      setStatusMessage(
        `Version ${data.version?.version_number ?? "new"} published and switched into runtime.`,
      );
      await Promise.all([loadVersions(), loadRuns()]);
      setAutomation((value) =>
        value
          ? {
              ...value,
              status: "active",
              publishedVersionId: data.version?.id ?? value.publishedVersionId,
              lastPublishedAt: new Date().toISOString(),
            }
          : value,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish workflow.");
    } finally {
      setPublishing(false);
    }
  }

  async function rollback(version: VersionRow) {
    if (
      !window.confirm(
        `Create and activate a new immutable version from version ${version.version_number}?`,
      )
    ) {
      return;
    }

    setRollingBackId(version.id);
    setError(null);

    try {
      const response = await fetch(`/api/automations/${automationId}/versions`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceVersionId: version.id, activate: true }),
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        rollback?: { versionNumber?: number };
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not roll back workflow.");
      }

      await load();
      setInspectorTab("versions");
      setStatusMessage(`Rollback published as version ${data.rollback?.versionNumber ?? "new"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not roll back workflow.");
    } finally {
      setRollingBackId(null);
    }
  }

  function fitCanvas() {
    const current = graphRef.current;
    const bounds = canvasRef.current?.getBoundingClientRect();

    if (!current || !bounds || current.nodes.length === 0) {
      setPan({ x: 120, y: 80 });
      setZoom(0.82);
      return;
    }

    const minX = Math.min(...current.nodes.map((node) => node.position.x));
    const minY = Math.min(...current.nodes.map((node) => node.position.y));
    const maxX = Math.max(...current.nodes.map((node) => node.position.x + NODE_WIDTH));
    const maxY = Math.max(...current.nodes.map((node) => node.position.y + NODE_HEIGHT));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const nextZoom = clamp(Math.min((bounds.width - 120) / width, (bounds.height - 120) / height), MIN_ZOOM, 1.1);
    setZoom(nextZoom);
    setPan({
      x: (bounds.width - width * nextZoom) / 2 - minX * nextZoom,
      y: (bounds.height - height * nextZoom) / 2 - minY * nextZoom,
    });
  }

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (dragState) {
        const current = graphRef.current;

        if (!current) {
          return;
        }

        const next = structuredClone(current);
        next.nodes = next.nodes.map((node) =>
          node.id === dragState.nodeId
            ? {
                ...node,
                position: {
                  x: Math.max(0, dragState.originX + (event.clientX - dragState.startX) / zoom),
                  y: Math.max(0, dragState.originY + (event.clientY - dragState.startY) / zoom),
                },
              }
            : node,
        );
        setGraph(next);
        setValidation(validateJ10FlowGraph(next));
      }

      if (panDragState) {
        setPan({
          x: panDragState.originX + event.clientX - panDragState.startX,
          y: panDragState.originY + event.clientY - panDragState.startY,
        });
      }
    }

    function onPointerUp() {
      if (dragState) {
        setPast((items) => [...items.slice(-39), dragState.before]);
        setFuture([]);
        setDirty(true);
        mutationRef.current += 1;
      }

      setDragState(null);
      setPanDragState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragState, panDragState, zoom]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDraft(true);
        return;
      }

      if (editing) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        setConnectSource(null);
        setSelectedEdgeId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07070a] text-white">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-violet-400" />
          <p className="mt-3 text-sm text-white/45">Loading J10 Flow…</p>
        </div>
      </main>
    );
  }

  if (!graph || !automation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07070a] p-6 text-white">
        <div className="max-w-md rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
          <CircleAlert className="mx-auto text-red-300" />
          <p className="mt-3 text-sm text-red-100">{error || "Workflow could not be loaded."}</p>
          <Link href="/dashboard/automation/flow" className="mt-5 inline-block text-sm text-violet-300 underline">
            Return to J10 Flow library
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-[#07070a] text-white">
      <header className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-white/[0.08] bg-[#0b0b0f] px-4 py-3 lg:flex-nowrap lg:px-5">
        <Link
          href="/dashboard/automation/flow"
          className="rounded-lg p-2 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Back to workflow library"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{graph.name || automation.name}</p>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-emerald-300">
              {automation.status}
            </span>
          </div>
          <p className="mt-1 truncate text-[10px] text-white/35">
            Draft r{revision} · {dirty ? "Unsaved changes" : saving ? "Saving" : "Saved"}
            {automation.publishedVersionId ? " · Versioned runtime" : " · Not published"}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/25 p-1">
          <ToolButton label="Undo" onClick={undo} disabled={past.length === 0}><Undo2 size={15} /></ToolButton>
          <ToolButton label="Redo" onClick={redo} disabled={future.length === 0}><Redo2 size={15} /></ToolButton>
          <ToolButton label="Fit canvas" onClick={fitCanvas}><Maximize2 size={15} /></ToolButton>
        </div>

        <button
          type="button"
          onClick={() => void saveDraft(true)}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishing}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-black text-[#04120d] transition hover:brightness-110 disabled:opacity-50"
        >
          {publishing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
          Publish
        </button>
      </header>

      {(error || statusMessage || connectSource) && (
        <div className={`flex min-h-9 items-center justify-between gap-3 border-b px-4 py-2 text-xs ${error ? "border-red-500/20 bg-red-500/10 text-red-100" : connectSource ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-white/[0.06] bg-white/[0.025] text-white/55"}`}>
          <span>
            {error ||
              (connectSource
                ? `Choose a target input for the ${connectSource.kind} route. Press Escape to cancel.`
                : statusMessage)}
          </span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStatusMessage(null);
              setConnectSource(null);
            }}
            className="text-current opacity-60 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(320px,1fr)_minmax(260px,0.8fr)] lg:grid-cols-[250px_minmax(0,1fr)_340px] lg:grid-rows-1">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-white/[0.08] bg-[#0a0a0e] p-4 lg:block">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-violet-400">Node catalog</p>
          <h2 className="mt-1 text-sm font-bold">Add to workflow</h2>
          <div className="relative mt-4">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              value={paletteSearch}
              onChange={(event) => setPaletteSearch(event.target.value)}
              placeholder="Search nodes"
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 py-2 pl-8 pr-3 text-xs outline-none focus:border-violet-400/40"
            />
          </div>
          <select
            value={paletteCategory}
            onChange={(event) => setPaletteCategory(event.target.value)}
            className="mt-2 w-full rounded-lg border border-white/[0.08] bg-[#101015] px-3 py-2 text-xs outline-none"
          >
            <option value="all">All categories</option>
            <option value="trigger">Triggers</option>
            <option value="ai">AI</option>
            <option value="business">Business</option>
            <option value="logic">Logic</option>
            <option value="integration">Integrations</option>
          </select>

          <div className="mt-4 space-y-2">
            {filteredCatalog.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => addNode(entry)}
                disabled={!entry.available}
                title={entry.unavailableReason}
                className="group w-full rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-left transition hover:border-violet-400/35 hover:bg-violet-500/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-300">
                    <CatalogIcon kind={entry.nodeKind} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white/85">{entry.title}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/35">{entry.description}</p>
                  </div>
                </div>
                {!entry.available && (
                  <p className="mt-2 text-[9px] text-amber-300/75">Runtime contract pending</p>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="relative min-h-0 overflow-hidden bg-[#08080c]">
          <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-white/[0.08] bg-[#0d0d12]/95 p-1 shadow-xl backdrop-blur">
            <ToolButton label="Zoom out" onClick={() => setZoom((value) => clamp(value - 0.1, MIN_ZOOM, MAX_ZOOM))}><Minus size={14} /></ToolButton>
            <span className="min-w-12 text-center text-[10px] text-white/45">{Math.round(zoom * 100)}%</span>
            <ToolButton label="Zoom in" onClick={() => setZoom((value) => clamp(value + 0.1, MIN_ZOOM, MAX_ZOOM))}><Plus size={14} /></ToolButton>
          </div>

          <select
            aria-label="Add workflow node"
            defaultValue=""
            onChange={(event) => {
              const entry = J10_FLOW_NODE_CATALOG.find(
                (candidate) => candidate.id === event.target.value,
              );
              if (entry) addNode(entry);
              event.currentTarget.value = "";
            }}
            className="absolute right-3 top-3 z-20 max-w-[48%] rounded-xl border border-violet-500/25 bg-[#111117] px-3 py-2 text-[10px] text-white outline-none lg:hidden"
          >
            <option value="">+ Add node</option>
            {J10_FLOW_NODE_CATALOG.filter((entry) => entry.available).map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.title}</option>
            ))}
          </select>

          <div
            ref={canvasRef}
            className="h-full min-h-[420px] w-full cursor-grab overflow-hidden active:cursor-grabbing"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1px)",
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
            onPointerDown={(event) => {
              const target = event.target as Element;

              if (target.closest("[data-flow-interactive='true']")) {
                return;
              }
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setPanDragState({
                startX: event.clientX,
                startY: event.clientY,
                originX: pan.x,
                originY: pan.y,
              });
            }}
            onWheel={(event) => {
              if (!event.ctrlKey && !event.metaKey) {
                return;
              }
              event.preventDefault();
              setZoom((value) => clamp(value + (event.deltaY < 0 ? 0.08 : -0.08), MIN_ZOOM, MAX_ZOOM));
            }}
          >
            <div
              className="absolute left-0 top-0 h-[1800px] w-[2600px] origin-top-left"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {graph.edges.map((edge) => (
                  <FlowEdgePath
                    key={edge.id}
                    edge={edge}
                    graph={graph}
                    selected={edge.id === selectedEdgeId}
                    onSelect={() => {
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(null);
                    }}
                  />
                ))}
              </svg>

              {graph.nodes.map((node) => (
                <FlowNodeCard
                  key={node.id}
                  node={node}
                  selected={node.id === selectedNodeId}
                  connecting={connectSource !== null}
                  onSelect={() => {
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                    setInspectorTab("properties");
                  }}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    setDragState({
                      nodeId: node.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: node.position.x,
                      originY: node.position.y,
                      before: structuredClone(graph),
                    });
                  }}
                  onStartConnection={(kind) => {
                    setConnectSource({ nodeId: node.id, kind });
                    setSelectedNodeId(node.id);
                  }}
                  onCompleteConnection={() => completeConnection(node.id)}
                />
              ))}
            </div>

            {graph.nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                <div>
                  <Workflow className="mx-auto text-white/15" size={34} />
                  <p className="mt-3 text-sm font-semibold text-white/45">Add a trigger to begin</p>
                  <p className="mt-1 text-xs text-white/25">Use the node catalog on the left.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto border-t border-white/[0.08] bg-[#0a0a0e] lg:border-l lg:border-t-0">
          <div className="sticky top-0 z-10 grid grid-cols-4 border-b border-white/[0.08] bg-[#0a0a0e] p-2">
            <InspectorTabButton active={inspectorTab === "properties"} onClick={() => setInspectorTab("properties")} label="Edit" />
            <InspectorTabButton active={inspectorTab === "validation"} onClick={() => setInspectorTab("validation")} label={`Checks ${validation.errors.length}`} />
            <InspectorTabButton active={inspectorTab === "versions"} onClick={() => setInspectorTab("versions")} label={`Versions ${versions.length}`} />
            <InspectorTabButton active={inspectorTab === "runs"} onClick={() => setInspectorTab("runs")} label={`Runs ${runs.length}`} />
          </div>

          <div className="p-4">
            {inspectorTab === "properties" && (
              <PropertiesInspector
                graph={graph}
                node={selectedNode}
                employees={employees}
                connections={connections}
                onGraphIdentityChange={updateGraphIdentity}
                onNodeChange={(updater) => selectedNode && updateNode(selectedNode.id, updater)}
                onDelete={deleteSelected}
              />
            )}
            {inspectorTab === "validation" && (
              <ValidationInspector
                validation={validation}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setInspectorTab("properties");
                }}
              />
            )}
            {inspectorTab === "versions" && (
              <VersionsInspector
                versions={versions}
                currentVersionId={automation.publishedVersionId}
                rollingBackId={rollingBackId}
                onRefresh={() => void loadVersions()}
                onRollback={(version) => void rollback(version)}
              />
            )}
            {inspectorTab === "runs" && (
              <RunsInspector runs={runs} onRefresh={() => void loadRuns()} />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function FlowNodeCard({
  node,
  selected,
  connecting,
  onSelect,
  onDragStart,
  onStartConnection,
  onCompleteConnection,
}: {
  node: J10FlowNode;
  selected: boolean;
  connecting: boolean;
  onSelect: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStartConnection: (kind: J10FlowEdgeKind) => void;
  onCompleteConnection: () => void;
}) {
  const outputs = outputKinds(node);

  return (
    <article
      data-flow-interactive="true"
      className={`absolute rounded-2xl border bg-[#111117] shadow-2xl transition ${selected ? "border-violet-400 ring-2 ring-violet-500/20" : "border-white/10 hover:border-white/20"} ${node.enabled ? "" : "opacity-45"}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {node.kind !== "trigger" && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (connecting) {
              onCompleteConnection();
            }
          }}
          className={`absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 bg-[#111117] ${connecting ? "border-blue-400 shadow-[0_0_16px_rgba(96,165,250,.8)]" : "border-white/25"}`}
          aria-label="Node input"
        />
      )}

      <div
        className="flex cursor-grab items-center gap-2 border-b border-white/[0.07] px-3 py-2.5 active:cursor-grabbing"
        onPointerDown={onDragStart}
      >
        <GripVertical size={13} className="text-white/20" />
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-300">
          <CatalogIcon kind={node.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-white/85">{node.label || "Untitled node"}</p>
          <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-widest text-white/25">{node.kind.replace("_", " ")}</p>
        </div>
      </div>
      <div className="px-3 py-2.5 text-[9px] leading-4 text-white/35">
        {nodeSummary(node)}
      </div>

      <div className="absolute -right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1">
        {outputs.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartConnection(kind);
            }}
            className={`flex h-6 min-w-6 items-center justify-center rounded-full border-2 bg-[#111117] px-1 text-[7px] font-black uppercase ${kind === "true" ? "border-emerald-400 text-emerald-300" : kind === "false" || kind === "failure" ? "border-red-400 text-red-300" : "border-violet-400 text-violet-300"}`}
            aria-label={`Connect ${kind} output`}
          >
            {kind === "next" ? "+" : kind.slice(0, 1)}
          </button>
        ))}
      </div>
    </article>
  );
}

function FlowEdgePath({
  edge,
  graph,
  selected,
  onSelect,
}: {
  edge: J10FlowEdge;
  graph: J10FlowGraph;
  selected: boolean;
  onSelect: () => void;
}) {
  const source = graph.nodes.find((node) => node.id === edge.sourceNodeId);
  const target = graph.nodes.find((node) => node.id === edge.targetNodeId);

  if (!source || !target) {
    return null;
  }

  const sourceOutputs = outputKinds(source);
  const outputIndex = Math.max(0, sourceOutputs.indexOf(edge.kind));
  const x1 = source.position.x + NODE_WIDTH;
  const y1 = source.position.y + NODE_HEIGHT / 2 + (outputIndex - (sourceOutputs.length - 1) / 2) * 28;
  const x2 = target.position.x;
  const y2 = target.position.y + NODE_HEIGHT / 2;
  const bend = Math.max(70, Math.abs(x2 - x1) * 0.45);
  const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  const color = edge.kind === "true" ? "#34d399" : edge.kind === "false" || edge.kind === "failure" ? "#fb7185" : "#8b5cf6";

  return (
    <g data-flow-interactive="true" className="pointer-events-auto cursor-pointer" onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <path d={path} fill="none" stroke="transparent" strokeWidth="18" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 4 : 2}
        strokeOpacity={selected ? 1 : 0.65}
        strokeLinecap="round"
        strokeDasharray={edge.kind === "failure" ? "7 5" : undefined}
      />
    </g>
  );
}

function PropertiesInspector({
  graph,
  node,
  employees,
  connections,
  onGraphIdentityChange,
  onNodeChange,
  onDelete,
}: {
  graph: J10FlowGraph;
  node: J10FlowNode | null;
  employees: FlowEmployee[];
  connections: FlowConnection[];
  onGraphIdentityChange: (field: "name" | "description", value: string) => void;
  onNodeChange: (updater: (node: J10FlowNode) => J10FlowNode) => void;
  onDelete: () => void;
}) {
  if (!node) {
    return (
      <div>
        <SectionTitle eyebrow="Workflow" title="Draft properties" />
        <Field label="Name">
          <input value={graph.name} onChange={(event) => onGraphIdentityChange("name", event.target.value)} className={inputClass} />
        </Field>
        <Field label="Description">
          <textarea value={graph.description ?? ""} onChange={(event) => onGraphIdentityChange("description", event.target.value)} rows={5} className={inputClass} />
        </Field>
        <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-[10px] leading-5 text-blue-100/60">
          Select a node to edit its typed configuration. Changes autosave with optimistic revision protection.
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle eyebrow={node.kind.replace("_", " ")} title="Node properties" />
      <Field label="Label">
        <input value={node.label} onChange={(event) => onNodeChange((current) => ({ ...current, label: event.target.value }))} className={inputClass} />
      </Field>
      <label className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs">
        <span>
          <span className="block font-semibold">Enabled</span>
          <span className="mt-1 block text-[9px] text-white/35">Disabled nodes do not compile into runtime.</span>
        </span>
        <input type="checkbox" checked={node.enabled} onChange={(event) => onNodeChange((current) => ({ ...current, enabled: event.target.checked }))} />
      </label>

      {node.kind === "trigger" && (
        <>
          <Field label="Trigger type">
            <input value={node.triggerType.replaceAll("_", " ")} disabled className={`${inputClass} opacity-50`} />
          </Field>
          {node.triggerType === "schedule" && (
            <>
              <Field label="Schedule expression">
                <input value={node.triggerConfig.scheduleExpression ?? ""} onChange={(event) => onNodeChange((current) => current.kind === "trigger" ? { ...current, triggerConfig: { ...current.triggerConfig, scheduleExpression: event.target.value } } : current)} className={inputClass} />
              </Field>
              <Field label="Time zone">
                <input value={node.triggerConfig.timezone ?? "UTC"} onChange={(event) => onNodeChange((current) => current.kind === "trigger" ? { ...current, triggerConfig: { ...current.triggerConfig, timezone: event.target.value } } : current)} className={inputClass} />
              </Field>
            </>
          )}
          {node.triggerType === "integration_event" && (
            <>
              <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-[10px] leading-5 text-white/50">
                Provider: <strong>{node.triggerConfig.provider}</strong><br />Event: <strong>{node.triggerConfig.eventType}</strong>
              </div>
              <Field label="Trigger connection">
                <select
                  value={node.triggerConfig.connectionId ?? ""}
                  onChange={(event) => onNodeChange((current) => current.kind === "trigger" ? { ...current, triggerConfig: { ...current.triggerConfig, connectionId: event.target.value || null } } : current)}
                  className={inputClass}
                >
                  <option value="">Select authorized connection</option>
                  {connections.filter((connection) => connection.providerId === node.triggerConfig.provider).map((connection) => (
                    <option key={connection.id} value={connection.id}>{connection.name} · {connection.readiness.state}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </>
      )}

      {node.kind === "ai_task" && (
        <>
          <Field label="AI employee">
            <select value={node.employeeId} onChange={(event) => onNodeChange((current) => current.kind === "ai_task" ? { ...current, employeeId: event.target.value } : current)} className={inputClass}>
              <option value="">Select an exact employee</option>
              {employees.filter((employee) => employee.status === "active").map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name} · {employee.role}</option>
              ))}
            </select>
          </Field>
          <Field label="Task type"><input value={node.taskType} onChange={(event) => onNodeChange((current) => current.kind === "ai_task" ? { ...current, taskType: event.target.value } : current)} className={inputClass} /></Field>
          <Field label="Instructions"><textarea value={node.instructions} onChange={(event) => onNodeChange((current) => current.kind === "ai_task" ? { ...current, instructions: event.target.value } : current)} rows={6} className={inputClass} /></Field>
          <ApprovalToggle value={node.requiresApproval} onChange={(value) => onNodeChange((current) => current.kind === "ai_task" ? { ...current, requiresApproval: value } : current)} />
        </>
      )}

      {node.kind === "action" && (
        <ActionInspector node={node} connections={connections} onNodeChange={onNodeChange} />
      )}

      {node.kind === "condition" && (
        <ConditionInspector node={node} onNodeChange={onNodeChange} />
      )}

      {node.kind === "approval" && (
        <Field label="Approval summary"><textarea value={node.instructions ?? ""} onChange={(event) => onNodeChange((current) => current.kind === "approval" ? { ...current, instructions: event.target.value } : current)} rows={6} className={inputClass} /></Field>
      )}

      {node.kind === "activity" && (
        <Field label="Activity details"><textarea value={node.instructions} onChange={(event) => onNodeChange((current) => current.kind === "activity" ? { ...current, instructions: event.target.value } : current)} rows={6} className={inputClass} /></Field>
      )}

      {node.kind !== "trigger" && (node.kind === "ai_task" || node.kind === "action" || node.kind === "activity") && (
        <RuntimeGuardrails node={node} onNodeChange={onNodeChange} />
      )}

      <button type="button" onClick={onDelete} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/15">
        <Trash2 size={14} /> Delete node
      </button>
    </div>
  );
}

function ActionInspector({ node, connections, onNodeChange }: { node: J10FlowActionNode; connections: FlowConnection[]; onNodeChange: (updater: (node: J10FlowNode) => J10FlowNode) => void }) {
  const integration = node.config.integration;
  const matchingConnections = integration ? connections.filter((connection) => connection.providerId === integration.provider) : [];

  function updateIntegration(patch: Partial<NonNullable<J10FlowActionNode["config"]["integration"]>>) {
    onNodeChange((current) => {
      if (current.kind !== "action" || !current.config.integration) {
        return current;
      }

      const nextIntegration = { ...current.config.integration, ...patch };
      return {
        ...current,
        requiresApproval: nextIntegration.mode === "live" ? true : current.requiresApproval,
        config: {
          ...current.config,
          integration: nextIntegration,
          integrationAction: {
            connectionId: nextIntegration.connectionId,
            capabilityId: nextIntegration.capability,
            mode: nextIntegration.mode ?? "simulate",
            input: nextIntegration.input,
          },
        },
      };
    });
  }

  return (
    <>
      <Field label="Action type"><input value={node.actionType.replaceAll("_", " ")} disabled className={`${inputClass} opacity-50`} /></Field>
      <Field label="Instructions"><textarea value={node.instructions ?? ""} onChange={(event) => onNodeChange((current) => current.kind === "action" ? { ...current, instructions: event.target.value } : current)} rows={5} className={inputClass} /></Field>
      {integration && (
        <>
          <Field label="Connection">
            <select value={integration.connectionId ?? ""} onChange={(event) => updateIntegration({ connectionId: event.target.value || null })} className={inputClass}>
              <option value="">Select {integration.provider} connection</option>
              {matchingConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name} · {connection.readiness.state}</option>)}
            </select>
          </Field>
          {matchingConnections.length === 0 && (
            <Link href="/dashboard/settings/integrations" className="mt-2 block text-[10px] text-amber-300 underline">Configure this provider in Integrations</Link>
          )}
          <Field label="Execution mode">
            <select value={integration.mode ?? "simulate"} onChange={(event) => updateIntegration({ mode: event.target.value as "simulate" | "sandbox" | "live" })} className={inputClass}>
              <option value="simulate">Simulate — no provider call</option>
              <option value="sandbox">Sandbox</option>
              <option value="live">Live — human approval required</option>
            </select>
          </Field>
          <Field label="Action input (JSON)">
            <textarea
              key={`${node.id}-${JSON.stringify(integration.input)}`}
              defaultValue={JSON.stringify(integration.input, null, 2)}
              onBlur={(event) => {
                try {
                  const parsed = JSON.parse(event.target.value) as unknown;
                  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
                  updateIntegration({ input: parsed as Record<string, unknown> });
                  event.target.setCustomValidity("");
                } catch {
                  event.target.setCustomValidity("Action input must be a JSON object.");
                  event.target.reportValidity();
                }
              }}
              rows={8}
              className={`${inputClass} font-mono text-[10px]`}
            />
          </Field>
        </>
      )}
      <ApprovalToggle value={node.requiresApproval} disabled={integration?.mode === "live"} onChange={(value) => onNodeChange((current) => current.kind === "action" ? { ...current, requiresApproval: value } : current)} />
    </>
  );
}

function ConditionInspector({ node, onNodeChange }: { node: J10FlowConditionNode; onNodeChange: (updater: (node: J10FlowNode) => J10FlowNode) => void }) {
  const rule = node.rules[0];

  function updateRule(patch: Partial<J10FlowConditionNode["rules"][number]>) {
    onNodeChange((current) => current.kind === "condition" ? { ...current, rules: [{ ...current.rules[0], ...patch }] } : current);
  }

  return (
    <>
      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-[10px] leading-5 text-emerald-100/60">
        Connect exactly one True output and one False output. The compiler writes deterministic forward step targets.
      </div>
      <Field label="Context path"><input value={rule?.left ?? ""} onChange={(event) => updateRule({ left: event.target.value })} placeholder="trigger.status" className={inputClass} /></Field>
      <Field label="Operator">
        <select value={rule?.operator ?? "equals"} onChange={(event) => updateRule({ operator: event.target.value as J10FlowConditionNode["rules"][number]["operator"] })} className={inputClass}>
          <option value="equals">Equals</option><option value="not_equals">Not equal</option><option value="contains">Contains</option><option value="not_contains">Does not contain</option><option value="starts_with">Starts with</option><option value="ends_with">Ends with</option><option value="greater_than">Greater than</option><option value="greater_than_or_equal">Greater or equal</option><option value="less_than">Less than</option><option value="less_than_or_equal">Less or equal</option>
        </select>
      </Field>
      <Field label="Expected value"><input value={String(rule?.right ?? "")} onChange={(event) => updateRule({ right: event.target.value })} className={inputClass} /></Field>
      <Field label="False-branch fallback">
        <select value={node.fallback} onChange={(event) => onNodeChange((current) => current.kind === "condition" ? { ...current, fallback: event.target.value as "continue" | "stop" } : current)} className={inputClass}><option value="stop">Stop if no target continues</option><option value="continue">Continue</option></select>
      </Field>
    </>
  );
}

function RuntimeGuardrails({ node, onNodeChange }: { node: Extract<J10FlowNode, { kind: "ai_task" | "action" | "activity" }>; onNodeChange: (updater: (node: J10FlowNode) => J10FlowNode) => void }) {
  const guardrails = node.config.executionGuardrails ?? { stepTimeoutMs: 30_000, workflowTimeoutMs: 120_000 };
  const policy = node.config.failurePolicy ?? { mode: "stop" as const, maxAttempts: 3, retryDelayMs: 0, afterRetries: "stop" as const };

  function updateConfig(patch: Record<string, unknown>) {
    onNodeChange((current) => {
      if (current.kind !== "ai_task" && current.kind !== "action" && current.kind !== "activity") return current;
      return { ...current, config: { ...current.config, ...patch } };
    });
  }

  return (
    <details className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <summary className="cursor-pointer text-xs font-semibold text-white/70">Failure policy & guardrails</summary>
      <Field label="On failure">
        <select value={policy.mode} onChange={(event) => updateConfig({ failurePolicy: { ...policy, mode: event.target.value } })} className={inputClass}><option value="stop">Stop</option><option value="retry">Retry</option><option value="continue">Continue</option><option value="human_review">Human review</option></select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Max attempts"><input type="number" min={1} max={10} value={policy.maxAttempts} onChange={(event) => updateConfig({ failurePolicy: { ...policy, maxAttempts: Number(event.target.value) } })} className={inputClass} /></Field>
        <Field label="Retry delay ms"><input type="number" min={0} max={300000} value={policy.retryDelayMs} onChange={(event) => updateConfig({ failurePolicy: { ...policy, retryDelayMs: Number(event.target.value) } })} className={inputClass} /></Field>
        <Field label="Step timeout ms"><input type="number" min={100} max={120000} value={guardrails.stepTimeoutMs} onChange={(event) => updateConfig({ executionGuardrails: { ...guardrails, stepTimeoutMs: Number(event.target.value) } })} className={inputClass} /></Field>
        <Field label="Workflow timeout ms"><input type="number" min={1000} max={300000} value={guardrails.workflowTimeoutMs} onChange={(event) => updateConfig({ executionGuardrails: { ...guardrails, workflowTimeoutMs: Number(event.target.value) } })} className={inputClass} /></Field>
      </div>
    </details>
  );
}

function ValidationInspector({ validation, onSelectNode }: { validation: J10FlowValidationResult; onSelectNode: (nodeId: string) => void }) {
  const issues = [...validation.errors.map((issue) => ({ ...issue, severity: "error" })), ...validation.warnings.map((issue) => ({ ...issue, severity: "warning" }))];

  return (
    <div>
      <SectionTitle eyebrow="Deterministic checks" title={validation.valid ? "Ready to publish" : "Publish blocked"} />
      <div className={`rounded-xl border p-3 text-xs ${validation.valid ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-200" : "border-red-500/20 bg-red-500/[0.07] text-red-200"}`}>
        {validation.valid ? "The graph contract is valid. Server-side readiness is checked again at publish." : `${validation.errors.length} graph error(s) must be fixed.`}
      </div>
      <div className="mt-4 space-y-2">
        {issues.map((issue, index) => (
          <button key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? index}`} type="button" onClick={() => issue.nodeId && onSelectNode(issue.nodeId)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-left">
            <div className="flex items-start gap-2"><CircleAlert size={14} className={issue.severity === "error" ? "text-red-400" : "text-amber-400"} /><div><p className="text-[10px] font-bold uppercase tracking-wider text-white/55">{issue.code.replaceAll("_", " ")}</p><p className="mt-1 text-[10px] leading-4 text-white/40">{issue.message}</p></div></div>
          </button>
        ))}
        {issues.length === 0 && <p className="py-8 text-center text-xs text-white/30">No validation issues.</p>}
      </div>
    </div>
  );
}

function VersionsInspector({ versions, currentVersionId, rollingBackId, onRefresh, onRollback }: { versions: VersionRow[]; currentVersionId: string | null; rollingBackId: string | null; onRefresh: () => void; onRollback: (version: VersionRow) => void }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3"><SectionTitle eyebrow="Immutable history" title="Published versions" /><ToolButton label="Refresh versions" onClick={onRefresh}><RefreshCw size={14} /></ToolButton></div>
      <div className="space-y-3">
        {versions.map((version) => {
          const current = version.id === currentVersionId;
          return (
            <div key={version.id} className={`rounded-xl border p-3 ${current ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-white/[0.08] bg-white/[0.025]"}`}>
              <div className="flex items-center justify-between"><p className="text-xs font-bold">Version {version.version_number}</p><span className="text-[8px] font-bold uppercase tracking-wider text-white/35">{current ? "current" : version.status}</span></div>
              <p className="mt-2 font-mono text-[8px] text-white/25">SHA-256 {version.graph_checksum?.slice(0, 16)}…</p>
              <p className="mt-2 text-[9px] text-white/35">{formatDate(version.published_at || version.created_at)}</p>
              {version.rollback_of_version_id && <p className="mt-2 text-[9px] text-violet-300/70">Created by rollback</p>}
              {!current && (version.status === "retired" || version.status === "published") && (
                <button type="button" onClick={() => onRollback(version)} disabled={rollingBackId !== null} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-[10px] font-semibold text-violet-200 disabled:opacity-40">{rollingBackId === version.id ? <Loader2 size={12} className="animate-spin" /> : <History size={12} />} Create rollback version</button>
              )}
            </div>
          );
        })}
        {versions.length === 0 && <p className="py-8 text-center text-xs text-white/30">Publish the draft to create version 1.</p>}
      </div>
    </div>
  );
}

function RunsInspector({ runs, onRefresh }: { runs: RunRow[]; onRefresh: () => void }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3"><SectionTitle eyebrow="Operations" title="Recent executions" /><ToolButton label="Refresh runs" onClick={onRefresh}><RefreshCw size={14} /></ToolButton></div>
      <div className="space-y-3">
        {runs.map((run) => (
          <details key={run.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold capitalize">{run.status.replaceAll("_", " ")}</span><ChevronDown size={13} className="text-white/30" /></div>
              <p className="mt-2 text-[9px] text-white/35">{formatDate(run.startedAt)} · {run.executionMode}</p>
              <p className="mt-1 text-[9px] text-white/25">API: {run.apiCalled ? "yes" : "no"} · Cost: ${Number(run.totalCostUSD ?? 0).toFixed(4)}</p>
            </summary>
            <div className="mt-3 border-t border-white/[0.07] pt-3">
              <p className="font-mono text-[8px] text-violet-300/60">Version {run.versionTrace.automationVersionId?.slice(0, 8) ?? "legacy"}</p>
              <div className="mt-3 space-y-2">{run.steps.map((step) => <div key={step.id} className="rounded-lg bg-black/25 p-2 text-[9px] text-white/45"><span className="font-semibold text-white/65">#{step.stepOrder} {step.stepType}</span> · {step.status}<br /><span className="font-mono text-[8px] text-white/25">node {step.versionTrace.graphNodeId ?? "legacy"}</span></div>)}</div>
              {run.errorMessage && <p className="mt-3 text-[9px] text-red-300">{run.errorMessage}</p>}
            </div>
          </details>
        ))}
        {runs.length === 0 && <p className="py-8 text-center text-xs text-white/30">No executions recorded for this workflow.</p>}
      </div>
    </div>
  );
}

function ApprovalToggle({ value, disabled = false, onChange }: { value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs"><span><span className="block font-semibold">Require human approval</span><span className="mt-1 block text-[9px] text-white/35">Pause safely before this node executes.</span></span><input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block"><span className="mb-2 block text-[9px] font-bold uppercase tracking-wider text-white/35">{label}</span>{children}</label>;
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="mb-5"><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-violet-400">{eyebrow}</p><h2 className="mt-1 text-sm font-bold">{title}</h2></div>;
}

function ToolButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="rounded-lg p-2 text-white/45 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-25">{children}</button>;
}

function InspectorTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-1 py-2 text-[9px] font-bold uppercase tracking-wider transition ${active ? "bg-violet-500/15 text-violet-200" : "text-white/30 hover:text-white/60"}`}>{label}</button>;
}

function CatalogIcon({ kind }: { kind: J10FlowNodeCatalogEntry["nodeKind"] | J10FlowNode["kind"] }) {
  switch (kind) {
    case "trigger": return <Zap size={14} />;
    case "ai_task": return <Bot size={14} />;
    case "condition": return <GitBranch size={14} />;
    case "approval": return <ShieldCheck size={14} />;
    case "activity": return <Activity size={14} />;
    case "planned": return <Clock3 size={14} />;
    default: return <Box size={14} />;
  }
}

function outputKinds(node: J10FlowNode): J10FlowEdgeKind[] {
  if (node.kind === "condition") return ["true", "false"];
  if (node.kind === "action" && node.actionType === "integration_action") return ["success"];
  if (node.kind === "trigger" || node.kind === "approval" || node.kind === "activity") return ["next"];
  return ["next"];
}

function edgePort(kind: J10FlowEdgeKind) {
  return kind === "next" ? "next" as const : kind;
}

function nodeSummary(node: J10FlowNode) {
  switch (node.kind) {
    case "trigger": return node.triggerType.replaceAll("_", " ");
    case "ai_task": return node.employeeId ? `${node.taskType} · employee selected` : `${node.taskType} · employee required`;
    case "action": return node.actionType === "integration_action" ? `${node.config.integration?.provider ?? "provider"} · ${node.config.integration?.mode ?? "simulate"}` : node.actionType.replaceAll("_", " ");
    case "condition": return `${node.rules[0]?.left || "context path"} ${node.rules[0]?.operator || "equals"} ${String(node.rules[0]?.right ?? "value")}`;
    case "approval": return "human control gate";
    case "activity": return node.instructions || "record workflow activity";
  }
}

function formatDate(value: string | null) {
  if (!value) return "No timestamp";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const inputClass = "w-full rounded-xl border border-white/[0.09] bg-black/30 px-3 py-2.5 text-xs text-white/80 outline-none transition focus:border-violet-400/50 disabled:cursor-not-allowed";
