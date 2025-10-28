import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getProject, updateProjectCustomPrompt } from '$lib/server/database.js';
import prompt from "$lib/server/prompt.md?raw";

export const GET: RequestHandler = async ({ params }) => {
    try {
        const { projectId } = params;
        
        if (!projectId) {
            return error(400, 'Project ID is required');
        }
        
        // Check if project exists and get current custom prompt
        const project = await getProject(projectId);
        if (!project) {
            return error(404, 'Project not found');
        }
        
        const customPrompt = project.customPrompt || prompt;
        
        return json({
            success: true,
            customPrompt
        });
        
    } catch (err) {
        console.error('Failed to get project settings:', err);
        return error(500, 'Failed to get project settings');
    }
};

export const PUT: RequestHandler = async ({ params, request }) => {
    try {
        const { projectId } = params;
        const { customPrompt } = await request.json();
        
        if (!projectId) {
            return error(400, 'Project ID is required');
        }
        
        if (!customPrompt || typeof customPrompt !== 'string') {
            return error(400, 'Custom prompt is required');
        }
        
        if (customPrompt.trim().length === 0) {
            return error(400, 'Custom prompt cannot be empty');
        }
        
        if (customPrompt.length > 10000) {
            return error(400, 'Custom prompt is too long (max 10000 characters)');
        }
        
        // Check if project exists
        const project = await getProject(projectId);
        if (!project) {
            return error(404, 'Project not found');
        }
        
        // Update project with custom prompt
        await updateProjectCustomPrompt(projectId, customPrompt.trim());
        
        return json({
            success: true,
            message: 'Custom prompt saved successfully'
        });
        
    } catch (err) {
        console.error('Failed to update project settings:', err);
        return error(500, 'Failed to update project settings');
    }
};
