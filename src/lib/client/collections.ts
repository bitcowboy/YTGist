import type { Collection, CollectionVideo } from '$lib/types';

// Fetch all collections
export const fetchCollections = async (): Promise<Collection[]> => {
    try {
        const response = await fetch('/api/collections');
        if (!response.ok) {
            throw new Error('Failed to fetch collections');
        }
        const data = await response.json();
        return data.collections || [];
    } catch (error) {
        console.error('Error fetching collections:', error);
        return [];
    }
};

// Create a new collection
export const createCollection = async (name: string, description?: string): Promise<Collection> => {
    try {
        const response = await fetch('/api/collections', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, description }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to create collection');
        }
        
        const data = await response.json();
        return data.collection;
    } catch (error) {
        console.error('Error creating collection:', error);
        throw error;
    }
};

// Get a single collection
export const fetchCollection = async (collectionId: string): Promise<Collection | null> => {
    try {
        const response = await fetch(`/api/collections/${collectionId}`);
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error('Failed to fetch collection');
        }
        const data = await response.json();
        return data.collection;
    } catch (error) {
        console.error('Error fetching collection:', error);
        return null;
    }
};

// Update a collection
export const updateCollection = async (collectionId: string, name: string, description?: string): Promise<Collection> => {
    try {
        const response = await fetch(`/api/collections/${collectionId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, description }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to update collection');
        }
        
        const data = await response.json();
        return data.collection;
    } catch (error) {
        console.error('Error updating collection:', error);
        throw error;
    }
};

// Delete a collection
export const deleteCollection = async (collectionId: string): Promise<void> => {
    try {
        const response = await fetch(`/api/collections/${collectionId}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to delete collection');
        }
    } catch (error) {
        console.error('Error deleting collection:', error);
        throw error;
    }
};

// Classify and collect video using AI
export const classifyAndCollectVideo = async (videoId: string): Promise<string[]> => {
    try {
        const response = await fetch('/api/collections/classify-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to classify and collect video');
        }
        
        const data = await response.json();
        return data.collectionIds || [];
    } catch (error) {
        console.error('Error classifying and collecting video:', error);
        throw error;
    }
};

// Get videos in a collection
export const fetchCollectionVideos = async (collectionId: string): Promise<CollectionVideo[]> => {
    try {
        const response = await fetch(`/api/collections/${collectionId}/videos`);
        if (!response.ok) {
            throw new Error('Failed to fetch collection videos');
        }
        const data = await response.json();
        return data.videos || [];
    } catch (error) {
        console.error('Error fetching collection videos:', error);
        return [];
    }
};

// Remove video from collection
export const removeVideoFromCollection = async (collectionId: string, videoId: string): Promise<void> => {
    try {
        const response = await fetch(`/api/collections/${collectionId}/videos`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to remove video from collection');
        }
    } catch (error) {
        console.error('Error removing video from collection:', error);
        throw error;
    }
};

// Get collections for a video
export const fetchVideoCollections = async (videoId: string): Promise<Collection[]> => {
    try {
        const response = await fetch(`/api/collections/video-collections?videoId=${encodeURIComponent(videoId)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch video collections');
        }
        const data = await response.json();
        return data.collections || [];
    } catch (error) {
        console.error('Error fetching video collections:', error);
        return [];
    }
};

