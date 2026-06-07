import { create } from 'zustand';
import type { Segment } from './edit-store';
import { deleteProjectFromOPFS } from '../lib/opfs';

export interface SavedClipMeta {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  duration: number;
  keyframeTimes: number[];
  fps: number;
  segments: Segment[];
  history: Segment[][];
  historyIndex: number;
  color: string;
}

export interface SavedMediaItemMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  duration: number | null;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  // Snapshot of last edit state (restored when re-opening)
  segments: Segment[];
  duration: number;
  keyframeTimes: number[];
  fps: number;
  // Names of media files last used (for display only; Files aren't serializable)
  mediaFileNames: string[];
  // Segment count for the card preview
  segmentCount: number;

  // New persistent fields:
  clips?: SavedClipMeta[];
  activeClipId?: string | null;
  mediaItems?: SavedMediaItemMeta[];
}

export interface ProjectStore {
  projects: ProjectMeta[];
  activeProjectId: string | null;

  // Actions
  createProject: (name: string) => ProjectMeta;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  openProject: (id: string) => void;
  closeProject: () => void;
  saveProjectState: (
    id: string,
    patch: Partial<Pick<ProjectMeta, 'segments' | 'duration' | 'keyframeTimes' | 'fps' | 'mediaFileNames' | 'segmentCount' | 'clips' | 'activeClipId' | 'mediaItems'>>
  ) => void;

  activeProject: () => ProjectMeta | null;
}

const STORAGE_KEY = 'flc-projects-v1';

function loadFromStorage(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMeta[];
  } catch {
    return [];
  }
}

function saveToStorage(projects: ProjectMeta[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Quota exceeded or private mode — silently ignore
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: loadFromStorage(),
  activeProjectId: null,

  createProject(name) {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const project: ProjectMeta = {
      id,
      name: name.trim() || 'Untitled Project',
      createdAt: now,
      updatedAt: now,
      segments: [],
      duration: 0,
      keyframeTimes: [],
      fps: 30,
      mediaFileNames: [],
      segmentCount: 0,
    };
    const projects = [...get().projects, project];
    saveToStorage(projects);
    set({ projects, activeProjectId: id });
    return project;
  },

  deleteProject(id) {
    const projects = get().projects.filter((p) => p.id !== id);
    saveToStorage(projects);
    set((s) => ({
      projects,
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }));
    deleteProjectFromOPFS(id).catch((err) => {
      console.error(`Failed to delete project ${id} files from OPFS:`, err);
    });
  },

  renameProject(id, name) {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p
    );
    saveToStorage(projects);
    set({ projects });
  },

  openProject(id) {
    set({ activeProjectId: id });
  },

  closeProject() {
    set({ activeProjectId: null });
  },

  saveProjectState(id, patch) {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
    );
    saveToStorage(projects);
    set({ projects });
  },

  activeProject() {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId) ?? null;
  },
}));
