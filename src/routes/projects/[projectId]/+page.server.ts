import type { PageServerLoad } from './$types';
import { getProject, getProjectVideos, getSummary } from '$lib/server/database';
import type { Project, ProjectVideo, SummaryData } from '$lib/types';

export const load: PageServerLoad = async ({ params }) => {
	const projectId = params.projectId;
	
	try {
		// Get project details
		const project = await getProject(projectId);
		if (!project) {
			return {
				project: null,
				videos: [],
				error: 'Project not found'
			};
		}

		// Get project videos
		const projectVideos = await getProjectVideos(projectId);
		
		// Enrich videos with summary data
		const videosWithSummary: (ProjectVideo & { summary?: SummaryData })[] = [];
		
		for (const projectVideo of projectVideos) {
			try {
				const summary = await getSummary(projectVideo.videoId);
				videosWithSummary.push({
					...projectVideo,
					summary: summary || undefined
				});
			} catch (error) {
				console.error(`Failed to fetch summary for video ${projectVideo.videoId}:`, error);
				// Add video without summary data
				videosWithSummary.push(projectVideo);
			}
		}

		return {
			project,
			videos: videosWithSummary
		};
	} catch (error) {
		console.error('Failed to load project:', error);
		return {
			project: null,
			videos: [],
			error: 'Failed to load project'
		};
	}
};
