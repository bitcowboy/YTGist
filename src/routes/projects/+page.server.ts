import type { PageServerLoad } from './$types.js';
import { getProjects, getProjectVideos, getSummary, getProjectSummary } from '$lib/server/database.js';

export const load: PageServerLoad = async () => {
    try {
        // Get all projects
        const projects = await getProjects();
        
        // For each project, get its videos with summary data
        const projectsWithVideos = await Promise.all(
            projects.map(async (project) => {
                const projectVideos = await getProjectVideos(project.$id);
                
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
                
                // Get project summary
                const projectSummary = await getProjectSummary(project.$id);
                
                return {
                    ...project,
                    videos: videosWithDetails,
                    videoCount: videosWithDetails.length,
                    summary: projectSummary ? {
                        title: projectSummary.title,
                        abstract: projectSummary.abstract,
                        isStale: projectSummary.isStale
                    } : null
                };
            })
        );
        
        return {
            projects: projectsWithVideos
        };
    } catch (error) {
        console.error('Failed to load projects:', error);
        return {
            projects: []
        };
    }
};
