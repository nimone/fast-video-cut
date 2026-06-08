import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { EditorView } from '../components/editor/editor-view';
import { useProjectStore } from '../store/project-store';

export const Route = createFileRoute('/editor/$projectId')({
  component: EditorRouteComponent,
});

function EditorRouteComponent() {
  const { projectId } = Route.useParams();
  const { projects, saveProjectState, openProject, closeProject } = useProjectStore();

  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (projectId) {
      openProject(projectId);
    }
  }, [projectId, openProject]);

  if (!project) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 select-none">
        <div className="text-center">
          <h2 className="text-lg font-bold text-destructive mb-2">Project not found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The project with ID "{projectId}" does not exist or has been deleted.
          </p>
          <a href="/" className="text-sm text-primary hover:underline">
            Go back to projects
          </a>
        </div>
      </div>
    );
  }

  return (
    <EditorView
      projectId={projectId}
      projectName={project.name}
      onClose={closeProject}
      saveProjectState={saveProjectState}
    />
  );
}
