// src/lib/opfs.ts
// OPFS (Origin Private File System) helpers to persist video files locally.

export async function saveFileToOPFS(projectId: string, fileId: string, file: File): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects', { create: true });
    const projDir = await projectsDir.getDirectoryHandle(projectId, { create: true });
    const fileHandle = await projDir.getFileHandle(fileId, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    console.log(`Saved file to OPFS: projects/${projectId}/${fileId} (${file.name})`);
  } catch (error) {
    console.error(`Error saving file to OPFS (projects/${projectId}/${fileId}):`, error);
    throw error;
  }
}

export async function loadFileFromOPFS(
  projectId: string,
  fileId: string,
  fileName: string,
  fileType: string
): Promise<File> {
  try {
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects', { create: true });
    const projDir = await projectsDir.getDirectoryHandle(projectId, { create: true });
    const fileHandle = await projDir.getFileHandle(fileId);
    const blob = await fileHandle.getFile();
    return new File([blob], fileName, { type: fileType });
  } catch (error) {
    console.error(`Error loading file from OPFS (projects/${projectId}/${fileId}):`, error);
    throw error;
  }
}

export async function deleteClipFromOPFS(projectId: string, fileId: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects', { create: true });
    const projDir = await projectsDir.getDirectoryHandle(projectId, { create: true });
    await projDir.removeEntry(fileId);
    console.log(`Deleted file from OPFS: projects/${projectId}/${fileId}`);
  } catch (error) {
    console.error(`Error deleting file from OPFS (projects/${projectId}/${fileId}):`, error);
  }
}

export async function deleteProjectFromOPFS(projectId: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects', { create: true });
    await projectsDir.removeEntry(projectId, { recursive: true });
    console.log(`Deleted project directory from OPFS: projects/${projectId}`);
  } catch (error) {
    console.error(`Error deleting project from OPFS (projects/${projectId}):`, error);
  }
}
