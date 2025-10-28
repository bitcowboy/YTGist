export interface ProjectSummary {
	title: string;
	abstract: string;
	body: string;
	keyTakeaway: string;
	references: string;
}

export interface ProjectSummaryResponse {
	success: boolean;
	summary: ProjectSummary;
	cached?: boolean;
	generatedAt?: string;
	isStale?: boolean;
	videoCount: number;
	totalVideos?: number;
}

export const generateProjectSummary = async (projectId: string, forceRegenerate = false): Promise<ProjectSummaryResponse> => {
	try {
		const response = await fetch(`/api/projects/${projectId}/summary`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ forceRegenerate }),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
			throw new Error(errorData.message || `HTTP ${response.status}`);
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Failed to generate project summary:', error);
		throw error;
	}
};

export const getCachedProjectSummary = async (projectId: string): Promise<ProjectSummaryResponse> => {
	try {
		const response = await fetch(`/api/projects/${projectId}/summary`, {
			method: 'GET',
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
			throw new Error(errorData.message || `HTTP ${response.status}`);
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Failed to get cached project summary:', error);
		throw error;
	}
};
