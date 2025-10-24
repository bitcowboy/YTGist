import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getProjects, createProject, isVideoInProject } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ url }) => {
    try {
        const projects = await getProjects();
        const videoId = url.searchParams.get('videoId');
        
        // If videoId is provided, check which projects contain this video
        if (videoId) {
            const projectsWithVideoStatus = await Promise.all(
                projects.map(async (project) => {
                    const containsVideo = await isVideoInProject(project.$id, videoId);
                    return {
                        ...project,
                        containsVideo
                    };
                })
            );
            
            return json({
                success: true,
                projects: projectsWithVideoStatus
            });
        }
        
        return json({
            success: true,
            projects
        });
    } catch (err) {
        console.error('Failed to get projects:', err);
        return error(500, 'Failed to fetch projects');
    }
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { name } = await request.json();
        
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return error(400, 'Project name is required');
        }
        
        if (name.trim().length > 500) {
            return error(400, 'Project name is too long (max 500 characters)');
        }
        
        const project = await createProject(name.trim());
        
        return json({
            success: true,
            project
        });
    } catch (err) {
        console.error('Failed to create project:', err);
        return error(500, 'Failed to create project');
    }
};
