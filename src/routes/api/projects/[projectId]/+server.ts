import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getProject, deleteProject, getProjectVideos, getSummary } from '$lib/server/database.js';

export const GET: RequestHandler = async ({ params }) => {
    try {
        const { projectId } = params;
        
        if (!projectId) {
            return error(400, 'Project ID is required');
        }
        
        const project = await getProject(projectId);
        if (!project) {
            return error(404, 'Project not found');
        }
        
        // Get project videos
        const projectVideos = await getProjectVideos(projectId);
        
        // Get video details from summaries
        const videosWithDetails = [];
        for (const projectVideo of projectVideos) {
            const summary = await getSummary(projectVideo.videoId);
            if (summary) {
                videosWithDetails.push({
                    ...projectVideo,
                    videoDetails: {
                        title: summary.title,
                        keyTakeaway: summary.keyTakeaway,
                        author: summary.author,
                        channelId: summary.channelId,
                        hasSubtitles: summary.hasSubtitles
                    }
                });
            }
        }
        
        return json({
            success: true,
            project: {
                ...project,
                videos: videosWithDetails,
                videoCount: videosWithDetails.length
            }
        });
    } catch (err) {
        console.error('Failed to get project:', err);
        return error(500, 'Failed to fetch project');
    }
};

export const DELETE: RequestHandler = async ({ params }) => {
    try {
        const { projectId } = params;
        
        if (!projectId) {
            return error(400, 'Project ID is required');
        }
        
        const project = await getProject(projectId);
        if (!project) {
            return error(404, 'Project not found');
        }
        
        await deleteProject(projectId);
        
        return json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (err) {
        console.error('Failed to delete project:', err);
        return error(500, 'Failed to delete project');
    }
};
