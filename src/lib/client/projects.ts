import { fetchWithNonce } from './nonce';

export interface Project {
    $id: string;
    name: string;
    createdAt: string;
}

export interface ProjectVideo {
    $id: string;
    projectId: string;
    videoId: string;
    addedAt: string;
    order: number;
}

export interface ProjectWithVideos extends Project {
    videos: ProjectVideo[];
    videoCount: number;
}

// Fetch all projects
export const fetchProjects = async (videoId?: string): Promise<Project[]> => {
    try {
        const url = videoId ? `/api/projects?videoId=${videoId}` : '/api/projects';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        const data = await response.json();
        return data.projects || [];
    } catch (error) {
        console.error('Error fetching projects:', error);
        return [];
    }
};

// Create a new project
export const createProject = async (name: string): Promise<Project> => {
    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to create project');
        }
        
        const data = await response.json();
        return data.project;
    } catch (error) {
        console.error('Error creating project:', error);
        throw error;
    }
};

// Get a single project with its videos
export const fetchProject = async (projectId: string): Promise<ProjectWithVideos | null> => {
    try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error('Failed to fetch project');
        }
        const data = await response.json();
        return data.project;
    } catch (error) {
        console.error('Error fetching project:', error);
        return null;
    }
};

// Delete a project
export const deleteProject = async (projectId: string): Promise<void> => {
    try {
        const response = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to delete project');
        }
    } catch (error) {
        console.error('Error deleting project:', error);
        throw error;
    }
};

// Rename a project
export const renameProject = async (projectId: string, name: string): Promise<Project> => {
    try {
        const response = await fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to rename project');
        }
        
        const data = await response.json();
        return data.project;
    } catch (error) {
        console.error('Error renaming project:', error);
        throw error;
    }
};

// Add video to project
export const addVideoToProject = async (projectId: string, videoId: string): Promise<void> => {
    try {
        const response = await fetch(`/api/projects/${projectId}/videos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to add video to project');
        }
    } catch (error) {
        console.error('Error adding video to project:', error);
        throw error;
    }
};

// Remove video from project
export const removeVideoFromProject = async (projectId: string, videoId: string): Promise<void> => {
    try {
        const response = await fetch(`/api/projects/${projectId}/videos`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to remove video from project');
        }
    } catch (error) {
        console.error('Error removing video from project:', error);
        throw error;
    }
};
