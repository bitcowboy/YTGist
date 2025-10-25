import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getProject, addVideoToProject, removeVideoFromProject, markProjectSummaryStale } from '$lib/server/database.js';

export const POST: RequestHandler = async ({ params, request }) => {
    try {
        const { projectId } = params;
        const { videoId } = await request.json();
        
        if (!projectId) {
            return error(400, 'Project ID is required');
        }
        
        if (!videoId || typeof videoId !== 'string') {
            return error(400, 'Video ID is required');
        }
        
        // Check if project exists
        const project = await getProject(projectId);
        if (!project) {
            return error(404, 'Project not found');
        }
        
        await addVideoToProject(projectId, videoId);
        
        // Mark project summary cache as stale
        await markProjectSummaryStale(projectId);
        
        return json({
            success: true,
            message: 'Video added to project successfully'
        });
    } catch (err) {
        console.error('Failed to add video to project:', err);
        
        if (err instanceof Error && err.message === 'Video is already in this project') {
            return error(409, err.message);
        }
        
        return error(500, 'Failed to add video to project');
    }
};

export const DELETE: RequestHandler = async ({ params, request }) => {
    try {
        const { projectId } = params;
        const { videoId } = await request.json();
        
        if (!projectId) {
            return error(400, 'Project ID is required');
        }
        
        if (!videoId || typeof videoId !== 'string') {
            return error(400, 'Video ID is required');
        }
        
        // Check if project exists
        const project = await getProject(projectId);
        if (!project) {
            return error(404, 'Project not found');
        }
        
        await removeVideoFromProject(projectId, videoId);
        
        // Mark project summary cache as stale
        await markProjectSummaryStale(projectId);
        
        return json({
            success: true,
            message: 'Video removed from project successfully'
        });
    } catch (err) {
        console.error('Failed to remove video from project:', err);
        return error(500, 'Failed to remove video from project');
    }
};
