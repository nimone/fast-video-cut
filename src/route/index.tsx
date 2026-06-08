import { createFileRoute } from '@tanstack/react-router';
import { ProjectsHome } from '../components/home/projects-home';

export const Route = createFileRoute('/')({
  component: ProjectsHome,
});
