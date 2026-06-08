// src/components/home/projects-home.tsx
// Landing screen — shows all projects + create/delete actions.

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Plus, Folder, Scissors, Trash2, Clock, Film,
  MoreHorizontal, Edit2, FolderOpen, Clapperboard,
} from 'lucide-react';
import { useProjectStore, type ProjectMeta } from '../../store/project-store';
import {
  Dialog, DialogPopup, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/* ── helpers ─────────────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDur(s: number): string {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// A deterministic accent colour per project (not random on each render)
const ACCENTS = [
  'from-violet-500/20 to-purple-600/10 border-violet-500/20',
  'from-blue-500/20 to-cyan-600/10 border-blue-500/20',
  'from-emerald-500/20 to-teal-600/10 border-emerald-500/20',
  'from-amber-500/20 to-orange-600/10 border-amber-500/20',
  'from-rose-500/20 to-pink-600/10 border-rose-500/20',
  'from-indigo-500/20 to-blue-600/10 border-indigo-500/20',
];
const ICON_ACCENTS = [
  'text-violet-400', 'text-blue-400', 'text-emerald-400',
  'text-amber-400', 'text-rose-400', 'text-indigo-400',
];

function projectAccentIdx(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % ACCENTS.length;
}

/* ── Create-project dialog ───────────────────────────────────────── */

function CreateProjectDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Clapperboard className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle>New Project</DialogTitle>
              <DialogDescription className="mt-0.5">
                Give your editing project a name to get started.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-2">
          <Input
            nativeInput
            ref={inputRef}
            placeholder="e.g. Wedding Edit, Vlog #12…"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
            size="lg"
          />
        </div>

        <DialogFooter variant="bare">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            id="btn-confirm-create-project"
            variant="default"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="shadow-lg shadow-primary/20"
          >
            <Plus className="size-4" />
            Create Project
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/* ── Rename dialog ───────────────────────────────────────────────── */

function RenameDialog({
  project,
  onClose,
  onRename,
}: {
  project: ProjectMeta | null;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
    }
  }, [project]);

  const handleSubmit = () => {
    if (!name.trim() || !project) return;
    onRename(project.id, name.trim());
    onClose();
  };

  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Rename Project</DialogTitle>
          <DialogDescription>Enter a new name for "{project?.name}".</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">
          <Input
            nativeInput
            ref={inputRef}
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
            size="lg"
          />
        </div>
        <DialogFooter variant="bare">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="default" onClick={handleSubmit} disabled={!name.trim()}>
            Rename
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/* ── Delete confirm dialog ───────────────────────────────────────── */

function DeleteDialog({
  project,
  onClose,
  onDelete,
}: {
  project: ProjectMeta | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete Project?</DialogTitle>
          <DialogDescription>
            "{project?.name}" will be permanently deleted. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter variant="bare">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => { if (project) { onDelete(project.id); onClose(); } }}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/* ── Project card ────────────────────────────────────────────────── */

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDelete,
}: {
  project: ProjectMeta;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const ai = projectAccentIdx(project.id);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div
      className={`
        group relative flex flex-col rounded-2xl border bg-gradient-to-br overflow-hidden
        cursor-pointer transition-all duration-200
        hover:shadow-xl hover:-translate-y-0.5 hover:border-white/10
        ${ACCENTS[ai]}
      `}
      onClick={onOpen}
    >
      {/* Thumbnail / hero area */}
      <div className="h-36 flex items-center justify-center relative overflow-hidden">
        {/* Grid lines decoration */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Glow blob */}
        <div className={`absolute inset-0 blur-3xl opacity-20 bg-gradient-to-br ${ACCENTS[ai].split(' ').slice(0, 2).join(' ')}`} />

        {/* Icon */}
        <div className={`relative w-14 h-14 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/10 flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
          <Film className={`size-7 ${ICON_ACCENTS[ai]}`} />
        </div>

        {/* Context menu button */}
        <div
          ref={menuRef}
          className="absolute top-2 right-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-7 h-7 rounded-lg bg-black/30 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            title="Project options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-30 w-40 rounded-xl border border-border bg-popover shadow-xl overflow-hidden text-sm">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => { setMenuOpen(false); onOpen(); }}
              >
                <FolderOpen className="size-3.5" /> Open
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-foreground/80 hover:text-foreground transition-colors"
                onClick={() => { setMenuOpen(false); onRename(); }}
              >
                <Edit2 className="size-3.5" /> Rename
              </button>
              <div className="h-px bg-border mx-2 my-1" />
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-destructive/10 text-destructive/80 hover:text-destructive transition-colors"
                onClick={() => { setMenuOpen(false); onDelete(); }}
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-3 bg-card/60 backdrop-blur-sm border-t border-white/5 flex-1">
        <p className="font-semibold text-sm text-foreground truncate mb-1.5">
          {project.name}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
            {project.duration > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatDur(project.duration)}
              </span>
            )}
            {project.segmentCount > 0 && (
              <span className="flex items-center gap-1">
                <Scissors className="size-3" />
                {project.segmentCount} cut{project.segmentCount !== 1 ? 's' : ''}
              </span>
            )}
            {project.duration === 0 && (
              <span className="text-muted-foreground/40 italic">empty</span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/40 flex-shrink-0">
            {timeAgo(project.updatedAt)}
          </span>
        </div>
        {project.mediaFileNames.length > 0 && (
          <p className="text-[10px] text-muted-foreground/40 mt-1 truncate">
            {project.mediaFileNames[0]}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── New-project card ─────────────────────────────────────────────── */

function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      id="btn-new-project"
      onClick={onClick}
      className="
        group flex flex-col items-center justify-center h-full min-h-[220px]
        rounded-2xl border-2 border-dashed border-border/40
        hover:border-primary/40 hover:bg-primary/5
        transition-all duration-200 cursor-pointer gap-3
      "
    >
      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-hover:bg-primary/15">
        <Plus className="size-5 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground/70 group-hover:text-foreground transition-colors">
          New Project
        </p>
        <p className="text-xs text-muted-foreground/40 mt-0.5">Start a new edit</p>
      </div>
    </button>
  );
}

/* ── Main home screen ─────────────────────────────────────────────── */

export function ProjectsHome() {
  const navigate = useNavigate();
  const { projects, createProject, deleteProject, renameProject, openProject } =
    useProjectStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null);

  // Sort newest first
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleCreate = (name: string) => {
    const proj = createProject(name); // also sets activeProjectId
    navigate({ to: '/editor/$projectId', params: { projectId: proj.id } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-8 h-14 bg-card/80 backdrop-blur-sm border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Scissors className="size-3.5 text-primary" />
          </div>
          <span className="font-bold text-sm tracking-tight">
            Video<span className="text-primary">Cut</span>
          </span>
        </div>
        <Button
          id="btn-header-new-project"
          variant="default"
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="shadow-lg shadow-primary/20"
        >
          <Plus />
          New Project
        </Button>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto px-8 py-8">
        {/* Hero heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-1">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? 'Create your first project to start editing.'
              : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-24 h-24 rounded-3xl bg-primary/8 border border-primary/15 flex items-center justify-center">
              <Folder className="size-11 text-primary/50" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground/70 mb-2">No projects yet</p>
              <p className="text-sm text-muted-foreground/60 max-w-xs">
                Projects keep your edits organised. Create one to get started.
              </p>
            </div>
            <Button
              id="btn-empty-new-project"
              variant="default"
              size="lg"
              onClick={() => setCreateOpen(true)}
              className="shadow-lg shadow-primary/20"
            >
              <Plus />
              Create First Project
            </Button>
          </div>
        ) : (
          /* Grid */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {/* New project card */}
            <NewProjectCard onClick={() => setCreateOpen(true)} />

            {/* Project cards */}
            {sorted.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => {
                  openProject(p.id);
                  navigate({ to: '/editor/$projectId', params: { projectId: p.id } });
                }}
                onRename={() => setRenameTarget(p)}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Dialogs */}
      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <RenameDialog
        project={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={renameProject}
      />
      <DeleteDialog
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={deleteProject}
      />
    </div>
  );
}
